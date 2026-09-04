import "server-only";
import { z } from "zod";
import { baselineSnapshotSchema } from "@/lib/intake";
import { pinnedInputSchema, type ScopeSource } from "@/lib/analysis";
import type { Prisma } from "@/generated/prisma/client";
import { AppError } from "./errors";

export const amendmentSchema = z.strictObject({ schemaVersion: z.literal(1), clauses: z.array(z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/), text: z.string().trim().min(1).max(12000),
  amendsSourceIds: z.array(z.string().min(1).max(200)).max(40),
})).max(40) }).refine(s => new Set(s.clauses.map(c => c.id)).size === s.clauses.length);

export async function loadAnalysisInput(tx: Prisma.TransactionClient, requestId: string) {
  const request = await tx.changeRequest.findUnique({ where: { id: requestId }, include: { project: { include: { baseline: true } } } });
  if (!request) throw new AppError("NOT_FOUND", "Request not found.", 404);
  const { project } = request;
  const baseline = project.baseline;
  if (!baseline) throw new AppError("BASELINE_REQUIRED", "Confirm the original agreement before analysis.", 422);
  const snapshot = baselineSnapshotSchema.safeParse(baseline.clausesJson);
  if (!snapshot.success) throw new AppError("BASELINE_INVALID", "The baseline has no usable confirmed scope. Ask the operator to inspect it.", 422);
  if (request.basedOnScopeRevision !== project.scopeRevision) throw new AppError("BASELINE_CHANGED", "Scope changed since this request was recorded. Create a new request against the current agreement.", 409);
  const sources: ScopeSource[] = snapshot.data.clauses.map(c => ({ sourceType: "baseline_clause", sourceId: `${baseline.id}:${c.id}`, recordId: baseline.id, clauseId: c.id, text: c.text, amendsSourceIds: [] }));
  const decisions = await tx.projectDecision.findMany({ where: { projectId: project.id, outcome: "ACCEPTED" }, include: { supersededBy: { select: { outcome: true, projectId: true } } }, orderBy: [{ decidedAt: "asc" }, { id: "asc" }] });
  const knownIds = new Set(sources.map(s => s.sourceId));
  const parsed = decisions.map(d => {
    const amendments = amendmentSchema.safeParse(d.amendmentClausesJson);
    if (!amendments.success || (d.supersededBy && d.supersededBy.projectId !== project.id)) throw new AppError("BASELINE_INVALID", "An accepted amendment has an invalid scope record. Analysis cannot omit it.", 422);
    for (const c of amendments.data.clauses) knownIds.add(`${d.id}:${c.id}`);
    return { decision: d, clauses: amendments.data.clauses };
  });
  for (const { decision, clauses } of parsed) {
    if (decision.supersededBy?.outcome === "ACCEPTED") continue;
    for (const c of clauses) {
      if (c.amendsSourceIds.some(id => !knownIds.has(id))) throw new AppError("BASELINE_INVALID", "An amendment references a missing or foreign source.", 422);
      sources.push({ sourceType: "accepted_change_clause", sourceId: `${decision.id}:${c.id}`, recordId: decision.id, clauseId: c.id, text: c.text, amendsSourceIds: c.amendsSourceIds });
    }
  }
  const input = pinnedInputSchema.safeParse({ schemaVersion: 1, projectId: project.id, requestId, requestText: request.text, hourlyRatePaise: request.hourlyRatePaise, baselineId: baseline.id, baselineHash: baseline.contentHash, scopeRevision: project.scopeRevision, sources });
  if (!input.success) throw new AppError("BASELINE_INVALID", "The saved request, rate or complete scope is not valid for analysis. Nothing was omitted.", 422);
  return input.data;
}
