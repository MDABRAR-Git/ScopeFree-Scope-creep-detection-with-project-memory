import { NextResponse } from "next/server";
import { checkOrigin, requireSession } from "@/server/auth";
import { api, readJson } from "@/server/errors";
import { confirmBaseline, getBaseline } from "@/server/intake";
type Context = { params: Promise<{ projectId: string }> };
export async function GET(request: Request, context: Context) {
  return api(async () => {
    await requireSession();
    return NextResponse.json({ baseline: await getBaseline((await context.params).projectId) });
  })(request);
}
export async function POST(request: Request, context: Context) {
  return api(async () => {
    await requireSession(); checkOrigin(request);
    const baseline = await confirmBaseline((await context.params).projectId, await readJson(request, 200_000));
    return NextResponse.json({ baseline }, { status: 201 });
  })(request);
}
