"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LogOut, Plus, LoaderCircle } from "lucide-react";
import type { ApiErrorBody } from "@/lib/contracts";

async function submit(url: string, data?: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) {
    const error = (result as ApiErrorBody).error;
    throw new Error(Object.values(error?.fields ?? {}).flat()[0] ?? error?.message ?? "Something went wrong. Please try again.");
  }
  return result;
}
export function LoginForm({ configurationError }: { configurationError?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function onSubmit(event: FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try { await submit("/api/auth/login", { password }); router.replace("/projects"); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to log in. Please try again."); setBusy(false); }
  }
  return <form onSubmit={onSubmit} className="form-stack">
    <div><label htmlFor="password">Workspace password</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" aria-invalid={!!error} aria-describedby={error || configurationError ? "login-error" : "password-help"} disabled={busy} /></div>
    <p id="password-help" className="field-help">Use the password configured for your workspace.</p>
    {(error || configurationError) && <p id="login-error" className="form-error" role="alert">{error || configurationError}</p>}
    <button className="button button-primary full-width" disabled={busy || !!configurationError}>{busy ? <><LoaderCircle className="spin" size={18} aria-hidden="true" /> Opening workspace…</> : <>Open workspace <ArrowRight size={18} aria-hidden="true" /></>}</button>
  </form>;
}
export function CreateProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function onSubmit(event: FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try { const result = await submit("/api/projects", { name }); router.push(`/projects/${result.project.id}`); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to create the project. Please try again."); setBusy(false); }
  }
  return <form onSubmit={onSubmit} className="create-form">
    <div className="create-field"><label htmlFor="project-name">Project name</label><input id="project-name" name="name" placeholder="e.g. Acme website redesign" required maxLength={120} value={name} onChange={e => setName(e.target.value)} aria-invalid={!!error} aria-describedby={error ? "project-error" : "project-name-help"} disabled={busy} /><span id="project-name-help" className="field-help">Give it a name you and your client will recognize.</span></div>
    <button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}{busy ? "Creating…" : "Create project"}</button>
    {error && <p className="form-error create-error" id="project-error" role="alert">{error}</p>}
  </form>;
}
export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div className="logout-wrap"><button className="button button-quiet" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await submit("/api/auth/logout"); router.replace("/login"); router.refresh(); } catch { setError("Could not log out. Try again."); setBusy(false); } }}><LogOut size={16} aria-hidden="true" />{busy ? "Logging out…" : "Log out"}</button>{error && <span role="alert" className="form-error">{error}</span>}</div>;
}
