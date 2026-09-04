import { redirect } from "next/navigation";
import { Check, LockKeyhole, ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/brand";
import { LoginForm } from "@/components/access-forms";
import { getWorkspaceSession } from "@/server/auth";
import { AppError } from "@/server/errors";
export const dynamic = "force-dynamic";
export default async function LoginPage() {
  let configurationError: string | undefined;
  let authenticated = false;
  try { authenticated = !!await getWorkspaceSession(); }
  catch (error) { configurationError = error instanceof AppError ? error.message : "Workspace access is unavailable. Please try again."; }
  if (authenticated) redirect("/projects");
  return <main id="main" className="login-page"><section className="login-story"><Brand light /><div className="story-content"><span className="story-tag"><span /> A CLEARER WAY TO WORK</span><h1>Good projects.<br />Clear boundaries.</h1><p className="story-description">Keep the original agreement and every agreed change connected. Make room for great work.</p><div className="scope-illustration" aria-hidden="true"><div className="illustration-top"><span className="illustration-icon"><Check size={18} /></span><div><strong>Start with shared understanding</strong><span>One place for your project scope</span></div><ArrowUpRight size={19} /></div><div className="illustration-line" /><div className="illustration-step"><span className="step-dot" /><span>Original agreement</span><span className="step-line" /></div><div className="illustration-step"><span className="step-dot hollow" /><span>Thoughtful changes</span><span className="step-line short" /></div><div className="illustration-step"><span className="step-dot hollow" /><span>A lasting project memory</span></div></div></div><p className="story-footer">Less ambiguity. More time for the work.</p></section>
    <section className="login-entry"><div className="login-entry-inner"><span className="entry-icon"><LockKeyhole size={25} strokeWidth={1.6} aria-hidden="true" /></span><p className="eyebrow">YOUR PRIVATE WORKSPACE</p><h2>Your workspace.</h2><p className="muted login-subtitle">Sign in, or create your account the first time.</p><LoginForm configurationError={configurationError} /><div className="privacy-note"><LockKeyhole size={14} aria-hidden="true" /><span>Projects are private to the signed-in account.</span></div></div><p className="login-footer">ScopeFree <span>•</span> Built for independent work</p></section></main>;
}
