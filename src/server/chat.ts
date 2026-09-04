import "server-only";
import { z } from "zod";
import { chatInputSchema, citationLabels, type ChatAnswer, type ChatCitationSourceType, type DecisionListItem, type ValidatedCitation } from "@/lib/chat";
import { chatOutputSchema } from "@/lib/contracts";
import { baselineSnapshotSchema } from "@/lib/intake";
import { clientProposalSnapshotSchema } from "@/lib/proposals";
import { readRevision } from "@/lib/review";
import { compareRevisions, deriveDecisionStatus, normalizeMemorySearch } from "@/lib/memory";
import { db, database } from "./db";
import { getProject } from "./projects";
import { AppError } from "./errors";
import { amendmentSchema } from "./scope";
import { analysisLimits } from "./ai/analyze";
import { chatMessages, chatResponseSchema, CHAT_PROMPT_VERSION } from "./ai/chat-prompt";
import { createAIProvider, type AIProvider } from "./ai/provider";

type Scenario = { minimum: number; likely: number; maximum: number };
type CitableSource = { sourceType: ChatCitationSourceType; sourceId: string; text: string; href: string; relevance: number };

function encodeAnchor(value: string) { return encodeURIComponent(value); }
function score(text: string, tokens: string[]) {
  if (!tokens.length) return 0;
  const haystack = normalizeMemorySearch(text);
  return tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
}

async function loadProjectRecords(projectId: string) {
  const project = await getProject(projectId); // enforces owner-scoped access
  const record = await database(() => db().project.findUnique({ where: { id: project.id }, include: {
    baseline: true,
    requests: { orderBy: [{ requestNumber: "asc" }], include: { estimate: { include: { revisions: { orderBy: [{ revision: "asc" }] }, proposals: { include: { decision: true } } } } } },
    decisions: { orderBy: [{ decidedAt: "asc" }, { id: "asc" }], include: { supersededBy: { select: { id: true } }, supersedesDecision: { select: { id: true } }, proposal: { select: { id: true, decisionComment: true } } } },
  } }));
  if (!record) throw new AppError("NOT_FOUND", "Project not found.", 404);
  return { projectId: project.id, record };
}

// Retrieve every owner-scoped, project-scoped record the chatbot may cite, plus deterministic price
// history. Application-owned Prisma queries only — the model never generates SQL or runs tools.
export async function retrieveChatEvidence(projectId: string, question: string) {
  const { record } = await loadProjectRecords(projectId);
  const tokens = normalizeMemorySearch(question).split(" ").filter(token => token.length > 2);
  const sources = new Map<string, CitableSource>();
  const add = (sourceType: ChatCitationSourceType, sourceId: string, text: string, href: string) => {
    if (!text) return; const key = `${sourceType}::${sourceId}`;
    if (!sources.has(key)) sources.set(key, { sourceType, sourceId, text, href, relevance: score(text, tokens) });
  };

  const baseline = record.baseline ? baselineSnapshotSchema.safeParse(record.baseline.clausesJson) : null;
  const baselineClauses = baseline?.success ? baseline.data.clauses.map(clause => {
    const sourceId = `${record.baseline!.id}:${clause.id}`;
    add("baseline_clause", sourceId, clause.text, `/projects/${projectId}/baseline#clause-${encodeAnchor(clause.id)}`);
    return { sourceId, clauseId: clause.id, text: clause.text, isDeliverable: clause.isDeliverable };
  }) : [];

  const amendments: { sourceId: string; text: string; status: string; fromDecisionId: string; amendsSourceIds: string[] }[] = [];
  const decisions: { sourceId: string; requestNumber: number; outcome: string; status: string; finalDecisionText: string; decidedAt: string; changesScope: boolean; totalChargePaise: Scenario; supersedesDecisionId: string | null; supersededByDecisionId: string | null }[] = [];
  const clientComments: { sourceId: string; decisionId: string; outcome: string; text: string }[] = [];
  for (const decision of record.decisions) {
    const status = deriveDecisionStatus(decision.outcome, !!decision.supersededBy);
    const snapshot = clientProposalSnapshotSchema.safeParse(decision.approvedSnapshotJson);
    const totalChargePaise = snapshot.success ? snapshot.data.client.calculated.totalChargePaise : { minimum: 0, likely: 0, maximum: 0 };
    const changesScope = decision.outcome === "ACCEPTED" && (snapshot.success ? snapshot.data.client.agreement.clauses.length > 0 || !!snapshot.data.client.agreement.supersedesDecisionId : false);
    add("decision", decision.id, decision.finalDecisionText, `/projects/${projectId}/memory/${decision.id}`);
    decisions.push({ sourceId: decision.id, requestNumber: 0, outcome: decision.outcome, status, finalDecisionText: decision.finalDecisionText, decidedAt: decision.decidedAt.toISOString(), changesScope, totalChargePaise, supersedesDecisionId: decision.supersedesDecisionId, supersededByDecisionId: decision.supersededBy?.id ?? null });
    if (decision.proposal.decisionComment) { add("client_comment", decision.proposal.id, decision.proposal.decisionComment, `/projects/${projectId}/memory/${decision.id}`); clientComments.push({ sourceId: decision.proposal.id, decisionId: decision.id, outcome: decision.outcome, text: decision.proposal.decisionComment }); }
    if (decision.outcome === "ACCEPTED") {
      const parsed = amendmentSchema.safeParse(decision.amendmentClausesJson);
      if (parsed.success) for (const clause of parsed.data.clauses) {
        const sourceId = `${decision.id}:${clause.id}`;
        add("accepted_change_clause", sourceId, clause.text, `/projects/${projectId}/memory/${decision.id}#clause-${encodeAnchor(clause.id)}`);
        amendments.push({ sourceId, text: clause.text, status, fromDecisionId: decision.id, amendsSourceIds: clause.amendsSourceIds });
      }
    }
  }

  const requests: { sourceId: string; requestNumber: number; text: string; origin: string; status: string }[] = [];
  const revisions: { sourceId: string; estimateId: string; requestNumber: number; revision: number; createdBy: string; editReason: string | null; totalChargePaise: Scenario }[] = [];
  const priceHistory: { estimateId: string; requestNumber: number; from: { revision: number; totalChargePaise: Scenario }; to: { revision: number; totalChargePaise: Scenario }; editReason: string | null; changedFields: string[] }[] = [];
  for (const request of record.requests) {
    const estimate = request.estimate;
    const currentProposal = estimate?.proposals.find(p => p.id === estimate.currentProposalId);
    const decision = estimate?.proposals.find(p => p.decision)?.decision ?? null;
    const status = !estimate ? "NOT_ANALYZED" : decision ? decision.outcome : currentProposal?.status === "PENDING" ? "OFFER_PENDING" : estimate.status;
    add("request", request.id, request.text, `/projects/${projectId}/requests`);
    requests.push({ sourceId: request.id, requestNumber: request.requestNumber, text: request.text, origin: request.origin, status });
    const matchingDecision = decisions.find(d => estimate?.proposals.some(p => p.decision && p.id && d.sourceId === p.decision.id));
    if (matchingDecision) matchingDecision.requestNumber = request.requestNumber;
    if (!estimate) continue;
    let previous: ReturnType<typeof readRevision> | null = null;
    for (const revision of estimate.revisions) {
      let saved: ReturnType<typeof readRevision>;
      try { saved = readRevision(revision.snapshotJson); } catch { continue; }
      if (revision.editReason) add("estimate_revision", revision.id, revision.editReason, `/projects/${projectId}/estimates/${estimate.id}`);
      revisions.push({ sourceId: revision.id, estimateId: estimate.id, requestNumber: request.requestNumber, revision: revision.revision, createdBy: revision.createdBy, editReason: revision.editReason, totalChargePaise: saved.calculated.totalChargePaise });
      if (previous) {
        const comparison = compareRevisions(previous, saved);
        const changedFields = [...new Set(comparison.tasks.flatMap(t => t.kind === "CHANGED" ? t.fields : [t.kind.toLowerCase()]))];
        if (comparison.hourlyRatePaise.delta) changedFields.push("hourlyRate");
        if (comparison.additionalChargePaise.delta) changedFields.push("additionalCharge");
        priceHistory.push({ estimateId: estimate.id, requestNumber: request.requestNumber, from: { revision: revision.revision - 1, totalChargePaise: previous.calculated.totalChargePaise }, to: { revision: revision.revision, totalChargePaise: saved.calculated.totalChargePaise }, editReason: revision.editReason, changedFields });
      }
      previous = saved;
    }
  }

  const evidence = { baselineClauses, amendments, requests, decisions, clientComments, revisions, priceHistory };
  return { evidence, sources };
}

function withinBudget(messages: { content: string }[]) {
  const limits = analysisLimits();
  return messages.reduce((sum, m) => sum + Buffer.byteLength(m.content, "utf8"), 0) + limits.output + 1024 <= limits.context;
}

export async function answerProjectChat(projectId: string, body: unknown, provider: AIProvider = createAIProvider(), signal: AbortSignal = AbortSignal.timeout(90_000)): Promise<ChatAnswer> {
  const input = chatInputSchema.parse(body);
  const { evidence, sources } = await retrieveChatEvidence(projectId, input.question);
  const limits = analysisLimits();

  // Trim least-relevant citable evidence to fit the configured budget rather than silently omitting
  // authoritative records. Decisions and accepted amendments are never dropped; if the core still
  // overflows, return CONTEXT_TOO_LARGE. Any drop is disclosed as a subset.
  let working = evidence, subset = false;
  const dropOrder: ("revisions" | "priceHistory" | "requests" | "clientComments")[] = ["priceHistory", "revisions", "clientComments", "requests"];
  for (const key of [null, ...dropOrder] as const) {
    if (key) { working = { ...working, [key]: [] }; subset = true; }
    if (withinBudget(chatMessages(input, working))) break;
    if (key === dropOrder[dropOrder.length - 1]) throw new AppError("CONTEXT_TOO_LARGE", "This project's records exceed the configured chat context budget. Ask a narrower question, or use Show All Decisions for the complete list.", 422);
  }

  const messages = chatMessages(input, working);
  for (let attempt = 0; attempt < 2; attempt++) {
    signal.throwIfAborted();
    const result = await provider.generate({ messages, maxOutputTokens: limits.output, responseSchema: chatResponseSchema, signal });
    const validated = validateChatOutput(result.text, sources);
    if (validated.ok) return { ...validated.answer, subset };
    if (attempt === 1) throw new AppError("AI_OUTPUT_INVALID", "The chat answer could not be validated against project evidence after one repair attempt. Please retry.", 502, true);
    messages.push({ role: "assistant", content: result.text }, { role: "user", content: `Your response failed validation: ${validated.reason} Return corrected JSON. Use only the exact sourceType and sourceId values from the supplied evidence, and quotes that are verbatim substrings of that source's text. If nothing supports an answer, set insufficientEvidence true with empty citations.` });
  }
  throw new AppError("AI_OUTPUT_INVALID", "No valid chat answer was returned.", 502, true);
}

function validateChatOutput(text: string, sources: Map<string, CitableSource>): { ok: true; answer: Omit<ChatAnswer, "subset"> } | { ok: false; reason: string } {
  let parsed: z.infer<typeof chatOutputSchema>;
  try { parsed = chatOutputSchema.parse(JSON.parse(text)); } catch { return { ok: false, reason: "The output was not JSON matching the schema." }; }
  const citations: ValidatedCitation[] = [];
  for (const citation of parsed.citations) {
    const source = sources.get(`${citation.sourceType}::${citation.sourceId}`);
    if (!source) return { ok: false, reason: `Citation ${citation.sourceType}/${citation.sourceId} is not a supplied source for this project.` };
    if (!source.text.includes(citation.quote)) return { ok: false, reason: `A quote for ${citation.sourceType}/${citation.sourceId} is not an exact substring of the saved source.` };
    citations.push({ sourceType: citation.sourceType, sourceId: citation.sourceId, quote: citation.quote, label: citationLabels[citation.sourceType], href: source.href });
  }
  if (!parsed.insufficientEvidence && citations.length === 0 && /\b(clause|decision|accepted|declined|price|₹|revision)\b/i.test(parsed.answer)) {
    return { ok: false, reason: "A substantive answer must cite at least one supplied source or set insufficientEvidence true." };
  }
  return { ok: true, answer: { answer: parsed.answer, citations, insufficientEvidence: parsed.insufficientEvidence } };
}

// Deterministic, complete decision list for the "Show All Decisions" action. No AI, no pagination,
// no summarization: every recorded final decision in this owner-scoped project.
export async function listProjectDecisions(projectId: string): Promise<DecisionListItem[]> {
  const { record } = await loadProjectRecords(projectId);
  const byRequest = new Map<string, number>();
  for (const request of record.requests) if (request.estimate) for (const proposal of request.estimate.proposals) if (proposal.decision) byRequest.set(proposal.decision.id, request.requestNumber);
  return record.decisions
    .toSorted((a, b) => b.decidedAt.getTime() - a.decidedAt.getTime() || b.id.localeCompare(a.id))
    .map(decision => {
      const snapshot = clientProposalSnapshotSchema.safeParse(decision.approvedSnapshotJson);
      const totalChargePaise = snapshot.success ? snapshot.data.client.calculated.totalChargePaise : { minimum: 0, likely: 0, maximum: 0 };
      const changesScope = decision.outcome === "ACCEPTED" && (snapshot.success ? snapshot.data.client.agreement.clauses.length > 0 || !!snapshot.data.client.agreement.supersedesDecisionId : false);
      return { id: decision.id, requestNumber: byRequest.get(decision.id) ?? 0, title: decision.title, outcome: decision.outcome, status: deriveDecisionStatus(decision.outcome, !!decision.supersededBy), decidedAt: decision.decidedAt.toISOString(), changesScope, totalChargePaise, href: `/projects/${projectId}/memory/${decision.id}` };
    });
}

export { CHAT_PROMPT_VERSION };
