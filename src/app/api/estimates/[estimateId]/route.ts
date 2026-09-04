import { NextResponse } from "next/server";
import { requireResourceOwner } from "@/server/auth";
import { api } from "@/server/errors";
import { getEstimate } from "@/server/analysis";
export async function GET(request: Request, { params }: { params: Promise<{ estimateId: string }> }) {
  return api(async () => { await requireResourceOwner("estimate", (await params).estimateId); return NextResponse.json({ estimate: await getEstimate((await params).estimateId) }); })(request);
}
