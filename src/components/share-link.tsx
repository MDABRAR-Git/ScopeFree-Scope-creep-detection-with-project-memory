"use client";
import { useState } from "react";
export function ShareLink({ link }: { link: string }) {
  const [message,setMessage]=useState("");
  return <div className="share-link"><label>Client link (shown only now)<input readOnly value={link} onFocus={e=>e.target.select()}/></label><button type="button" className="button button-secondary" onClick={async()=>{try{await navigator.clipboard.writeText(link);setMessage("Link copied. Share it with the client manually.");}catch{setMessage("Select the link and copy it manually.");}}}>Copy client link</button><p className="field-help">Keep this link private. If you lose it, rotate access to get a new one.</p>{message&&<p role="status">{message}</p>}</div>;
}
