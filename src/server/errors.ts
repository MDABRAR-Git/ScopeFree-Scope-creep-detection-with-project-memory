import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { ApiErrorBody, ErrorCode } from "@/lib/contracts";

export class AppError extends Error {
  constructor(public code: ErrorCode, message: string, public status: number, public retryable = false, public retryAfter?: number) { super(message); }
}
export function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    const fields: Record<string, string[]> = {};
    for (const issue of error.issues) (fields[issue.path.join(".") || "form"] ??= []).push(issue.message);
    return NextResponse.json<ApiErrorBody>({ error: { code: "INVALID_INPUT", message: "Check the highlighted fields.", fields, retryable: false } }, { status: 422 });
  }
  if (error instanceof AppError) return NextResponse.json<ApiErrorBody>({ error: { code: error.code, message: error.message, retryable: error.retryable } }, { status: error.status, headers: error.retryAfter ? { "Retry-After": String(error.retryAfter) } : undefined });
  // Deliberately exclude raw errors, query parameters, secrets and request bodies from responses/logs.
  return NextResponse.json<ApiErrorBody>({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again.", retryable: true } }, { status: 500 });
}
export function api(handler: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    let response: Response;
    try { response = await handler(request); } catch (error) { response = errorResponse(error); }
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
}
export async function readJson(request: Request, maxBytes = 4096): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new AppError("INVALID_INPUT", "Send a JSON request.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("INVALID_INPUT", "A request body is required.", 422);
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new AppError("INPUT_TOO_LARGE", "The request is too large.", 413); }
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new AppError("INVALID_INPUT", "Send valid JSON.", 422); }
  } finally { reader.releaseLock(); }
}
