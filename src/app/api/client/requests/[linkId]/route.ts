import { NextResponse } from "next/server";
import { checkOrigin } from "@/server/auth";
import { api, readJson } from "@/server/errors";
import { tokenHashFromRequest } from "@/server/client-access";
import { getClientIntake, submitClientRequest } from "@/server/client-intake";
type Context = { params: Promise<{ linkId: string }> };
export async function GET(request: Request, { params }: Context) { return api(async () => NextResponse.json(await getClientIntake((await params).linkId, tokenHashFromRequest(request))))(request); }
export async function POST(request: Request, { params }: Context) { return api(async () => { checkOrigin(request); return NextResponse.json({ receipt: await submitClientRequest((await params).linkId, tokenHashFromRequest(request), await readJson(request, 24000)) }); })(request); }
