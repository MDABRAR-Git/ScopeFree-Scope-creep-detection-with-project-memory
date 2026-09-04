import type { PublicOffer } from "@/lib/proposals";
import { formatMoney, scenarios } from "@/lib/pricing";

export function OfferContent({ offer }: { offer: PublicOffer }) {
  return <div className="offer-content"><h2>Request #{offer.requestNumber}</h2><p className="source-text">{offer.requestText}</p>
    <p>Approved revision {offer.approvedRevision} · {formatMoney(offer.hourlyRatePaise)} / hour</p>
    <div className="review-price-range">{scenarios.map(s => <div key={s}><strong>{s}</strong><p>{formatMoney(offer.calculated.totalChargePaise[s])}</p><small>{offer.calculated.billableQuarterHours[s]/4} additional hours · Labor {formatMoney(offer.calculated.laborChargePaise[s])}</small></div>)}</div>
    <p>Fixed additional charge: {formatMoney(offer.calculated.additionalChargePaise)} · added once per scenario</p>{offer.additionalChargeReason && <p className="source-text">Reason: {offer.additionalChargeReason}</p>}
    {offer.tasks.map((t,i) => <article className="intake-panel" key={t.id}><p className="eyebrow">TASK {i+1} · {t.classification}</p><h3>{t.title}</h3><p>Additional hours: {t.estimatedHours.minimum} / {t.estimatedHours.likely} / {t.estimatedHours.maximum} (minimum / likely / maximum)</p>{t.assumptions.length > 0 && <><h4>Assumptions</h4><ul>{t.assumptions.map((a,j)=><li key={j}>{a}</li>)}</ul></>}{t.evidence.map((e,j)=><blockquote key={j}><p className="source-text">{e.quote}</p><small>{e.sourceType === "baseline_clause" ? "Original agreement" : "Accepted amendment"} · {e.clauseId}</small></blockquote>)}</article>)}
    <section className="intake-panel"><h3>Agreement terms</h3>{offer.agreement.clauses.length ? offer.agreement.clauses.map(c=><p className="source-text" key={c.id}>{c.text}</p>) : <p>This request is already in scope. It adds no change to the agreement.</p>}
      {offer.replacesDecision && <p className="uncertainty-note">This offer replaces the whole accepted amendment “{offer.replacesDecision.title}”, accepted on {new Date(offer.replacesDecision.decidedAt).toLocaleDateString("en-IN",{timeZone:"UTC"})}. The terms above define the replacement.</p>}</section>
    <p className="offer-budget-note">Hours and prices are estimates. Acceptance permits the described scope and estimated budget range; it does not make an automatic charge. Work beyond the maximum range or changed assumptions requires a new approval.</p>
  </div>;
}
