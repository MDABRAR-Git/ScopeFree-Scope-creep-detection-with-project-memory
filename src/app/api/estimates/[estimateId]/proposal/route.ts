import { NextResponse } from "next/server";
import { requireResourceOwner, checkOrigin } from "@/server/auth";
import { api, readJson } from "@/server/errors";
import { emailProposal } from "@/server/proposals";
export async function POST(request: Request, { params }: { params: Promise<{ estimateId: string }> }) { return api(async () => { checkOrigin(request); await requireResourceOwner("estimate", (await params).estimateId); return NextResponse.json(await emailProposal((await params).estimateId, await readJson(request))); })(request); }
