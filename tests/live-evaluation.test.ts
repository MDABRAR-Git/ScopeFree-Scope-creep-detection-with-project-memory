import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { generateAnalysis } from "../src/server/ai/analyze";
import { scopeCases, caseInput } from "./evaluation/scope-cases";
import { SCOPE_PROMPT_VERSION } from "../src/server/ai/scope-prompt";
const enabled = process.env.SCOPEFREE_LIVE_EVAL === "true";
const observations: unknown[] = [];
function saveObservations() {
  mkdirSync('.local/evaluation', { recursive: true });
  writeFileSync('.local/evaluation/milestone-3-live.json', JSON.stringify({ at: new Date().toISOString(), provider: process.env.AI_PROVIDER, model: process.env.AI_MODEL, promptVersion: SCOPE_PROMPT_VERSION, thinking: process.env.AI_THINKING ?? 'default', reasoningEffort: process.env.AI_REASONING_EFFORT ?? 'default', maxOutputTokens: Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 6000), requestTimeoutMs: Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 30000), results: observations }, null, 2));
}
describe.skipIf(!enabled)("live scope evaluation - real provider, no prescribed effort values", () => {
  afterAll(saveObservations);
  it.each(scopeCases)("$id", async testCase => {
    const start = Date.now();
    console.log(`Live case ${testCase.id}: starting`);
    try {
      const result = await generateAnalysis(caseInput(testCase), AbortSignal.timeout(120000));
      const categories = [...new Set(result.analysis.tasks.map(t => t.classification))].sort();
      const cited = result.analysis.tasks.flatMap(t => t.sourceEvidence.map(e => e.sourceId.split(':').at(-1)));
      const categoriesMatch = JSON.stringify(categories) === JSON.stringify([...testCase.categories].sort());
      const evidenceMatch = testCase.evidence.every(id => cited.includes(id));
      observations.push({ id: testCase.id, elapsedMs: Date.now()-start, categoriesMatch, evidenceMatch, ...result });
      saveObservations();
      console.log(`Live case ${testCase.id}: classifications=${categoriesMatch}, evidence=${evidenceMatch}, ${Date.now()-start}ms`);
      expect(categories).toEqual([...testCase.categories].sort());
      expect(evidenceMatch).toBe(true);
    } catch (error) {
      if (!observations.some(o => (o as { id: string }).id === testCase.id)) observations.push({ id: testCase.id, elapsedMs: Date.now()-start, error: error instanceof Error ? error.message : 'Error' });
      saveObservations();
      console.log(`Live case ${testCase.id}: failed after ${Date.now()-start}ms`);
      throw error;
    }
  }, 125000);
});
