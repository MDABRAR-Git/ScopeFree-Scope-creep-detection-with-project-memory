import { NextResponse } from "next/server";
import { checkOrigin, requireResourceOwner } from "@/server/auth";
import { api, readJson } from "@/server/errors";
import { analyzeRequest } from "@/server/analysis";
export const runtime = "nodejs";
export const maxDuration = 125;
export async function POST(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  return api(async req => {
    checkOrigin(req); const requestId = (await params).requestId; const session = await requireResourceOwner("request", requestId);
    const estimate = await analyzeRequest(requestId, await readJson(req), session.id, req.signal);
    return NextResponse.json({ estimate });
  })(request);
}
