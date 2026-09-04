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
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function onSubmit(event: FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try { await submit(`/api/auth/${mode === "login" ? "login" : "register"}`, mode === "login" ? { email, password } : { email, password, confirmPassword }); router.replace("/projects"); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to log in. Please try again."); setBusy(false); }
  }
  function changeMode(next: "login" | "register") { setMode(next); setError(""); setPassword(""); setConfirmPassword(""); }
  return <><div className="auth-tabs" role="tablist" aria-label="Account access"><button type="button" role="tab" aria-selected={mode === "login"} onClick={() => changeMode("login")}>Sign in</button><button type="button" role="tab" aria-selected={mode === "register"} onClick={() => changeMode("register")}>Create account</button></div><form onSubmit={onSubmit} className="form-stack">
    <div><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" aria-invalid={!!error} disabled={busy} /></div>
    <div><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 8 : undefined} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === "login" ? "Enter your password" : "At least 8 characters"} aria-invalid={!!error} aria-describedby={error || configurationError ? "login-error" : "password-help"} disabled={busy} /></div>
    {mode === "register" && <div><label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" required maxLength={128} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Enter the password again" aria-invalid={!!error} disabled={busy} /></div>}
    <p id="password-help" className="field-help">{mode === "login" ? "Use the email and password for your ScopeFree account." : "Your first account will securely claim projects created before accounts were enabled."}</p>
    {(error || configurationError) && <p id="login-error" className="form-error" role="alert">{error || configurationError}</p>}
    <button className="button button-primary full-width" disabled={busy || !!configurationError}>{busy ? <><LoaderCircle className="spin" size={18} aria-hidden="true" /> {mode === "login" ? "Signing in…" : "Creating account…"}</> : <>{mode === "login" ? "Sign in" : "Create account"} <ArrowRight size={18} aria-hidden="true" /></>}</button>
  </form></>;
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
