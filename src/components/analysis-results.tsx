"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { classificationLabels } from "@/lib/analysis";
import type { AnalysisOutput } from "@/lib/contracts";
import { EstimateReview, ReviewPrices } from "./estimate-review";
import type { SavedEstimate } from "@/server/analysis";
import { OfferManager } from "./offer-manager";
function Items({ title, values }: { title: string; values: string[] }) {
  return values.length ? <div className="analysis-notes"><h4>{title}</h4><ul>{values.map((v, i) => <li key={i}>{v}</li>)}</ul></div> : null;
}
function TaskCards({ analysis, sources }: { analysis: AnalysisOutput; sources: SavedEstimate["sources"] }) {
  return <div className="analysis-tasks">{analysis.tasks.map((task, index) => <article className="intake-panel analysis-task" key={task.id}>
        <div className="task-top"><span className="eyebrow">TASK {index + 1}</span><span className={`scope-label scope-${task.classification}`}>{classificationLabels[task.classification]}</span></div>
        <h3>{task.title}</h3><p className="source-text">{task.explanation}</p>
        <dl className="hours-grid">{(["minimum", "likely", "maximum"] as const).map(key => <div key={key}><dt>{key} additional hours</dt><dd>{task.estimatedHours[key]}<small> h</small></dd></div>)}</dl>
        {task.classification === "UNCERTAIN" && <p className="uncertainty-note">Unresolved scope: these hours are provisional and excluded from the additional-hour total.</p>}
        <div className="task-evidence"><h4>Evidence from the agreement</h4>{task.sourceEvidence.length ? task.sourceEvidence.map((e, i) => {
          const sourceIndex = sources.findIndex(s => s.sourceId === e.sourceId && s.sourceType === e.sourceType);
          return <blockquote key={i}><p>{e.quote}</p>{sourceIndex >= 0 && <Link href={`#source-${sourceIndex}`}>{e.sourceType === "baseline_clause" ? "Original baseline" : "Accepted amendment"} · {sources[sourceIndex].clauseId}</Link>}</blockquote>;
        }) : <p>No matching source evidence. Read the explanation and assumptions carefully.</p>}</div>
        {task.matchedScopeClause && <p className="complexity"><strong>Matched clause relation:</strong> {task.matchedScopeClause.relation}</p>}
        <Items title="Assumptions" values={task.assumptions} /><Items title="Questions to resolve" values={task.missingInformation} /><Items title="Technical risks" values={task.risks} /><p className="complexity"><strong>Complexity:</strong> {task.complexity}</p>
      </article>)}</div>;
}
function dateLabel(value: string) {
  return `${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value))} UTC`;
}
export function AnalysisResults({ estimate }: { estimate: SavedEstimate }) {
  return <SavedAnalysis key={`${estimate.id}-${estimate.currentRevision}-${estimate.status}`} initialEstimate={estimate} />;
}
function SavedAnalysis({ initialEstimate }: { initialEstimate: SavedEstimate }) {
  const [estimate, setEstimate] = useState(initialEstimate);
  const { sources } = estimate;
  const humanEdited = estimate.revisions.some(revision => revision.createdBy !== "ai");
  const origin = estimate.approvedRevisionId ? "Human-approved" : humanEdited ? "Human-edited · Review required" : "AI-generated · Review required";
  return <section className="intake-section estimate-review-page" aria-labelledby="analysis-title">
    <Link className="back-link" href={`/projects/${estimate.projectId}/requests`}><ArrowLeft size={14} aria-hidden="true" />All requests</Link>
    <div className="intake-heading"><div><p className="eyebrow">UNDERSTAND THE CHANGE</p><h2 id="analysis-title">Scope analysis</h2><p>Compared with the agreement saved for this analysis.</p></div><span className="neutral-badge">{origin}</span></div>
    <div className="intake-notice"><FileText size={19} aria-hidden="true" /><p>{estimate.status === "REVIEW_REQUIRED" ? "Review the suggested scope, evidence, assumptions, hours and calculated price before approving this estimate." : `Revision ${estimate.currentRevision} is frozen for internal approval. This is not client acceptance.`}</p></div>
    <div className="intake-panel analysis-request review-request"><h3>Client request</h3><p className="source-text">{estimate.requestText}</p></div>
    <EstimateReview estimate={estimate} onSaved={setEstimate}><TaskCards analysis={estimate.analysis} sources={sources} /></EstimateReview>
    <section className="intake-panel saved-agreement" aria-label="Saved agreement terms"><h3>Saved agreement terms · Revision {estimate.currentRevision}</h3>{estimate.agreement.clauses.length ? estimate.agreement.clauses.map(c => <p className="source-text" key={c.id}>{c.text}</p>) : <p>No scope amendment terms are saved.</p>}{estimate.agreement.supersedesDecisionId && <p>This review replaces a whole accepted amendment. Read the selected decision and restate all retained terms before approval.</p>}</section>
    <OfferManager estimate={estimate} onSaved={setEstimate}/>
    <section className="review-history review-approval-history intake-panel" aria-labelledby="approval-history-title">
      <h3 id="approval-history-title">Approval history</h3>
      <p>Internal approvals and reopened reviews, oldest first. Earlier approvals remain recorded after reopening.</p>
      {estimate.approvalHistory.length ? <ol aria-label="Approval audit history">{[...estimate.approvalHistory].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).map(event => {
        const revision = estimate.revisions.find(item => item.id === event.revisionId);
        const action = event.action === "approved" ? "Approved" : event.action === "review_reopened" ? "Review reopened" : "Review event";
        return <li key={event.id}><span><strong>{action}</strong> · {revision ? `Revision ${revision.revision}` : "Revision not recorded"}</span><time dateTime={event.createdAt}>{dateLabel(event.createdAt)}</time></li>;
      })}</ol> : <p>No approval or reopening events yet.</p>}
    </section>
    <section className="review-history" aria-labelledby="review-history-title"><h3 id="review-history-title">Original analysis & revision history</h3><p>Saved snapshots are read-only. Each review preserves the earlier evidence and decisions.</p>
      <details className="source-details"><summary>Original AI analysis · Unedited</summary><div className="review-history-content"><p className="source-text">{estimate.originalAnalysis.explanation}</p><TaskCards analysis={estimate.originalAnalysis} sources={sources} /><p className="provenance">Provider: {estimate.provenance.provider}<br/>Model: {estimate.provenance.model}<br/>Prompt: {estimate.provenance.promptVersion}<br/>Scope revision: {estimate.scopeRevision}</p><time dateTime={estimate.createdAt}>{dateLabel(estimate.createdAt)}</time></div></details>
      {[...estimate.revisions].sort((a, b) => a.revision - b.revision).map(revision => <details className="source-details" key={revision.id}><summary>Saved revision {revision.revision} · {revision.createdBy === "ai" ? "AI-generated" : "Human-edited"}{revision.id === estimate.approvedRevisionId ? " · Human-approved" : ""}{revision.revision === estimate.currentRevision ? " · Current" : ""}</summary><div className="review-history-content"><p className="review-revision-meta">Saved by {revision.createdBy} · <time dateTime={revision.createdAt}>{dateLabel(revision.createdAt)}</time></p><p className="source-text"><strong>Review reason:</strong> {revision.editReason || "No classification change or removal reason recorded."}</p>{revision.snapshot.legacy && <p className="review-help">Legacy revision: totals are calculated from its preserved inputs.</p>}<p className="source-text">{revision.snapshot.analysis.explanation}</p><ReviewPrices draft={revision.snapshot} calculated={revision.snapshot.calculated} /><TaskCards analysis={revision.snapshot.analysis} sources={sources} /><div className="saved-agreement"><h4>Saved agreement terms</h4>{revision.snapshot.agreement.clauses.length ? revision.snapshot.agreement.clauses.map(c => <p className="source-text" key={c.id}>{c.text}</p>) : <p>No amendment terms in this revision.</p>}{revision.snapshot.agreement.supersedesDecisionId && <p>Replaces accepted decision {revision.snapshot.agreement.supersedesDecisionId}.</p>}</div></div></details>)}
    </section>
    <section className="analysis-sources" aria-labelledby="sources-title"><h3 id="sources-title">Scope used for this analysis</h3><p>The complete saved source snapshot keeps these citations traceable.</p>{sources.map((source, i) => <article className="saved-clause" id={`source-${i}`} key={source.sourceId} tabIndex={-1}><div className="clause-title"><span className="clause-id">{source.clauseId}</span><span className="clause-kind">{source.sourceType === "baseline_clause" ? "Original baseline" : "Accepted amendment"}</span></div><p className="source-text">{source.text}</p>{source.sourceType === "baseline_clause" && <Link className="back-link" href={`/projects/${estimate.projectId}/baseline#clause-${source.clauseId}`}>Open baseline clause</Link>}</article>)}</section>
  </section>;
}
