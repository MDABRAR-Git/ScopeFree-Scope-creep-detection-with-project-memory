"use client";
import { useRef, useState } from "react";
import type { SavedEstimate } from "@/server/analysis";
import { readApiResponse } from "@/lib/api-client";
import { ShareLink } from "./share-link";
import { OfferContent } from "./offer-content";

export function OfferManager({ estimate, onSaved }: { estimate: SavedEstimate; onSaved: (estimate: SavedEstimate)=>void }) {
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[link,setLink]=useState(""),[confirmed,setConfirmed]=useState(false),[message,setMessage]=useState("");
  const working=useRef(false),attempt=useRef<{action:string;key:string}|null>(null);
  const current=estimate.offers.find(p=>p.id===estimate.currentProposalId);
  async function act(action:"generate"|"link"|"revoke"|"revise"){
    if(working.current)return;
    working.current=true;setBusy(true);setError("");setMessage("");setLink("");
    if(attempt.current?.action!==action)attempt.current={action,key:crypto.randomUUID()};
    try{
      const result=await readApiResponse(await fetch(action==="generate"?`/api/estimates/${estimate.id}/proposal`:`/api/proposals/${current!.id}/${action}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idempotencyKey:attempt.current!.key,expectedRevision:estimate.currentRevision,...(action!=="generate"?{confirmed:true}:{})})}));
      if(result.link)setLink(result.link);
      const saved=await readApiResponse(await fetch(`/api/estimates/${estimate.id}`,{cache:"no-store"}));onSaved(saved.estimate);
      attempt.current=null;setConfirmed(false);setMessage(action==="generate"?"Offer created. Copy and share its link manually.":action==="link"?"Access rotated. The earlier link no longer works.":"Offer revoked. Save and approve a new review before sharing another offer.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Unable to update the offer. Retry safely.");}
    finally{working.current=false;setBusy(false);}
  }
  return <section className="intake-panel offer-manager" aria-label="Client offers"><h3>Client offers</h3><p>Share only the approved revision. Client acceptance is recorded separately from internal approval.</p>
    {estimate.status==="APPROVED"&&(!current||current.status==="REVOKED")&&<button type="button" className="button button-primary" disabled={busy} onClick={()=>void act("generate")}>Generate client offer</button>}
    {current&&<p>Current offer: <strong>{current.status}</strong> · Link expires {new Date(current.expiresAt).toLocaleString("en-IN")}</p>}
    {current?.status==="PENDING"&&<><label className="check-label"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} disabled={busy}/><span>I understand that rotating or revoking access invalidates the old link, and editing requires a new approval.</span></label><div className="offer-buttons"><button type="button" className="button button-secondary" disabled={busy||!confirmed} onClick={()=>void act("link")}>Rotate offer link</button><button type="button" className="button button-secondary" disabled={busy||!confirmed} onClick={()=>void act("revoke")}>Revoke offer</button><button type="button" className="button button-primary" disabled={busy||!confirmed} onClick={()=>void act("revise")}>Revoke offer and edit</button></div></>}
    {link&&<ShareLink link={link}/>}{message&&<p role="status">{message}</p>}{error&&<p role="alert" className="form-error">{error}</p>}
    {!estimate.offers.length&&estimate.status!=="APPROVED"&&<p className="field-help">Save and approve this review to generate a client offer.</p>}
    {estimate.offers.map((p,i)=><details key={p.id} className="source-details"><summary>Offer {i+1} · {p.status}{p.replacesProposalId?" · replaces an earlier offer":""}</summary><div className="review-history-content">{p.offer?<OfferContent offer={p.offer}/>:<p>Historical offer preserved in its original format.</p>}{p.decidedAt&&<p>Client {p.status.toLowerCase()} on {new Date(p.decidedAt).toLocaleString("en-IN")}</p>}{p.comment&&<p className="source-text">Client comment: {p.comment}</p>}</div></details>)}
  </section>;
}
