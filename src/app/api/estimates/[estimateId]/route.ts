import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { api } from "@/server/errors";
import { getEstimate } from "@/server/analysis";
export async function GET(request: Request, { params }: { params: Promise<{ estimateId: string }> }) {
  return api(async () => { await requireSession(); return NextResponse.json({ estimate: await getEstimate((await params).estimateId) }); })(request);
}
