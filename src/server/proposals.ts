import "server-only";
import { randomUUID } from "node:crypto";
import { projectIdSchema } from "@/lib/contracts";
import { pinnedInputSchema, validateAnalysis } from "@/lib/analysis";
import { validateAgreement } from "@/lib/agreement";
import { readRevision, agreementRevisionSchema } from "@/lib/review";
import { clientProposalSnapshotSchema, decisionInputSchema, generateProposalInputSchema, proposalActionInputSchema, publicOfferSchema, type ClientProposalView } from "@/lib/proposals";
import { db, database } from "./db";
import { AppError } from "./errors";
import { checkCredential, clientLink, expiry, newCredential, receipt, validateSupersession, type Transaction } from "./client-access";

function validId(id: string) { if (!projectIdSchema.safeParse(id).success) throw new AppError("NOT_FOUND", "Offer or estimate not found.", 404); }
async function lockEstimate(tx: Transaction, estimateId: string) {
  const ref = await tx.estimate.findUnique({ where: { id: estimateId }, select: { request: { select: { projectId: true } } } });
  if (!ref) throw new AppError("NOT_FOUND", "Estimate not found.", 404);
  await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id"=${ref.request.projectId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "Estimate" WHERE "id"=${estimateId}::uuid FOR UPDATE`;
  return tx.estimate.findUniqueOrThrow({ where: { id: estimateId }, include: { request: { include: { project: true } }, approvedRevision: true, currentProposal: true } });
}
type LockedEstimate = Awaited<ReturnType<typeof lockEstimate>>;
async function approvedSnapshot(tx: Transaction, estimate: LockedEstimate, expectedRevision: number) {
  if (estimate.currentRevision !== expectedRevision) throw new AppError("STALE_REVISION", "A newer revision exists. Reload this estimate.", 409);
  if (!estimate.approvedRevision || estimate.approvedRevision.revision !== expectedRevision || !["APPROVED", "PROPOSED"].includes(estimate.status)) throw new AppError("ESTIMATE_LOCKED", "Approve the exact saved revision first.", 409);
  const pinned = pinnedInputSchema.parse(estimate.originalInputJson);
  if (pinned.projectId !== estimate.request.projectId || pinned.requestId !== estimate.requestId) throw new AppError("INVALID_ESTIMATE", "The saved scope has inconsistent ownership.", 422);
  if (estimate.request.project.scopeRevision !== pinned.scopeRevision) throw new AppError("BASELINE_CHANGED", "Scope changed. Create a new request and analysis against current scope.", 409);
  const saved = readRevision(estimate.approvedRevision.snapshotJson);
  if (saved.schemaVersion !== 3 || saved.legacy) throw new AppError("AGREEMENT_REQUIRED", "Reopen, save and approve a review with the client-facing agreement terms.", 422);
  if (saved.calculated.provisional) throw new AppError("UNCERTAIN_TASKS", "Resolve uncertain tasks before sharing an offer.", 422);
  try { validateAnalysis(saved.analysis, pinned.sources); validateAgreement(saved.agreement, saved.analysis, pinned.sources, true); }
  catch (error) { throw new AppError("AGREEMENT_REQUIRED", error instanceof Error ? error.message : "Review the agreement terms.", 422); }
  const replacesDecision = await validateSupersession(tx, pinned.projectId, saved.agreement.supersedesDecisionId);
  const reviewed = agreementRevisionSchema.parse(estimate.approvedRevision.snapshotJson);
  const client = publicOfferSchema.parse({
    projectName: estimate.request.project.name, requestNumber: estimate.request.requestNumber, requestText: estimate.request.text,
    approvedRevision: expectedRevision, hourlyRatePaise: saved.hourlyRatePaise, calculated: saved.calculated, additionalChargeReason: saved.additionalChargeReason,
    agreement: saved.agreement, replacesDecision,
    tasks: saved.analysis.tasks.map(t => ({ id: t.id, title: t.title, classification: t.classification, estimatedHours: t.estimatedHours, assumptions: t.assumptions,
      evidence: t.sourceEvidence.map(e => ({ sourceType: e.sourceType, clauseId: pinned.sources.find(s => s.sourceId === e.sourceId && s.sourceType === e.sourceType)!.clauseId, quote: e.quote })) })),
  });
  return { snapshot: clientProposalSnapshotSchema.parse({ schemaVersion: 2, reviewed, client }), scopeRevision: pinned.scopeRevision };
}
export async function generateProposal(estimateId: string, body: unknown) {
  validId(estimateId); const input = generateProposalInputSchema.parse(body);
  return database(() => db().$transaction(async tx => {
    const estimate = await lockEstimate(tx, estimateId);
    const op = await receipt(tx, `offer:${estimateId}`, input.idempotencyKey, { expectedRevision: input.expectedRevision });
    if (op.previous) return { ...op.previous.resultJson as object, link: null };
    if (estimate.currentProposal && estimate.currentProposal.status !== "REVOKED") throw new AppError("ESTIMATE_LOCKED", "This estimate already has an offer. Use its existing link or rotate access.", 409);
    if (estimate.status !== "APPROVED") throw new AppError("ESTIMATE_LOCKED", "Approve this saved review before generating an offer.", 409);
    const { snapshot, scopeRevision } = await approvedSnapshot(tx, estimate, input.expectedRevision);
    const credential = newCredential();
    const proposal = await tx.proposal.create({ data: { projectId: estimate.request.projectId, estimateId, approvedRevisionId: estimate.approvedRevisionId!, snapshotJson: snapshot, basedOnScopeRevision: scopeRevision, tokenHash: credential.tokenHash, expiresAt: expiry("offer"), replacesProposalId: estimate.currentProposalId } });
    await tx.estimate.update({ where: { id: estimateId }, data: { status: "PROPOSED", currentProposalId: proposal.id } });
    await tx.auditEvent.create({ data: { projectId: proposal.projectId, entityType: "proposal", entityId: proposal.id, action: "offer_generated", actorType: "freelancer", revisionId: proposal.approvedRevisionId, metadataJson: { replacesProposalId: proposal.replacesProposalId } } });
    const result = { proposalId: proposal.id, expiresAt: proposal.expiresAt.toISOString() };
    await op.save(result);
    return { ...result, link: clientLink("proposals", proposal.id, credential.token) };
  }));
}
export async function manageProposal(id: string, action: "rotate" | "revoke" | "revise", body: unknown) {
  validId(id); const input = proposalActionInputSchema.parse(body);
  return database(() => db().$transaction(async tx => {
    const ref = await tx.proposal.findUnique({ where: { id } });
    if (!ref) throw new AppError("NOT_FOUND", "Offer not found.", 404);
    const estimate = await lockEstimate(tx, ref.estimateId);
    await tx.$queryRaw`SELECT "id" FROM "Proposal" WHERE "id"=${id}::uuid FOR UPDATE`;
    const proposal = await tx.proposal.findUniqueOrThrow({ where: { id } });
    const op = await receipt(tx, `offer-action:${id}`, input.idempotencyKey, { action, expectedRevision: input.expectedRevision });
    if (op.previous) return { ...op.previous.resultJson as object, link: null };
    if (estimate.currentRevision !== input.expectedRevision) throw new AppError("STALE_REVISION", "A newer review exists. Reload before changing this offer.", 409);
    if (estimate.currentProposalId !== id || proposal.status !== "PENDING") throw new AppError("ALREADY_DECIDED", "This offer is no longer pending. Its saved result cannot be changed.", 409);
    let link: string | null = null;
    if (action === "rotate") {
      await approvedSnapshot(tx, estimate, input.expectedRevision);
      const credential = newCredential();
      await tx.proposal.update({ where: { id }, data: { tokenHash: credential.tokenHash, expiresAt: expiry("offer") } });
      link = clientLink("proposals", id, credential.token);
    } else {
      await tx.proposal.update({ where: { id }, data: { status: "REVOKED", revokedAt: new Date() } });
      await tx.estimate.update({ where: { id: estimate.id }, data: { status: "REVIEW_REQUIRED", approvedRevisionId: null } });
      await tx.auditEvent.create({ data: { projectId: proposal.projectId, entityType: "estimate", entityId: estimate.id, action: "review_reopened", actorType: "freelancer", revisionId: proposal.approvedRevisionId, metadataJson: { revokedProposalId: id } } });
    }
    await tx.auditEvent.create({ data: { projectId: proposal.projectId, entityType: "proposal", entityId: id, action: action === "rotate" ? "offer_link_rotated" : action === "revise" ? "offer_revoked_for_revision" : "offer_revoked", actorType: "freelancer", revisionId: proposal.approvedRevisionId, metadataJson: {} } });
    const result = { proposalId: id, estimateId: estimate.id };
    await op.save(result);
    return { ...result, link };
  }));
}
export async function getClientProposal(id: string, hash: string): Promise<ClientProposalView> {
  validId(id);
  return database(() => db().$transaction(async tx => {
    const proposal = await tx.proposal.findUnique({ where: { id }, include: { decision: true, estimate: { select: { currentProposalId: true, approvedRevisionId: true } }, project: { select: { scopeRevision: true } } } });
    checkCredential(proposal, hash);
    if (proposal!.status === "REVOKED" || proposal!.estimate.currentProposalId !== id) throw new AppError("LINK_REVOKED", "This offer has been replaced or revoked.", 410);
    if (!proposal!.decision && (proposal!.basedOnScopeRevision !== proposal!.project.scopeRevision || proposal!.approvedRevisionId !== proposal!.estimate.approvedRevisionId)) throw new AppError("BASELINE_CHANGED", "The agreement changed. Ask the freelancer for a current offer.", 409);
    const snapshot = clientProposalSnapshotSchema.safeParse(proposal!.snapshotJson);
    if (!snapshot.success) throw new AppError("INVALID_ESTIMATE", "This offer format is not available for client sharing.", 422);
    return { offer: snapshot.data.client, status: proposal!.status as ClientProposalView["status"], expiresAt: proposal!.expiresAt.toISOString(), decision: proposal!.decision ? { outcome: proposal!.decision.outcome, comment: proposal!.decisionComment ?? "", decidedAt: proposal!.decision.decidedAt.toISOString() } : null };
  }));
}
export async function decideProposal(id: string, hash: string, body: unknown) {
  validId(id); const input = decisionInputSchema.parse(body);
  return database(() => db().$transaction(async tx => {
    const ref = await tx.proposal.findUnique({ where: { id } });
    checkCredential(ref, hash);
    const estimate = await lockEstimate(tx, ref!.estimateId);
    await tx.$queryRaw`SELECT "id" FROM "Proposal" WHERE "id"=${id}::uuid FOR UPDATE`;
    const proposal = await tx.proposal.findUniqueOrThrow({ where: { id }, include: { decision: true } });
    checkCredential(proposal, hash);
    const op = await receipt(tx, `decision:${id}`, input.idempotencyKey, { decision: input.decision, comment: input.comment });
    const outcome = input.decision === "accept" ? "ACCEPTED" : "DECLINED";
    if (proposal.decision) {
      if (proposal.decision.outcome !== outcome) throw new AppError("ALREADY_DECIDED", "This offer already has a different final decision.", 409);
      const result = { outcome, comment: proposal.decisionComment ?? "", decidedAt: proposal.decision.decidedAt.toISOString() };
      if (!op.previous) await op.save(result);
      return result;
    }
    if (proposal.status !== "PENDING" || proposal.revokedAt || estimate.currentProposalId !== id) throw new AppError("LINK_REVOKED", "This offer is no longer available for a decision.", 410);
    if (estimate.approvedRevisionId !== proposal.approvedRevisionId || estimate.status !== "PROPOSED" || estimate.request.project.scopeRevision !== proposal.basedOnScopeRevision) throw new AppError("BASELINE_CHANGED", "The agreement or reviewed revision changed. Ask for a current offer.", 409);
    const snapshot = clientProposalSnapshotSchema.parse(proposal.snapshotJson);
    const validated = await approvedSnapshot(tx, estimate, snapshot.client.approvedRevision);
    // Compare semantic fields after parsing to canonical schema order, never JSONB key order.
    if (JSON.stringify(validated.snapshot.reviewed) !== JSON.stringify(snapshot.reviewed)) throw new AppError("INVALID_ESTIMATE", "The offer no longer matches its approved review.", 422);
    const agreement = snapshot.reviewed.agreement;
    await validateSupersession(tx, proposal.projectId, agreement.supersedesDecisionId);
    const changesScope = outcome === "ACCEPTED" && (agreement.clauses.length > 0 || !!agreement.supersedesDecisionId);
    const scopeRevisionAfter = proposal.basedOnScopeRevision + (changesScope ? 1 : 0), now = new Date();
    await tx.projectDecision.create({ data: {
      id: randomUUID(), projectId: proposal.projectId, proposalId: id, outcome, title: `Request #${estimate.request.requestNumber}: ${estimate.request.summary}`,
      tagsJson: [], finalDecisionText: outcome === "ACCEPTED" ? "Client accepted the described scope and estimated budget range." : "Client declined this offer.",
      sourceReferencesJson: snapshot.reviewed.analysis.tasks.flatMap(t => t.sourceEvidence), approvedSnapshotJson: snapshot,
      amendmentClausesJson: { schemaVersion: 1, clauses: outcome === "ACCEPTED" ? agreement.clauses.map(c => ({ id: c.id, text: c.text, amendsSourceIds: c.amendsSourceIds })) : [] },
      supersedesDecisionId: outcome === "ACCEPTED" ? agreement.supersedesDecisionId : null, scopeRevisionAfter, decidedAt: now,
    } });
    if (changesScope) await tx.project.update({ where: { id: proposal.projectId }, data: { scopeRevision: scopeRevisionAfter } });
    await tx.proposal.update({ where: { id }, data: { status: outcome, decidedAt: now, decisionComment: input.comment } });
    await tx.auditEvent.create({ data: { projectId: proposal.projectId, entityType: "proposal", entityId: id, action: outcome === "ACCEPTED" ? "client_accepted" : "client_declined", actorType: "client", revisionId: proposal.approvedRevisionId, metadataJson: { scopeRevisionAfter } } });
    const result = { outcome, comment: input.comment, decidedAt: now.toISOString() };
    await op.save(result);
    return result;
  }));
}
