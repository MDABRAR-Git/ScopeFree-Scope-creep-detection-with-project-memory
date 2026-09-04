import Link from "next/link";
import { ArrowUpRight, FolderOpen, Leaf, LockKeyhole } from "lucide-react";
import { CreateProjectForm } from "@/components/access-forms";
import { listProjects } from "@/server/projects";
import { requirePageSession } from "@/server/auth";
export default async function ProjectsPage() {
  await requirePageSession();
  const projects = await listProjects();
  return <><div className="breadcrumb">Workspace <span>/</span> Projects</div><div className="page-heading"><div><p className="eyebrow">ROOM FOR YOUR BEST WORK</p><h1>Your projects</h1><p className="muted">Start with clarity. Keep every project grounded in what you agreed.</p></div><span className="count-badge">{projects.length} {projects.length === 1 ? "project" : "projects"}</span></div>
    <section className="new-project-panel" aria-labelledby="create-title"><div className="panel-intro"><span className="panel-icon"><FolderOpen size={22} aria-hidden="true" /></span><div><h2 id="create-title">A new project starts here</h2><p className="muted">Create a dedicated space for your next piece of work.</p></div></div><CreateProjectForm /></section>
    <section className="project-section" aria-labelledby="projects-title"><div className="section-heading"><h2 id="projects-title">All projects <span>{projects.length}</span></h2><span className="section-caption">Your work, in one place</span></div>
      {projects.length === 0 ? <div className="empty-state"><div className="empty-art" aria-hidden="true"><FolderOpen size={43} strokeWidth={1.2} /><span><Leaf size={19} /></span></div><h3>A fresh start, a clear scope.</h3><p>Your projects will live here. Give your first project a name<br className="desktop-break" /> above to open its workspace.</p><span className="empty-footnote"><LockKeyhole size={13} aria-hidden="true" /> Private to your workspace</span></div> : <div className="project-grid">
        {projects.map(project => <Link className="project-card" key={project.id} href={`/projects/${project.id}`}>
          <div className="project-card-top"><span className="folder-tile"><FolderOpen size={24} aria-hidden="true" /></span><ArrowUpRight size={19} aria-hidden="true" /></div>
          <h3>{project.name}</h3><p>{project.requestCount} saved {project.requestCount === 1 ? "request" : "requests"}</p>
          <div className="project-card-footer"><span className="neutral-badge">{project.baselineConfirmed ? "Baseline confirmed" : "Getting started"}</span><span>Created {new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(project.createdAt)}</span></div>
        </Link>)}
      </div>}
    </section><footer className="page-footer"><span className="footer-dot" /> A clear beginning for every project.</footer></>;
}
