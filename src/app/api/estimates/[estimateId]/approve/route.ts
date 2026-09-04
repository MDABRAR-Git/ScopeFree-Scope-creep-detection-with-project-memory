import { NextResponse } from "next/server";
import { requireResourceOwner, checkOrigin } from "@/server/auth";
import { api, readJson } from "@/server/errors";
import { mutateReview } from "@/server/review";
export async function POST(request: Request, { params }: { params: Promise<{ estimateId: string }> }) {
  return api(async () => { checkOrigin(request); await requireResourceOwner("estimate", (await params).estimateId); return NextResponse.json({ estimate: await mutateReview((await params).estimateId, "approve", await readJson(request, 512000)) }); })(request);
}
