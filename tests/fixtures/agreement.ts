import type { ReviewDraft } from "../../src/lib/pricing";
import type { Agreement } from "../../src/lib/agreement";
// Synthetic terms for isolated automated checks only; never imported by application code.
export function testAgreement(draft: ReviewDraft): Agreement {
  return { clauses: draft.analysis.tasks.filter(t => t.classification !== "IN_SCOPE").map((t,i) => ({ id: `A${i+1}`, taskIds: [t.id], text: `Implement the reviewed additional website functionality for task ${i+1}.`, amendsSourceIds: t.classification === "MODIFICATION" && t.matchedScopeClause ? [t.matchedScopeClause.sourceId] : [] })), supersedesDecisionId: null };
}
