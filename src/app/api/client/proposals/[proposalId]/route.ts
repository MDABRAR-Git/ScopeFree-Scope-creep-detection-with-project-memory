import { NextResponse } from "next/server";
import { api } from "@/server/errors";
import { tokenHashFromRequest } from "@/server/client-access";
import { getClientProposal } from "@/server/proposals";
export async function GET(request: Request, { params }: { params: Promise<{ proposalId: string }> }) { return api(async () => NextResponse.json(await getClientProposal((await params).proposalId, tokenHashFromRequest(request))))(request); }
