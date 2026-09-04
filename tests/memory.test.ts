import { describe, expect, it } from "vitest";
import { compareRevisions, deriveDecisionStatus, matchesMemorySearch, memoryQuerySchema, pendingAvailability, sortMemoryRows } from "../src/lib/memory";
import { pricedSnapshot, readRevision } from "../src/lib/review";
import type { ReviewDraft } from "../src/lib/pricing";

function draft(): ReviewDraft {
  return { hourlyRatePaise: 100000, additionalChargePaise: 0, additionalChargeReason: "", analysis: { schemaVersion: 1, explanation: "Reviewed scope.", tasks: [{
    id: "T1", title: "Responsive page", classification: "NEW_FEATURE", matchedScopeClause: null, sourceEvidence: [], estimatedHours: { minimum: 1, likely: 2, maximum: 3 }, assumptions: ["Content supplied"], complexity: "Low", risks: [], missingInformation: [], explanation: "One additional page.",
  }] } };
}

describe("Project Memory authority and search", () => {
  it("derives supersession only from an accepted replacement relationship", () => {
    expect(deriveDecisionStatus("ACCEPTED", false)).toBe("ACCEPTED");
    expect(deriveDecisionStatus("ACCEPTED", true)).toBe("SUPERSEDED");
    expect(deriveDecisionStatus("DECLINED", true)).toBe("DECLINED");
  });
  it("keeps pending availability distinct from status", () => {
    const base = { expiresAt: new Date("2030-01-01"), basedOnScopeRevision: 2, projectScopeRevision: 2, approvedRevisionId: "a", currentApprovedRevisionId: "a" };
    expect(pendingAvailability(base, new Date("2029-01-01"))).toBe("ACTIVE");
    expect(pendingAvailability({ ...base, expiresAt: new Date("2020-01-01") }, new Date("2029-01-01"))).toBe("EXPIRED");
    expect(pendingAvailability({ ...base, projectScopeRevision: 3 }, new Date("2029-01-01"))).toBe("STALE");
    expect(pendingAvailability({ ...base, currentApprovedRevisionId: "b" }, new Date("2029-01-01"))).toBe("STALE");
  });
  it("normalizes complete text search and applies stable newest-first ordering", () => {
    expect(matchesMemorySearch("Client\nComment Café", "  COMMENT  cafe\u0301 ")).toBe(true);
    expect(matchesMemorySearch("Different project", "comment")).toBe(false);
    const rows = [{ id: "a", occurredAt: "2026-01-01T00:00:00.000Z" }, { id: "b", occurredAt: "2026-01-01T00:00:00.000Z" }, { id: "c", occurredAt: "2027-01-01T00:00:00.000Z" }];
    expect(sortMemoryRows(rows).map(row => row.id)).toEqual(["c", "b", "a"]);
    expect(memoryQuerySchema.parse({})).toEqual({ q: "", status: "ALL" });
    expect(() => memoryQuerySchema.parse({ q: "x".repeat(201) })).toThrow();
    expect(() => memoryQuerySchema.parse({ status: "REVOKED" })).toThrow();
  });
});

it("compares immutable revisions by stable task ID and deterministic prices", () => {
  const firstDraft = draft(), secondDraft = structuredClone(firstDraft);
  secondDraft.hourlyRatePaise = 150000; secondDraft.additionalChargePaise = 50000; secondDraft.additionalChargeReason = "Setup";
  secondDraft.analysis.tasks[0].title = "Responsive portfolio page"; secondDraft.analysis.tasks[0].estimatedHours.likely = 2.5; secondDraft.analysis.tasks[0].assumptions = ["Approved content supplied"];
  secondDraft.analysis.tasks.push({ ...structuredClone(secondDraft.analysis.tasks[0]), id: "T2", title: "Navigation link" });
  const comparison = compareRevisions(readRevision(pricedSnapshot(firstDraft)), readRevision(pricedSnapshot(secondDraft)));
  expect(comparison.tasks).toEqual([
    { id: "T1", kind: "CHANGED", title: "Responsive portfolio page", fields: ["title", "hours", "assumptions"] },
    { id: "T2", kind: "ADDED", title: "Navigation link", fields: [] },
  ]);
  expect(comparison.hourlyRatePaise.delta).toBe(50000);
  expect(comparison.additionalChargePaise.delta).toBe(50000);
  expect(comparison.totalChargePaise.likely).toEqual({ before: 200000, after: 800000, delta: 600000 });
});
