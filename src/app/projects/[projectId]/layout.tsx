import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, LockKeyhole } from "lucide-react";
import { ProjectTabs } from "@/components/project-tabs";
import { requirePageSession } from "@/server/auth";
import { getProject } from "@/server/projects";
import { AppError } from "@/server/errors";
export default async function ProjectLayout({ params, children }: { params: Promise<{ projectId: string }>; children: React.ReactNode }) {
  const session = await requirePageSession();
  const { projectId } = await params;
  const project = await getProject(projectId, session.userId).catch(error => { if (error instanceof AppError && error.code === "NOT_FOUND") notFound(); throw error; });
  return <>
    <nav className="breadcrumb" aria-label="Breadcrumb"><Link href="/projects">Projects</Link><ChevronRight size={12} aria-hidden="true" /><span className="breadcrumb-project">{project.name}</span></nav>
    <Link href="/projects" className="back-link"><ArrowLeft size={15} aria-hidden="true" />All projects</Link>
    <div className="page-heading project-heading"><div><p className="eyebrow">PROJECT WORKSPACE</p><h1>{project.name}</h1><p className="muted">The home for your agreement and the changes that follow.</p></div><span className="neutral-badge"><LockKeyhole size={13} aria-hidden="true" />Private project</span></div>
    <ProjectTabs projectId={project.id} />{children}
  </>;
}
