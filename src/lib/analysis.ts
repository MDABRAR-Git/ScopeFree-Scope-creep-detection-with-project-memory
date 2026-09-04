import { z } from "zod";
import { analysisOutputSchema, hourlyRatePaiseSchema, scopeSourceTypeSchema, type AnalysisOutput } from "./contracts";

export const analyzeInputSchema = z.strictObject({ idempotencyKey: z.uuid() });
export const sourceSchema = z.strictObject({
  sourceType: scopeSourceTypeSchema, sourceId: z.string().min(1).max(200),
  text: z.string().min(1).max(12000), clauseId: z.string().min(1).max(64),
  recordId: z.uuid(), amendsSourceIds: z.array(z.string().min(1).max(200)).max(40),
});
export type ScopeSource = z.infer<typeof sourceSchema>;
export const pinnedInputSchema = z.strictObject({
  schemaVersion: z.literal(1), projectId: z.uuid(), requestId: z.uuid(),
  requestText: z.string().min(10).max(4000), hourlyRatePaise: hourlyRatePaiseSchema,
  baselineId: z.uuid(), baselineHash: z.string().length(64), scopeRevision: z.number().int().nonnegative(),
  sources: z.array(sourceSchema).min(1).max(1000),
});
export type PinnedInput = z.infer<typeof pinnedInputSchema>;
export const classificationLabels = { IN_SCOPE: "IN_SCOPE", MODIFICATION: "MODIFICATION", NEW_FEATURE: "NEW_FEATURE", UNCERTAIN: "UNCERTAIN" } as const;
export function overallClassification(analysis: AnalysisOutput) {
  return (["UNCERTAIN", "NEW_FEATURE", "MODIFICATION", "IN_SCOPE"] as const).find(value => analysis.tasks.some(t => t.classification === value))!;
}
export function additionalHours(analysis: AnalysisOutput) {
  const sums = { minimum: 0, likely: 0, maximum: 0 };
  for (const task of analysis.tasks) if (["MODIFICATION", "NEW_FEATURE"].includes(task.classification)) {
    for (const key of ["minimum", "likely", "maximum"] as const) sums[key] += task.estimatedHours[key] * 4;
  }
  return { minimum: sums.minimum / 4, likely: sums.likely / 4, maximum: sums.maximum / 4, provisional: analysis.tasks.some(t => t.classification === "UNCERTAIN") };
}
export function validateAnalysis(value: unknown, sources: ScopeSource[]): AnalysisOutput {
  const analysis = analysisOutputSchema.parse(value);
  const index = new Map(sources.map(s => [`${s.sourceType}:${s.sourceId}`, s]));
  for (const task of analysis.tasks) {
    for (const evidence of task.sourceEvidence) {
      const source = index.get(`${evidence.sourceType}:${evidence.sourceId}`);
      if (!source || !source.text.includes(evidence.quote)) throw new Error("A citation ID or exact quote does not exist in the supplied scope.");
    }
    const matched = task.matchedScopeClause;
    if (matched && (!index.has(`${matched.sourceType}:${matched.sourceId}`) || !task.sourceEvidence.some(e => e.sourceId === matched.sourceId && e.sourceType === matched.sourceType))) throw new Error("The matched clause needs an exact citation to that supplied source.");
    if (["IN_SCOPE", "MODIFICATION"].includes(task.classification) && !matched) throw new Error("Covered or modified work requires a matching agreed clause; otherwise classify it UNCERTAIN.");
    if (task.classification === "IN_SCOPE" && matched?.relation !== "inclusion") throw new Error("Covered work must match an inclusion.");
    if (task.classification === "UNCERTAIN" && !task.missingInformation.length) throw new Error("Uncertain work needs a specific question about missing information.");
  }
  return analysis;
}
