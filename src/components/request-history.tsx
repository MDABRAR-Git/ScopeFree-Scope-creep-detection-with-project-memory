import Link from "next/link";
import { AnalyzeButton } from "./analyze-button";
import type { RequestHistory } from "@/server/request-history";
import { formatMoney, scenarios } from "@/lib/pricing";

function MoneyRange({ value }: { value: { minimum: number | string; likely: number | string; maximum: number | string } }) {
  return <span>{formatMoney(value.minimum)}–{formatMoney(value.maximum)} <small>· likely {formatMoney(value.likely)}</small></span>;
}
const statusLabels: Record<string, string> = { REVIEW_REQUIRED: "Review required", APPROVED: "Internally approved", PROPOSED: "Proposal created", NOT_ANALYZED: "Not analyzed" };
export function RequestHistoryView({ history, projectId }: { history: RequestHistory; projectId: string }) {
  const { rows, summary } = history;
  function card(row: RequestHistory["rows"][number], detail = false) {
    return <article className="intake-panel request-card" key={row.id}>
      <div className="request-card-meta"><span className="neutral-badge">{row.classification ?? "Not analyzed"}</span><time dateTime={row.createdAt}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(row.createdAt))} UTC</time></div>
      <h4>#{row.requestNumber} — {row.summary}</h4>{!detail && <p className="source-text">{row.description}</p>}<p>{statusLabels[row.status]} · Client acceptance: {row.clientAcceptance}</p>
      {row.stale && row.clientAcceptance !== "ACCEPTED" && <p className="field-help">Scope has changed since this request. Excluded from pending billing.</p>}
      {row.hourlyRatePaise != null && <p>{formatMoney(row.hourlyRatePaise)} / hour</p>}
      {row.billing ? <><p>Billable hours: {row.billing.billableQuarterHours.minimum / 4}–{row.billing.billableQuarterHours.maximum / 4} h · likely {row.billing.billableQuarterHours.likely / 4} h</p>
        {detail && <p>Labor: <MoneyRange value={row.billing.laborChargePaise} /></p>}
        <p>Additional charge: {formatMoney(row.billing.additionalChargePaise)}</p>{detail && row.additionalChargeReason && <p className="source-text">Reason: {row.additionalChargeReason}</p>}
        <p><strong>{row.billing.provisional ? "Provisional total" : "Total estimate"}: <MoneyRange value={row.billing.totalChargePaise} /></strong></p>
        {row.billing.provisional && <p className="uncertainty-note">Unresolved work is excluded. Billing cannot be finalized.</p>}</> : <p>Billable hours and prices await review.</p>}
      {row.acceptedAt && <p>Accepted: {new Date(row.acceptedAt).toISOString()}</p>}
      {!detail && <AnalyzeButton requestId={row.id} projectId={projectId} estimateId={row.estimateId ?? undefined} />}
      {detail && row.estimateId && <Link className="back-link" href={`/projects/${projectId}/estimates/${row.estimateId}`}>Open review</Link>}
    </article>;
  }
  return <section className="intake-section" aria-label="Request tracking">
    <section className="intake-panel" aria-labelledby="billing-summary-title"><h3 id="billing-summary-title">Billing summary</h3>
      <p>Total Requests: {summary.totalRequests} · Additional Requests: {summary.additionalRequests} · IN_SCOPE Requests: {summary.inScopeRequests}</p>
      <p>Accepted Additional Billing: <MoneyRange value={summary.acceptedAdditionalPaise} /></p>
      <p>Pending Additional Billing: <MoneyRange value={summary.pendingAdditionalPaise} /></p>
      <p className="field-help">Pending billing includes saved, reviewed requests awaiting client acceptance. Unreviewed, uncertain, declined, revoked, expired and stale requests are excluded. Internal approval is not client acceptance.</p>
    </section>
    <section aria-labelledby="request-history-title"><div className="section-heading"><h3 id="request-history-title">Request History</h3><span>Total Requests: {summary.totalRequests}</span></div>
      <div className="request-list">{rows.length ? rows.map(row => card(row)) : <p>No requests yet.</p>}</div></section>
    <section aria-labelledby="additional-requests-title"><div className="section-heading"><h3 id="additional-requests-title">Additional Requests</h3><span>Total Additional Requests: {summary.additionalRequests}</span></div>
      <div className="request-list">{rows.some(r => r.additional) ? rows.filter(r => r.additional).map(row => card(row, true)) : <p>No reviewed additional requests yet.</p>}</div></section>
    <p className="field-help">Amounts are INR estimates ({scenarios.join(" / ")}); no automatic charge is made.</p>
  </section>;
}
