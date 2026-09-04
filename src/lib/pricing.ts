import { z } from "zod";
import { analysisOutputSchema, hourlyRatePaiseSchema, scenarioAmountsSchema } from "./contracts";

export const scenarios = ["minimum", "likely", "maximum"] as const;
export const chargePaiseSchema = z.number().int().nonnegative().safe();
export const chargeRupeesSchema = z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/, "Enter a nonnegative INR amount with at most two decimals.")
  .transform(value => { const [whole, fraction = ""] = value.split("."); return Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))); }).pipe(chargePaiseSchema);
export const reviewDraftSchema = z.strictObject({
  analysis: analysisOutputSchema, hourlyRatePaise: hourlyRatePaiseSchema,
  additionalChargePaise: chargePaiseSchema, additionalChargeReason: z.string().trim().max(500),
}).superRefine((draft, ctx) => {
  if (draft.additionalChargePaise > 0 && !draft.additionalChargeReason) ctx.addIssue({ code: "custom", path: ["additionalChargeReason"], message: "Explain the additional charge to the client." });
  if (draft.additionalChargePaise > 0 && draft.analysis.tasks.every(t => t.classification === "IN_SCOPE")) ctx.addIssue({ code: "custom", path: ["additionalChargePaise"], message: "An IN_SCOPE request cannot have an additional charge." });
});
export type ReviewDraft = z.infer<typeof reviewDraftSchema>;
export const calculatedSchema = z.strictObject({
  calculatorVersion: z.literal(1), billableQuarterHours: scenarioAmountsSchema,
  laborChargePaise: scenarioAmountsSchema, additionalChargePaise: chargePaiseSchema,
  totalChargePaise: scenarioAmountsSchema, provisional: z.boolean(),
});
export type Calculated = z.infer<typeof calculatedSchema>;
function safe(value: bigint) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("The total exceeds the supported exact monetary range.");
  return Number(value);
}
export function calculatePricing(value: ReviewDraft): Calculated {
  const draft = reviewDraftSchema.parse(value);
  const billableQuarterHours = { minimum: 0, likely: 0, maximum: 0 };
  const laborChargePaise = { ...billableQuarterHours }, totalChargePaise = { ...billableQuarterHours };
  for (const task of draft.analysis.tasks) if (task.classification === "MODIFICATION" || task.classification === "NEW_FEATURE") {
    for (const s of scenarios) billableQuarterHours[s] += task.estimatedHours[s] * 4;
  }
  for (const s of scenarios) {
    // Nonnegative integers: add half the denominator, then divide exactly once.
    const labor = (BigInt(billableQuarterHours[s]) * BigInt(draft.hourlyRatePaise) + 2n) / 4n;
    laborChargePaise[s] = safe(labor);
    totalChargePaise[s] = safe(labor + BigInt(draft.additionalChargePaise));
  }
  return { calculatorVersion: 1, billableQuarterHours, laborChargePaise, additionalChargePaise: draft.additionalChargePaise, totalChargePaise, provisional: draft.analysis.tasks.some(t => t.classification === "UNCERTAIN") };
}
export function formatMoney(paise: number | string) {
  const value = BigInt(paise);
  return `₹${(value / 100n).toLocaleString("en-IN")}.${(value % 100n).toString().padStart(2, "0")}`;
}
