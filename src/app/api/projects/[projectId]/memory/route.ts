import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth";
import { api } from "@/server/errors";
import { getProjectMemory, queryFromSearchParams } from "@/server/memory";

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  return api(async () => {
    await requireSession();
    const query = queryFromSearchParams(new URL(request.url).searchParams);
    return NextResponse.json({ memory: await getProjectMemory((await params).projectId, query) });
  })(request);
}
