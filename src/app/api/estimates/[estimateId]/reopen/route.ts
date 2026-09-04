import { NextResponse } from "next/server";
import { requireSession, checkOrigin } from "@/server/auth";
import { api, readJson } from "@/server/errors";
import { mutateReview } from "@/server/review";
export async function POST(request: Request, { params }: { params: Promise<{ estimateId: string }> }) {
  return api(async () => { checkOrigin(request); await requireSession(); return NextResponse.json({ estimate: await mutateReview((await params).estimateId, "reopen", await readJson(request, 512000)) }); })(request);
}
