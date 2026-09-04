import { NextResponse } from "next/server";
import { checkOrigin, requireSession } from "@/server/auth";
import { api, AppError } from "@/server/errors";
import { getBaseline } from "@/server/intake";
import { extractDocument, readUpload } from "@/server/extraction";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  return api(async () => {
    await requireSession(); checkOrigin(request);
    if (await getBaseline((await context.params).projectId)) throw new AppError("BASELINE_ALREADY_CONFIRMED", "The original baseline is already confirmed. View it in the Baseline tab.", 409);
    return NextResponse.json(await extractDocument(await readUpload(request), request.signal));
  })(request);
}
