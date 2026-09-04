import { requirePageSession } from "@/server/auth";
import { WorkspaceShell } from "@/components/workspace-shell";
export const dynamic = "force-dynamic";
export default async function ProjectsLayout({ children }: { children: React.ReactNode }) { await requirePageSession(); return <WorkspaceShell>{children}</WorkspaceShell>; }
