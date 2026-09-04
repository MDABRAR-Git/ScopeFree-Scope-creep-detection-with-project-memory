import "server-only";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { draftClauses, MAX_UPLOAD_BYTES } from "@/lib/intake";
import { AppError } from "./errors";
import { z } from "zod";

const state = globalThis as unknown as { scopefreeExtractions?: number };
const failure = () => new AppError("EXTRACTION_FAILED", "The document could not be read completely. Paste the agreed text instead.", 422);
const workerResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), text: z.string().min(1).max(12_000) }),
  z.object({ ok: z.literal(false), code: z.enum(["INPUT_TOO_LARGE", "EXTRACTION_FAILED", "UNSUPPORTED_FILE"]), message: z.string().max(1000) }),
]);
export function validateFile(file: File, bytes: Uint8Array) {
  if (file.size > MAX_UPLOAD_BYTES) throw new AppError("INPUT_TOO_LARGE", "Upload one file no larger than 5 MB, or paste the agreed text instead.", 422);
  if (file.size === 0) throw failure();
  const kind = file.name.toLowerCase().split(".").at(-1);
  const generic = ["", "application/octet-stream"];
  const pdfSignature = Buffer.from(bytes.subarray(0, 5)).toString("ascii") === "%PDF-";
  const zipSignature = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;
  const valid = (kind === "pdf" && pdfSignature && [...generic, "application/pdf"].includes(file.type)) ||
    (kind === "docx" && zipSignature && [...generic, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(file.type)) ||
    (kind === "txt" && !pdfSignature && !zipSignature && [...generic, "text/plain"].includes(file.type));
  if (!valid) throw new AppError("UNSUPPORTED_FILE", "Use a text-based PDF, DOCX or UTF-8 TXT whose contents match its file type, or paste the agreed text instead.", 422);
  return kind as "pdf" | "docx" | "txt";
}

export async function extractDocument(file: File, signal?: AbortSignal) {
  if (file.size > MAX_UPLOAD_BYTES) throw new AppError("INPUT_TOO_LARGE", "The file exceeds 5 MB. Paste the agreed text instead.", 422);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = validateFile(file, bytes);
  if ((state.scopefreeExtractions ?? 0) >= 2) throw new AppError("EXTRACTION_FAILED", "Document extraction is busy. Retry shortly or paste the text instead.", 429, true, 5);
  if (signal?.aborted) throw failure();
  state.scopefreeExtractions = (state.scopefreeExtractions ?? 0) + 1;
  let worker: Worker | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    const result = await new Promise<unknown>((resolve, reject) => {
      worker = new Worker(path.join(process.cwd(), "scripts", "extract-document.mjs"), {
        workerData: { kind, bytes }, resourceLimits: { maxOldGenerationSizeMb: 128 },
        // Keep parser diagnostics and document metadata out of application logs.
        stdout: true, stderr: true,
      });
      worker.stdout?.resume(); worker.stderr?.resume();
      worker.once("message", resolve);
      worker.once("error", () => reject(failure()));
      worker.once("exit", () => reject(failure()));
      timer = setTimeout(() => reject(new AppError("EXTRACTION_FAILED", "Extraction exceeded the 15-second limit. Paste the agreed text instead.", 422)), 15_000);
      onAbort = () => reject(failure());
      signal?.addEventListener("abort", onAbort, { once: true });
    });
    const parsed = workerResultSchema.safeParse(result);
    if (!parsed.success) throw failure();
    if (!parsed.data.ok) throw new AppError(parsed.data.code, parsed.data.message, 422);
    return { text: parsed.data.text, clauses: draftClauses(parsed.data.text) };
  } finally {
    if (timer) clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
    await worker?.terminate();
    state.scopefreeExtractions!--;
  }
}

export async function readUpload(request: Request): Promise<File> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data;")) throw new AppError("UNSUPPORTED_FILE", "Choose one document to upload, or paste the agreed text instead.", 422);
  const reader = request.body?.getReader();
  if (!reader) throw failure();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const timeout = setTimeout(() => { void reader.cancel(); }, 10_000);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_UPLOAD_BYTES + 64 * 1024) { await reader.cancel(); throw new AppError("INPUT_TOO_LARGE", "Upload one file no larger than 5 MB, or paste the text instead.", 422); }
      chunks.push(value);
    }
  } finally { clearTimeout(timeout); reader.releaseLock(); }
  let form: FormData;
  try { form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": contentType } }).formData(); }
  catch { throw failure(); }
  const entries = [...form.entries()];
  if (entries.length !== 1 || entries[0][0] !== "file" || !(entries[0][1] instanceof File)) throw new AppError("UNSUPPORTED_FILE", "Upload exactly one file using the file field.", 422);
  return entries[0][1];
}
