import "server-only";
import { randomUUID } from "node:crypto";
import { projectIdSchema, revisionSnapshotSchema } from "@/lib/contracts";
import { additionalHours, analyzeInputSchema, overallClassification, pinnedInputSchema, validateAnalysis } from "@/lib/analysis";
import { db, database } from "./db";
import { AppError } from "./errors";
import { loadAnalysisInput } from "./scope";
import { generateAnalysis, checkContext } from "./ai/analyze";
import { scopeMessages } from "./ai/scope-prompt";
import { createAIProvider } from "./ai/provider";

export async function getEstimate(estimateId: string) {
  if (!projectIdSchema.safeParse(estimateId).success) throw new AppError("NOT_FOUND", "Analysis not found.", 404);
  const estimate = await database(() => db().estimate.findUnique({ where: { id: estimateId }, include: { request: { select: { projectId: true } }, revisions: { orderBy: { revision: "asc" } } } }));
  if (!estimate) throw new AppError("NOT_FOUND", "Analysis not found.", 404);
  const input = pinnedInputSchema.parse(estimate.originalInputJson);
  if (input.projectId !== estimate.request.projectId || input.requestId !== estimate.requestId) throw new AppError("INVALID_ESTIMATE", "The saved analysis has inconsistent source ownership.", 422);
  const analysis = validateAnalysis(estimate.originalAiJson, input.sources);
  return { id: estimate.id, projectId: input.projectId, requestId: input.requestId, requestText: input.requestText,
    analysis, sources: input.sources, scopeRevision: input.scopeRevision, hourlyRatePaise: input.hourlyRatePaise,
    overallClassification: overallClassification(analysis), additionalHours: additionalHours(analysis),
    status: estimate.status, currentRevision: estimate.currentRevision, createdAt: estimate.createdAt.toISOString(),
    provenance: { provider: estimate.provider, model: estimate.model, promptVersion: estimate.promptVersion },
    revisions: estimate.revisions.map(r => ({ id: r.id, revision: r.revision, snapshot: revisionSnapshotSchema.parse(r.snapshotJson), createdAt: r.createdAt.toISOString(), createdBy: r.createdBy })),
  };
}
export type SavedEstimate = Awaited<ReturnType<typeof getEstimate>>;

export async function analyzeRequest(requestId: string, body: unknown, sessionId: string, requestSignal?: AbortSignal) {
  if (!projectIdSchema.safeParse(requestId).success) throw new AppError("NOT_FOUND", "Request not found.", 404);
  const { idempotencyKey } = analyzeInputSchema.parse(body);
  const leaseId = randomUUID();
  const deadline = AbortSignal.any([AbortSignal.timeout(120_000), ...(requestSignal ? [requestSignal] : [])]);
  const claim = await database(() => db().$transaction(async tx => {
    const request = await tx.changeRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new AppError("NOT_FOUND", "Request not found.", 404);
    await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id"=${request.projectId}::uuid FOR UPDATE`;
    const existing = await tx.estimate.findUnique({ where: { requestId }, select: { id: true } });
    if (existing) return { existing: existing.id };
    const job = await tx.analysisJob.findUnique({ where: { requestId } });
    if (job && job.expiresAt > new Date()) throw new AppError("ANALYSIS_IN_PROGRESS", "This request is already being analyzed. Wait, then check again.", 409, true, 5);
    const input = await loadAnalysisInput(tx, requestId);
    checkContext(scopeMessages(input));
    createAIProvider(); // Fail missing credentials before charging a session attempt or claiming a job.
    const rows = await tx.$queryRaw<{ attempts: number; windowStart: Date }[]>`
      INSERT INTO "AnalysisThrottle" ("sessionId","attempts","windowStart") VALUES (${sessionId}::uuid,1,NOW())
      ON CONFLICT ("sessionId") DO UPDATE SET
        "attempts"=CASE WHEN "AnalysisThrottle"."windowStart" <= NOW()-INTERVAL '10 minutes' THEN 1 ELSE LEAST("AnalysisThrottle"."attempts"+1,7) END,
        "windowStart"=CASE WHEN "AnalysisThrottle"."windowStart" <= NOW()-INTERVAL '10 minutes' THEN NOW() ELSE "AnalysisThrottle"."windowStart" END
      RETURNING "attempts","windowStart"`;
    if (rows[0].attempts > 6) throw new AppError("ANALYSIS_RATE_LIMITED", "This session has reached six analysis attempts in ten minutes. Retry after the window resets.", 429, true, Math.max(1, Math.ceil((rows[0].windowStart.getTime() + 600000 - Date.now()) / 1000)));
    await tx.analysisJob.upsert({ where: { requestId }, create: { requestId, leaseId, idempotencyKey, expiresAt: new Date(Date.now() + 150_000) }, update: { leaseId, idempotencyKey, expiresAt: new Date(Date.now() + 150_000) } });
    return { input };
  }));
  if (claim.existing) return getEstimate(claim.existing);
  const input = claim.input!;
  try {
    const result = await generateAnalysis(input, deadline);
    if (deadline.aborted) throw new AppError("AI_TIMEOUT", "Analysis timed out or was cancelled. No result was saved.", 504, true);
    const id = await database(() => db().$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id"=${input.projectId}::uuid FOR UPDATE`;
      const job = await tx.analysisJob.findUnique({ where: { requestId } });
      if (!job || job.leaseId !== leaseId || job.expiresAt <= new Date()) throw new AppError("ANALYSIS_IN_PROGRESS", "This analysis attempt expired. Check the saved result or retry.", 409, true);
      const current = await loadAnalysisInput(tx, requestId);
      if (JSON.stringify(input) !== JSON.stringify(current)) throw new AppError("BASELINE_CHANGED", "Scope or request changed during analysis. Create a current-scope request.", 409);
      const estimate = await tx.estimate.create({ data: { requestId, originalAiJson: result.analysis, originalInputJson: input, provider: result.provider, model: result.model, promptVersion: result.promptVersion, currentRevision: 1 } });
      const revision = await tx.estimateRevision.create({ data: { estimateId: estimate.id, revision: 1, snapshotJson: { schemaVersion: 1, analysis: result.analysis, hourlyRatePaise: input.hourlyRatePaise }, createdBy: "ai" } });
      await tx.auditEvent.create({ data: { projectId: input.projectId, entityType: "estimate", entityId: estimate.id, action: "analyzed", actorType: "freelancer", revisionId: revision.id, metadataJson: { schemaVersion: 1, scopeRevision: input.scopeRevision, idempotencyKey, repaired: result.repaired, promptVersion: result.promptVersion } } });
      await tx.analysisJob.delete({ where: { requestId } });
      return estimate.id;
    }));
    return getEstimate(id);
  } catch (error) {
    if (deadline.aborted && !(error instanceof AppError)) throw new AppError("AI_TIMEOUT", "Analysis timed out or was cancelled. Please retry.", 504, true);
    throw error;
  } finally {
    // A process crash/outage is recoverable after the lease expires; never erase a newer attempt.
    try { await db().analysisJob.deleteMany({ where: { requestId, leaseId } }); } catch { /* lease expiry provides recovery */ }
  }
}
