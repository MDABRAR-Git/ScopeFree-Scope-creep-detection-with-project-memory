import { describe, expect, it } from "vitest";
import { analysisOutputSchema, hoursSchema, projectInputSchema, revisionSnapshotSchema } from "../src/lib/contracts";

const task = { id: "t1", title: "Existing deliverable", classification: "covered", matchedScopeClause: null, sourceEvidence: [], estimatedHours: { minimum: 0, likely: 0, maximum: 0 }, assumptions: [], complexity: "Small", risks: [], missingInformation: [], explanation: "Test-only contract fixture" };
describe("shared strict contracts", () => {
  it("trims project names and rejects blank, long and authoritative extra fields", () => {
    expect(projectInputSchema.parse({ name: "  Site  " })).toEqual({ name: "Site" });
    for (const input of [{ name: " " }, { name: "x".repeat(121) }, { name: "Site", scopeRevision: 9 }]) expect(projectInputSchema.safeParse(input).success).toBe(false);
  });
  it("requires quarter-hour ordered bounded ranges", () => {
    expect(hoursSchema.safeParse({ minimum: 0.25, likely: 1, maximum: 2 }).success).toBe(true);
    for (const hours of [{ minimum: -1, likely: 0, maximum: 0 }, { minimum: 0, likely: 0.1, maximum: 1 }, { minimum: 2, likely: 1, maximum: 3 }, { minimum: 0, likely: 1, maximum: 201 }]) expect(hoursSchema.safeParse(hours).success).toBe(false);
  });
  it("rejects duplicated IDs, excluded fields and covered work with extra hours", () => {
    const output = { schemaVersion: 1, tasks: [task], explanation: "Test fixture" };
    expect(analysisOutputSchema.safeParse(output).success).toBe(true);
    expect(analysisOutputSchema.safeParse({ ...output, tasks: [task, task] }).success).toBe(false);
    for (const addition of [{ confidence: 0.9 }, { costs: 300 }, { timeline: "tomorrow" }]) expect(analysisOutputSchema.safeParse({ ...output, ...addition }).success).toBe(false);
    expect(analysisOutputSchema.safeParse({ ...output, tasks: [{ ...task, estimatedHours: { minimum: 1, likely: 1, maximum: 1 } }] }).success).toBe(false);
    expect(revisionSnapshotSchema.safeParse({ schemaVersion: 1, analysis: output, hourlyRatePaise: 1.5 }).success).toBe(false);
  });
});
