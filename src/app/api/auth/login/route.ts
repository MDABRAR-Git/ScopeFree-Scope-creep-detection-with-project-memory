import { NextResponse } from "next/server";
import { checkOrigin, login } from "@/server/auth";
import { api, readJson } from "@/server/errors";
export const POST = api(async request => {
  checkOrigin(request);
  return NextResponse.json({ user: await login(await readJson(request)) });
});
