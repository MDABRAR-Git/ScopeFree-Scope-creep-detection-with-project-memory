import { NextResponse } from "next/server";
import { requireSession, checkOrigin } from "@/server/auth";
import { api, readJson } from "@/server/errors";
import { generateProposal } from "@/server/proposals";
export async function POST(request: Request, { params }: { params: Promise<{ estimateId: string }> }) { return api(async () => { checkOrigin(request); await requireSession(); return NextResponse.json(await generateProposal((await params).estimateId, await readJson(request))); })(request); }
