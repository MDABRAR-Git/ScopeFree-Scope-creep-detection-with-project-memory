import { NextResponse } from "next/server";
import { requireSession, checkOrigin } from "@/server/auth";
import { api, readJson } from "@/server/errors";
import { answerProjectChat, listProjectDecisions } from "@/server/chat";

// GET returns the deterministic, complete decision list for the Show All Decisions action.
export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  return api(async () => {
    await requireSession();
    return NextResponse.json({ decisions: await listProjectDecisions((await params).projectId) });
  })(request);
}

// POST answers one project-scoped, read-only question with validated citations.
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  return api(async () => {
    checkOrigin(request);
    await requireSession();
    return NextResponse.json(await answerProjectChat((await params).projectId, await readJson(request)));
  })(request);
}
