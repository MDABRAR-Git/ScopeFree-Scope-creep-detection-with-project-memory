import { NextResponse } from "next/server";
import { requireSession, checkOrigin } from "@/server/auth";
import { api, readJson } from "@/server/errors";
import { manageProposal } from "@/server/proposals";
export async function POST(request: Request, { params }: { params: Promise<{ proposalId: string }> }) { return api(async () => { checkOrigin(request); await requireSession(); return NextResponse.json(await manageProposal((await params).proposalId, "revise", await readJson(request))); })(request); }
