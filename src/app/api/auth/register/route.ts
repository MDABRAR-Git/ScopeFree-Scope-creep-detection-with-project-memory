import { NextResponse } from "next/server";
import { checkOrigin, register } from "@/server/auth";
import { api, readJson } from "@/server/errors";
export const POST = api(async request => { checkOrigin(request); return NextResponse.json({ user: await register(await readJson(request)) }, { status: 201 }); });
