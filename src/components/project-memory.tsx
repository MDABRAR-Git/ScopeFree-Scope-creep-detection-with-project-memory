import Link from "next/link";
import { BookOpen, Search, ArrowRight, FileClock } from "lucide-react";
import { formatMoney, scenarios } from "@/lib/pricing";
import { memoryStatusSchema, type MemoryStatus } from "@/lib/memory";
import type { ProjectMemory } from "@/server/memory";

const labels: Record<Exclude<MemoryStatus, "ALL">, string> = { PENDING: "Pending offer", ACCEPTED: "Accepted", DECLINED: "Declined", SUPERSEDED: "Superseded" };
function date(value: string) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value)); }
function href(projectId: string, q: string, status: MemoryStatus) {
  const params = new URLSearchParams(); if (q) params.set("q", q); if (status !== "ALL") params.set("status", status);
  return `/projects/${projectId}/memory${params.size ? `?${params}` : ""}`;
}
export function ProjectMemoryView({ projectId, memory }: { projectId: string; memory: ProjectMemory }) {
  return <section className="memory-page" aria-labelledby="memory-title">
    <div className="intake-heading"><div><p className="eyebrow">PROJECT MEMORY</p><h2 id="memory-title">Decisions and current offers</h2><p>Trace what the client decided, what it changed, and the exact reviewed price.</p></div><span className="count-badge">{memory.rows.length} of {memory.total}</span></div>
    <div className="memory-scope" aria-label="Current agreement summary">
      <div><strong>{memory.scope.baselineClauseCount}</strong><span>Original baseline clauses</span></div><div><strong>{memory.scope.currentAcceptedAmendments}</strong><span>Current accepted changes</span></div><div><strong>{memory.scope.scopeRevision}</strong><span>Scope revision</span></div>
    </div>
    <div className="memory-counts" aria-label="Memory status counts"><span>Accepted <strong>{memory.summary.accepted}</strong></span><span>Superseded <strong>{memory.summary.superseded}</strong></span><span>Declined <strong>{memory.summary.declined}</strong></span><span>Pending <strong>{memory.summary.pending}</strong></span></div>
    <form method="get" className="memory-search" role="search"><label htmlFor="memory-search">Search Project Memory</label><div><Search size={17} aria-hidden="true" /><input id="memory-search" name="q" defaultValue={memory.query.q} maxLength={200} placeholder="Request, decision, task, term, comment or tag" />{memory.query.status !== "ALL" && <input type="hidden" name="status" value={memory.query.status} />}<button className="button button-primary">Search</button></div></form>
    <nav className="memory-filters" aria-label="Filter Project Memory">{memoryStatusSchema.options.map(status => <Link key={status} href={href(projectId, memory.query.q, status)} aria-current={memory.query.status === status ? "page" : undefined}>{status === "ALL" ? "All" : labels[status]}</Link>)}{(memory.query.q || memory.query.status !== "ALL") && <Link className="memory-clear" href={`/projects/${projectId}/memory`}>Clear filters</Link>}</nav>
    {memory.rows.length ? <div className="memory-list">{memory.rows.map(row => {
      const target = row.kind === "DECISION" ? `/projects/${projectId}/memory/${row.id}` : `/projects/${projectId}/estimates/${row.estimateId}`;
      return <article key={row.id} className="memory-card"><div className="memory-card-top"><span className={`memory-status memory-${row.status.toLowerCase()}`}>{labels[row.status]}</span><time dateTime={row.occurredAt}>{date(row.occurredAt)}</time></div>
        <p className="eyebrow">REQUEST #{row.requestNumber} · REVISION {row.approvedRevision}</p><h3>{row.title}</h3><p className="source-text memory-request">{row.requestText}</p>
        <div className="memory-effect"><span>{row.changesScope ? "Changes the agreement" : "No agreement change"}</span>{row.availability && <span>{row.availability === "ACTIVE" ? "Available for decision" : row.availability === "EXPIRED" ? "Offer expired" : "Offer is stale"}</span>}{row.clientCommentPresent && <span>Client comment recorded</span>}</div>
        <div className="memory-card-bottom"><div>{scenarios.map(s => <span key={s}><small>{s}</small><strong>{formatMoney(row.totalChargePaise[s])}</strong></span>)}</div><Link href={target}>{row.kind === "DECISION" ? "Open decision" : "Open offer review"}<ArrowRight size={15} aria-hidden="true" /></Link></div>
      </article>;
    })}</div> : <div className="empty-state memory-empty"><FileClock size={30} aria-hidden="true" /><h3>{memory.total ? "No matching memory" : "No client decisions yet"}</h3><p>{memory.total ? "Try another search or clear the status filter." : "Final client decisions and current pending offers will appear here."}</p>{memory.total > 0 && <Link className="button button-quiet" href={`/projects/${projectId}/memory`}>Clear filters</Link>}</div>}
    <p className="memory-readonly"><BookOpen size={14} aria-hidden="true" />Project Memory is read-only. It never changes scope, offers, prices or decisions.</p>
  </section>;
}
