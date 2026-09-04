"use client";

import { useState } from "react";
import Link from "next/link";
import { FolderOpen, LockKeyhole, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { Brand } from "./brand";
import { LogoutButton } from "./access-forms";

export function WorkspaceShell({ children, email }: { children: React.ReactNode; email: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return <div className="workspace-shell">
    <header className="topbar"><div className="topbar-left">
      <button type="button" className="rail-toggle mobile-global-toggle" aria-label="Open workspace navigation" aria-controls="workspace-navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><Menu size={19} aria-hidden="true" /></button>
      <Link href="/projects" aria-label="ScopeFree projects"><Brand /></Link>
    </div><div className="topbar-right"><span className="workspace-label"><LockKeyhole size={14} aria-hidden="true" /> Private workspace</span><span className="topbar-divider" /><LogoutButton /></div></header>
    <div className="workspace-body">
      {mobileOpen && <button type="button" className="nav-scrim" aria-label="Close workspace navigation" onClick={() => setMobileOpen(false)} />}
      <aside id="workspace-navigation" className={`sidebar global-sidebar${collapsed ? " collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`}>
        <div className="rail-control-row global-rail-controls">
          <button type="button" className="rail-toggle desktop-global-toggle" aria-label={collapsed ? "Expand workspace navigation" : "Collapse workspace navigation"} aria-controls="workspace-navigation" aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>{collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}</button>
        </div>
        <div><div className="sidebar-heading"><p className="eyebrow sidebar-label">WORKSPACE</p><button type="button" className="rail-toggle sidebar-mobile-close" aria-label="Close workspace navigation" onClick={() => setMobileOpen(false)}><X size={18} aria-hidden="true" /></button></div><Link className="sidebar-link active" aria-label="Projects" href="/projects" onClick={() => setMobileOpen(false)}><FolderOpen size={18} aria-hidden="true" /><span>Projects</span></Link></div>
        <div className="sidebar-note"><span className="small-mark">SF</span><p>Keep scope, estimates, and client decisions connected.</p></div>
        <div className="profile"><span className="avatar">{email[0]?.toUpperCase()}</span><div><strong>{email}</strong><span>Private account</span></div></div>
      </aside>
      <main id="main" className="main-content">{children}</main>
    </div>
  </div>;
}
