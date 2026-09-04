import { z } from "zod";
import type { AnalysisOutput } from "./contracts";
import type { ScopeSource } from "./analysis";

export const agreementSchema = z.strictObject({
  clauses: z.array(z.strictObject({
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
    taskIds: z.array(z.string().min(1).max(100)).max(20),
    text: z.string().trim().min(1).max(12000),
    amendsSourceIds: z.array(z.string().min(1).max(200)).max(40),
  })).max(40),
  supersedesDecisionId: z.uuid().nullable(),
}).refine(a => new Set(a.clauses.map(c => c.id)).size === a.clauses.length, "Agreement clause IDs must be unique.");
export type Agreement = z.infer<typeof agreementSchema>;
export const emptyAgreement = (): Agreement => ({ clauses: [], supersedesDecisionId: null });

export function validateAgreement(value: unknown, analysis: AnalysisOutput, sources: ScopeSource[], complete = false) {
  const agreement = agreementSchema.parse(value);
  const tasks = new Map(analysis.tasks.map(t => [t.id, t]));
  const sourceIds = new Set(sources.map(s => s.sourceId));
  for (const clause of agreement.clauses) {
    if (clause.taskIds.some(id => !tasks.has(id) || tasks.get(id)!.classification === "IN_SCOPE")) throw new Error("Agreement terms must refer to additional tasks in this review.");
    if (!clause.taskIds.length && !agreement.supersedesDecisionId) throw new Error("Link each agreement clause to its additional task.");
    if (clause.amendsSourceIds.some(id => !sourceIds.has(id))) throw new Error("Agreement terms reference a missing or foreign scope source.");
  }
  if (analysis.tasks.every(t => t.classification === "IN_SCOPE") && (agreement.clauses.length || agreement.supersedesDecisionId)) throw new Error("An IN_SCOPE-only request cannot change the agreement.");
  if (complete) for (const task of analysis.tasks) {
    if (task.classification === "MODIFICATION" || task.classification === "NEW_FEATURE") {
      const clauses = agreement.clauses.filter(c => c.taskIds.includes(task.id));
      if (!clauses.length) throw new Error(`Record client-facing agreement terms for “${task.title}” before approval.`);
      if (task.classification === "MODIFICATION" && !clauses.some(c => c.amendsSourceIds.length)) throw new Error(`Identify the existing scope changed by “${task.title}”.`);
    }
  }
  return agreement;
}
