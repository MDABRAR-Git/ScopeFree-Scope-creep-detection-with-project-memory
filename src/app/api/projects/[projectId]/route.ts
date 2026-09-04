import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { api } from "@/server/errors";
import { getProject } from "@/server/projects";
export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return api(async () => { const session = await requireSession(); const { projectId } = await context.params; return NextResponse.json({ project: await getProject(projectId, session.userId) }); })(request);
}
