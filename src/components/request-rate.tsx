"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { rateRupeesSchema } from "@/lib/intake";
import { readApiResponse } from "@/lib/api-client";
export function RequestRate({requestId}:{requestId:string}){
  const [rate,setRate]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),router=useRouter();
  return <form noValidate onSubmit={async e=>{e.preventDefault();if(busy)return;setError("");const parsed=rateRupeesSchema.safeParse(rate);if(!parsed.success){setError("Enter a valid positive INR hourly rate with at most two decimals.");return;}setBusy(true);try{await readApiResponse(await fetch(`/api/requests/${requestId}/rate`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({hourlyRatePaise:parsed.data})}));router.refresh();}catch(cause){setError(cause instanceof Error?cause.message:"Unable to save the rate.");}finally{setBusy(false);}}}><p>Needs hourly rate before analysis.</p><label>Request hourly rate (INR)<input inputMode="decimal" value={rate} onChange={e=>setRate(e.target.value)} disabled={busy}/></label><button className="button button-secondary" disabled={busy}>Set hourly rate</button>{error&&<p role="alert" className="form-error">{error}</p>}</form>;
}
