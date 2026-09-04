"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, FileText, FolderOpen, ListChecks, MessageSquare, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";

export function ProjectTabs({ projectId, projectName }: { projectId: string; projectName: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const root = `/projects/${projectId}`;
  const activePath = pathname.startsWith(`${root}/estimates/`) ? `${root}/requests` : pathname;
  const sections = [
    { label: "Overview", href: root, Icon: FolderOpen },
    { label: "Baseline", href: `${root}/baseline`, Icon: FileText },
    { label: "Requirements", href: `${root}/requests`, Icon: ListChecks },
    { label: "Project Memory", href: `${root}/memory`, Icon: BookOpen },
  ];

  return <div className={`project-navigation${collapsed ? " collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`}>
    <button type="button" className="project-nav-mobile-trigger" aria-label="Open project navigation" aria-controls="project-navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><PanelLeftOpen size={18} aria-hidden="true" /><span>Project navigation</span></button>
    {mobileOpen && <button type="button" className="nav-scrim project-nav-scrim" aria-label="Close project navigation" onClick={() => setMobileOpen(false)} />}
    <aside id="project-navigation" className="project-sidebar">
      <div className="rail-control-row project-rail-controls">
        <button type="button" className="rail-toggle project-rail-toggle" aria-label={collapsed ? "Expand project navigation" : "Collapse project navigation"} aria-controls="project-sections" aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>{collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}</button>
      </div>
      <header className="project-sidebar-header"><div className="project-sidebar-identity"><p className="eyebrow">PROJECT</p><strong title={projectName}>{projectName}</strong></div>
        <button type="button" className="rail-toggle project-mobile-close" aria-label="Close project navigation" onClick={() => setMobileOpen(false)}><X size={18} aria-hidden="true" /></button>
      </header>
      <nav id="project-sections" className="project-tabs" aria-label="Project sections">
        {sections.map(({ label, href, Icon }) => <Link key={href} className={`project-tab ${activePath === href ? "selected" : ""}`} href={href} aria-current={activePath === href ? "page" : undefined} title={collapsed ? label : undefined} onClick={() => setMobileOpen(false)}><Icon size={18} aria-hidden="true" /><span>{label}</span></Link>)}
        <span className="project-tab unavailable" aria-disabled="true" title="Available in Milestone 7"><MessageSquare size={18} aria-hidden="true" /><span>Project AI Chatbot</span><small>Milestone 7</small></span>
      </nav>
    </aside>
  </div>;
}
