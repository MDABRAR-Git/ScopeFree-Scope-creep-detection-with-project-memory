import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { AppError } from "./errors";

export type Transaction = Prisma.TransactionClient;
export const hashValue = (value: string) => createHash("sha256").update(value).digest("hex");
export function newCredential() { const token = randomBytes(32).toString("base64url"); return { token, tokenHash: hashValue(token) }; }
export function tokenHashFromRequest(request: Request) {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") ?? "");
  if (!match) throw new AppError("INVALID_LINK", "This link is not valid. Ask the freelancer for a new link.", 404);
  return hashValue(match[1]);
}
export function expiry(kind: "offer" | "intake") {
  const value = process.env[kind === "offer" ? "PROPOSAL_LINK_DAYS" : "CLIENT_INTAKE_LINK_DAYS"] ?? (kind === "offer" ? "7" : "30");
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new AppError("INVALID_INPUT", "Link expiry must be configured between 1 and 90 days.", 503);
  return new Date(Date.now() + days * 86400000);
}
export function clientLink(kind: "requests" | "proposals", id: string, token: string) {
  const origin = process.env.APP_ORIGIN;
  if (!origin) throw new AppError("AUTH_NOT_CONFIGURED", "Configure the workspace origin before creating links.", 503);
  return `${origin}/client/${kind}/${id}#token=${token}`;
}
export function checkCredential(row: { tokenHash: string | null; expiresAt: Date; revokedAt: Date | null } | null, hash: string) {
  if (!row || row.tokenHash !== hash) throw new AppError("INVALID_LINK", "This link is not valid. Ask the freelancer for a new link.", 404);
  if (row.revokedAt) throw new AppError("LINK_REVOKED", "This link was revoked. Ask the freelancer for the current link.", 410);
  if (row.expiresAt <= new Date()) throw new AppError("LINK_EXPIRED", "This link has expired. Ask the freelancer for a new link.", 410);
}
export async function receipt(tx: Transaction, scope: string, key: string, body: unknown) {
  const bodyHash = hashValue(JSON.stringify(body));
  const previous = await tx.operationReceipt.findUnique({ where: { scope_key: { scope, key } } });
  if (previous && previous.bodyHash !== bodyHash) throw new AppError("IDEMPOTENCY_CONFLICT", "This retry key was used with different inputs. Reload before trying a different action.", 409);
  return { previous, save: (result: Prisma.InputJsonValue) => tx.operationReceipt.create({ data: { scope, key, bodyHash, resultJson: result } }) };
}
export async function validateSupersession(tx: Transaction, projectId: string, decisionId: string | null) {
  if (!decisionId) return null;
  const decision = await tx.projectDecision.findFirst({ where: { id: decisionId, projectId, outcome: "ACCEPTED", supersededBy: null } });
  if (!decision) throw new AppError("BASELINE_CHANGED", "The agreement selected for replacement is no longer applicable in this project.", 409);
  return { id: decision.id, title: decision.title, decidedAt: decision.decidedAt.toISOString() };
}
