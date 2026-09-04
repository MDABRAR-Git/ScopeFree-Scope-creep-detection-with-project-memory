import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { api } from "@/server/errors";
import { getMemoryDecision } from "@/server/memory";

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string; decisionId: string }> }) {
  return api(async () => {
    await requireSession();
    const { projectId, decisionId } = await params;
    return NextResponse.json({ decision: await getMemoryDecision(projectId, decisionId) });
  })(request);
}
