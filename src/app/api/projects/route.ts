import { NextResponse } from "next/server";
import { checkOrigin, requireSession } from "@/server/auth";
import { api, readJson } from "@/server/errors";
import { createProject, listProjects } from "@/server/projects";
export const GET = api(async () => { await requireSession(); return NextResponse.json({ projects: await listProjects() }); });
export const POST = api(async request => {
  await requireSession();
  checkOrigin(request);
  return NextResponse.json({ project: await createProject(await readJson(request)) }, { status: 201 });
});
