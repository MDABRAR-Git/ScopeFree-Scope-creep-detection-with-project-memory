import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, FileText, FolderOpen, MessageSquare, BookOpen, ListChecks, LockKeyhole } from "lucide-react";
import { getProject } from "@/server/projects";
import { requirePageSession } from "@/server/auth";
import { AppError } from "@/server/errors";
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  await requirePageSession();
  const { projectId } = await params;
  const project = await getProject(projectId).catch(error => { if (error instanceof AppError && error.code === "NOT_FOUND") notFound(); throw error; });
  return <><div className="breadcrumb"><Link href="/projects">Projects</Link><span>/</span><span className="breadcrumb-project">{project.name}</span></div><Link href="/projects" className="back-link"><ArrowLeft size={15} aria-hidden="true" /> All projects</Link><div className="page-heading project-heading"><div><p className="eyebrow">PROJECT WORKSPACE</p><h1>{project.name}</h1><p className="muted">The home for your agreement and the changes that follow.</p></div><span className="neutral-badge"><LockKeyhole size={13} aria-hidden="true" /> Private project</span></div>
    <nav className="project-tabs" aria-label="Project sections"><span className="project-tab selected" aria-current="page"><FolderOpen size={17} aria-hidden="true" /> Overview</span>{[[FileText, "Baseline"], [ListChecks, "Requests"], [BookOpen, "Project Memory"], [MessageSquare, "Ask Project Memory"]].map(([Icon, label]) => { const TabIcon = Icon as typeof FileText; return <span key={label as string} className="project-tab unavailable" aria-disabled="true" title="Available in a later milestone"><TabIcon size={17} aria-hidden="true" />{label as string}</span>; })}</nav>
    <section className="project-welcome"><span className="success-icon"><Check size={26} aria-hidden="true" /></span><p className="eyebrow">FOUNDATION IN PLACE</p><h2>Your project has a home.</h2><p>Your project is saved and ready for the next step.<br />Baseline and request intake will be added in Milestone 2.</p><div className="next-step"><span className="next-step-icon"><FileText size={24} aria-hidden="true" /></span><div><span className="eyebrow">UP NEXT</span><h3>Start with the original agreement</h3><p>Capture what you and your client have agreed to deliver.</p></div><span className="neutral-badge">Milestone 2</span></div></section><footer className="page-footer"><span className="footer-dot" /> Project saved · Created {new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" }).format(project.createdAt)}</footer></>;
}
