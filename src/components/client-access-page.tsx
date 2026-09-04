"use client";
import { useEffect,useRef,useState } from "react";
import type { ClientProposalView } from "@/lib/proposals";
import { clientRequestInputSchema } from "@/lib/proposals";
import { readApiResponse } from "@/lib/api-client";
import { OfferContent } from "./offer-content";

export function ClientAccessPage({kind,id}:{kind:"requests"|"proposals";id:string}){
  const token=useRef("");
  const [intake,setIntake]=useState<{projectName:string;expiresAt:string}|null>(null),[view,setView]=useState<ClientProposalView|null>(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[busy,setBusy]=useState(false),[text,setText]=useState(""),[comment,setComment]=useState(""),[confirmed,setConfirmed]=useState(false);
  const [receipt,setReceipt]=useState<{requestNumber:number;submittedAt:string}|null>(null),[reload,setReload]=useState(0);
  const operation=useRef<{body:string;key:string}|null>(null),working=useRef(false),errorRef=useRef<HTMLParagraphElement>(null);
  useEffect(()=>{if(error)errorRef.current?.focus();},[error]);
  useEffect(()=>{
    token.current=new URLSearchParams(location.hash.slice(1)).get("token")??"";
    const controller=new AbortController();
    async function load(){
      setLoading(true);setError("");
      if(!/^[A-Za-z0-9_-]{43}$/.test(token.current)){setError("This link is incomplete. Ask the freelancer for a new link.");setLoading(false);return;}
      try{const result=await readApiResponse(await fetch(`/api/client/${kind}/${id}`,{headers:{Authorization:`Bearer ${token.current}`},cache:"no-store",signal:controller.signal}));if(kind==="requests")setIntake(result);else setView(result);}
      catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Unable to open this link.");}
      finally{if(!controller.signal.aborted)setLoading(false);}
    }
    void load();return()=>controller.abort();
  },[kind,id,reload]);
  async function submit(decision?:"accept"|"decline"){
    if(working.current)return;
    const payload=decision?{decision,confirmed,comment:comment.trim()}:{text:text.trim()};
    const identity=JSON.stringify(payload);
    if(operation.current?.body!==identity)operation.current={body:identity,key:crypto.randomUUID()};
    const body={...payload,idempotencyKey:operation.current!.key};
    if(!decision&&!clientRequestInputSchema.safeParse(body).success){setError("Describe the request in 10–4,000 characters.");return;}
    if(decision&&!confirmed){setError("Confirm your decision before continuing.");return;}
    working.current=true;setBusy(true);setError("");
    try{
      const result=await readApiResponse(await fetch(`/api/client/${kind}/${id}${decision?"/decision":""}`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token.current}`},body:JSON.stringify(body)}));
      if(decision)setView(old=>old?{...old,status:result.decision.outcome,decision:result.decision}:old);else setReceipt(result.receipt);
      operation.current=null;
    }catch(e){setError(e instanceof Error?e.message:"Unable to save. Your input has been kept; please retry.");}
    finally{working.current=false;setBusy(false);}
  }
  return <main id="main" className="client-page"><header><span className="client-brand">ScopeFree.</span><p>Project agreements and change requests</p></header>
    {loading&&<p role="status">Opening your link…</p>}
    {error&&<p className="form-error" role="alert" ref={errorRef} tabIndex={-1}>{error} Your input has been kept.</p>}
    {!loading&&!intake&&!view&&<button className="button button-secondary" onClick={()=>setReload(n=>n+1)}>Retry opening link</button>}
    {intake&&<><h1>{intake.projectName}</h1><h2>Submit a change request</h2>{receipt?<section className="intake-panel" role="status"><h3>Request #{receipt.requestNumber} received</h3><p>The freelancer will review your request and prepare an estimate. This is not an approval or a charge.</p><button className="button button-secondary" onClick={()=>{setReceipt(null);setText("");}}>Submit another request</button></section>:<form className="intake-panel" onSubmit={e=>{e.preventDefault();void submit();}}><label>What would you like to change?<textarea rows={7} maxLength={4000} value={text} onChange={e=>setText(e.target.value)} disabled={busy}/></label><p className="field-help">10–4,000 characters. The freelancer sets the hourly rate and reviews the scope before sharing an offer.</p><button className="button button-primary" disabled={busy}>{busy?"Submitting…":"Submit request"}</button></form>}</>}
    {view&&<><h1>{view.offer.projectName}</h1><p>Client offer · {view.status} · Link expires {new Date(view.expiresAt).toLocaleString("en-IN")}</p><OfferContent offer={view.offer}/>{view.decision?<section className="intake-panel" role="status"><h2>{view.decision.outcome==="ACCEPTED"?"Offer accepted":"Offer declined"}</h2><p>Recorded {new Date(view.decision.decidedAt).toLocaleString("en-IN")}</p>{view.decision.comment&&<p className="source-text">Your comment: {view.decision.comment}</p>}<p>This decision is saved. No automatic charge has been made.</p></section>:<section className="intake-panel"><h2>Your decision</h2><label>Comment (optional)<textarea rows={3} maxLength={500} value={comment} disabled={busy} onChange={e=>setComment(e.target.value)}/></label><label className="check-label"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/><span>I have reviewed this offer and confirm the Accept or Decline action I choose below.</span></label><div className="offer-buttons"><button className="button button-primary" disabled={busy||!confirmed} onClick={()=>void submit("accept")}>Accept offer</button><button className="button button-secondary" disabled={busy||!confirmed} onClick={()=>void submit("decline")}>Decline offer</button></div></section>}</>}
    <footer>Access is provided by this private link. Keep it private and contact the freelancer if it needs replacing.</footer>
  </main>;
}
