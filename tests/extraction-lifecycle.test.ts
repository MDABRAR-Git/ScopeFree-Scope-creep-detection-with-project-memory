import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ instances: [] as { terminate: () => Promise<number> }[] }));
vi.mock("node:worker_threads", async () => {
  const { EventEmitter } = await import("node:events");
  return { Worker: class extends EventEmitter {
    stdout = { resume() {} };
    stderr = { resume() {} };
    terminate = vi.fn(async () => 0);
    constructor() { super(); fake.instances.push(this); }
  } };
});
import { extractDocument } from "../src/server/extraction";
const file = () => new File(["Build a responsive project website."], "agreement.txt", { type: "text/plain" });
beforeEach(() => { vi.useFakeTimers(); fake.instances.length = 0; });
afterEach(() => { vi.useRealTimers(); });

it("terminates a non-responsive parser at its bounded deadline", async () => {
  const pending = extractDocument(file());
  const rejected = expect(pending).rejects.toMatchObject({ code: "EXTRACTION_FAILED", message: expect.stringContaining("15-second") });
  await vi.advanceTimersByTimeAsync(15_001); await rejected;
  expect(fake.instances).toHaveLength(1); expect(fake.instances[0].terminate).toHaveBeenCalledOnce();
});
it("terminates the worker when the request is cancelled mid-extraction", async () => {
  const controller = new AbortController();
  const pending = extractDocument(file(), controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({ code: "EXTRACTION_FAILED" });
  await vi.advanceTimersByTimeAsync(0); expect(fake.instances).toHaveLength(1);
  controller.abort(); await rejected; expect(fake.instances[0].terminate).toHaveBeenCalledOnce();
});
it("bounds concurrent parser workers and releases capacity after failures", async () => {
  const first = extractDocument(file()); const second = extractDocument(file());
  const results = Promise.allSettled([first, second]);
  await vi.advanceTimersByTimeAsync(0); expect(fake.instances).toHaveLength(2);
  await expect(extractDocument(file())).rejects.toMatchObject({ code: "EXTRACTION_FAILED", status: 429 });
  await vi.advanceTimersByTimeAsync(15_001); await results;
  const next = extractDocument(file()); const failed = expect(next).rejects.toMatchObject({ status: 422 });
  await vi.advanceTimersByTimeAsync(15_001); await failed; expect(fake.instances).toHaveLength(3);
});
