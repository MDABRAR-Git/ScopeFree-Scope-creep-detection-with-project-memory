import Link from "next/link";
import { Check, FileText, ListChecks, ArrowRight } from "lucide-react";
import { getProject } from "@/server/projects";
import { getBaseline, listRequests } from "@/server/intake";
import { requirePageSession } from "@/server/auth";
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  await requirePageSession();
  const { projectId } = await params;
  const [project, baseline, requests] = await Promise.all([getProject(projectId), getBaseline(projectId), listRequests(projectId)]);
  return <><section className="project-welcome"><span className="success-icon"><Check size={26} aria-hidden="true" /></span><p className="eyebrow">{baseline ? "A CLEAR STARTING POINT" : "FOUNDATION IN PLACE"}</p><h2>{baseline ? "Your original scope is recorded." : "Your project has a home."}</h2><p>{baseline ? `${baseline.snapshot.clauses.length} confirmed clauses · ${requests.length} saved requests` : "Start by capturing the original agreement, then record the changes your client requests."}</p>
    <div className="overview-actions"><Link className="next-step" href={`/projects/${projectId}/baseline`}><span className="next-step-icon"><FileText size={24} aria-hidden="true" /></span><div><span className="eyebrow">ORIGINAL AGREEMENT</span><h3>{baseline ? "View confirmed baseline" : "Add the project baseline"}</h3><p>{baseline ? "Read the original text and scope clauses." : "Paste requirements or upload an agreed document."}</p></div><ArrowRight size={18} aria-hidden="true" /></Link><Link className="next-step" href={`/projects/${projectId}/requests`}><span className="next-step-icon"><ListChecks size={24} aria-hidden="true" /></span><div><span className="eyebrow">CLIENT CHANGES</span><h3>Open client requests</h3><p>{baseline ? "Record the next request and your hourly rate." : "Confirm a baseline to begin saving requests."}</p></div><ArrowRight size={18} aria-hidden="true" /></Link></div>
    </section><footer className="page-footer"><span className="footer-dot" />Project saved · Created {new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" }).format(project.createdAt)}</footer></>;
}
