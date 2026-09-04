"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { classificationLabels, overallClassification, validateAnalysis } from "@/lib/analysis";
import { readApiResponse } from "@/lib/api-client";
import type { AnalysisOutput } from "@/lib/contracts";
import { calculatePricing, chargeRupeesSchema, formatMoney, reviewDraftSchema, scenarios, type Calculated, type ReviewDraft } from "@/lib/pricing";
import { requiresEditReason } from "@/lib/review";
import type { SavedEstimate } from "@/server/analysis";
import { emptyAgreement, validateAgreement, type Agreement } from "@/lib/agreement";
import { AgreementEditor } from "./agreement-editor";

type Task = AnalysisOutput["tasks"][number];
const noteFields = ["assumptions", "missingInformation", "risks"] as const;
const noteLabels = { assumptions: "assumptions", missingInformation: "questions to resolve", risks: "technical risks" };
type EditableTask = Omit<Task, "estimatedHours" | typeof noteFields[number]> & {
  estimatedHours: Record<typeof scenarios[number], string>;
  assumptions: string; missingInformation: string; risks: string;
};
type FormDraft = { tasks: EditableTask[]; explanation: string; rate: string; charge: string; chargeReason: string; agreement: Agreement };
type Issue = { path: string; message: string };
const moneyInput = (paise: number) => `${BigInt(paise) / 100n}.${(BigInt(paise) % 100n).toString().padStart(2, "0")}`;
function editableTask(task: Task): EditableTask {
  return { ...task, estimatedHours: { minimum: String(task.estimatedHours.minimum), likely: String(task.estimatedHours.likely), maximum: String(task.estimatedHours.maximum) }, assumptions: task.assumptions.join("\n"), missingInformation: task.missingInformation.join("\n"), risks: task.risks.join("\n") };
}
function editableDraft(draft: ReviewDraft, agreement: Agreement = emptyAgreement()): FormDraft {
  return { tasks: draft.analysis.tasks.map(editableTask), explanation: draft.analysis.explanation, rate: moneyInput(draft.hourlyRatePaise), charge: moneyInput(draft.additionalChargePaise), chargeReason: draft.additionalChargeReason, agreement };
}
const lines = (value: string) => value.split("\n").map(line => line.trim()).filter(Boolean);
function validateForm(form: FormDraft, sources: SavedEstimate["sources"]): { draft?: ReviewDraft; calculated?: Calculated; issues: Issue[] } {
  const issues: Issue[] = [];
  const rate = chargeRupeesSchema.safeParse(form.rate);
  const charge = chargeRupeesSchema.safeParse(form.charge);
  if (!rate.success || rate.data <= 0 || rate.data > 10_000_000) issues.push({ path: "hourlyRatePaise", message: "Enter an hourly rate above ₹0 and up to ₹100,000, with at most two decimals." });
  if (!charge.success) issues.push({ path: "additionalChargePaise", message: "Enter a supported nonnegative fixed charge in INR, with at most two decimals." });
  const parsed = reviewDraftSchema.safeParse({
    analysis: { schemaVersion: 1, explanation: form.explanation, tasks: form.tasks.map(task => ({
      ...task, assumptions: lines(task.assumptions), missingInformation: lines(task.missingInformation), risks: lines(task.risks),
      estimatedHours: Object.fromEntries(scenarios.map(s => [s, /^\d+(?:\.\d+)?$/.test(task.estimatedHours[s].trim()) ? Number(task.estimatedHours[s]) : NaN])),
    })) }, hourlyRatePaise: rate.success ? rate.data : NaN, additionalChargePaise: charge.success ? charge.data : NaN, additionalChargeReason: form.chargeReason,
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!issues.some(existing => existing.path === path)) issues.push({ path, message: path.includes("estimatedHours") ? "Use 0–200 hours in quarter-hour steps, ordered minimum ≤ likely ≤ maximum." : issue.message });
    }
    return { issues };
  }
  parsed.data.analysis.tasks.forEach((task, index) => {
    try { validateAnalysis({ ...parsed.data.analysis, tasks: [task] }, sources); }
    catch (error) { issues.push({ path: `analysis.tasks.${index}`, message: error instanceof Error ? error.message : "Check this task’s evidence and questions." }); }
  });
  if (issues.length) return { issues };
  try { validateAgreement(form.agreement, parsed.data.analysis, sources); }
  catch (error) { return { issues: [{ path: "agreement", message: error instanceof Error ? error.message : "Check agreement terms." }] }; }
  try { return { draft: parsed.data, calculated: calculatePricing(parsed.data), issues }; }
  catch { return { issues: [{ path: "additionalChargePaise", message: "The calculated total exceeds the supported exact monetary range. Reduce the additional charge." }] }; }
}

export function ReviewPrices({ draft, calculated }: { draft: ReviewDraft; calculated: Calculated }) {
  return <div className="review-prices">
    <h4>{calculated.provisional ? "Provisional pricing · Incomplete" : "Estimated additional price"}</h4>
    {calculated.provisional && <p className="uncertainty-note">UNCERTAIN tasks are excluded. These totals are incomplete, even when they show ₹0.00. Resolve the scope before approval.</p>}
    <dl className="review-price-range">{scenarios.map(s => <div key={s}><dt>{s}</dt><dd>{formatMoney(calculated.totalChargePaise[s])}<small>{calculated.billableQuarterHours[s] / 4} additional hours</small></dd></div>)}</dl>
    <dl className="review-price-breakdown"><div><dt>Hourly rate</dt><dd>{formatMoney(draft.hourlyRatePaise)}</dd></div><div><dt>Likely labor charge</dt><dd>{formatMoney(calculated.laborChargePaise.likely)}</dd></div><div><dt>Fixed additional charge · once</dt><dd>{formatMoney(calculated.additionalChargePaise)}</dd></div></dl>
    {draft.additionalChargeReason && <p className="source-text"><strong>Additional charge reason:</strong> {draft.additionalChargeReason}</p>}
    <p className="review-help">Calculated from the displayed inputs. Hours and prices are estimates. Approval does not charge or notify the client.</p>
  </div>;
}

export function EstimateReview({ estimate, onSaved, children }: { estimate: SavedEstimate; onSaved: (estimate: SavedEstimate) => void; children: ReactNode }) {
  const [form, setForm] = useState(() => editableDraft(estimate.draft, estimate.agreement));
  const [editing, setEditing] = useState(false);
  const [editReason, setEditReason] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState<"review" | "approve" | "reopen" | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const working = useRef(false);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLFieldSetElement>(null);
  const prefix = useId();
  const id = (path: string) => `${prefix}-${path}`;
  const validation = validateForm(form, estimate.sources);
  const dirty = JSON.stringify(form) !== JSON.stringify(editableDraft(estimate.draft, estimate.agreement)) || editReason.length > 0;
  let agreementError = "";
  try { validateAgreement(estimate.agreement, estimate.analysis, estimate.sources, true); }
  catch (cause) { agreementError = cause instanceof Error ? cause.message : "Complete the agreement terms."; }
  const reasonRequired = estimate.draft.analysis.tasks.some(task => {
    const next = form.tasks.find(candidate => candidate.id === task.id);
    return !next || next.classification !== task.classification;
  });
  const unlocked = estimate.status === "REVIEW_REQUIRED";
  const needsReplacementReview = estimate.offers.some(p => p.status === "REVOKED" && p.approvedRevisionId === estimate.revisions.find(r => r.revision === estimate.currentRevision)?.id);
  const uncertain = estimate.draft.analysis.tasks.some(task => task.classification === "UNCERTAIN");
  const hasInvalidDraft = validation.issues.length > 0;
  const issues = [...validation.issues, ...(reasonRequired && !editReason.trim() ? [{ path: "editReason", message: "Enter one review reason covering the classification changes and removed tasks." }] : [])];
  const invalid = (path: string) => issues.some(issue => issue.path === path || issue.path.startsWith(`${path}.`));
  const change = (next: FormDraft) => { setForm(next); setReviewed(false); setFeedback(""); setError(""); };
  function changeTask(index: number, patch: Partial<EditableTask>) {
    change({ ...form, tasks: form.tasks.map((task, i) => i === index ? { ...task, ...patch } : task) });
  }
  useEffect(() => { if (editing) editorRef.current?.querySelector<HTMLInputElement>("input")?.focus(); }, [editing]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => { if (feedback) statusRef.current?.focus(); }, [feedback]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function perform(action: "review" | "approve" | "reopen") {
    if (working.current) return;
    if (action === "review" && (!editing || !unlocked)) return;
    if (action === "approve" && !unlocked) return;
    if (action === "reopen" && estimate.status !== "APPROVED") return;
    setError(""); setFeedback("");
    if (action === "review" && (!validation.draft || (reasonRequired && !editReason.trim()))) { setError("Review the highlighted inputs. Your draft has been kept."); return; }
    if (action === "approve" && (dirty || hasInvalidDraft || uncertain || !reviewed || estimate.legacyRevision || needsReplacementReview || agreementError)) { setError("Save a valid review, complete agreement terms, resolve uncertain tasks and confirm the review before approving."); return; }
    if (action === "review" && validation.draft && requiresEditReason(estimate.draft, validation.draft) && !editReason.trim()) { setError("A review reason is required for classification changes or task removal."); return; }
    working.current = true; setBusy(action);
    try {
      const body = action === "review" ? { expectedRevision: estimate.currentRevision, draft: validation.draft, agreement: form.agreement, editReason: editReason.trim() } : action === "approve" ? { expectedRevision: estimate.currentRevision, reviewed: true } : { expectedRevision: estimate.currentRevision };
      const result = await readApiResponse(await fetch(`/api/estimates/${estimate.id}/${action}`, { method: action === "review" ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
      const saved = result.estimate as SavedEstimate;
      onSaved(saved); setForm(editableDraft(saved.draft, saved.agreement)); setEditReason(""); setReviewed(false); setEditing(false);
      setFeedback(action === "review" ? `Review saved as revision ${saved.currentRevision}. Confirm this saved revision to approve it.` : action === "approve" ? `Revision ${saved.currentRevision} approved. The saved review is now read-only.` : "Review reopened. Previous saved revisions remain in history.");
    } catch (cause) { setError(`${cause instanceof Error ? cause.message : "Unable to update this estimate."} Your draft has been kept.`); }
    finally { working.current = false; setBusy(null); }
  }
  const fieldProps = (path: string) => ({ id: id(path), "aria-invalid": invalid(path), "aria-describedby": invalid(path) ? id("validation") : undefined });
  function taskEditor(task: EditableTask, index: number) {
    const path = `analysis.tasks.${index}`;
    const label = `Task ${index + 1}`;
    const matchedIndex = estimate.sources.findIndex(source => source.sourceType === task.matchedScopeClause?.sourceType && source.sourceId === task.matchedScopeClause?.sourceId);
    return <fieldset className="intake-panel review-task" key={task.id} id={id(path)} aria-describedby={invalid(path) ? id("validation") : undefined}>
      <legend>{label}</legend><div className="task-top"><span className={`scope-label scope-${task.classification}`}>{classificationLabels[task.classification]}</span><button type="button" className="button button-secondary review-remove" aria-label={`Remove ${label.toLowerCase()}`} disabled={form.tasks.length <= 1} onClick={() => change({ ...form, tasks: form.tasks.filter((_, i) => i !== index) })}>Remove task</button></div>
      <div className="review-field"><label htmlFor={id(`${path}.title`)}>{label} title</label><input {...fieldProps(`${path}.title`)} value={task.title} maxLength={200} onChange={e => changeTask(index, { title: e.target.value })} /></div>
      <div className="review-field"><label htmlFor={id(`${path}.classification`)}>{label} classification</label><select {...fieldProps(`${path}.classification`)} value={task.classification} onChange={e => {
        const classification = e.target.value as Task["classification"];
        changeTask(index, { classification, ...(classification === "IN_SCOPE" ? { estimatedHours: { minimum: "0", likely: "0", maximum: "0" }, matchedScopeClause: task.matchedScopeClause ? { ...task.matchedScopeClause, relation: "inclusion" } : null } : {}) });
      }}>{Object.entries(classificationLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></div>
      <div className="hours-grid review-hours">{scenarios.map(s => <div key={s}><label htmlFor={id(`${path}.estimatedHours.${s}`)}>{label} {s} hours</label><input {...fieldProps(`${path}.estimatedHours.${s}`)} type="number" min="0" max="200" step="0.25" inputMode="decimal" readOnly={task.classification === "IN_SCOPE"} value={task.estimatedHours[s]} onChange={e => changeTask(index, { estimatedHours: { ...task.estimatedHours, [s]: e.target.value } })} /></div>)}</div>
      <p className="review-help">{task.classification === "IN_SCOPE" ? "Included work has zero additional hours and must match an inclusion below." : "Use quarter-hour steps (0.25 h), minimum ≤ likely ≤ maximum. Modified work includes incremental effort only."}</p>
      {task.classification === "UNCERTAIN" && <p className="uncertainty-note">Add a specific question below. This task must be resolved before approval; its hours are excluded from provisional totals.</p>}
      <div className="review-evidence"><h4>{label} evidence</h4><p className="review-help">Choose only from the scope saved with this analysis. Quotes must be exact, continuous portions of that source (up to 2,000 characters).</p>
        {task.sourceEvidence.map((evidence, evidenceIndex) => {
          const sourceIndex = estimate.sources.findIndex(source => source.sourceId === evidence.sourceId && source.sourceType === evidence.sourceType);
          const source = estimate.sources[sourceIndex];
          const quotePath = `${path}.sourceEvidence.${evidenceIndex}.quote`;
          return <div className="review-evidence-card" key={`${evidence.sourceType}:${evidence.sourceId}:${evidenceIndex}`}><div className="review-evidence-top"><a href={`#source-${sourceIndex}`}>{source?.sourceType === "baseline_clause" ? "Original baseline" : "Accepted amendment"} · {source?.clauseId}</a><button type="button" className="button button-secondary" aria-label={`Remove ${label.toLowerCase()} evidence ${evidenceIndex + 1}`} onClick={() => {
            const sourceEvidence = task.sourceEvidence.filter((_, i) => i !== evidenceIndex);
            const retainsMatch = sourceEvidence.some(item => item.sourceId === task.matchedScopeClause?.sourceId && item.sourceType === task.matchedScopeClause?.sourceType);
            changeTask(index, { sourceEvidence, matchedScopeClause: retainsMatch ? task.matchedScopeClause : null });
          }}>Remove evidence</button></div><label htmlFor={id(quotePath)}>{label} evidence {evidenceIndex + 1} exact quote</label><textarea {...fieldProps(quotePath)} className="resize-none" rows={3} maxLength={2000} value={evidence.quote} onChange={e => changeTask(index, { sourceEvidence: task.sourceEvidence.map((item, i) => i === evidenceIndex ? { ...item, quote: e.target.value } : item) })} /><details className="review-source-preview"><summary>Read full source · {source?.clauseId}</summary><p className="source-text">{source?.text}</p></details></div>;
        })}
        <div className="review-field"><label htmlFor={id(`${path}.addEvidence`)}>Add {label.toLowerCase()} evidence from saved scope</label><select id={id(`${path}.addEvidence`)} value="" disabled={task.sourceEvidence.length >= 20} onChange={e => {
          if (!e.target.value) return;
          const source = estimate.sources[Number(e.target.value)];
          changeTask(index, { sourceEvidence: [...task.sourceEvidence, { sourceId: source.sourceId, sourceType: source.sourceType, quote: source.text.slice(0, 2000) }] });
        }}><option value="">Select a source…</option>{estimate.sources.map((source, i) => <option key={`${source.sourceType}:${source.sourceId}`} value={i} disabled={task.sourceEvidence.some(e => e.sourceId === source.sourceId && e.sourceType === source.sourceType)}>{source.sourceType === "baseline_clause" ? "Baseline" : "Amendment"} · {source.clauseId}</option>)}</select></div>
        <div className="review-field"><label htmlFor={id(`${path}.matchedScopeClause`)}>{label} matching clause</label><select {...fieldProps(`${path}.matchedScopeClause`)} value={matchedIndex >= 0 ? String(matchedIndex) : ""} onChange={e => {
          const source = e.target.value === "" ? null : estimate.sources[Number(e.target.value)];
          changeTask(index, { matchedScopeClause: source ? { sourceId: source.sourceId, sourceType: source.sourceType, relation: task.classification === "IN_SCOPE" ? "inclusion" : "context" } : null });
        }}><option value="">No matching clause</option>{estimate.sources.map((source, i) => task.sourceEvidence.some(e => e.sourceId === source.sourceId && e.sourceType === source.sourceType) ? <option key={`${source.sourceType}:${source.sourceId}`} value={i}>{source.clauseId}</option> : null)}</select></div>
        {task.matchedScopeClause && <div className="review-field"><label htmlFor={id(`${path}.matchedScopeClause.relation`)}>{label} clause relation</label><select {...fieldProps(`${path}.matchedScopeClause.relation`)} value={task.matchedScopeClause.relation} disabled={task.classification === "IN_SCOPE"} onChange={e => changeTask(index, { matchedScopeClause: { ...task.matchedScopeClause!, relation: e.target.value as NonNullable<Task["matchedScopeClause"]>["relation"] } })}>{["inclusion", "exclusion", "limit", "context"].map(relation => <option key={relation} value={relation}>{relation}</option>)}</select><p className="review-help">Absence is not an explicit exclusion. Use context to explain a gap in the agreement.</p></div>}
      </div>
      {noteFields.map(field => <div className="review-field" key={field}><label htmlFor={id(`${path}.${field}`)}>{label} {noteLabels[field]}</label><textarea {...fieldProps(`${path}.${field}`)} className="resize-none" rows={3} value={task[field]} onChange={e => changeTask(index, { [field]: e.target.value })} /><p className="review-help">One item per line; up to 20 items, 2,000 characters each.</p></div>)}
      <div className="review-field"><label htmlFor={id(`${path}.complexity`)}>{label} complexity</label><textarea {...fieldProps(`${path}.complexity`)} className="resize-none" rows={2} maxLength={2000} value={task.complexity} onChange={e => changeTask(index, { complexity: e.target.value })} /></div>
      <div className="review-field"><label htmlFor={id(`${path}.explanation`)}>{label} explanation</label><textarea {...fieldProps(`${path}.explanation`)} className="resize-none" rows={3} maxLength={2000} value={task.explanation} onChange={e => changeTask(index, { explanation: e.target.value })} /></div>
    </fieldset>;
  }

  return <form className="estimate-review" noValidate aria-label="Estimate review" aria-busy={!!busy} onSubmit={event => { event.preventDefault(); void perform("review"); }}>
    <div className="review-toolbar"><div><h3>{editing ? "Edit reviewed estimate" : "Saved estimate"}</h3><p>Revision {estimate.currentRevision}{dirty ? " · Unsaved changes" : " · All changes saved"}</p></div>{unlocked && <button type="button" className="button button-secondary" disabled={!!busy} aria-expanded={editing} aria-controls={id("editor")} onClick={() => setEditing(value => !value)}>{editing ? "Close editor" : "Edit review"}</button>}</div>
    <div className="analysis-layout"><div className="analysis-tasks">
      {editing && unlocked ? <fieldset ref={editorRef} className="review-editor" id={id("editor")} disabled={!!busy}><legend className="review-sr-only">Review inputs</legend>
        {form.tasks.map(taskEditor)}
        <AgreementEditor value={form.agreement} onChange={agreement => change({ ...form, agreement })} analysis={{tasks:form.tasks}} sources={estimate.sources} options={estimate.supersessionOptions}/>
        <div className="review-add-task"><button type="button" className="button button-secondary" disabled={form.tasks.length >= 20} onClick={() => {
          change({ ...form, tasks: [...form.tasks, editableTask({ id: crypto.randomUUID(), title: "", classification: "UNCERTAIN", matchedScopeClause: null, sourceEvidence: [], estimatedHours: { minimum: 0, likely: 0, maximum: 0 }, assumptions: [], missingInformation: [], risks: [], complexity: "", explanation: "" })] });
        }}>Add task</button><span>{form.tasks.length} / 20 tasks · At least one task is required</span></div>
        <div className="intake-panel"><div className="review-field"><label htmlFor={id("analysis.explanation")}>Overall explanation</label><textarea {...fieldProps("analysis.explanation")} className="resize-none" maxLength={2000} rows={3} value={form.explanation} onChange={e => change({ ...form, explanation: e.target.value })} /></div>
          <div className="review-field"><label htmlFor={id("hourlyRatePaise")}>Hourly rate (INR)</label><input {...fieldProps("hourlyRatePaise")} inputMode="decimal" value={form.rate} onChange={e => change({ ...form, rate: e.target.value })} /><p className="review-help">Above ₹0, up to ₹100,000/hour; at most two decimals.</p></div>
          <div className="review-field"><label htmlFor={id("additionalChargePaise")}>Fixed additional charge (INR)</label><input {...fieldProps("additionalChargePaise")} inputMode="decimal" value={form.charge} onChange={e => change({ ...form, charge: e.target.value })} /><p className="review-help">Added once per request to each scenario. Use 0 for no charge. An all-IN_SCOPE request must have no additional charge.</p></div>
          <div className="review-field"><label htmlFor={id("additionalChargeReason")}>Additional charge reason (client-facing)</label><textarea {...fieldProps("additionalChargeReason")} className="resize-none" maxLength={500} rows={2} value={form.chargeReason} onChange={e => change({ ...form, chargeReason: e.target.value })} /><p className="review-help">Required when the additional charge is above ₹0.</p></div>
          <div className="review-field"><label htmlFor={id("editReason")}>Review reason{reasonRequired ? " (required)" : " (optional)"}</label><textarea {...fieldProps("editReason")} className="resize-none" maxLength={1000} rows={3} value={editReason} onChange={e => { setEditReason(e.target.value); setFeedback(""); setError(""); }} /><p className="review-help">One recorded reason must explain any classification changes or removed tasks.</p></div>
        </div>
      </fieldset> : <div id={id("editor")}>{children}</div>}
    </div><aside className="intake-panel analysis-summary review-summary" aria-label="Analysis summary"><p className="eyebrow">CHANGE AT A GLANCE</p><h3>{classificationLabels[overallClassification(editing && validation.draft ? validation.draft.analysis : estimate.analysis)]}</h3><p>{editing ? form.explanation : estimate.analysis.explanation}</p>
      <p className="review-summary-state">{editing ? "Live draft calculation" : `Saved revision ${estimate.currentRevision}`}</p>
      {editing ? validation.draft && validation.calculated ? <ReviewPrices draft={validation.draft} calculated={validation.calculated} /> : <p className="uncertainty-note">Draft totals are unavailable until the inputs and evidence are valid. No complete quote is shown.</p> : <ReviewPrices draft={estimate.draft} calculated={estimate.calculated} />}
      <hr/><p>{editing ? form.tasks.length : estimate.analysis.tasks.length} tasks · One client request</p>{dirty && !editing && <p className="uncertainty-note">Unsaved edits are kept in the editor. The values above show the saved revision. Open Edit review to finish saving.</p>}
      {estimate.legacyRevision && <p className="uncertainty-note">This estimate uses an older revision format. Open Edit review and save a reviewed snapshot before approval.</p>}
    </aside></div>
    {editing && issues.length > 0 && <div className="review-validation" id={id("validation")} aria-label="Review validation"><h4>Check these review inputs</h4><ul>{issues.map((issue, i) => <li key={`${issue.path}-${i}`}>{issue.path.startsWith("analysis.tasks.") ? `Task ${Number(issue.path.split(".")[2]) + 1}: ` : ""}{issue.message}</li>)}</ul></div>}
    {error && <div className="form-error review-error" role="alert" ref={errorRef} tabIndex={-1}>{error}</div>}
    {feedback && <p className="review-feedback" role="status" ref={statusRef} tabIndex={-1}>{feedback}</p>}
    <div className="review-actions intake-panel">
      {unlocked ? <><h3>Save, then approve</h3><p>Approval freezes the exact saved revision and its calculated totals.</p>
        {editing && <button type="submit" className="button button-primary" disabled={!!busy}>{busy === "review" ? "Saving review…" : "Save review"}</button>}
        {needsReplacementReview && <p className="uncertainty-note">Open Edit review and save a new revision before approving a replacement offer.</p>}
        {dirty && <p className="uncertainty-note">Save your changes before approving. Unsaved changes cannot be approved.</p>}
        {uncertain && <p className="review-help">Resolve every UNCERTAIN task and save the review to enable approval.</p>}
        {agreementError && <p className="uncertainty-note">{agreementError} Open Edit review to complete the terms.</p>}
        <label className="check-label" htmlFor={id("reviewed")}><input id={id("reviewed")} type="checkbox" checked={reviewed} disabled={!!busy || dirty || hasInvalidDraft || uncertain || estimate.legacyRevision || needsReplacementReview || !!agreementError} onChange={e => setReviewed(e.target.checked)} /><span>I have reviewed the scope, evidence, assumptions, hours and price, including the client-facing agreement terms, for saved revision {estimate.currentRevision}.</span></label>
        <button type="button" className="button button-primary" disabled={!!busy || dirty || hasInvalidDraft || uncertain || !reviewed || estimate.legacyRevision || needsReplacementReview || !!agreementError} onClick={() => void perform("approve")}>{busy === "approve" ? "Approving…" : "Approve estimate"}</button>
      </> : <><h3>Human-approved · Revision {estimate.currentRevision}</h3><p>This saved review is read-only. Approval is internal and does not record client acceptance.</p>{estimate.status === "APPROVED" ? <button type="button" className="button button-secondary" disabled={!!busy} onClick={() => void perform("reopen")}>{busy === "reopen" ? "Reopening…" : "Reopen Review"}</button> : <p className="review-help">Use Client offers below to revoke a pending offer and edit. Final client decisions cannot be changed.</p>}</>}
    </div>
  </form>;
}
