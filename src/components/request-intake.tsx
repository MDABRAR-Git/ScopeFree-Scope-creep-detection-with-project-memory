"use client";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, LoaderCircle, Plus } from "lucide-react";
import { formatRate, rateRupeesSchema, requestInputSchema } from "@/lib/intake";
import { readApiResponse } from "@/lib/api-client";
import type { SavedRequest } from "@/server/intake";
import { AnalyzeButton } from "./analyze-button";

export function RequestIntake({ projectId, hasBaseline, initialRequests }: { projectId: string; hasBaseline: boolean; initialRequests: SavedRequest[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [rate, setRate] = useState("");
  const [requests, setRequests] = useState(initialRequests);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (working.current) return;
    setError(""); setSaved(false);
    const parsedRate = rateRupeesSchema.safeParse(rate);
    if (!parsedRate.success) { setError("Enter a rate above ₹0 and no more than ₹100,000/hour, with at most two decimal places."); return; }
    const parsed = requestInputSchema.safeParse({ text, hourlyRatePaise: parsedRate.data });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    working.current = true; setBusy(true);
    try {
      const result = await readApiResponse(await fetch(`/api/projects/${projectId}/requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) }));
      setRequests(previous => [result.request, ...previous]); setText(""); setSaved(true); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save the request. Your input is still here."); }
    finally { working.current = false; setBusy(false); }
  }
  return <section className="intake-section" aria-labelledby="requests-heading"><div className="intake-heading"><div><p className="eyebrow">KEEP EACH CHANGE IN VIEW</p><h2 id="requests-heading">Client requests</h2><p>Record what your client is asking to change.</p></div><span className="count-badge">{requests.length} {requests.length === 1 ? "request" : "requests"}</span></div>
    {!hasBaseline ? <div className="intake-panel missing-baseline"><FileText size={30} aria-hidden="true" /><h3>Start with the original agreement</h3><p>Confirm the baseline before recording requests, so each change has an agreed starting point.</p><Link className="button button-primary" href={`/projects/${projectId}/baseline`}>Add baseline<ArrowRight size={17} aria-hidden="true" /></Link></div> : <form className="intake-panel request-form" onSubmit={submit}>
      <h3>Add a client request</h3><p>Saving records the request. Analysis is a separate step.</p>
      <label htmlFor="request-text">What has the client requested?</label><textarea id="request-text" rows={5} placeholder="Describe the requested change and any details the client provided…" value={text} disabled={busy} onChange={e => { setText(e.target.value); setSaved(false); }} aria-describedby="request-text-help" aria-invalid={text.trim().length > 4000} />
      <div className="input-meta" id="request-text-help"><span>10–4,000 characters</span><span className={text.trim().length > 4000 ? "invalid-count" : ""}>{text.trim().length.toLocaleString()} / 4,000</span></div>
      <div className="request-rate-row"><div><label htmlFor="hourly-rate">Hourly rate (INR)</label><div className="rate-input"><span aria-hidden="true">₹</span><input id="hourly-rate" inputMode="decimal" placeholder="0.00" value={rate} disabled={busy} onChange={e => { setRate(e.target.value); setSaved(false); }} aria-describedby="rate-help" /><span>/ hour</span></div><p className="field-help" id="rate-help">Up to ₹100,000/hour. This input does not create a quote or charge.</p></div><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}{busy ? "Saving…" : "Save request"}</button></div>
      {error && <p className="form-error" role="alert">{error}</p>}{saved && <p className="saved-feedback" role="status">Request saved. It has not been analyzed.</p>}
    </form>}
    <div className="section-heading"><h3>All requests <span className="count-badge">{requests.length}</span></h3></div>
    {requests.length === 0 ? <div className="empty-state request-empty"><FileText size={30} aria-hidden="true" /><h3>No requests yet</h3><p>Saved requests will appear here with the rate you entered.</p></div> : <div className="request-list">{requests.map(request => <article className="intake-panel request-card" key={request.id} id={`request-${request.id}`}><div className="request-card-meta"><span className="neutral-badge">{request.estimate ? "Analyzed · Review required" : "Saved · Not analyzed"}</span><time dateTime={request.createdAt}>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(request.createdAt))} UTC</time></div><p className="source-text">{request.text}</p><div className="request-card-bottom"><p><strong>{request.hourlyRatePaise == null ? "Rate not supplied" : `${formatRate(request.hourlyRatePaise)} / hour`}</strong><span>Entered rate · No price calculated</span></p><AnalyzeButton requestId={request.id} projectId={projectId} estimateId={request.estimate?.id} /></div></article>)}</div>}
  </section>;
}
