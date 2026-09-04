import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { api } from "@/server/errors";
import { getRequestHistory } from "@/server/request-history";
export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  return api(async () => { await requireSession(); return NextResponse.json({ history: await getRequestHistory((await params).projectId) }); })(request);
}
