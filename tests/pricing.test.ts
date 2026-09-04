import { describe, expect, it } from "vitest";
import { calculatePricing, chargeRupeesSchema, reviewDraftSchema, type ReviewDraft } from "../src/lib/pricing";
import { pricedSnapshot, readRevision, readStoredAnalysis, requiresEditReason } from "../src/lib/review";
import { analysisOutputSchema } from "../src/lib/contracts";

function draft(): ReviewDraft {
  return { analysis: { schemaVersion: 1, explanation: "Requested extension.", tasks: [{ id: "T1", title: "Extension", classification: "NEW_FEATURE", matchedScopeClause: null, sourceEvidence: [], estimatedHours: { minimum: 2, likely: 3, maximum: 4 }, assumptions: [], complexity: "Simple", risks: [], missingInformation: [], explanation: "New functionality." }] }, hourlyRatePaise: 100000, additionalChargePaise: 50000, additionalChargeReason: "One-time service configuration." };
}
describe("review pricing", () => {
  it("calculates all three ranges and adds the fixed request charge once, not per task", () => {
    const d = draft(); d.analysis.tasks.push({ ...d.analysis.tasks[0], id: "T2" });
    expect(calculatePricing(d)).toMatchObject({ billableQuarterHours: { minimum: 16, likely: 24, maximum: 32 }, laborChargePaise: { minimum: 400000, likely: 600000, maximum: 800000 }, totalChargePaise: { minimum: 450000, likely: 650000, maximum: 850000 }, provisional: false });
  });
  it("rounds half-up once after aggregation, including half a paise", () => {
    const d = draft(); d.hourlyRatePaise = 1; d.additionalChargePaise = 0;
    d.analysis.tasks[0].estimatedHours = { minimum: .25, likely: .5, maximum: .75 };
    expect(calculatePricing(d).laborChargePaise).toEqual({ minimum: 0, likely: 1, maximum: 1 });
    d.analysis.tasks.push({ ...d.analysis.tasks[0], id: "T2" });
    expect(calculatePricing(d).laborChargePaise).toEqual({ minimum: 1, likely: 1, maximum: 2 });
  });
  it("excludes UNCERTAIN tasks and keeps mixed totals provisional", () => {
    const d = draft(); d.analysis.tasks.push({ ...d.analysis.tasks[0], id: "T2", classification: "UNCERTAIN", missingInformation: ["Which outcome?"] });
    expect(calculatePricing(d)).toMatchObject({ billableQuarterHours: { minimum: 8, likely: 12, maximum: 16 }, provisional: true });
  });
  it("requires free IN_SCOPE work and forbids a fixed charge on an all-IN_SCOPE request", () => {
    const d = draft(); d.analysis.tasks[0].classification = "IN_SCOPE";
    expect(() => calculatePricing(d)).toThrow();
    d.analysis.tasks[0].estimatedHours = { minimum: 0, likely: 0, maximum: 0 };
    expect(() => calculatePricing(d)).toThrow(); d.additionalChargePaise = 0;
    expect(calculatePricing(d).totalChargePaise).toEqual({ minimum: 0, likely: 0, maximum: 0 });
  });
  it("rejects missing charge reasons, client totals, rates and invalid ranges", () => {
    const d = draft();
    for (const change of [{ additionalChargeReason: "   " }, { additionalChargePaise: -1 }, { additionalChargePaise: .5 }, { hourlyRatePaise: 0 }, { hourlyRatePaise: 10000001 }, { totalChargePaise: 1 }]) expect(reviewDraftSchema.safeParse({ ...d, ...change }).success).toBe(false);
    for (const hours of [{ minimum: -1, likely: 2, maximum: 3 }, { minimum: 3, likely: 2, maximum: 4 }, { minimum: .1, likely: 2, maximum: 3 }, { minimum: 1, likely: 2, maximum: 201 }]) expect(() => calculatePricing({ ...d, analysis: { ...d.analysis, tasks: [{ ...d.analysis.tasks[0], estimatedHours: hours }] } })).toThrow();
    expect(chargeRupeesSchema.parse("500.25")).toBe(50025);
    for (const amount of ["1.001", "-1", "Infinity", "1e3", "9007199254740992"]) expect(chargeRupeesSchema.safeParse(amount).success).toBe(false);
  });
  it("rejects totals exceeding safe serialization boundaries", () => {
    expect(() => calculatePricing({ ...draft(), additionalChargePaise: Number.MAX_SAFE_INTEGER })).toThrow("supported exact monetary range");
  });
  it("validates saved prices against their inputs and requires reasons for removed/reclassified tasks", () => {
    const d = draft(), saved = pricedSnapshot(d);
    expect(readRevision(saved).calculated).toEqual(calculatePricing(d)); saved.calculated.totalChargePaise.likely++;
    expect(() => readRevision(saved)).toThrow("does not match");
    expect(requiresEditReason(d, { ...d, analysis: { ...d.analysis, tasks: [] } })).toBe(true);
    expect(requiresEditReason(d, { ...d, analysis: { ...d.analysis, tasks: [{ ...d.analysis.tasks[0], classification: "MODIFICATION" }] } })).toBe(true);
    expect(requiresEditReason(d, { ...d, hourlyRatePaise: 200000 })).toBe(false);
  });
  it("reads legacy storage without modifying originals; new AI/API contracts reject legacy values", () => {
    const old = { ...draft().analysis, tasks: [{ ...draft().analysis.tasks[0], classification: "out_of_scope" }] };
    const copy = structuredClone(old);
    expect(readStoredAnalysis(old).tasks[0].classification).toBe("NEW_FEATURE"); expect(old).toEqual(copy);
    expect(analysisOutputSchema.safeParse(old).success).toBe(false);
    expect(readRevision({ schemaVersion: 1, analysis: old, hourlyRatePaise: 100000 })).toMatchObject({ legacy: true, additionalChargePaise: 0 });
  });
});
