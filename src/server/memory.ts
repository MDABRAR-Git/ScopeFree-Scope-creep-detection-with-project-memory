import "server-only";
import { z } from "zod";
import { evidenceSchema, projectIdSchema } from "@/lib/contracts";
import { baselineSnapshotSchema } from "@/lib/intake";
import { pinnedInputSchema, validateAnalysis } from "@/lib/analysis";
import { validateAgreement } from "@/lib/agreement";
import { amendmentSchema } from "./scope";
import { clientProposalSnapshotSchema } from "@/lib/proposals";
import { compareRevisions, deriveDecisionStatus, matchesMemorySearch, memoryQuerySchema, memoryRowSchema, pendingAvailability, sortMemoryRows, type MemoryQuery, type MemoryRow } from "@/lib/memory";
import { readRevision, readStoredAnalysis } from "@/lib/review";
import { db, database } from "./db";
import { getProject } from "./projects";
import { AppError } from "./errors";

const tagsSchema = z.array(z.string().trim().min(1).max(200)).max(40);
const referencesSchema = z.array(evidenceSchema).max(400);
function invalid(message = "A saved Project Memory record needs operator attention."): never {
  throw new AppError("INVALID_ESTIMATE", message, 422);
}
function assertEqual(left: unknown, right: unknown) {
  if (JSON.stringify(left) !== JSON.stringify(right)) invalid();
}
function parseOffer(value: unknown) {
  const parsed = clientProposalSnapshotSchema.safeParse(value);
  if (!parsed.success) invalid("A saved offer in Project Memory needs operator attention.");
  return parsed.data;
}
function scopeEffect(snapshot: ReturnType<typeof parseOffer>) {
  return snapshot.client.agreement.clauses.length > 0 || !!snapshot.client.agreement.supersedesDecisionId;
}
type KnownSource = { sourceType: "baseline_clause" | "accepted_change_clause"; recordId: string; clauseId: string; text: string };
function validateSnapshotContext(snapshot: ReturnType<typeof parseOffer>, estimate: { id: string; requestId: string; originalInputJson: unknown }, request: { id: string }, projectId: string, knownSources: Map<string, KnownSource>) {
  const pinned = pinnedInputSchema.safeParse(estimate.originalInputJson);
  if (!pinned.success || pinned.data.projectId !== projectId || pinned.data.requestId !== request.id || estimate.requestId !== request.id) invalid();
  for (const source of pinned.data.sources) {
    const known = knownSources.get(source.sourceId);
    if (!known || known.sourceType !== source.sourceType || known.recordId !== source.recordId || known.clauseId !== source.clauseId || known.text !== source.text) invalid();
  }
  try { validateAnalysis(snapshot.reviewed.analysis, pinned.data.sources); validateAgreement(snapshot.reviewed.agreement, snapshot.reviewed.analysis, pinned.data.sources, true); }
  catch { invalid(); }
  return pinned.data;
}
function decisionSearchText(input: { row: MemoryRow; finalDecisionText: string; clientComment: string; tags: string[]; snapshot: ReturnType<typeof parseOffer> }) {
  const { row, finalDecisionText, clientComment, tags, snapshot } = input;
  return [row.requestNumber, row.requestText, row.title, finalDecisionText, clientComment, ...tags,
    ...snapshot.reviewed.analysis.tasks.flatMap(task => [task.title, task.explanation, ...task.assumptions]),
    ...snapshot.client.agreement.clauses.map(clause => clause.text)].join(" ");
}
function pendingSearchText(row: MemoryRow, snapshot: ReturnType<typeof parseOffer>) {
  return [row.requestNumber, row.requestText, row.title,
    ...snapshot.reviewed.analysis.tasks.flatMap(task => [task.title, task.explanation, ...task.assumptions]),
    ...snapshot.client.agreement.clauses.map(clause => clause.text)].join(" ");
}

export async function getProjectMemory(projectId: string, rawQuery: unknown = {}) {
  const query = memoryQuerySchema.parse(rawQuery);
  const project = await getProject(projectId);
  const record = await database(() => db().project.findUnique({ where: { id: project.id }, include: {
    baseline: true,
    decisions: { orderBy: [{ decidedAt: "desc" }, { id: "desc" }], include: {
      proposal: { include: { approvedRevision: true, estimate: { include: { request: true } } } },
      supersededBy: { select: { id: true, projectId: true, outcome: true } },
    } },
    proposals: { where: { status: "PENDING" }, include: { decision: true, approvedRevision: true, estimate: { include: { request: true } } } },
  } }));
  if (!record) throw new AppError("NOT_FOUND", "Project not found.", 404);
  let baselineClauseCount = 0;
  const knownSources = new Map<string, KnownSource>();
  if (record.baseline) {
    const baseline = baselineSnapshotSchema.safeParse(record.baseline.clausesJson);
    if (!baseline.success) invalid("The original baseline in Project Memory needs operator attention.");
    baselineClauseCount = baseline.data.clauses.length;
    for (const clause of baseline.data.clauses) knownSources.set(`${record.baseline.id}:${clause.id}`, { sourceType: "baseline_clause", recordId: record.baseline.id, clauseId: clause.id, text: clause.text });
  }
  for (const decision of record.decisions) if (decision.outcome === "ACCEPTED") {
    const amendments = amendmentSchema.safeParse(decision.amendmentClausesJson); if (!amendments.success) invalid();
    for (const clause of amendments.data.clauses) knownSources.set(`${decision.id}:${clause.id}`, { sourceType: "accepted_change_clause", recordId: decision.id, clauseId: clause.id, text: clause.text });
  }
  const candidates: { row: MemoryRow; searchText: string }[] = [];
  for (const decision of record.decisions) {
    const proposal = decision.proposal, estimate = proposal.estimate, request = estimate.request;
    if (decision.projectId !== record.id || proposal.projectId !== record.id || request.projectId !== record.id || proposal.estimateId !== estimate.id || proposal.approvedRevisionId !== proposal.approvedRevision.id || proposal.approvedRevision.estimateId !== estimate.id) invalid();
    if (decision.supersededBy && (decision.supersededBy.projectId !== record.id || decision.supersededBy.outcome !== "ACCEPTED")) invalid();
    const snapshot = parseOffer(decision.approvedSnapshotJson);
    const proposalSnapshot = parseOffer(proposal.snapshotJson);
    assertEqual(snapshot, proposalSnapshot);
    validateSnapshotContext(snapshot, estimate, request, record.id, knownSources);
    assertEqual(readRevision(proposal.approvedRevision.snapshotJson), { ...snapshot.reviewed, legacy: false });
    if (snapshot.client.requestNumber !== request.requestNumber || snapshot.client.requestText !== request.text || snapshot.client.approvedRevision !== proposal.approvedRevision.revision) invalid();
    if (proposal.status !== decision.outcome || !proposal.decidedAt || proposal.decidedAt.getTime() !== decision.decidedAt.getTime()) invalid();
    const tags = tagsSchema.safeParse(decision.tagsJson); if (!tags.success) invalid();
    const references = referencesSchema.safeParse(decision.sourceReferencesJson); if (!references.success) invalid();
    assertEqual(references.data, snapshot.reviewed.analysis.tasks.flatMap(task => task.sourceEvidence));
    const amendments = amendmentSchema.safeParse(decision.amendmentClausesJson); if (!amendments.success) invalid();
    if (decision.outcome === "ACCEPTED") assertEqual(amendments.data.clauses.map(c => ({ id: c.id, text: c.text, amendsSourceIds: c.amendsSourceIds })), snapshot.client.agreement.clauses.map(c => ({ id: c.id, text: c.text, amendsSourceIds: c.amendsSourceIds })));
    else if (amendments.data.clauses.length || decision.supersedesDecisionId) invalid();
    const status = deriveDecisionStatus(decision.outcome, !!decision.supersededBy);
    const row = memoryRowSchema.parse({
      id: decision.id, kind: "DECISION", status, availability: null, requestId: request.id, estimateId: estimate.id,
      requestNumber: request.requestNumber, requestText: request.text, title: decision.title, occurredAt: decision.decidedAt.toISOString(),
      changesScope: decision.outcome === "ACCEPTED" && scopeEffect(snapshot), clientCommentPresent: !!proposal.decisionComment,
      approvedRevision: snapshot.client.approvedRevision, totalChargePaise: snapshot.client.calculated.totalChargePaise,
      supersedesDecisionId: decision.supersedesDecisionId, supersededByDecisionId: decision.supersededBy?.id ?? null,
    });
    candidates.push({ row, searchText: decisionSearchText({ row, finalDecisionText: decision.finalDecisionText, clientComment: proposal.decisionComment ?? "", tags: tags.data, snapshot }) });
  }
  for (const proposal of record.proposals) {
    if (proposal.decision || proposal.estimate.currentProposalId !== proposal.id) continue;
    const estimate = proposal.estimate, request = estimate.request;
    if (proposal.projectId !== record.id || request.projectId !== record.id || proposal.approvedRevisionId !== proposal.approvedRevision.id || proposal.approvedRevision.estimateId !== estimate.id) invalid();
    const snapshot = parseOffer(proposal.snapshotJson);
    validateSnapshotContext(snapshot, estimate, request, record.id, knownSources);
    assertEqual(readRevision(proposal.approvedRevision.snapshotJson), { ...snapshot.reviewed, legacy: false });
    if (snapshot.client.requestNumber !== request.requestNumber || snapshot.client.requestText !== request.text || snapshot.client.approvedRevision !== proposal.approvedRevision.revision) invalid();
    const row = memoryRowSchema.parse({
      id: proposal.id, kind: "PENDING_OFFER", status: "PENDING",
      availability: pendingAvailability({ expiresAt: proposal.expiresAt, basedOnScopeRevision: proposal.basedOnScopeRevision, projectScopeRevision: record.scopeRevision, approvedRevisionId: proposal.approvedRevisionId, currentApprovedRevisionId: estimate.approvedRevisionId }),
      requestId: request.id, estimateId: estimate.id, requestNumber: request.requestNumber, requestText: request.text,
      title: `Pending offer · Request #${request.requestNumber}`, occurredAt: proposal.createdAt.toISOString(), changesScope: scopeEffect(snapshot), clientCommentPresent: false,
      approvedRevision: snapshot.client.approvedRevision, totalChargePaise: snapshot.client.calculated.totalChargePaise,
      supersedesDecisionId: snapshot.client.agreement.supersedesDecisionId, supersededByDecisionId: null,
    });
    candidates.push({ row, searchText: pendingSearchText(row, snapshot) });
  }
  const allRows = sortMemoryRows(candidates.map(candidate => candidate.row));
  const search = new Map(candidates.map(candidate => [candidate.row.id, candidate.searchText]));
  const rows = allRows.filter(row => (query.status === "ALL" || row.status === query.status) && matchesMemorySearch(search.get(row.id)!, query.q));
  const count = (status: MemoryRow["status"]) => allRows.filter(row => row.status === status).length;
  return {
    query, rows, total: allRows.length,
    summary: { accepted: count("ACCEPTED"), superseded: count("SUPERSEDED"), declined: count("DECLINED"), pending: count("PENDING") },
    scope: { baselineClauseCount, currentAcceptedAmendments: allRows.filter(row => row.status === "ACCEPTED" && row.changesScope).length, scopeRevision: record.scopeRevision },
  };
}
export type ProjectMemory = Awaited<ReturnType<typeof getProjectMemory>>;

export async function getMemoryDecision(projectId: string, decisionId: string) {
  if (!projectIdSchema.safeParse(decisionId).success) throw new AppError("NOT_FOUND", "Memory decision not found.", 404);
  const project = await getProject(projectId);
  const decision = await database(() => db().projectDecision.findFirst({
    where: { id: decisionId, projectId },
    include: {
      supersedesDecision: { select: { id: true, title: true, decidedAt: true, projectId: true, outcome: true } },
      supersededBy: { select: { id: true, title: true, decidedAt: true, projectId: true, outcome: true } },
      proposal: { include: {
        approvedRevision: true,
        estimate: { include: {
          request: true,
          revisions: { orderBy: [{ revision: "asc" }, { id: "asc" }] },
          proposals: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { decision: true } },
        } },
      } },
    },
  }));
  if (!decision) throw new AppError("NOT_FOUND", "Memory decision not found.", 404);
  const proposal = decision.proposal, estimate = proposal.estimate, request = estimate.request;
  if (proposal.projectId !== projectId || request.projectId !== projectId || proposal.approvedRevision.estimateId !== estimate.id || proposal.approvedRevisionId !== proposal.approvedRevision.id) invalid();
  for (const related of [decision.supersedesDecision, decision.supersededBy]) if (related && (related.projectId !== projectId || related.outcome !== "ACCEPTED")) invalid();
  const snapshot = parseOffer(decision.approvedSnapshotJson); assertEqual(snapshot, parseOffer(proposal.snapshotJson));
  const acceptedSources = await database(() => db().projectDecision.findMany({ where: { projectId, outcome: "ACCEPTED" }, include: { supersededBy: { select: { id: true, outcome: true, projectId: true } } } }));
  const acceptedIndex = new Map(acceptedSources.map(source => [source.id, source]));
  const baseline = await database(() => db().baseline.findUnique({ where: { projectId } }));
  if (!baseline) invalid("The pinned baseline for this decision is unavailable.");
  const baselineSnapshot = baselineSnapshotSchema.safeParse(baseline.clausesJson); if (!baselineSnapshot.success) invalid();
  const knownSources = new Map<string, KnownSource>();
  for (const clause of baselineSnapshot.data.clauses) knownSources.set(`${baseline.id}:${clause.id}`, { sourceType: "baseline_clause", recordId: baseline.id, clauseId: clause.id, text: clause.text });
  for (const sourceDecision of acceptedSources) {
    const sourceAmendment = amendmentSchema.safeParse(sourceDecision.amendmentClausesJson); if (!sourceAmendment.success) invalid();
    for (const clause of sourceAmendment.data.clauses) knownSources.set(`${sourceDecision.id}:${clause.id}`, { sourceType: "accepted_change_clause", recordId: sourceDecision.id, clauseId: clause.id, text: clause.text });
  }
  const pinned = validateSnapshotContext(snapshot, estimate, request, projectId, knownSources);
  if (baseline.id !== pinned.baselineId) invalid("The pinned baseline for this decision is unavailable.");
  assertEqual(readRevision(proposal.approvedRevision.snapshotJson), { ...snapshot.reviewed, legacy: false });
  if (snapshot.client.requestNumber !== request.requestNumber || snapshot.client.requestText !== request.text || snapshot.client.approvedRevision !== proposal.approvedRevision.revision) invalid();
  const originalAnalysis = (() => { try { return validateAnalysis(readStoredAnalysis(estimate.originalAiJson), pinned.sources); } catch { invalid(); } })();
  const tags = tagsSchema.safeParse(decision.tagsJson); if (!tags.success) invalid();
  const references = referencesSchema.safeParse(decision.sourceReferencesJson); if (!references.success) invalid();
  const amendments = amendmentSchema.safeParse(decision.amendmentClausesJson); if (!amendments.success) invalid();
  if (decision.outcome === "ACCEPTED") assertEqual(amendments.data.clauses.map(c => ({ id: c.id, text: c.text, amendsSourceIds: c.amendsSourceIds })), snapshot.client.agreement.clauses.map(c => ({ id: c.id, text: c.text, amendsSourceIds: c.amendsSourceIds })));
  else if (amendments.data.clauses.length || decision.supersedesDecisionId) invalid();
  const revisions = estimate.revisions.map(revision => {
    let saved: ReturnType<typeof readRevision>; try { saved = readRevision(revision.snapshotJson); validateAnalysis(saved.analysis, pinned.sources); } catch { invalid(); }
    return { id: revision.id, revision: revision.revision, createdAt: revision.createdAt.toISOString(), createdBy: revision.createdBy, editReason: revision.editReason,
      snapshot: saved, comparison: null as ReturnType<typeof compareRevisions> | null };
  });
  revisions.forEach((revision, index) => { if (index) revision.comparison = compareRevisions(revisions[index - 1].snapshot, revision.snapshot); });
  const evidence = snapshot.reviewed.analysis.tasks.flatMap(task => task.sourceEvidence.map(reference => {
    const source = pinned.sources.find(item => item.sourceType === reference.sourceType && item.sourceId === reference.sourceId);
    if (!source || !source.text.includes(reference.quote)) invalid("A saved Project Memory citation needs operator attention.");
    if (source.sourceType === "baseline_clause") {
      const clause = baselineSnapshot.data.clauses.find(item => item.id === source.clauseId);
      if (source.recordId !== baseline.id || !clause || clause.text !== source.text) invalid();
      return { taskId: task.id, taskTitle: task.title, sourceType: source.sourceType, sourceId: source.sourceId, clauseId: source.clauseId, quote: reference.quote, href: `/projects/${projectId}/baseline#clause-${encodeURIComponent(source.clauseId)}`, historical: false };
    }
    const sourceDecision = acceptedIndex.get(source.recordId); if (!sourceDecision) invalid();
    const sourceAmendment = amendmentSchema.safeParse(sourceDecision.amendmentClausesJson); if (!sourceAmendment.success) invalid();
    const clause = sourceAmendment.data.clauses.find(item => item.id === source.clauseId);
    if (source.sourceId !== `${sourceDecision.id}:${source.clauseId}` || !clause || clause.text !== source.text) invalid();
    return { taskId: task.id, taskTitle: task.title, sourceType: source.sourceType, sourceId: source.sourceId, clauseId: source.clauseId, quote: reference.quote, href: `/projects/${projectId}/memory/${sourceDecision.id}#clause-${encodeURIComponent(source.clauseId)}`, historical: sourceDecision.supersededBy?.outcome === "ACCEPTED" };
  }));
  assertEqual(references.data, snapshot.reviewed.analysis.tasks.flatMap(task => task.sourceEvidence));
  const status = deriveDecisionStatus(decision.outcome, !!decision.supersededBy);
  const row = memoryRowSchema.parse({ id: decision.id, kind: "DECISION", status, availability: null, requestId: request.id, estimateId: estimate.id,
    requestNumber: request.requestNumber, requestText: request.text, title: decision.title, occurredAt: decision.decidedAt.toISOString(), changesScope: decision.outcome === "ACCEPTED" && scopeEffect(snapshot),
    clientCommentPresent: !!proposal.decisionComment, approvedRevision: snapshot.client.approvedRevision, totalChargePaise: snapshot.client.calculated.totalChargePaise,
    supersedesDecisionId: decision.supersedesDecisionId, supersededByDecisionId: decision.supersededBy?.id ?? null });
  const offerHistory = estimate.proposals.map(item => {
    if (item.projectId !== projectId || item.estimateId !== estimate.id) invalid();
    if (item.status === "ACCEPTED" || item.status === "DECLINED") {
      if (!item.decision || item.decision.projectId !== projectId || item.decision.proposalId !== item.id || item.decision.outcome !== item.status || !item.decidedAt || item.decision.decidedAt.getTime() !== item.decidedAt.getTime()) invalid();
    } else if (item.decision || item.decidedAt) invalid();
    const offer = parseOffer(item.snapshotJson);
    const state = item.status === "ACCEPTED" ? "FINAL_ACCEPTED" : item.status === "DECLINED" ? "FINAL_DECLINED" : item.status === "REVOKED" ? (estimate.proposals.some(next => next.replacesProposalId === item.id) ? "REPLACED" : "REVOKED") : item.expiresAt <= new Date() ? "EXPIRED" : item.id !== estimate.currentProposalId || item.basedOnScopeRevision !== project.scopeRevision || item.approvedRevisionId !== estimate.approvedRevisionId ? "STALE" : "PENDING_ACTIVE";
    return { id: item.id, state, createdAt: item.createdAt.toISOString(), expiresAt: item.expiresAt.toISOString(), decidedAt: item.decidedAt?.toISOString() ?? null, approvedRevision: offer.client.approvedRevision, totalChargePaise: offer.client.calculated.totalChargePaise };
  });
  return {
    row, finalDecisionText: decision.finalDecisionText, clientComment: proposal.decisionComment ?? "", tags: tags.data, offer: snapshot.client,
    amendmentClauses: amendments.data.clauses,
    supersession: {
      replaces: decision.supersedesDecision ? { ...decision.supersedesDecision, decidedAt: decision.supersedesDecision.decidedAt.toISOString() } : null,
      replacedBy: decision.supersededBy ? { ...decision.supersededBy, decidedAt: decision.supersededBy.decidedAt.toISOString() } : null,
    },
    offerHistory, evidence,
    original: { analysis: originalAnalysis, createdAt: estimate.createdAt.toISOString(), provenance: { provider: estimate.provider, model: estimate.model, promptVersion: estimate.promptVersion } },
    revisions,
  };
}
export type MemoryDecision = Awaited<ReturnType<typeof getMemoryDecision>>;

export function queryFromSearchParams(params: URLSearchParams): MemoryQuery {
  for (const key of params.keys()) if (!new Set(["q", "status"]).has(key) || params.getAll(key).length !== 1) throw new AppError("INVALID_INPUT", "Use only one search and status value.", 422);
  return memoryQuerySchema.parse({ q: params.get("q") ?? undefined, status: params.get("status") ?? undefined });
}
