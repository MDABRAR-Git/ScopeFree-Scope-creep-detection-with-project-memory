import { expect, it, vi } from "vitest";
import type { Prisma } from "../src/generated/prisma/client";
import { loadAnalysisInput } from "../src/server/scope";
const p = "11111111-1111-4111-8111-111111111111";
const d = "22222222-2222-4222-8222-222222222222";
function fixture() {
  const request = { id: p, text: "Add an extra website page.", hourlyRatePaise: 100000, basedOnScopeRevision: 1, project: { id: p, scopeRevision: 1, baseline: { id: p, contentHash: "a".repeat(64), clausesJson: { schemaVersion: 1, clauses: [{ id: "B1", text: "Build exactly five website pages.", isDeliverable: true }] } } } };
  const findMany = vi.fn().mockResolvedValue([]);
  const tx = { changeRequest: { findUnique: vi.fn().mockResolvedValue(request) }, projectDecision: { findMany } };
  return { tx: tx as unknown as Prisma.TransactionClient, request, findMany };
}
it("loads accepted sources only and ignores an explicitly superseded amendment", async () => {
  const { tx, findMany } = fixture();
  findMany.mockResolvedValue([{ id: d, amendmentClausesJson: { schemaVersion: 1, clauses: [{ id: "A1", text: "Eight pages agreed.", amendsSourceIds: [`${p}:B1`] }] }, supersededBy: { outcome: "ACCEPTED", projectId: p } }, { id: p, amendmentClausesJson: { schemaVersion: 1, clauses: [{ id: "A2", text: "Six pages replace the older page limit.", amendsSourceIds: [`${p}:B1`] }] }, supersededBy: null }]);
  const result = await loadAnalysisInput(tx, p);
  expect(findMany.mock.calls[0][0].where).toEqual({ projectId: p, outcome: "ACCEPTED" });
  expect(result.sources.map(s => s.clauseId)).toEqual(["B1", "A2"]);
});
it("rejects malformed, foreign-referencing and cross-project replacement records without silent omission", async () => {
  for (const decision of [
    { id: d, amendmentClausesJson: {}, supersededBy: null },
    { id: d, amendmentClausesJson: { schemaVersion: 1, clauses: [{ id: "A1", text: "More pages.", amendsSourceIds: ["foreign"] }] }, supersededBy: null },
    { id: d, amendmentClausesJson: { schemaVersion: 1, clauses: [] }, supersededBy: { outcome: "ACCEPTED", projectId: d } },
  ]) { const { tx, findMany } = fixture(); findMany.mockResolvedValue([decision]); await expect(loadAnalysisInput(tx, p)).rejects.toMatchObject({ code: "BASELINE_INVALID" }); }
});
it("rejects missing or unusable baselines, missing rates and stale requests before generation", async () => {
  const missing = fixture(); Object.assign(missing.request.project, { baseline: null }); await expect(loadAnalysisInput(missing.tx, p)).rejects.toMatchObject({ code: "BASELINE_REQUIRED" });
  const empty = fixture(); empty.request.project.baseline.clausesJson.clauses = []; await expect(loadAnalysisInput(empty.tx, p)).rejects.toMatchObject({ code: "BASELINE_INVALID" });
  const rate = fixture(); Object.assign(rate.request, { hourlyRatePaise: null }); await expect(loadAnalysisInput(rate.tx, p)).rejects.toMatchObject({ code: "RATE_REQUIRED" });
  const stale = fixture(); stale.request.project.scopeRevision = 2; await expect(loadAnalysisInput(stale.tx, p)).rejects.toMatchObject({ code: "BASELINE_CHANGED" });
});
