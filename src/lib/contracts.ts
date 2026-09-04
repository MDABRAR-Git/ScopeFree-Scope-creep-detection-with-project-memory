import { z } from "zod";

export const projectIdSchema = z.uuid();
export const projectInputSchema = z.strictObject({ name: z.string().trim().min(1, "Enter a project name.").max(120, "Use 120 characters or fewer.") });
export const loginInputSchema = z.strictObject({ password: z.string().min(1, "Enter your password.").max(256, "Password is too long.") });
const text = z.string().trim().min(1).max(2000);
const strings = z.array(text).max(20);
const hoursValue = z.number().min(0).max(200).multipleOf(0.25);
export const hoursSchema = z.strictObject({ minimum: hoursValue, likely: hoursValue, maximum: hoursValue })
  .refine(h => h.minimum <= h.likely && h.likely <= h.maximum, "Hours must be ordered minimum ≤ likely ≤ maximum.");
export const classificationSchema = z.enum(["covered", "modifies_existing", "out_of_scope", "uncertain"]);
export const scopeSourceTypeSchema = z.enum(["baseline_clause", "accepted_change_clause"]);
export const evidenceSchema = z.strictObject({ sourceType: scopeSourceTypeSchema, sourceId: text, quote: text });
export const taskSchema = z.strictObject({
  id: z.string().trim().min(1).max(100), title: z.string().trim().min(1).max(200),
  classification: classificationSchema,
  matchedScopeClause: z.strictObject({ sourceType: scopeSourceTypeSchema, sourceId: text, relation: z.enum(["inclusion", "exclusion", "limit", "context"]) }).nullable(),
  sourceEvidence: z.array(evidenceSchema).max(20), estimatedHours: hoursSchema,
  assumptions: strings, complexity: text, risks: strings, missingInformation: strings, explanation: text,
}).refine(t => t.classification !== "covered" || Object.values(t.estimatedHours).every(h => h === 0), "Covered work must have zero additional hours.");
export const analysisOutputSchema = z.strictObject({ schemaVersion: z.literal(1), tasks: z.array(taskSchema).min(1).max(20), explanation: text })
  .refine(a => new Set(a.tasks.map(t => t.id)).size === a.tasks.length, "Task IDs must be unique.");
export const hourlyRatePaiseSchema = z.number().int().positive().max(10_000_000);
export const scenarioAmountsSchema = z.strictObject({ minimum: z.number().int().nonnegative().safe(), likely: z.number().int().nonnegative().safe(), maximum: z.number().int().nonnegative().safe() });
export const revisionSnapshotSchema = z.strictObject({ schemaVersion: z.literal(1), analysis: analysisOutputSchema, hourlyRatePaise: hourlyRatePaiseSchema });
// These shared contracts establish storage/API vocabulary. Later milestones add their services and semantic checks.
export const proposalSnapshotSchema = z.strictObject({ schemaVersion: z.literal(1), projectName: z.string().min(1).max(120), requestText: z.string().trim().min(10).max(4000), approvedRevisionId: z.uuid(), reviewed: revisionSnapshotSchema, additionalQuarterHours: scenarioAmountsSchema, calculatedCostsPaise: scenarioAmountsSchema, assumptions: strings, supersedesDecisionId: z.uuid().nullable() });
export const chatCitationSchema = z.strictObject({ sourceType: z.enum(["baseline_clause", "accepted_change_clause", "request", "estimate_revision", "proposal", "decision", "client_comment"]), sourceId: text, quote: text });
export const chatOutputSchema = z.strictObject({ answer: z.string().trim().min(1).max(8000), citations: z.array(chatCitationSchema).max(40), insufficientEvidence: z.boolean() });
export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;

export const errorCodes = [
  "ANALYSIS_IN_PROGRESS", "ANALYSIS_RATE_LIMITED",
  "UNAUTHORIZED", "INVALID_CREDENTIALS", "AUTH_NOT_CONFIGURED", "FORBIDDEN_ORIGIN", "LOGIN_RATE_LIMITED", "INVALID_INPUT", "INPUT_TOO_LARGE", "NOT_FOUND", "DATABASE_ERROR", "INTERNAL_ERROR",
  "BASELINE_REQUIRED", "BASELINE_INVALID", "BASELINE_ALREADY_CONFIRMED", "UNSUPPORTED_FILE", "EXTRACTION_FAILED", "AI_NOT_CONFIGURED", "AI_UNAVAILABLE", "AI_RATE_LIMITED", "AI_TIMEOUT", "AI_OUTPUT_INVALID", "INVALID_ESTIMATE", "UNCERTAIN_TASKS", "STALE_REVISION", "BASELINE_CHANGED", "LINK_EXPIRED", "LINK_REVOKED", "ALREADY_DECIDED", "CONTEXT_TOO_LARGE",
] as const;
export type ErrorCode = typeof errorCodes[number];
export type ApiErrorBody = { error: { code: ErrorCode; message: string; fields?: Record<string, string[]>; retryable: boolean } };
