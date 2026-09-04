import { PDFDocument, StandardFonts } from "pdf-lib";
import JSZip from "jszip";

// Test-only inputs: never imported by runtime code or used as an AI fallback.
export const agreement = "Build a responsive five-page website.\n\nInclude a contact form with email notifications.";
export const baselineInput = (text = agreement) => ({ text, snapshot: { schemaVersion: 1, clauses: text.split("\n\n").map((part, index) => ({ id: `B${index + 1}`, text: part, isDeliverable: index === 0 })) }, confirmed: true });
export async function pdfFixture({ blank = false, mixed = false, text = agreement.replace(/\n\n/g, "\n") } = {}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([600, 800]);
  if (blank) {
    const png = await pdf.embedPng(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=", "base64"));
    page.drawImage(png, { x: 10, y: 10, width: 100, height: 100 });
  } else page.drawText(text, { x: 30, y: 730, size: 12, font: await pdf.embedFont(StandardFonts.Helvetica) });
  if (mixed) pdf.addPage([600, 800]);
  return Buffer.from(await pdf.save());
}
export async function docxFixture(text = agreement, oversizedArchive = false) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  const escape = (part: string) => part.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  zip.file("word/document.xml", '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + text.split("\n\n").map(part => `<w:p><w:r><w:t xml:space="preserve">${escape(part)}</w:t></w:r></w:p>`).join("") + '</w:body></w:document>');
  if (oversizedArchive) zip.file("word/media/oversized.bin", Buffer.alloc(17 * 1024 * 1024));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
