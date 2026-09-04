import "server-only";
import { projectIdSchema, hourlyRatePaiseSchema } from "@/lib/contracts";
import { z } from "zod";
import { clientRequestInputSchema, operationInputSchema } from "@/lib/proposals";
import { db, database } from "./db";
import { getProject } from "./projects";
import { AppError } from "./errors";
import { checkCredential, clientLink, expiry, newCredential, receipt } from "./client-access";

export async function getIntakeLink(projectId: string) {
  await getProject(projectId);
  const link = await database(() => db().clientIntakeLink.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" }, select: { id: true, expiresAt: true, revokedAt: true } }));
  return link ? { id: link.id, expiresAt: link.expiresAt.toISOString(), revoked: !!link.revokedAt } : null;
}
export async function manageIntakeLink(projectId: string, action: "create" | "revoke", body: unknown) {
  await getProject(projectId);
  const input = operationInputSchema.parse(body);
  return database(() => db().$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id"=${projectId}::uuid FOR UPDATE`;
    if (!await tx.baseline.findUnique({ where: { projectId } })) throw new AppError("BASELINE_REQUIRED", "Confirm the baseline before inviting client requests.", 422);
    const op = await receipt(tx, `intake-link:${projectId}`, input.idempotencyKey, { action });
    if (op.previous) return { ...op.previous.resultJson as object, link: null };
    await tx.clientIntakeLink.updateMany({ where: { projectId, revokedAt: null }, data: { revokedAt: new Date() } });
    let id = projectId, result: { id: string; expiresAt: string | null; link?: string | null; revoked: boolean } = { id, expiresAt: null, revoked: true };
    if (action === "create") {
      const credential = newCredential();
      const link = await tx.clientIntakeLink.create({ data: { projectId, tokenHash: credential.tokenHash, expiresAt: expiry("intake") } });
      id = link.id;
      result = { id, expiresAt: link.expiresAt.toISOString(), revoked: false };
      await op.save(result);
      result.link = clientLink("requests", id, credential.token);
    } else await op.save(result);
    await tx.auditEvent.create({ data: { projectId, entityType: "intake_link", entityId: id, action: action === "create" ? "intake_link_created" : "intake_link_revoked", actorType: "freelancer", metadataJson: {} } });
    return result;
  }));
}
export async function getClientIntake(id: string, hash: string) {
  if (!projectIdSchema.safeParse(id).success) throw new AppError("INVALID_LINK", "This request link is invalid.", 404);
  const row = await database(() => db().clientIntakeLink.findUnique({ where: { id }, include: { project: { select: { name: true } } } }));
  checkCredential(row, hash);
  return { projectName: row!.project.name, expiresAt: row!.expiresAt.toISOString() };
}
export async function submitClientRequest(id: string, hash: string, body: unknown) {
  if (!projectIdSchema.safeParse(id).success) throw new AppError("INVALID_LINK", "This request link is invalid.", 404);
  const input = clientRequestInputSchema.parse(body);
  return database(() => db().$transaction(async tx => {
    const ref = await tx.clientIntakeLink.findUnique({ where: { id } });
    checkCredential(ref, hash);
    await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id"=${ref!.projectId}::uuid FOR UPDATE`;
    const link = await tx.clientIntakeLink.findUniqueOrThrow({ where: { id } });
    checkCredential(link, hash);
    const op = await receipt(tx, `client-request:${id}`, input.idempotencyKey, { text: input.text });
    if (op.previous) return op.previous.resultJson;
    const now = new Date(), reset = link.windowStart.getTime() <= now.getTime() - 600000;
    if (!reset && link.attempts >= 10) throw new AppError("CLIENT_RATE_LIMITED", "This link has received ten requests in ten minutes. Please retry after the window resets.", 429, true);
    const project = await tx.project.findUniqueOrThrow({ where: { id: link.projectId } });
    if (!await tx.baseline.findUnique({ where: { projectId: project.id } })) throw new AppError("BASELINE_REQUIRED", "The freelancer must confirm the agreement first.", 422);
    await tx.clientIntakeLink.update({ where: { id }, data: { attempts: reset ? 1 : link.attempts + 1, windowStart: reset ? now : link.windowStart } });
    const request = await tx.changeRequest.create({ data: { projectId: project.id, text: input.text, origin: "client", basedOnScopeRevision: project.scopeRevision } });
    const result = { requestNumber: request.requestNumber, submittedAt: request.createdAt.toISOString() };
    await tx.auditEvent.create({ data: { projectId: project.id, entityType: "request", entityId: request.id, action: "client_submitted", actorType: "client", metadataJson: { intakeLinkId: id } } });
    await op.save(result);
    return result;
  }));
}
export async function setRequestRate(id: string, body: unknown) {
  if (!projectIdSchema.safeParse(id).success) throw new AppError("NOT_FOUND", "Request not found.", 404);
  const input = z.strictObject({ hourlyRatePaise: hourlyRatePaiseSchema }).parse(body);
  return database(() => db().$transaction(async tx => {
    const request = await tx.changeRequest.findUnique({ where: { id } });
    if (!request) throw new AppError("NOT_FOUND", "Request not found.", 404);
    await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id"=${request.projectId}::uuid FOR UPDATE`;
    if (await tx.estimate.findUnique({ where: { requestId: id } }) || await tx.analysisJob.findUnique({ where: { requestId: id } })) throw new AppError("ESTIMATE_LOCKED", "Analysis has started. Change the rate through a saved review after analysis.", 409);
    const updated = await tx.changeRequest.update({ where: { id }, data: input, select: { id: true, hourlyRatePaise: true } });
    await tx.auditEvent.create({ data: { projectId: request.projectId, entityType: "request", entityId: id, action: "rate_set", actorType: "freelancer", metadataJson: input } });
    return updated;
  }));
}
