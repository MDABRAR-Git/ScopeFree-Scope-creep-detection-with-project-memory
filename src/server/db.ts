import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { AppError } from "./errors";

const globalDb = globalThis as unknown as { scopefreeDb?: PrismaClient };
export function db() {
  if (!process.env.DATABASE_URL) throw new AppError("DATABASE_ERROR", "Database is not configured. Ask the workspace operator to complete setup.", 503);
  // Prisma's PostgreSQL adapter normalizes timestamps assuming a UTC database session.
  // Pin every connection; machine/database defaults must not shift session expiry or audit times.
  return globalDb.scopefreeDb ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, options: "-c timezone=UTC", connectionTimeoutMillis: 5000, max: 10 }), log: [] });
}
export async function database<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("DATABASE_ERROR", "The database is unavailable. Please try again.", 503, true);
  }
}
