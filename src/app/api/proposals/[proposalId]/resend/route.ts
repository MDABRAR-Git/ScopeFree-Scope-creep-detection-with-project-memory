import { NextResponse } from "next/server";
import { requireResourceOwner, checkOrigin } from "@/server/auth";
import { api, readJson } from "@/server/errors";
import { resendProposal } from "@/server/proposals";
export async function POST(request: Request, { params }: { params: Promise<{ proposalId: string }> }) { return api(async () => { checkOrigin(request); await requireResourceOwner("proposal", (await params).proposalId); return NextResponse.json(await resendProposal((await params).proposalId, await readJson(request))); })(request); }
