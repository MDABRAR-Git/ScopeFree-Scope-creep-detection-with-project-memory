"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, Sparkles } from "lucide-react";
import { readApiResponse } from "@/lib/api-client";
export function AnalyzeButton({ requestId, projectId, estimateId }: { requestId: string; projectId: string; estimateId?: string }) {
  const router = useRouter();
  const key = useRef<string | null>(null);
  const working = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function analyze() {
    if (working.current) return;
    working.current = true; setBusy(true); setError("");
    key.current ??= crypto.randomUUID();
    try {
      const result = await readApiResponse(await fetch(`/api/requests/${requestId}/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idempotencyKey: key.current }) }));
      router.push(`/projects/${projectId}/estimates/${result.estimate.id}`); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Analysis failed. Your saved request is unchanged."); }
    finally { working.current = false; setBusy(false); }
  }
  if (estimateId) return <Link className="button button-primary" href={`/projects/${projectId}/estimates/${estimateId}`}>View analysis</Link>;
  return <div className="analyze-action"><button className="button button-primary" disabled={busy} onClick={() => void analyze()}>{busy ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}{busy ? "Analyzing request…" : error ? "Retry analysis" : "Analyze Request"}</button>{busy && <p role="status">Comparing your request with the complete agreed scope. This can take up to two minutes.</p>}{error && <p className="form-error" role="alert">{error}</p>}</div>;
}
