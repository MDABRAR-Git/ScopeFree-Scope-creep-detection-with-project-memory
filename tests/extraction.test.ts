import { describe, expect, it } from "vitest";
import { extractDocument, readUpload } from "../src/server/extraction";
import { agreement, docxFixture, pdfFixture } from "./fixtures/intake-documents";
const file = (bytes: Uint8Array | string, name: string, type: string) => new File([typeof bytes === "string" ? bytes : new Uint8Array(bytes)], name, { type });
describe("real server document parsers", () => {
  it("extracts a UTF-8 TXT including BOM and normalizes line endings", async () => {
    const result = await extractDocument(file("\uFEFF" + agreement.replaceAll("\n", "\r\n"), "agreement.txt", "text/plain"));
    expect(result.text).toBe(agreement); expect(result.clauses).toHaveLength(2);
  });
  it("extracts real DOCX body text", async () => { expect((await extractDocument(file(await docxFixture(), "agreement.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))).text).toBe(agreement); });
  it("extracts a real text PDF", async () => { const result = await extractDocument(file(await pdfFixture(), "agreement.pdf", "application/pdf")); expect(result.text).toContain("Build a responsive five-page website."); expect(result.text).toContain("Include a contact form with email notifications."); }, 20_000);
  it("rejects scanned and mixed unreadable PDF pages instead of omitting scope", async () => {
    for (const settings of [{ blank: true }, { mixed: true }]) await expect(extractDocument(file(await pdfFixture(settings), "scan.pdf", "application/pdf"))).rejects.toMatchObject({ code: "EXTRACTION_FAILED" });
  });
  it("rejects empty/corrupt/binary/non-UTF8 text and type mismatches", async () => {
    for (const bad of [file("", "empty.txt", "text/plain"), file(new Uint8Array([255, 254, 0, 0]), "binary.txt", "text/plain"), file("%PDF-broken", "bad.pdf", "application/pdf"), file("PK\u0003\u0004broken", "bad.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")]) await expect(extractDocument(bad)).rejects.toMatchObject({ code: "EXTRACTION_FAILED" });
    for (const bad of [file(agreement, "file.exe", "text/plain"), file(agreement, "file.pdf", "application/pdf"), file("%PDF-any", "file.txt", "text/plain"), file(agreement, "file.txt", "image/png")]) await expect(extractDocument(bad)).rejects.toMatchObject({ code: "UNSUPPORTED_FILE" });
  });
  it("rejects upload/text/expanded-archive size excess without truncation", async () => {
    for (const bad of [file("a".repeat(5 * 1024 * 1024 + 1), "large.txt", "text/plain"), file("Build a website. " + "x".repeat(12000), "long.txt", "text/plain"), file(await docxFixture(agreement, true), "large.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")]) await expect(extractDocument(bad)).rejects.toMatchObject({ code: "INPUT_TOO_LARGE" });
  });
  it("rejects multi-file and malformed multipart uploads", async () => {
    const form = new FormData(); form.append("file", file(agreement, "one.txt", "text/plain")); form.append("extra", "untrusted");
    await expect(readUpload(new Request("http://localhost/upload", { method: "POST", body: form }))).rejects.toMatchObject({ code: "UNSUPPORTED_FILE" });
    await expect(readUpload(new Request("http://localhost/upload", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=bad" }, body: "broken" }))).rejects.toMatchObject({ code: "EXTRACTION_FAILED" });
  });
  it("does not start parsing after cancellation", async () => { const controller = new AbortController(); controller.abort(); await expect(extractDocument(file(agreement, "test.txt", "text/plain"), controller.signal)).rejects.toMatchObject({ code: "EXTRACTION_FAILED" }); });
});
