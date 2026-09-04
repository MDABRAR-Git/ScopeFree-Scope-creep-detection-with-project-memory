import { describe, expect, it } from "vitest";
import { baselineInputSchema, baselineSnapshotSchema, clausesToText, draftClauses, rateRupeesSchema, requestInputSchema } from "../src/lib/intake";
import { baselineInput } from "./fixtures/intake-documents";
describe("baseline confirmation contracts", () => {
  it("requires complete matching text, reviewed confirmation and an identified deliverable", () => {
    expect(baselineInputSchema.safeParse(baselineInput()).success).toBe(true);
    for (const input of [{ ...baselineInput(), confirmed: false }, { ...baselineInput(), text: "Different source text" }, { ...baselineInput(), confirmedBy: "client" }, { ...baselineInput(), snapshot: { schemaVersion: 1, clauses: [{ id: "B1", text: "Build the complete project website.", isDeliverable: false }] } }]) expect(baselineInputSchema.safeParse(input).success).toBe(false);
  });
  it("rejects empty, repeated and unsafe clause IDs and unusable deliverables", () => {
    for (const id of ["", "../path", "<script>", "x".repeat(65)]) expect(baselineSnapshotSchema.safeParse({ schemaVersion: 1, clauses: [{ id, text: "Build a responsive website.", isDeliverable: true }] }).success).toBe(false);
    expect(baselineSnapshotSchema.safeParse({ schemaVersion: 1, clauses: [baselineInput().snapshot.clauses[0], baselineInput().snapshot.clauses[0]] }).success).toBe(false);
    for (const text of ["", "....", "test test test"]) expect(baselineInputSchema.safeParse(baselineInput(text)).success).toBe(false);
  });
  it("enforces exact text and clause limits without truncation", () => {
    const text = "Build a website " + "x".repeat(12_000 - 16);
    expect(text.length).toBe(12_000); expect(baselineInputSchema.safeParse(baselineInput(text)).success).toBe(true);
    expect(baselineInputSchema.safeParse(baselineInput(text + "x")).success).toBe(false);
    const clauses = Array.from({ length: 40 }, (_, i) => ({ id: `B${i}`, text: "Build a website page.", isDeliverable: true }));
    expect(baselineSnapshotSchema.safeParse({ schemaVersion: 1, clauses }).success).toBe(true);
    expect(baselineSnapshotSchema.safeParse({ schemaVersion: 1, clauses: [...clauses, { ...clauses[0], id: "extra" }] }).success).toBe(false);
  });
  it("retains every paragraph when suggesting clause boundaries", () => {
    const text = Array.from({ length: 45 }, (_, i) => `Deliverable number ${i}`).join("\n\n");
    expect(clausesToText(draftClauses(text))).toBe(text);
    expect(draftClauses(text).length).toBeLessThanOrEqual(40);
    expect(draftClauses("Build a page.\r\n\r\nAdd a form.")).toHaveLength(2);
  });
});
describe("request intake and exact INR inputs", () => {
  it.each([["0.01", 1], ["1000", 100000], ["1234.56", 123456], ["100000.00", 10000000]])("parses %s without floating-point money arithmetic", (value, expected) => { expect(rateRupeesSchema.parse(value)).toBe(expected); });
  it.each(["0", "-1", "100000.01", "1.001", "1e3", "Infinity", "1,000", ""]) ("rejects invalid rate %s", value => { expect(rateRupeesSchema.safeParse(value).success).toBe(false); });
  it("validates request lengths and rejects injected prices/project/scope/supersession fields", () => {
    expect(requestInputSchema.parse({ text: "  Add a contact page.  ", hourlyRatePaise: 10000 }).text).toBe("Add a contact page.");
    for (const input of [{ text: "short", hourlyRatePaise: 1 }, { text: "x".repeat(4001), hourlyRatePaise: 1 }, { text: "Add a contact page", hourlyRatePaise: 1.1 }, { text: "Add a contact page", hourlyRatePaise: 0 }, { text: "Add a contact page", hourlyRatePaise: 10000001 }, ...["projectId", "basedOnScopeRevision", "supersedesDecisionId", "calculatedCostsPaise"].map(key => ({ text: "Add a contact page", hourlyRatePaise: 1, [key]: "untrusted" }))]) expect(requestInputSchema.safeParse(input).success).toBe(false);
  });
});
