import Link from "next/link";
import { FolderOpen, LockKeyhole } from "lucide-react";
import { Brand } from "./brand";
import { LogoutButton } from "./access-forms";
export function WorkspaceShell({ children, email }: { children: React.ReactNode; email: string }) {
  return <div className="workspace-shell"><header className="topbar"><Link href="/projects" aria-label="ScopeFree projects"><Brand /></Link><div className="topbar-right"><span className="workspace-label"><LockKeyhole size={14} aria-hidden="true" /> Private workspace</span><span className="topbar-divider" /><LogoutButton /></div></header>
    <div className="workspace-body"><aside className="sidebar"><div><p className="eyebrow sidebar-label">WORKSPACE</p><Link className="sidebar-link active" href="/projects"><FolderOpen size={18} aria-hidden="true" /><span>Projects</span></Link></div><div className="sidebar-note"><span className="small-mark">SF</span><p>Keep scope, estimates, and client decisions connected.</p></div><div className="profile"><span className="avatar">{email[0]?.toUpperCase()}</span><div><strong>{email}</strong><span>Private account</span></div></div></aside><main id="main" className="main-content">{children}</main></div></div>;
}
