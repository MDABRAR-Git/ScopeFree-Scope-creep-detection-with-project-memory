import { z } from "zod";
import { hourlyRatePaiseSchema } from "./contracts";

export const MAX_BASELINE_CHARACTERS = 12_000;
export const MAX_CLAUSES = 40;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// This is a basic usability check, not a semantic determination of scope or agreement.
// The freelancer identifies concrete deliverables and explicitly confirms the result.
export function hasUsableDeliverable(text: string) {
  const words = text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return text.trim().length >= 12 && new Set(words).size >= 3;
}
export const baselineClauseSchema = z.strictObject({
  id: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, "Use a unique clause ID with letters, numbers, dots, underscores or hyphens (1–64 characters)."),
  text: z.string().trim().min(1, "Each clause needs text.").max(MAX_BASELINE_CHARACTERS).refine(value => !value.includes("\u0000"), "Remove null characters from the clause text."),
  isDeliverable: z.boolean(),
});
export type BaselineClause = z.infer<typeof baselineClauseSchema>;
export function clausesToText(clauses: Pick<BaselineClause, "text">[]) {
  return clauses.map(clause => clause.text.trim()).join("\n\n");
}
export function draftClauses(text: string): BaselineClause[] {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  const paragraphs = normalized.split(/\n[\t ]*\n+/).filter(part => part.trim());
  // Retain all text even if there are too many paragraphs. The user can set boundaries manually.
  const parts = paragraphs.length > MAX_CLAUSES ? [normalized] : paragraphs;
  return parts.map((part, index) => ({ id: `B${index + 1}`, text: part.trim(), isDeliverable: false }));
}
export const baselineSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(1),
  clauses: z.array(baselineClauseSchema).min(1, "Add at least one clause.").max(MAX_CLAUSES, "Use at most 40 clauses."),
}).superRefine((value, ctx) => {
  const ids = new Set<string>();
  value.clauses.forEach((clause, index) => {
    if (ids.has(clause.id)) ctx.addIssue({ code: "custom", path: ["clauses", index, "id"], message: "Clause IDs must be unique." });
    ids.add(clause.id);
  });
  if (clausesToText(value.clauses).length > MAX_BASELINE_CHARACTERS) ctx.addIssue({ code: "custom", path: ["clauses"], message: "The baseline must be 12,000 characters or fewer, including clause separators." });
  if (!value.clauses.some(clause => clause.isDeliverable && hasUsableDeliverable(clause.text))) ctx.addIssue({ code: "custom", path: ["clauses"], message: "Identify at least one concrete deliverable with a usable description. Add specific work or an outcome, not a placeholder." });
});
export const baselineInputSchema = z.strictObject({
  text: z.string().trim().min(1).max(MAX_BASELINE_CHARACTERS),
  snapshot: baselineSnapshotSchema,
  confirmed: z.literal(true, { error: "Confirm that you have reviewed the original agreement." }),
}).refine(value => value.text === clausesToText(value.snapshot.clauses), { path: ["text"], message: "The confirmed text must match the complete clause preview. Review it again." });

export const requestInputSchema = z.strictObject({
  text: z.string().trim().min(10, "Describe the request in at least 10 characters.").max(4000, "Use 4,000 characters or fewer.").refine(value => !value.includes("\u0000"), "Remove null characters from the request text."),
  hourlyRatePaise: hourlyRatePaiseSchema,
});

export const rateRupeesSchema = z.string().trim()
  .regex(/^\d{1,6}(?:\.\d{1,2})?$/, "Enter an INR rate with at most two decimal places.")
  .transform(value => {
    const [whole, fractional = ""] = value.split(".");
    return Number(whole) * 100 + Number(fractional.padEnd(2, "0"));
  })
  .pipe(hourlyRatePaiseSchema);
export function formatRate(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(paise / 100);
}
