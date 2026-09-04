// Runs only in a disposable server worker. No filenames, file bytes, parser errors or prompts are logged.
import { parentPort, workerData } from 'node:worker_threads';
import yauzl from 'yauzl';

class ExtractionFailure extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const alternative = ' Paste the agreed text instead.';
const tooLarge = () => new ExtractionFailure('INPUT_TOO_LARGE', 'The document exceeds the safe extraction limits.' + alternative);
const unreadable = () => new ExtractionFailure('EXTRACTION_FAILED', 'The document could not be read completely. Use a readable, unencrypted text document.' + alternative);

async function checkDocxArchive(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) { reject(unreadable()); return; }
      let declaredBytes = 0;
      let actualBytes = 0;
      let count = 0;
      let documentFound = false;
      let contentTypes = '';
      let failed = false;
      const names = new Set();
      const fail = (problem) => { if (!failed) { failed = true; zip.close(); reject(problem); } };
      zip.on('error', () => fail(unreadable()));
      zip.on('entry', entry => {
        if (failed) return;
        count++;
        declaredBytes += entry.uncompressedSize;
        if (count > 1000 || declaredBytes > 16 * 1024 * 1024) { fail(tooLarge()); return; }
        if (names.has(entry.fileName) || (entry.generalPurposeBitFlag & 1)) { fail(unreadable()); return; }
        names.add(entry.fileName);
        if (entry.fileName === 'word/document.xml') documentFound = true;
        if (/\/$/.test(entry.fileName)) { zip.readEntry(); return; }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) { fail(unreadable()); return; }
          stream.on('error', () => fail(unreadable()));
          stream.on('data', chunk => {
            actualBytes += chunk.length;
            if (actualBytes > 16 * 1024 * 1024) { stream.destroy(); fail(tooLarge()); return; }
            if (entry.fileName === '[Content_Types].xml') {
              contentTypes += chunk.toString('utf8');
              if (contentTypes.length > 100_000) { stream.destroy(); fail(tooLarge()); }
            }
          });
          stream.on('end', () => { if (!failed) zip.readEntry(); });
        });
      });
      zip.on('end', () => {
        if (!documentFound || !contentTypes.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml')) { fail(new ExtractionFailure('UNSUPPORTED_FILE', 'This file is not a supported DOCX document.' + alternative)); return; }
        resolve();
      });
      zip.readEntry();
    });
  });
}

async function extract() {
  const buffer = Buffer.from(workerData.bytes);
  let text;
  if (workerData.kind === 'txt') {
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch { throw unreadable(); }
  } else if (workerData.kind === 'docx') {
    await checkDocxArchive(buffer);
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    if (result.messages.some(message => message.type === 'error')) throw unreadable();
    text = result.value;
  } else {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loading = pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, useWorkerFetch: false, stopAtErrors: true, verbosity: 0 });
    try {
      const pdf = await loading.promise;
      // Reject rather than silently skipping pages. Limits supplement the worker's time/memory bounds.
      if (pdf.numPages > 100) throw tooLarge();
      const pages = [];
      let characterCount = 0;
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        let pageText = '';
        for (const item of content.items) if ('str' in item) pageText += item.str + (item.hasEOL ? '\n' : ' ');
        // A page with no readable text might contain scanned scope. Never silently omit it.
        if (!/[\p{L}\p{N}]/u.test(pageText)) throw new ExtractionFailure('EXTRACTION_FAILED', 'At least one PDF page has no readable text. Scanned or mixed image/text PDFs need a complete pasted agreement.' + alternative);
        characterCount += pageText.length;
        if (characterCount > 24_000) throw tooLarge();
        pages.push(pageText.trim());
        page.cleanup();
      }
      text = pages.join('\n\n');
    } finally { await loading.destroy(); }
  }
  text = text.replace(/\r\n?/g, '\n').trim();
  if (text.length > 12_000) throw new ExtractionFailure('INPUT_TOO_LARGE', 'The extracted agreement exceeds 12,000 characters. Nothing was truncated or saved.' + alternative);
  if (!/[\p{L}\p{N}]/u.test(text) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) throw unreadable();
  return text;
}

try { parentPort.postMessage({ ok: true, text: await extract() }); }
catch (error) {
  const safe = error instanceof ExtractionFailure ? error : unreadable();
  parentPort.postMessage({ ok: false, code: safe.code, message: safe.message });
}
