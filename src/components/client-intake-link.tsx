"use client";
import { useRef,useState } from "react";
import { useRouter } from "next/navigation";
import { readApiResponse } from "@/lib/api-client";
import { ShareLink } from "./share-link";
import type { getIntakeLink } from "@/server/client-intake";
export function ClientIntakeLink({projectId,initial}:{projectId:string;initial:Awaited<ReturnType<typeof getIntakeLink>>}){
  const [state,setState]=useState(initial),[link,setLink]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[confirmed,setConfirmed]=useState(false);
  const working=useRef(false),attempt=useRef<{method:string;key:string}|null>(null),router=useRouter();
  async function act(method:"POST"|"DELETE"){
    if(working.current)return;working.current=true;setBusy(true);setError("");setLink("");
    if(attempt.current?.method!==method)attempt.current={method,key:crypto.randomUUID()};
    try{const result=await readApiResponse(await fetch(`/api/projects/${projectId}/intake-link`,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify({idempotencyKey:attempt.current!.key})}));setLink(result.link??"");const next=await readApiResponse(await fetch(`/api/projects/${projectId}/intake-link`));setState(next.intake);setConfirmed(false);attempt.current=null;router.refresh();}
    catch(e){setError(e instanceof Error?e.message:"Unable to manage this link.");}finally{working.current=false;setBusy(false);}
  }
  return <section className="intake-panel client-intake-link" aria-label="Client request link"><h3>Invite client requests</h3><p>Share a private submission link. Clients can submit new requests; you set the rate and review each one.</p>{state&&<p>{state.revoked?"Revoked":"Created"} · Expires {new Date(state.expiresAt).toLocaleString("en-IN")}</p>}{state&&!state.revoked&&<label className="check-label"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>I understand that this invalidates the previous request link.</span></label>}<div className="offer-buttons"><button type="button" className="button button-secondary" disabled={busy||!!state&&!state.revoked&&!confirmed} onClick={()=>void act("POST")}>{state&&!state.revoked?"Rotate client request link":"Create client request link"}</button>{state&&!state.revoked&&<button type="button" className="button button-secondary" disabled={busy||!confirmed} onClick={()=>void act("DELETE")}>Revoke client request link</button>}</div>{link&&<ShareLink link={link}/>}{error&&<p role="alert" className="form-error">{error}</p>}</section>;
}
