import "server-only";
import { projectIdSchema } from "@/lib/contracts";
import { pinnedInputSchema, validateAnalysis } from "@/lib/analysis";
import { approvalInputSchema, pricedSnapshot, readRevision, reopenInputSchema, requiresEditReason, revisionInputSchema } from "@/lib/review";
import { db, database } from "./db";
import { AppError } from "./errors";
import { getEstimate } from "./analysis";
import { emptyAgreement, validateAgreement } from "@/lib/agreement";
import { validateSupersession } from "./client-access";

export async function mutateReview(estimateId: string, action: "save" | "approve" | "reopen", body: unknown) {
  if (!projectIdSchema.safeParse(estimateId).success) throw new AppError("NOT_FOUND", "Estimate not found.", 404);
  const input = action === "save" ? revisionInputSchema.parse(body) : action === "approve" ? approvalInputSchema.parse(body) : reopenInputSchema.parse(body);
  await database(() => db().$transaction(async tx => {
    const ref = await tx.estimate.findUnique({ where: { id: estimateId }, select: { request: { select: { projectId: true } } } });
    if (!ref) throw new AppError("NOT_FOUND", "Estimate not found.", 404);
    const projectId = ref.request.projectId;
    // All review/approval operations lock in the same order as scope-changing decisions.
    await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id"=${projectId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Estimate" WHERE "id"=${estimateId}::uuid FOR UPDATE`;
    const estimate = await tx.estimate.findUniqueOrThrow({ where: { id: estimateId }, include: { proposals: true, revisions: { orderBy: { revision: "desc" }, take: 1 } } });
    if (estimate.currentRevision !== input.expectedRevision) throw new AppError("STALE_REVISION", "A newer review was saved. Reload before making changes.", 409);
    if (estimate.proposals.some(p => p.status !== "REVOKED") || estimate.status === "PROPOSED") throw new AppError("ESTIMATE_LOCKED", "Revoke a pending offer before editing. Final client decisions cannot be changed.", 409);
    const pinned = pinnedInputSchema.parse(estimate.originalInputJson);
    if (pinned.projectId !== projectId || pinned.requestId !== estimate.requestId) throw new AppError("INVALID_ESTIMATE", "Source ownership is inconsistent.", 422);
    const current = estimate.revisions[0];
    if (!current || current.revision !== estimate.currentRevision) throw new AppError("INVALID_ESTIMATE", "The saved revision is missing.", 422);
    let snapshot: ReturnType<typeof readRevision>;
    try { snapshot = readRevision(current.snapshotJson); validateAnalysis(snapshot.analysis, pinned.sources); }
    catch { throw new AppError("INVALID_ESTIMATE", "The saved revision is invalid.", 422); }
    let revisionId = current.id;
    if (action === "save") {
      if (estimate.status !== "REVIEW_REQUIRED") throw new AppError("ESTIMATE_LOCKED", "Reopen review before editing an approved estimate.", 409);
      const { draft, editReason, agreement = emptyAgreement() } = revisionInputSchema.parse(input);
      let saved: ReturnType<typeof pricedSnapshot>;
      try { validateAnalysis(draft.analysis, pinned.sources); validateAgreement(agreement, draft.analysis, pinned.sources); saved = pricedSnapshot(draft, agreement); }
      catch (e) { throw new AppError("INVALID_ESTIMATE", e instanceof Error ? e.message : "Check the estimate.", 422); }
      if (requiresEditReason(snapshot, draft) && !editReason) throw new AppError("EDIT_REASON_REQUIRED", "Record a reason for classification changes or removed tasks.", 422);
      const revision = await tx.estimateRevision.create({ data: { estimateId, revision: current.revision + 1, snapshotJson: saved, editReason: editReason || null, createdBy: "freelancer" } });
      revisionId = revision.id;
      await tx.estimate.update({ where: { id: estimateId }, data: { currentRevision: revision.revision } });
    } else if (action === "approve") {
      if (estimate.proposals.some(p => p.status === "REVOKED" && p.approvedRevisionId === current.id)) throw new AppError("STALE_REVISION", "Save a new review revision after revoking an offer, then approve it.", 409);
      const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
      if (project.scopeRevision !== pinned.scopeRevision) throw new AppError("BASELINE_CHANGED", "The agreed scope changed. Create a new request against current scope.", 409);
      if (snapshot.legacy) throw new AppError("INVALID_ESTIMATE", "Save this review to record its calculated prices before approving.", 422);
      if (snapshot.calculated.provisional) throw new AppError("UNCERTAIN_TASKS", "Resolve every UNCERTAIN task before approving.", 422);
      try { validateAgreement(snapshot.agreement, snapshot.analysis, pinned.sources, true); }
      catch (error) { throw new AppError("AGREEMENT_REQUIRED", error instanceof Error ? error.message : "Complete the client-facing agreement terms.", 422); }
      await validateSupersession(tx, projectId, snapshot.agreement.supersedesDecisionId);
      if (estimate.status === "APPROVED" && estimate.approvedRevisionId === current.id) return;
      if (estimate.status !== "REVIEW_REQUIRED") throw new AppError("ESTIMATE_LOCKED", "This estimate is not awaiting review.", 409);
      await tx.estimate.update({ where: { id: estimateId }, data: { status: "APPROVED", approvedRevisionId: current.id } });
    } else {
      if (estimate.status === "REVIEW_REQUIRED") return;
      await tx.estimate.update({ where: { id: estimateId }, data: { status: "REVIEW_REQUIRED", approvedRevisionId: null } });
    }
    await tx.auditEvent.create({ data: { projectId, entityType: "estimate", entityId: estimateId, action: action === "save" ? "review_saved" : action === "approve" ? "approved" : "review_reopened", actorType: "freelancer", revisionId, metadataJson: { schemaVersion: 1, expectedRevision: input.expectedRevision, scopeRevision: pinned.scopeRevision } } });
  }));
  return getEstimate(estimateId);
}
