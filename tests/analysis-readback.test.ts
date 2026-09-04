import { expect, it, vi } from "vitest";
import { caseInput, scopeCases } from "./evaluation/scope-cases";

const mocks = vi.hoisted(() => ({ database: vi.fn(), client: vi.fn(), load: vi.fn(), generate: vi.fn() }));
vi.mock("../src/server/db", () => ({ db: mocks.client, database: mocks.database }));
vi.mock("../src/server/scope", () => ({ loadAnalysisInput: mocks.load }));
vi.mock("../src/server/ai/analyze", () => ({ generateAnalysis: mocks.generate, checkContext: vi.fn() }));
vi.mock("../src/server/ai/provider", () => ({ createAIProvider: vi.fn() }));
import { analyzeRequest } from "../src/server/analysis";
import { AppError } from "../src/server/errors";

it("handles a failed post-save readback while asynchronous lease cleanup is still pending", async () => {
  const input = caseInput(scopeCases[0]);
  const estimateId = "33333333-3333-4333-8333-333333333333";
  const readbackError = new AppError("DATABASE_ERROR", "Database is temporarily unavailable.", 503, true);
  let leaseId = "";
  let releaseCleanup!: () => void;
  const cleanup = new Promise<void>(resolve => { releaseCleanup = resolve; });
  const tx = {
    changeRequest: { findUnique: vi.fn().mockResolvedValue({ projectId: input.projectId }) },
    $queryRaw: vi.fn().mockResolvedValue([{ attempts: 1, windowStart: new Date() }]),
    estimate: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: estimateId }) },
    estimateRevision: { create: vi.fn().mockResolvedValue({ id: estimateId }) },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
    analysisJob: {
      findUnique: vi.fn().mockImplementation(async () => leaseId ? { leaseId, expiresAt: new Date(Date.now() + 150000) } : null),
      upsert: vi.fn().mockImplementation(async (args: { create: { leaseId: string } }) => { leaseId = args.create.leaseId; }),
      delete: vi.fn().mockResolvedValue({}),
    },
  };
  const client = {
    $transaction: vi.fn().mockImplementation(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx)),
    estimate: { findUnique: vi.fn().mockRejectedValue(readbackError) },
    analysisJob: { deleteMany: vi.fn().mockReturnValue(cleanup) },
  };
  mocks.client.mockReturnValue(client);
  mocks.database.mockImplementation((work: () => Promise<unknown>) => work());
  mocks.load.mockResolvedValue(input);
  // Generation itself is outside this fault-injection test; the real provider is IN_SCOPE separately.
  const source = input.sources.find(s => s.clauseId === "B2")!;
  mocks.generate.mockResolvedValue({ analysis: { schemaVersion: 1, explanation: "The form is agreed.", tasks: [{
    id: "T1", title: "Agreed contact form", classification: "IN_SCOPE",
    matchedScopeClause: { sourceType: source.sourceType, sourceId: source.sourceId, relation: "inclusion" },
    sourceEvidence: [{ sourceType: source.sourceType, sourceId: source.sourceId, quote: source.text }],
    estimatedHours: { minimum: 0, likely: 0, maximum: 0 }, assumptions: [], complexity: "Low", risks: [], missingInformation: [], explanation: "The form is agreed.",
  }] }, provider: "test", model: "test", promptVersion: "test", repaired: false });

  const result = analyzeRequest(input.requestId, { idempotencyKey: input.requestId }, input.projectId)
    .then(() => null, error => error);
  try {
    await vi.waitFor(() => expect(client.analysisJob.deleteMany).toHaveBeenCalledOnce());
    // Give the event loop a turn while cleanup is pending. A detached rejection fails Vitest here.
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(client.estimate.findUnique).toHaveBeenCalledOnce();
    expect(tx.estimate.create).toHaveBeenCalledOnce();
    expect(tx.estimateRevision.create).toHaveBeenCalledOnce();
    expect(tx.auditEvent.create).toHaveBeenCalledOnce();
  } finally { releaseCleanup(); }
  expect(await result).toBe(readbackError);
});
