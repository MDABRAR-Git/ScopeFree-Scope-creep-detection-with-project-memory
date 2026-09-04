import Link from "next/link";
import { AnalyzeButton } from "./analyze-button";
import type { RequestHistory } from "@/server/request-history";
import { formatMoney, scenarios } from "@/lib/pricing";
import { RequestRate } from "./request-rate";

function MoneyRange({ value }: { value: { minimum: number | string; likely: number | string; maximum: number | string } }) {
  return <span>{formatMoney(value.minimum)}–{formatMoney(value.maximum)} <small>· likely {formatMoney(value.likely)}</small></span>;
}
const statusLabels: Record<string, string> = { REVIEW_REQUIRED: "Review required", APPROVED: "Internally approved", PROPOSED: "Proposal created", NOT_ANALYZED: "Not analyzed" };
export function RequestHistoryView({ history, projectId }: { history: RequestHistory; projectId: string }) {
  const { rows, summary } = history;
  function card(row: RequestHistory["rows"][number], detail = false) {
    return <article className={`request-card${detail ? " request-card-detail" : ""}`} key={row.id}>
      <div className="request-card-meta"><div><span className={`status-rail scope-${row.classification ?? "PENDING"}`} aria-hidden="true" /><span className="neutral-badge">{row.classification ?? "Not analyzed"}</span><span className="request-state">{statusLabels[row.status]}</span></div><time dateTime={row.createdAt}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(row.createdAt))} UTC</time></div>
      <div className="request-card-layout"><div className="request-card-copy"><h4><span>#{row.requestNumber}</span>{row.summary}</h4>{!detail && <p className="source-text">{row.description}</p>}<div className="request-tags"><span>Client acceptance: {row.clientAcceptance}</span><span>Submitted by {row.origin === "client" ? "client" : "freelancer"}</span>{row.offerStatus && <span>Offer: {row.offerStatus}</span>}{row.delivery && row.delivery.status !== "NONE" && <span>Email: {row.delivery.status === "SENT" ? "sent" : row.delivery.status === "FAILED" ? "failed" : row.delivery.status.toLowerCase()}{row.delivery.clientEmail ? ` → ${row.delivery.clientEmail}` : ""}</span>}</div>
        {row.stale && row.clientAcceptance !== "ACCEPTED" && <p className="field-help">Scope has changed since this request. Excluded from pending billing.</p>}
        {detail && row.additionalChargeReason && <p className="source-text request-reason"><strong>Charge reason:</strong> {row.additionalChargeReason}</p>}
        {row.billing?.provisional && <p className="uncertainty-note">Unresolved work is excluded. Billing cannot be finalized.</p>}
        {row.acceptedAt && <p className="field-help">Accepted: {new Date(row.acceptedAt).toISOString()}</p>}
      </div>
      <dl className="request-facts">
        <div><dt>Rate</dt><dd>{row.hourlyRatePaise != null ? <>{formatMoney(row.hourlyRatePaise)} <small>/ hour</small></> : "Awaiting rate"}</dd></div>
        <div><dt>Billable hours</dt><dd>{row.billing ? <>{row.billing.billableQuarterHours.minimum / 4}–{row.billing.billableQuarterHours.maximum / 4} h <small>likely {row.billing.billableQuarterHours.likely / 4} h</small></> : "Awaiting review"}</dd></div>
        {detail && row.billing && <div><dt>Labor</dt><dd><MoneyRange value={row.billing.laborChargePaise} /></dd></div>}
        <div><dt>Additional charge</dt><dd>{row.billing ? formatMoney(row.billing.additionalChargePaise) : "Awaiting review"}</dd></div>
        <div className="request-total"><dt>{row.billing?.provisional ? "Provisional total" : "Total estimate"}</dt><dd>{row.billing ? <MoneyRange value={row.billing.totalChargePaise} /> : "Awaiting review"}</dd></div>
      </dl></div>
      <div className="request-card-actions">{!detail && (row.hourlyRatePaise === null && !row.estimateId ? <RequestRate requestId={row.id}/> : <AnalyzeButton requestId={row.id} projectId={projectId} estimateId={row.estimateId ?? undefined} />)}{detail && row.estimateId && <Link className="button button-secondary" href={`/projects/${projectId}/estimates/${row.estimateId}`}>Open review</Link>}</div>
    </article>;
  }
  return <section className="intake-section" aria-label="Request tracking">
    <section className="billing-summary" aria-labelledby="billing-summary-title"><div className="billing-summary-heading"><div><p className="eyebrow">COMMERCIAL OVERVIEW</p><h3 id="billing-summary-title">Billing summary</h3></div><div className="billing-counts"><span>Total Requests <strong>{summary.totalRequests}</strong></span><span>Additional Requests <strong>{summary.additionalRequests}</strong></span><span>IN_SCOPE Requests <strong>{summary.inScopeRequests}</strong></span></div></div>
      <div className="billing-ranges"><div><span>Accepted Additional Billing</span><strong><MoneyRange value={summary.acceptedAdditionalPaise} /></strong></div><div><span>Pending Additional Billing</span><strong><MoneyRange value={summary.pendingAdditionalPaise} /></strong></div></div>
      <p className="field-help">Pending billing includes saved, reviewed requests awaiting client acceptance. Unreviewed, uncertain, declined, revoked, expired and stale requests are excluded. Internal approval is not client acceptance.</p>
    </section>
    <section aria-labelledby="request-history-title"><div className="section-heading"><h3 id="request-history-title">Request History</h3><span>Total Requests: {summary.totalRequests}</span></div>
      <div className="request-list">{rows.length ? rows.map(row => card(row)) : <p>No requests yet.</p>}</div></section>
    <section aria-labelledby="additional-requests-title"><div className="section-heading"><h3 id="additional-requests-title">Additional Requests</h3><span>Total Additional Requests: {summary.additionalRequests}</span></div>
      <div className="request-list">{rows.some(r => r.additional) ? rows.filter(r => r.additional).map(row => card(row, true)) : <p>No reviewed additional requests yet.</p>}</div></section>
    <p className="field-help">Amounts are INR estimates ({scenarios.join(" / ")}); no automatic charge is made.</p>
  </section>;
}
