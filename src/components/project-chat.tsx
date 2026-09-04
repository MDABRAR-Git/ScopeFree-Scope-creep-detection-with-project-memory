"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { MessageSquare, ListChecks, ArrowRight, CornerDownLeft } from "lucide-react";
import { readApiResponse } from "@/lib/api-client";
import { chatInputSchema, type ChatAnswer, type DecisionListItem, type ValidatedCitation } from "@/lib/chat";
import { formatMoney } from "@/lib/pricing";

type Turn =
  | { kind: "question"; text: string }
  | { kind: "answer"; answer: string; citations: ValidatedCitation[]; insufficientEvidence: boolean; subset: boolean }
  | { kind: "decisions"; decisions: DecisionListItem[] };

const statusLabels: Record<string, string> = { ACCEPTED: "Accepted", DECLINED: "Declined", SUPERSEDED: "Superseded" };

export function ProjectChat({ projectId }: { projectId: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState<"ask" | "decisions" | null>(null);
  const [error, setError] = useState("");
  const working = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const fieldId = useId();
  const valid = chatInputSchema.safeParse({ question }).success;

  useEffect(() => { logRef.current?.querySelector<HTMLElement>(".chat-turn:last-child")?.scrollIntoView({ block: "nearest" }); }, [turns]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  async function ask() {
    if (working.current || !valid) return;
    const text = question.trim();
    working.current = true; setBusy("ask"); setError("");
    // Bounded, non-persistent context: the last few turns only.
    const context = turns.filter((t): t is Extract<Turn, { kind: "question" | "answer" }> => t.kind !== "decisions").slice(-4)
      .map(t => t.kind === "question" ? { role: "user" as const, content: t.text } : { role: "assistant" as const, content: t.answer });
    setTurns(prev => [...prev, { kind: "question", text }]);
    setQuestion("");
    try {
      const result = await readApiResponse(await fetch(`/api/projects/${projectId}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, context }) })) as ChatAnswer;
      setTurns(prev => [...prev, { kind: "answer", answer: result.answer, citations: result.citations, insufficientEvidence: result.insufficientEvidence, subset: result.subset }]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The chat could not answer. Your question is kept; retry."); setQuestion(text); }
    finally { working.current = false; setBusy(null); }
  }
  async function showAllDecisions() {
    if (working.current) return;
    working.current = true; setBusy("decisions"); setError("");
    try {
      const result = await readApiResponse(await fetch(`/api/projects/${projectId}/chat`, { cache: "no-store" })) as { decisions: DecisionListItem[] };
      setTurns(prev => [...prev, { kind: "decisions", decisions: result.decisions }]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load decisions. Retry."); }
    finally { working.current = false; setBusy(null); }
  }

  return <section className="chat-page" aria-labelledby="chat-title">
    <div className="intake-heading"><div><p className="eyebrow">PROJECT AI CHATBOT</p><h2 id="chat-title">Ask about this project</h2><p>Answers are read-only and grounded in this project&apos;s saved records. Every claim links to the exact source. The chatbot never changes scope, offers, prices or decisions.</p></div></div>

    <div className="chat-log" ref={logRef} role="log" aria-live="polite" aria-label="Conversation">
      {turns.length === 0 && <div className="empty-state chat-empty"><MessageSquare size={30} aria-hidden="true" /><h3>No questions yet</h3><p>Try &ldquo;What was the final decision?&rdquo;, &ldquo;What changed across revisions?&rdquo; or &ldquo;Why did the price change?&rdquo;. Chat is not saved and does not survive a refresh; your project records do.</p></div>}
      {turns.map((turn, index) => {
        if (turn.kind === "question") return <div key={index} className="chat-turn chat-question"><p>{turn.text}</p></div>;
        if (turn.kind === "decisions") return <div key={index} className="chat-turn chat-answer chat-decisions"><h3><ListChecks size={16} aria-hidden="true" /> All decisions ({turn.decisions.length})</h3>
          {turn.decisions.length ? <ul className="chat-decision-list">{turn.decisions.map(decision => <li key={decision.id}><Link href={decision.href}><span className={`memory-status memory-${decision.status.toLowerCase()}`}>{statusLabels[decision.status]}</span> <strong>#{decision.requestNumber} {decision.title}</strong></Link><span className="chat-decision-meta">{decision.changesScope ? "Changes the agreement" : "No agreement change"} · likely {formatMoney(decision.totalChargePaise.likely)} · {new Date(decision.decidedAt).toISOString().slice(0, 10)}</span></li>)}</ul> : <p className="field-help">No final decisions recorded yet. This complete list is read directly from the database, not summarized.</p>}
        </div>;
        return <div key={index} className={`chat-turn chat-answer${turn.insufficientEvidence ? " chat-insufficient" : ""}`}>
          <p className="chat-answer-text">{turn.answer}</p>
          {turn.insufficientEvidence && <p className="uncertainty-note">Insufficient evidence: no saved project record supports a complete answer.</p>}
          {turn.subset && <p className="field-help">Answered from a relevant subset of records to fit the context budget. Use Show All Decisions for the complete decision list.</p>}
          {turn.citations.length > 0 && <div className="chat-citations"><h4>Sources</h4><ul>{turn.citations.map((citation, i) => <li key={`${citation.sourceType}-${citation.sourceId}-${i}`}><Link href={citation.href}>{citation.label}<ArrowRight size={13} aria-hidden="true" /></Link><blockquote className="chat-quote">{citation.quote}</blockquote></li>)}</ul></div>}
        </div>;
      })}
      {busy === "ask" && <div className="chat-turn chat-answer" role="status"><p>Reading project records…</p></div>}
    </div>

    {error && <p className="form-error chat-error" role="alert" ref={errorRef} tabIndex={-1}>{error}</p>}

    <form className="chat-composer" onSubmit={event => { event.preventDefault(); void ask(); }}>
      <label htmlFor={fieldId}>Ask a question about this project</label>
      <div className="chat-input-row">
        <textarea id={fieldId} className="resize-none" rows={2} maxLength={2000} value={question} disabled={busy === "ask"} placeholder="e.g. What was the final decision about the extra page?"
          onChange={e => { setQuestion(e.target.value); setError(""); }}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(); } }} />
        <button type="submit" className="button button-primary" disabled={busy === "ask" || !valid}>{busy === "ask" ? "Asking…" : <>Ask<CornerDownLeft size={15} aria-hidden="true" /></>}</button>
      </div>
      <div className="chat-actions"><button type="button" className="button button-secondary" disabled={!!busy} onClick={() => void showAllDecisions()}><ListChecks size={15} aria-hidden="true" />{busy === "decisions" ? "Loading…" : "Show All Decisions"}</button><span className="field-help">Enter sends · Shift+Enter for a new line</span></div>
    </form>
  </section>;
}
