import "server-only";
import { overallClassification } from "@/lib/analysis";
import { readRevision } from "@/lib/review";
import { scenarios } from "@/lib/pricing";
import { db, database } from "./db";
import { getProject } from "./projects";
import { AppError } from "./errors";

export async function getRequestHistory(projectId: string) {
  const project = await getProject(projectId);
  const requests = await database(() => db().changeRequest.findMany({ where: { projectId }, orderBy: { requestNumber: "desc" }, include: { estimate: { include: { revisions: true, proposals: { include: { decision: true } } } } } }));
  const rows = requests.map(request => {
    const estimate = request.estimate;
    const proposal = estimate?.proposals.find(p => p.id === estimate.currentProposalId) ?? estimate?.proposals.toSorted((a,b) => b.createdAt.getTime()-a.createdAt.getTime())[0];
    const decision = estimate?.proposals.find(p => p.decision?.outcome === "ACCEPTED")?.decision ?? proposal?.decision;
    if (proposal && (proposal.projectId !== projectId || !estimate?.revisions.some(r => r.id === proposal.approvedRevisionId)) || decision && decision.projectId !== projectId) throw new AppError("INVALID_ESTIMATE", "A billing record has inconsistent project ownership.", 422);
    const current = estimate?.revisions.find(r => r.revision === estimate.currentRevision);
    const accepted = decision?.outcome === "ACCEPTED";
    let snapshot: ReturnType<typeof readRevision> | null = null;
    try {
      if (accepted) {
        const stored = decision.approvedSnapshotJson as { reviewed?: unknown };
        snapshot = readRevision(stored?.reviewed ?? stored);
      } else if (current) snapshot = readRevision(current.snapshotJson);
    } catch { throw new AppError("INVALID_ESTIMATE", "A saved billing snapshot needs operator attention.", 422); }
    const reviewed = accepted || !!(current && (current.createdBy === "freelancer" || estimate?.status === "APPROVED" || estimate?.status === "PROPOSED"));
    const classification = snapshot ? overallClassification(snapshot.analysis) : null;
    const billing = reviewed && snapshot ? snapshot.calculated : null;
    const additional = !!billing && !billing.provisional && (billing.additionalChargePaise > 0 || scenarios.some(s => billing.billableQuarterHours[s] > 0));
    const clientAcceptance = decision?.outcome ?? (proposal?.status === "PENDING" ? "PENDING" : "NOT_ACCEPTED");
    const expired = !!proposal && !decision && proposal.expiresAt <= new Date();
    const stale = request.basedOnScopeRevision !== project.scopeRevision;
    return {
      id: request.id, requestNumber: request.requestNumber, summary: request.summary, description: request.text,
      createdAt: request.createdAt.toISOString(), classification, estimateId: estimate?.id ?? null,
      status: estimate?.status ?? "NOT_ANALYZED", origin: request.origin, offerStatus: proposal ? proposal.status === "PENDING" && expired ? "EXPIRED" : proposal.status : null,
      clientAcceptance, acceptedAt: accepted ? decision.decidedAt.toISOString() : null,
      hourlyRatePaise: snapshot?.hourlyRatePaise ?? request.hourlyRatePaise,
      billing, additionalChargeReason: snapshot?.additionalChargeReason ?? "", reviewed, additional, stale,
      pendingBilling: additional && !decision && !stale && (!proposal || (proposal.status === "PENDING" && !expired) || (proposal.status === "REVOKED" && !!proposal.revokedAt && !!current && current.createdAt > proposal.revokedAt)),
    };
  });
  const accepted = { minimum: 0n, likely: 0n, maximum: 0n }, pending = { ...accepted };
  for (const row of rows) if (row.additional && row.billing) for (const s of scenarios) {
    if (row.clientAcceptance === "ACCEPTED") accepted[s] += BigInt(row.billing.totalChargePaise[s]);
    else if (row.pendingBilling) pending[s] += BigInt(row.billing.totalChargePaise[s]);
  }
  // Project aggregates are decimal strings so arbitrarily many requests do not lose integer precision.
  return { rows, summary: { totalRequests: rows.length, additionalRequests: rows.filter(r => r.additional).length, inScopeRequests: rows.filter(r => r.classification === "IN_SCOPE").length,
    acceptedAdditionalPaise: { minimum: accepted.minimum.toString(), likely: accepted.likely.toString(), maximum: accepted.maximum.toString() },
    pendingAdditionalPaise: { minimum: pending.minimum.toString(), likely: pending.likely.toString(), maximum: pending.maximum.toString() } } };
}
export type RequestHistory = Awaited<ReturnType<typeof getRequestHistory>>;
