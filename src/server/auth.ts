import "server-only";
import { createHash, randomUUID } from "node:crypto";
import argon2 from "argon2";
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { projectIdSchema } from "@/lib/contracts";
import { db, database } from "./db";
import { AppError } from "./errors";

const SESSION_SECONDS = 8 * 60 * 60;
const ATTEMPTS = 10;
const WINDOW_SECONDS = 15 * 60;
type SessionData = { id?: string };
const emailSchema = z.string().trim().email().max(254).transform(value => value.toLowerCase());
const passwordSchema = z.string().min(8, "Use at least 8 characters.").max(128);
export const loginInputSchema = z.strictObject({ email: emailSchema, password: z.string().min(1).max(128) });
export const registrationInputSchema = z.strictObject({ email: emailSchema, password: passwordSchema, confirmPassword: z.string().max(128) }).refine(value => value.password === value.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match." });

export function authConfig() {
  const secret = process.env.SESSION_SECRET;
  const origin = process.env.APP_ORIGIN;
  if (!secret || secret.length < 32 || !origin) throw new AppError("AUTH_NOT_CONFIGURED", "Workspace access is not configured. Follow the setup instructions in README.", 503);
  let url: URL;
  try { url = new URL(origin); } catch { throw new AppError("AUTH_NOT_CONFIGURED", "The workspace origin is not configured correctly.", 503); }
  if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) throw new AppError("AUTH_NOT_CONFIGURED", "APP_ORIGIN must be an exact HTTP(S) origin without a trailing slash.", 503);
  const options: SessionOptions = { cookieName: "scopefree_session", password: secret, ttl: SESSION_SECONDS,
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_SECONDS } };
  return { origin, options };
}
export function checkOrigin(request: Request) {
  const { origin } = authConfig();
  if (request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site") throw new AppError("FORBIDDEN_ORIGIN", "This action must be submitted from your ScopeFree workspace.", 403);
}
export async function getWorkspaceSession() {
  const config = authConfig();
  const session = await getIronSession<SessionData>(await cookies(), config.options);
  if (!session.id || !/^[0-9a-f-]{36}$/i.test(session.id)) return null;
  const record = await database(() => db().workspaceSession.findUnique({ where: { id: session.id }, include: { user: { select: { email: true, passwordHash: true } } } }));
  if (!record || record.expiresAt <= new Date() || record.credentialVersion !== createHash("sha256").update(record.user.passwordHash).digest("hex")) return null;
  return { id: record.id, userId: record.userId, email: record.user.email, expiresAt: record.expiresAt };
}
export async function requireSession() {
  const session = await getWorkspaceSession();
  if (!session) throw new AppError("UNAUTHORIZED", "Log in to access your workspace.", 401);
  return session;
}
export async function requirePageSession() {
  const session = await getWorkspaceSession();
  if (!session) redirect("/login");
  return session;
}
async function createSession(user: { id: string; email: string; passwordHash: string }) {
  const session = await getIronSession<SessionData>(await cookies(), authConfig().options);
  const record = await database(() => db().$transaction(async tx => {
    if (session.id) await tx.workspaceSession.deleteMany({ where: { id: session.id } });
    await tx.workspaceSession.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    return tx.workspaceSession.create({ data: { userId: user.id, credentialVersion: createHash("sha256").update(user.passwordHash).digest("hex"), expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000) } });
  }));
  session.id = record.id;
  await session.save();
  return { id: user.id, email: user.email };
}
async function chargeAttempt(kind: "login" | "register") {
  const rows = await database(() => db().$queryRaw<{ attempts: number; windowStart: Date }[]>`
    INSERT INTO "LoginThrottle" ("id", "attempts", "windowStart") VALUES (${kind}, 1, NOW())
    ON CONFLICT ("id") DO UPDATE SET
      "attempts" = CASE WHEN "LoginThrottle"."windowStart" <= NOW() - INTERVAL '15 minutes' THEN 1 ELSE LEAST("LoginThrottle"."attempts" + 1, 11) END,
      "windowStart" = CASE WHEN "LoginThrottle"."windowStart" <= NOW() - INTERVAL '15 minutes' THEN NOW() ELSE "LoginThrottle"."windowStart" END
    RETURNING "attempts", "windowStart"
  `);
  if (rows[0].attempts > ATTEMPTS) throw new AppError("LOGIN_RATE_LIMITED", "Too many attempts. Try again in 15 minutes.", 429, true, Math.max(1, Math.ceil((rows[0].windowStart.getTime() + WINDOW_SECONDS * 1000 - Date.now()) / 1000)));
}
export async function login(input: unknown) {
  const { email, password } = loginInputSchema.parse(input);
  await chargeAttempt("login");
  const user = await database(() => db().user.findUnique({ where: { email } }));
  let valid = false;
  try { if (user) valid = await argon2.verify(user.passwordHash, password); else await argon2.hash(password); } catch { valid = false; }
  if (!user || !valid) throw new AppError("INVALID_CREDENTIALS", "That email or password is incorrect. Please try again.", 401);
  return createSession(user);
}
export async function register(input: unknown) {
  const { email, password } = registrationInputSchema.parse(input);
  await chargeAttempt("register");
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await database(() => db().$transaction(async tx => {
    await tx.$executeRaw`LOCK TABLE "User" IN EXCLUSIVE MODE`;
    if (await tx.user.findUnique({ where: { email }, select: { id: true } })) throw new AppError("EMAIL_ALREADY_REGISTERED", "An account with this email already exists. Sign in instead.", 409);
    const first = await tx.user.count() === 0;
    const saved = await tx.user.create({ data: { id: randomUUID(), email, passwordHash } });
    if (first) await tx.project.updateMany({ where: { ownerId: null }, data: { ownerId: saved.id } });
    return saved;
  }));
  return createSession(user);
}
export async function logout() {
  const session = await getIronSession<SessionData>(await cookies(), authConfig().options);
  if (session.id) await database(() => db().workspaceSession.deleteMany({ where: { id: session.id } }));
  session.destroy();
}
async function ownerFor(kind: "project" | "request" | "estimate" | "proposal", id: string) {
  if (!projectIdSchema.safeParse(id).success) return null;
  if (kind === "project") return db().project.findUnique({ where: { id }, select: { ownerId: true } });
  if (kind === "request") return db().changeRequest.findUnique({ where: { id }, select: { project: { select: { ownerId: true } } } }).then(row => row?.project);
  if (kind === "estimate") return db().estimate.findUnique({ where: { id }, select: { request: { select: { project: { select: { ownerId: true } } } } } }).then(row => row?.request.project);
  return db().proposal.findUnique({ where: { id }, select: { project: { select: { ownerId: true } } } }).then(row => row?.project);
}
export async function requireResourceOwner(kind: "project" | "request" | "estimate" | "proposal", id: string) {
  const session = await requireSession();
  const resource = await database(() => ownerFor(kind, id));
  if (!resource || resource.ownerId !== session.userId) throw new AppError("NOT_FOUND", `${kind[0].toUpperCase()+kind.slice(1)} not found.`, 404);
  return session;
}
