"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, FileText, ListChecks, BookOpen, MessageSquare } from "lucide-react";
export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const root = `/projects/${projectId}`;
  const activePath = pathname.startsWith(`${root}/estimates/`) ? `${root}/requests` : pathname;
  return <nav className="project-tabs" aria-label="Project sections">
    {[{ label: "Overview", href: root, Icon: FolderOpen }, { label: "Baseline", href: `${root}/baseline`, Icon: FileText }, { label: "Requests", href: `${root}/requests`, Icon: ListChecks }, { label: "Project Memory", href: `${root}/memory`, Icon: BookOpen }].map(({ label, href, Icon }) =>
      <Link key={href} className={`project-tab ${activePath === href ? "selected" : ""}`} href={href} aria-current={activePath === href ? "page" : undefined}><Icon size={17} aria-hidden="true" />{label}</Link>)}
    <span className="project-tab unavailable" aria-disabled="true" title="Available in Milestone 7"><MessageSquare size={17} aria-hidden="true" />Ask Project Memory</span>
  </nav>;
}
