import { requirePageSession } from "@/server/auth";
import { WorkspaceShell } from "@/components/workspace-shell";
export const dynamic = "force-dynamic";
export default async function ProjectsLayout({ children }: { children: React.ReactNode }) { const session = await requirePageSession(); return <WorkspaceShell email={session.email}>{children}</WorkspaceShell>; }
