import { NextResponse } from "next/server";
import { loginInputSchema } from "@/lib/contracts";
import { checkOrigin, login } from "@/server/auth";
import { api, readJson } from "@/server/errors";
export const POST = api(async request => {
  checkOrigin(request);
  const { password } = loginInputSchema.parse(await readJson(request));
  await login(password);
  return NextResponse.json({ ok: true });
});
