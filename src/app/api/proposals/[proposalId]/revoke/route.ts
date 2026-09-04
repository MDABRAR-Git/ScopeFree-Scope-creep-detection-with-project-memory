import { NextResponse } from "next/server";
import { requireResourceOwner, checkOrigin } from "@/server/auth";
import { api, readJson } from "@/server/errors";
import { manageProposal } from "@/server/proposals";
export async function POST(request: Request, { params }: { params: Promise<{ proposalId: string }> }) { return api(async () => { checkOrigin(request); await requireResourceOwner("proposal", (await params).proposalId); return NextResponse.json(await manageProposal((await params).proposalId, "revoke", await readJson(request))); })(request); }
