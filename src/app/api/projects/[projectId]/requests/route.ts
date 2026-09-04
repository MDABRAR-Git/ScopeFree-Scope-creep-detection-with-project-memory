import { NextResponse } from "next/server";
import { checkOrigin, requireSession } from "@/server/auth";
import { api, readJson } from "@/server/errors";
import { listRequests, saveRequest } from "@/server/intake";
type Context = { params: Promise<{ projectId: string }> };
export async function GET(request: Request, context: Context) {
  return api(async () => { await requireSession(); return NextResponse.json({ requests: await listRequests((await context.params).projectId) }); })(request);
}
export async function POST(request: Request, context: Context) {
  return api(async () => {
    await requireSession(); checkOrigin(request);
    return NextResponse.json({ request: await saveRequest((await context.params).projectId, await readJson(request, 32_000)) }, { status: 201 });
  })(request);
}
