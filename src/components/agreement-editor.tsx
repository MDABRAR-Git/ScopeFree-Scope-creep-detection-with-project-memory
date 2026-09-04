"use client";
import type { Agreement } from "@/lib/agreement";
import type { AnalysisOutput } from "@/lib/contracts";
import type { ScopeSource } from "@/lib/analysis";
import type { SavedEstimate } from "@/server/analysis";

export function AgreementEditor({ value, onChange, analysis, sources, options }: { value: Agreement; onChange: (value: Agreement) => void; analysis: { tasks: Pick<AnalysisOutput["tasks"][number], "id" | "title" | "classification">[] }; sources: ScopeSource[]; options: SavedEstimate["supersessionOptions"] }) {
  const tasks = analysis.tasks.filter(t => t.classification !== "IN_SCOPE");
  return <section className="intake-panel agreement-editor" aria-label="Client-facing agreement terms"><h3>Client-facing agreement terms</h3>
    <p className="review-help">Describe the resulting deliverables and limits, not just the effort. For example, state the new agreed page count. These exact terms will be shared for client acceptance.</p>
    {value.clauses.map((clause, i) => <fieldset key={clause.id} className="agreement-clause"><legend>Agreement term {i + 1}</legend>
      <label>Agreement term {i + 1} text<textarea className="resize-none" value={clause.text} maxLength={12000} rows={3} onChange={e => onChange({ ...value, clauses: value.clauses.map((c,j) => j === i ? { ...c, text: e.target.value } : c) })}/></label>
      <p className="review-help">Applies to these additional tasks:</p>{tasks.map(task => <label className="check-label" key={task.id}><input type="checkbox" checked={clause.taskIds.includes(task.id)} onChange={e => onChange({ ...value, clauses: value.clauses.map((c,j) => j === i ? { ...c, taskIds: e.target.checked ? [...c.taskIds,task.id] : c.taskIds.filter(id => id !== task.id) } : c) })}/><span>Term {i + 1} applies to {task.title || "Untitled task"}</span></label>)}
      <p className="review-help">Explicitly changes these existing clauses (required for modifications). Selecting a clause does not replace its unrelated terms:</p>{sources.map(source => <label className="check-label" key={source.sourceId}><input type="checkbox" checked={clause.amendsSourceIds.includes(source.sourceId)} onChange={e => onChange({ ...value, clauses: value.clauses.map((c,j) => j === i ? { ...c, amendsSourceIds: e.target.checked ? [...c.amendsSourceIds,source.sourceId] : c.amendsSourceIds.filter(id => id !== source.sourceId) } : c) })}/><span>Term {i + 1} changes {source.sourceType === "baseline_clause" ? "baseline" : "accepted"} clause {source.clauseId}</span></label>)}
      <button type="button" className="button button-secondary" onClick={() => onChange({ ...value, clauses: value.clauses.filter((_,j) => j !== i) })}>Remove agreement term {i + 1}</button>
    </fieldset>)}
    <button type="button" className="button button-secondary" disabled={!tasks.length || value.clauses.length >= 40} onClick={() => onChange({ ...value, clauses: [...value.clauses, { id: crypto.randomUUID(), text: "", taskIds: tasks.length === 1 ? [tasks[0].id] : [], amendsSourceIds: [] }] })}>Add agreement term</button>
    {!tasks.length && <p className="review-help">IN_SCOPE-only work adds no amendment.</p>}
    <label className="review-field">Replace a whole accepted decision (optional)<select value={value.supersedesDecisionId ?? ""} onChange={e => onChange({ ...value, supersedesDecisionId: e.target.value || null })}><option value="">Keep existing accepted decisions</option>{options.map(option => <option key={option.id} value={option.id}>{option.title}</option>)}</select></label>
    {value.supersedesDecisionId && <><p className="uncertainty-note">This replaces the entire selected amendment. Restate every term that should remain applicable in the new agreement terms.</p><details><summary>Read the selected accepted terms</summary>{options.find(o => o.id === value.supersedesDecisionId)?.clauses.map(c => <p className="source-text" key={c.id}>{c.text}</p>)}</details></>}
  </section>;
}
