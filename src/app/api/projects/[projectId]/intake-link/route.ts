import { NextResponse } from "next/server";
import { requireSession, checkOrigin } from "@/server/auth";
import { api, readJson } from "@/server/errors";
import { getIntakeLink, manageIntakeLink } from "@/server/client-intake";
type Context = { params: Promise<{ projectId: string }> };
export async function GET(request: Request, { params }: Context) { return api(async () => { await requireSession(); return NextResponse.json({ intake: await getIntakeLink((await params).projectId) }); })(request); }
export async function POST(request: Request, { params }: Context) { return api(async () => { checkOrigin(request); await requireSession(); return NextResponse.json(await manageIntakeLink((await params).projectId, "create", await readJson(request))); })(request); }
export async function DELETE(request: Request, { params }: Context) { return api(async () => { checkOrigin(request); await requireSession(); return NextResponse.json(await manageIntakeLink((await params).projectId, "revoke", await readJson(request))); })(request); }
