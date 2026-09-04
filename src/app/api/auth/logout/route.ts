import { NextResponse } from "next/server";
import { checkOrigin, logout, requireSession } from "@/server/auth";
import { api } from "@/server/errors";
export const POST = api(async request => {
  checkOrigin(request);
  await requireSession();
  await logout();
  return NextResponse.json({ ok: true });
});
