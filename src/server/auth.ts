import "server-only";
import { createHash } from "node:crypto";
import argon2 from "argon2";
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, database } from "./db";
import { AppError } from "./errors";

const SESSION_SECONDS = 8 * 60 * 60;
const ATTEMPTS = 10;
const WINDOW_SECONDS = 15 * 60;
type SessionData = { id?: string };
export function authConfig() {
  // Base64 is an encoding of the Argon2 hash, not encryption. It avoids dotenv's $ expansion.
  const configuredHash = process.env.FREELANCER_PASSWORD_HASH;
  const passwordHash = configuredHash?.startsWith("$argon2id$") ? configuredHash : Buffer.from(configuredHash ?? "", "base64").toString("utf8");
  const secret = process.env.SESSION_SECRET;
  const origin = process.env.APP_ORIGIN;
  if (!passwordHash?.startsWith("$argon2id$") || !secret || secret.length < 32 || !origin) throw new AppError("AUTH_NOT_CONFIGURED", "Workspace access is not configured. Follow the setup instructions in README.", 503);
  let url: URL;
  try { url = new URL(origin); } catch { throw new AppError("AUTH_NOT_CONFIGURED", "The workspace origin is not configured correctly.", 503); }
  if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) throw new AppError("AUTH_NOT_CONFIGURED", "APP_ORIGIN must be an exact HTTP(S) origin without a trailing slash.", 503);
  const credentialVersion = createHash("sha256").update(passwordHash).digest("hex");
  const options: SessionOptions = { cookieName: "scopefree_session", password: secret, ttl: SESSION_SECONDS,
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_SECONDS } };
  return { passwordHash, origin, credentialVersion, options };
}
export function checkOrigin(request: Request) {
  const { origin } = authConfig();
  if (request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site") throw new AppError("FORBIDDEN_ORIGIN", "This action must be submitted from your ScopeFree workspace.", 403);
}
export async function getWorkspaceSession() {
  const config = authConfig();
  const session = await getIronSession<SessionData>(await cookies(), config.options);
  if (!session.id || !/^[0-9a-f-]{36}$/i.test(session.id)) return null;
  const record = await database(() => db().workspaceSession.findUnique({ where: { id: session.id } }));
  if (!record || record.expiresAt <= new Date() || record.credentialVersion !== config.credentialVersion) return null;
  return record;
}
export async function requireSession() {
  const session = await getWorkspaceSession();
  if (!session) throw new AppError("UNAUTHORIZED", "Log in to access your workspace.", 401);
  return session;
}
export async function requirePageSession() {
  if (!await getWorkspaceSession()) redirect("/login");
}
export async function login(password: string) {
  const config = authConfig();
  // One freelancer account: global DB-backed limit avoids trusting spoofable proxy/IP headers.
  // Atomic UPSERT charges attempts before password verification, including concurrent attempts.
  const rows = await database(() => db().$queryRaw<{ attempts: number; windowStart: Date }[]>`
    INSERT INTO "LoginThrottle" ("id", "attempts", "windowStart") VALUES ('workspace', 1, NOW())
    ON CONFLICT ("id") DO UPDATE SET
      "attempts" = CASE WHEN "LoginThrottle"."windowStart" <= NOW() - INTERVAL '15 minutes' THEN 1 ELSE LEAST("LoginThrottle"."attempts" + 1, 11) END,
      "windowStart" = CASE WHEN "LoginThrottle"."windowStart" <= NOW() - INTERVAL '15 minutes' THEN NOW() ELSE "LoginThrottle"."windowStart" END
    RETURNING "attempts", "windowStart"
  `);
  if (rows[0].attempts > ATTEMPTS) {
    const retryAfter = Math.max(1, Math.ceil((rows[0].windowStart.getTime() + WINDOW_SECONDS * 1000 - Date.now()) / 1000));
    throw new AppError("LOGIN_RATE_LIMITED", "Too many login attempts. Try again in 15 minutes.", 429, true, retryAfter);
  }
  let valid: boolean;
  try { valid = await argon2.verify(config.passwordHash, password); }
  catch { throw new AppError("AUTH_NOT_CONFIGURED", "The configured password hash is invalid. Generate a new hash using the setup instructions.", 503); }
  if (!valid) throw new AppError("INVALID_CREDENTIALS", "That password is incorrect. Please try again.", 401);
  const session = await getIronSession<SessionData>(await cookies(), config.options);
  const record = await database(() => db().$transaction(async tx => {
    if (session.id) await tx.workspaceSession.deleteMany({ where: { id: session.id } });
    await tx.workspaceSession.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    return tx.workspaceSession.create({ data: { credentialVersion: config.credentialVersion, expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000) } });
  }));
  session.id = record.id;
  await session.save();
}
export async function logout() {
  const session = await getIronSession<SessionData>(await cookies(), authConfig().options);
  if (session.id) await database(() => db().workspaceSession.deleteMany({ where: { id: session.id } }));
  session.destroy();
}
