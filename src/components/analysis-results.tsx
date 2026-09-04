import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { classificationLabels } from "@/lib/analysis";
import type { SavedEstimate } from "@/server/analysis";
function Items({ title, values }: { title: string; values: string[] }) {
  return values.length ? <div className="analysis-notes"><h4>{title}</h4><ul>{values.map((v, i) => <li key={i}>{v}</li>)}</ul></div> : null;
}
export function AnalysisResults({ estimate }: { estimate: SavedEstimate }) {
  const { analysis, additionalHours: hours, sources } = estimate;
  return <section className="intake-section" aria-labelledby="analysis-title">
    <Link className="back-link" href={`/projects/${estimate.projectId}/requests`}><ArrowLeft size={14} aria-hidden="true" />All requests</Link>
    <div className="intake-heading"><div><p className="eyebrow">UNDERSTAND THE CHANGE</p><h2 id="analysis-title">Scope analysis</h2><p>Compared with the agreement saved for this analysis.</p></div><span className="neutral-badge">AI-generated · Review required</span></div>
    <div className="intake-notice"><FileText size={19} aria-hidden="true" /><p>These are AI suggestions, not an approved agreement. Review the evidence and assumptions. Prices have not been calculated.</p></div>
    <div className="analysis-layout"><div className="analysis-tasks">
      <div className="intake-panel analysis-request"><h3>Client request</h3><p className="source-text">{estimate.requestText}</p></div>
      {analysis.tasks.map((task, index) => <article className="intake-panel analysis-task" key={task.id}>
        <div className="task-top"><span className="eyebrow">TASK {index + 1}</span><span className={`scope-label scope-${task.classification}`}>{classificationLabels[task.classification]}</span></div>
        <h3>{task.title}</h3><p className="source-text">{task.explanation}</p>
        <dl className="hours-grid">{(["minimum", "likely", "maximum"] as const).map(key => <div key={key}><dt>{key} additional hours</dt><dd>{task.estimatedHours[key]}<small> h</small></dd></div>)}</dl>
        {task.classification === "uncertain" && <p className="uncertainty-note">Unresolved scope: these hours are provisional and excluded from the additional-hour total.</p>}
        <div className="task-evidence"><h4>Evidence from the agreement</h4>{task.sourceEvidence.length ? task.sourceEvidence.map((e, i) => {
          const sourceIndex = sources.findIndex(s => s.sourceId === e.sourceId && s.sourceType === e.sourceType);
          return <blockquote key={i}><p>{e.quote}</p><Link href={`#source-${sourceIndex}`}>{e.sourceType === "baseline_clause" ? "Original baseline" : "Accepted amendment"} · {sources[sourceIndex].clauseId}</Link></blockquote>;
        }) : <p>No matching source evidence. Read the explanation and assumptions carefully.</p>}</div>
        <Items title="Assumptions" values={task.assumptions} /><Items title="Questions to resolve" values={task.missingInformation} /><Items title="Technical risks" values={task.risks} /><p className="complexity"><strong>Complexity:</strong> {task.complexity}</p>
      </article>)}
    </div><aside className="intake-panel analysis-summary" aria-label="Analysis summary"><p className="eyebrow">CHANGE AT A GLANCE</p><h3>{classificationLabels[estimate.overallClassification]}</h3><p>{analysis.explanation}</p><h4>{hours.provisional ? "Provisional additional hours" : "Estimated additional hours"}</h4><p className="summary-hours">{hours.minimum}–{hours.maximum}<span>hours · likely {hours.likely}</span></p>{hours.provisional && <p className="uncertainty-note">Uncertain tasks are excluded. This is not a complete estimate.</p>}<p>No price calculated. Review and pricing are not available yet.</p><hr/><p>{analysis.tasks.length} tasks · Saved revision {estimate.currentRevision}</p><p className="provenance">Provider: {estimate.provenance.provider}<br/>Model: {estimate.provenance.model}<br/>Prompt: {estimate.provenance.promptVersion}<br/>Scope revision: {estimate.scopeRevision}</p><time dateTime={estimate.createdAt}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(estimate.createdAt))} UTC</time></aside></div>
    <section className="analysis-sources" aria-labelledby="sources-title"><h3 id="sources-title">Scope used for this analysis</h3><p>The complete saved source snapshot keeps these citations traceable.</p>{sources.map((source, i) => <article className="saved-clause" id={`source-${i}`} key={source.sourceId} tabIndex={-1}><div className="clause-title"><span className="clause-id">{source.clauseId}</span><span className="clause-kind">{source.sourceType === "baseline_clause" ? "Original baseline" : "Accepted amendment"}</span></div><p className="source-text">{source.text}</p>{source.sourceType === "baseline_clause" && <Link className="back-link" href={`/projects/${estimate.projectId}/baseline#clause-${source.clauseId}`}>Open baseline clause</Link>}</article>)}</section>
  </section>;
}
