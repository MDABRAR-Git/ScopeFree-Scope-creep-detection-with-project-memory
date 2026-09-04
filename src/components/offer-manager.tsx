"use client";
import { useId, useRef, useState } from "react";
import type { SavedEstimate } from "@/server/analysis";
import { readApiResponse } from "@/lib/api-client";
import { clientEmailSchema } from "@/lib/proposals";
import { OfferContent } from "./offer-content";

const deliveryLabels: Record<string, string> = { NONE: "Not sent", SENDING: "Sending…", SENT: "Sent", FAILED: "Delivery failed" };
function formatDate(value: string) { return new Date(value).toLocaleString("en-IN"); }

export function OfferManager({ estimate, onSaved }: { estimate: SavedEstimate; onSaved: (estimate: SavedEstimate) => void }) {
  const current = estimate.offers.find(p => p.id === estimate.currentProposalId);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [email, setEmail] = useState(current?.delivery.clientEmail ?? ""), [confirmed, setConfirmed] = useState(false);
  const working = useRef(false), attempt = useRef<{ action: string; key: string } | null>(null);
  const emailId = useId();
  const canSendNew = estimate.status === "APPROVED" && (!current || current.status === "REVOKED");
  const emailValid = clientEmailSchema.safeParse(email).success;

  async function act(action: "email" | "resend" | "revoke" | "revise") {
    if (working.current) return;
    if (action === "email" && !emailValid) { setError("Enter a valid client email address before sending."); return; }
    working.current = true; setBusy(true); setError(""); setMessage("");
    if (attempt.current?.action !== action) attempt.current = { action, key: crypto.randomUUID() };
    try {
      const url = action === "email" ? `/api/estimates/${estimate.id}/proposal` : `/api/proposals/${current!.id}/${action}`;
      const body = action === "email"
        ? { idempotencyKey: attempt.current!.key, expectedRevision: estimate.currentRevision, clientEmail: email.trim() }
        : { idempotencyKey: attempt.current!.key, expectedRevision: estimate.currentRevision, confirmed: true };
      await readApiResponse(await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
      attempt.current = null; setConfirmed(false);
      setMessage(action === "email" || action === "resend" ? "Proposal emailed to the client. They review and decide inside the secure portal." : action === "revoke" ? "Offer revoked. Save and approve a new review before emailing another offer." : "Offer revoked. Edit and re-approve, then email the corrected offer.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update the offer. Retry safely."); }
    finally {
      // Always refresh so a failed send still surfaces the saved offer with its FAILED status and Retry.
      try { const saved = await readApiResponse(await fetch(`/api/estimates/${estimate.id}`, { cache: "no-store" })); onSaved(saved.estimate); } catch { /* keep current view */ }
      working.current = false; setBusy(false);
    }
  }

  const delivery = current?.delivery;
  return <section className="intake-panel offer-manager" aria-label="Client offers"><h3>Client offers</h3><p>Approve the exact saved revision, then email the secure proposal link to the client. Client acceptance is recorded separately from internal approval.</p>
    {canSendNew && <div className="offer-send"><div className="review-field"><label htmlFor={emailId}>Client email address</label><input id={emailId} type="email" inputMode="email" autoComplete="off" maxLength={254} value={email} disabled={busy} aria-invalid={!!email && !emailValid} onChange={e => { setEmail(e.target.value); setError(""); setMessage(""); }} /><p className="review-help">ScopeFree emails the secure proposal link to this address. The email is a delivery destination, not a verified client identity.</p></div>
      <button type="button" className="button button-primary" disabled={busy || !emailValid} onClick={() => void act("email")}>{busy ? "Emailing…" : "Email proposal"}</button></div>}
    {current && <p className="offer-current">Current offer: <strong>{current.status}</strong> · Link expires {formatDate(current.expiresAt)}</p>}
    {delivery && delivery.status !== "NONE" && <div className={`offer-delivery offer-delivery-${delivery.status.toLowerCase()}`} role="status">
      <p><strong>{deliveryLabels[delivery.status] ?? delivery.status}</strong>{delivery.clientEmail ? <> · {delivery.clientEmail}</> : null}{delivery.attempts > 1 ? <> · {delivery.attempts} attempts</> : null}</p>
      {delivery.status === "SENT" && delivery.sentAt && <p className="field-help">Emailed {formatDate(delivery.sentAt)}.</p>}
      {delivery.status === "FAILED" && <p className="form-error">{delivery.failureMessage ?? "The email could not be delivered."} Use Resend to try again.</p>}
    </div>}
    {current?.status === "PENDING" && <>
      <div className="offer-buttons"><button type="button" className="button button-primary" disabled={busy || !current.delivery.clientEmail} onClick={() => void act("resend")}>{delivery?.status === "FAILED" ? "Retry email" : "Resend proposal"}</button></div>
      <label className="check-label"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy} /><span>I understand that revoking this offer invalidates the emailed link, and editing requires a new approval and a newly emailed offer.</span></label>
      <div className="offer-buttons"><button type="button" className="button button-secondary" disabled={busy || !confirmed} onClick={() => void act("revoke")}>Revoke offer</button><button type="button" className="button button-secondary" disabled={busy || !confirmed} onClick={() => void act("revise")}>Revoke offer and edit</button></div>
      <p className="field-help">Resend rotates the secure link, so the previously emailed link stops working.</p>
    </>}
    {message && <p role="status" className="review-feedback">{message}</p>}{error && <p role="alert" className="form-error">{error}</p>}
    {!estimate.offers.length && estimate.status !== "APPROVED" && <p className="field-help">Save and approve this review to email a client offer.</p>}
    {estimate.offers.map((p, i) => <details key={p.id} className="source-details"><summary>Offer {i + 1} · {p.status}{p.delivery.clientEmail ? ` · ${p.delivery.clientEmail}` : ""}{p.replacesProposalId ? " · replaces an earlier offer" : ""}</summary><div className="review-history-content">{p.delivery.status !== "NONE" && <p className="field-help">Delivery: {deliveryLabels[p.delivery.status] ?? p.delivery.status}{p.delivery.sentAt ? ` · ${formatDate(p.delivery.sentAt)}` : ""}</p>}{p.offer ? <OfferContent offer={p.offer} /> : <p>Historical offer preserved in its original format.</p>}{p.decidedAt && <p>Client {p.status.toLowerCase()} on {formatDate(p.decidedAt)}</p>}{p.comment && <p className="source-text">Client comment: {p.comment}</p>}</div></details>)}
  </section>;
}
