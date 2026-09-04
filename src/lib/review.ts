import { z } from "zod";
import { analysisOutputSchema, revisionSnapshotSchema } from "./contracts";
import { calculatePricing, calculatedSchema, reviewDraftSchema, type ReviewDraft } from "./pricing";
import { agreementSchema, emptyAgreement, type Agreement } from "./agreement";

// Legacy vocabulary exists only at the immutable storage boundary, never in new AI/API inputs.
const legacyNames = { covered: "IN_SCOPE", modifies_existing: "MODIFICATION", out_of_scope: "NEW_FEATURE", uncertain: "UNCERTAIN" } as const;
export function readStoredAnalysis(value: unknown) {
  const copy = structuredClone(value);
  if (copy && typeof copy === "object" && "tasks" in copy && Array.isArray(copy.tasks)) for (const task of copy.tasks) {
    if (task && typeof task === "object" && typeof task.classification === "string" && task.classification in legacyNames) task.classification = legacyNames[task.classification as keyof typeof legacyNames];
  }
  return analysisOutputSchema.parse(copy);
}
export const pricedRevisionSchema = z.strictObject({ schemaVersion: z.literal(2), ...reviewDraftSchema.shape, calculated: calculatedSchema });
export const agreementRevisionSchema = pricedRevisionSchema.extend({ schemaVersion: z.literal(3), agreement: agreementSchema });
export function pricedSnapshot(draft: ReviewDraft, agreement: Agreement = emptyAgreement()) {
  return { schemaVersion: 3 as const, ...reviewDraftSchema.parse(draft), calculated: calculatePricing(draft), agreement: agreementSchema.parse(agreement) };
}
export function readRevision(value: unknown) {
  const object = z.object({ schemaVersion: z.number(), analysis: z.unknown() }).parse(value);
  if (object.schemaVersion === 1) {
    const old = revisionSnapshotSchema.parse({ ...(value as object), analysis: readStoredAnalysis(object.analysis) });
    const draft = { analysis: old.analysis, hourlyRatePaise: old.hourlyRatePaise, additionalChargePaise: 0, additionalChargeReason: "" };
    return { ...pricedSnapshot(draft), legacy: true };
  }
  const snapshot = object.schemaVersion === 2 ? { ...pricedRevisionSchema.parse(value), agreement: emptyAgreement() } : agreementRevisionSchema.parse(value);
  const calculated = calculatePricing(draftFromRevision(snapshot));
  if (JSON.stringify(calculated) !== JSON.stringify(snapshot.calculated)) throw new Error("Saved calculation does not match its inputs.");
  return { ...snapshot, legacy: false };
}
export function draftFromRevision(snapshot: ReviewDraft): ReviewDraft {
  return { analysis: snapshot.analysis, hourlyRatePaise: snapshot.hourlyRatePaise, additionalChargePaise: snapshot.additionalChargePaise, additionalChargeReason: snapshot.additionalChargeReason };
}
export const revisionInputSchema = z.strictObject({ expectedRevision: z.number().int().positive(), draft: reviewDraftSchema, agreement: agreementSchema.optional(), editReason: z.string().trim().max(1000) });
export const approvalInputSchema = z.strictObject({ expectedRevision: z.number().int().positive(), reviewed: z.literal(true) });
export const reopenInputSchema = z.strictObject({ expectedRevision: z.number().int().positive() });
export function requiresEditReason(before: ReviewDraft, after: ReviewDraft) {
  return before.analysis.tasks.some(t => { const next = after.analysis.tasks.find(n => n.id === t.id); return !next || next.classification !== t.classification; });
}
