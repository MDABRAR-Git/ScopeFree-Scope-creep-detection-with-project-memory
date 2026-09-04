import { NextResponse } from "next/server";
import { requireSession, checkOrigin } from "@/server/auth";
import { api, readJson } from "@/server/errors";
import { setRequestRate } from "@/server/client-intake";
export async function PUT(request: Request, { params }: { params: Promise<{ requestId: string }> }) { return api(async () => { checkOrigin(request); await requireSession(); return NextResponse.json({ request: await setRequestRate((await params).requestId, await readJson(request)) }); })(request); }
