import { NextResponse } from "next/server";
import { checkOrigin } from "@/server/auth";
import { api, readJson } from "@/server/errors";
import { tokenHashFromRequest } from "@/server/client-access";
import { decideProposal } from "@/server/proposals";
export async function POST(request: Request, { params }: { params: Promise<{ proposalId: string }> }) { return api(async () => { checkOrigin(request); return NextResponse.json({ decision: await decideProposal((await params).proposalId, tokenHashFromRequest(request), await readJson(request)) }); })(request); }
