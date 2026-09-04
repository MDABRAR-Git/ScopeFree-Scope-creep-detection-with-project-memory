"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, FileText, LoaderCircle, LockKeyhole, Plus, Upload, X, ArrowUp } from "lucide-react";
import { baselineInputSchema, clausesToText, draftClauses, MAX_BASELINE_CHARACTERS, MAX_CLAUSES, MAX_UPLOAD_BYTES, type BaselineClause } from "@/lib/intake";
import { ClientApiError, readApiResponse } from "@/lib/api-client";
import type { SavedBaseline } from "@/server/intake";

export function BaselineEditor({ projectId, initialBaseline }: { projectId: string; initialBaseline: SavedBaseline | null }) {
  const router = useRouter();
  const [baseline, setBaseline] = useState(initialBaseline);
  const [source, setSource] = useState("");
  const [clauses, setClauses] = useState<BaselineClause[] | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"extract" | "save" | null>(null);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const working = useRef(false);
  const canonical = clauses ? clausesToText(clauses) : source;
  const total = canonical.length;

  function changeClauses(next: BaselineClause[]) { setClauses(next); setConfirmed(false); setError(""); }
  function updateClause(index: number, patch: Partial<BaselineClause>) {
    changeClauses(clauses!.map((clause, position) => position === index ? { ...clause, ...patch } : clause));
  }
  async function extract(file?: File) {
    if (!file || working.current) return;
    setError("");
    if (file.size > MAX_UPLOAD_BYTES) { setError("The file exceeds 5 MB. Choose a smaller file or paste the agreed text instead."); return; }
    working.current = true; setBusy("extract");
    try {
      const form = new FormData(); form.append("file", file);
      const result = await readApiResponse(await fetch(`/api/projects/${projectId}/baseline/extract`, { method: "POST", body: form }));
      setSource(result.text); setFileName(file.name); setConfirmed(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not extract the file. Paste the text instead."); }
    finally { working.current = false; setBusy(null); if (fileInput.current) fileInput.current.value = ""; }
  }
  function preview() {
    setError("");
    if (!source.trim()) { setError("Paste an agreement or upload a readable document first."); return; }
    if (source.trim().length > MAX_BASELINE_CHARACTERS) { setError("The baseline exceeds 12,000 characters. Edit the text before continuing; nothing has been truncated."); return; }
    setClauses(draftClauses(source)); setConfirmed(false);
  }
  async function save() {
    if (working.current) return;
    setError("");
    const parsed = baselineInputSchema.safeParse({ text: canonical, snapshot: { schemaVersion: 1, clauses }, confirmed });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    working.current = true; setBusy("save");
    try {
      const result = await readApiResponse(await fetch(`/api/projects/${projectId}/baseline`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) }));
      setBaseline(result.baseline); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the baseline. Please retry."); if (e instanceof ClientApiError && e.code === "BASELINE_ALREADY_CONFIRMED") setConflict(true); }
    finally { working.current = false; setBusy(null); }
  }

  if (baseline) return <section className="intake-section" aria-labelledby="baseline-heading">
    <div className="intake-heading"><div><p className="eyebrow">THE ORIGINAL AGREEMENT</p><h2 id="baseline-heading">Confirmed baseline</h2><p>The starting point for every scope decision.</p></div><span className="neutral-badge"><LockKeyhole size={14} aria-hidden="true" />Read-only</span></div>
    <div className="intake-notice success-notice"><Check size={19} aria-hidden="true" /><div><strong>Original baseline saved</strong><p>Confirmed by {baseline.confirmedBy} on {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(baseline.confirmedAt))} UTC. This records your assertion of agreement.</p></div></div>
    <div className="saved-clauses">{baseline.snapshot.clauses.map(clause => <article className="saved-clause" key={clause.id} id={`clause-${clause.id}`}><div className="clause-title"><span className="clause-id">{clause.id}</span>{clause.isDeliverable && <span className="clause-kind">Deliverable identified by you</span>}</div><p className="source-text">{clause.text}</p></article>)}</div>
    <details className="source-details"><summary>View complete confirmed text</summary><p className="source-text">{baseline.text}</p></details>
    <div className="intake-footer"><p>The original baseline cannot be edited. If it was entered incorrectly, create a new project.</p><Link className="button button-primary" href={`/projects/${projectId}/requests`}>Add a request<ArrowRight size={17} aria-hidden="true" /></Link></div>
  </section>;

  return <section className="intake-section" aria-labelledby="baseline-heading">
    <div className="intake-heading"><div><p className="eyebrow">START WITH WHAT YOU AGREED</p><h2 id="baseline-heading">Original baseline</h2><p>Capture the deliverables and boundaries of this project.</p></div><span className="step-badge">{clauses ? "2 · Review & confirm" : "1 · Add agreement"}</span></div>
    <div className="intake-notice"><FileText size={19} aria-hidden="true" /><p>Review the complete agreement before confirming. The confirmed baseline becomes read-only; later agreed changes will be recorded separately.</p></div>
    {!clauses ? <div className="intake-panel">
      <div className="upload-zone"><Upload size={27} strokeWidth={1.5} aria-hidden="true" /><h3>Bring your agreement into ScopeFree</h3><p>Text-based PDF, DOCX or UTF-8 TXT · One file, up to 5 MB</p><label className="file-label" htmlFor="baseline-file">Choose agreement file</label><input ref={fileInput} id="baseline-file" type="file" accept=".pdf,.docx,.txt" disabled={!!busy} onChange={e => void extract(e.target.files?.[0])} />{busy === "extract" && <p role="status"><LoaderCircle size={16} className="spin" aria-hidden="true" />Extracting text…</p>}</div>
      <div className="or-divider"><span />or paste the agreed requirements<span /></div>
      <label htmlFor="baseline-source">Agreement text</label><textarea id="baseline-source" rows={10} value={source} disabled={!!busy} onChange={e => { setSource(e.target.value); setFileName(""); }} placeholder="Paste the agreed deliverables, quantities, inclusions and exclusions…" aria-describedby="baseline-text-help" aria-invalid={total > MAX_BASELINE_CHARACTERS} />
      <div className="input-meta"><span id="baseline-text-help">{fileName ? `Extracted from ${fileName}. Check the text for accuracy and completeness.` : "Nothing is saved until you confirm the baseline."}</span><span className={total > MAX_BASELINE_CHARACTERS ? "invalid-count" : ""}>{total.toLocaleString()} / 12,000</span></div>
      {total > MAX_BASELINE_CHARACTERS && <p className="form-error" role="alert">The agreement exceeds 12,000 characters. Edit it before continuing; your text has not been truncated.</p>}
      <div className="form-actions"><button className="button button-primary" onClick={preview} disabled={!!busy}>Review clauses<ArrowRight size={17} aria-hidden="true" /></button></div>
    </div> : <div className="clause-editor">
      <div className="clause-toolbar"><div><h3>Review the scope clauses</h3><p>Edit IDs and text, add or merge clauses, and identify concrete deliverables.</p></div><button className="button button-quiet" disabled={!!busy} onClick={() => { setSource(canonical); setClauses(null); setConfirmed(false); setError(""); }}>Edit source text</button></div>
      {clauses.map((clause, index) => <fieldset className="clause-card" key={index} disabled={!!busy}><legend>Clause {index + 1}</legend><div className="clause-controls"><div><label htmlFor={`clause-id-${index}`}>Clause ID</label><input id={`clause-id-${index}`} value={clause.id} onChange={e => updateClause(index, { id: e.target.value })} /></div><div className="clause-buttons">{index > 0 && <button type="button" className="button button-quiet" aria-label={`Merge clause ${index + 1} with previous`} onClick={() => { const next = [...clauses]; next[index - 1] = { ...next[index - 1], text: `${next[index - 1].text}\n\n${clause.text}`, isDeliverable: next[index - 1].isDeliverable || clause.isDeliverable }; next.splice(index, 1); changeClauses(next); }}><ArrowUp size={15} aria-hidden="true" />Merge</button>}<button type="button" className="button button-quiet" aria-label={`Remove clause ${index + 1}`} onClick={() => changeClauses(clauses.filter((_, position) => position !== index))}><X size={16} aria-hidden="true" />Remove</button></div></div>
        <label htmlFor={`clause-text-${index}`}>Clause text</label><textarea id={`clause-text-${index}`} rows={4} value={clause.text} onChange={e => updateClause(index, { text: e.target.value })} />
        <label className="check-label"><input type="checkbox" checked={clause.isDeliverable} onChange={e => updateClause(index, { isDeliverable: e.target.checked })} /><span>This clause describes a concrete deliverable.</span></label>
      </fieldset>)}
      <div className="clause-toolbar"><button className="button button-secondary" disabled={!!busy || clauses.length >= MAX_CLAUSES} onClick={() => { let nextId = clauses.length + 1; while (clauses.some(clause => clause.id === `B${nextId}`)) nextId++; changeClauses([...clauses, { id: `B${nextId}`, text: "", isDeliverable: false }]); }}><Plus size={17} aria-hidden="true" />Add clause</button><span className="input-meta">{clauses.length} / 40 clauses · {total.toLocaleString()} / 12,000 characters</span></div>
      <details className="source-details"><summary>Preview complete text to be saved</summary><p className="source-text">{canonical}</p></details>
      <div className="confirmation-panel"><label className="check-label"><input type="checkbox" checked={confirmed} disabled={!!busy} onChange={e => setConfirmed(e.target.checked)} /><span>I have reviewed all text and clauses, identified the agreed deliverables, and confirm this as the original agreement. I understand it cannot be edited after saving.</span></label><p>This is your assertion of agreement, not independent verification of client consent.</p><button className="button button-primary" disabled={!!busy || conflict} onClick={() => void save()}>{busy === "save" ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <LockKeyhole size={17} aria-hidden="true" />}{busy === "save" ? "Saving baseline…" : "Confirm baseline"}</button></div>
    </div>}
    {error && <div className="form-error intake-error" role="alert">{error}{conflict && <button className="button button-quiet" onClick={() => window.location.reload()}>Open saved baseline</button>}</div>}
  </section>;
}
