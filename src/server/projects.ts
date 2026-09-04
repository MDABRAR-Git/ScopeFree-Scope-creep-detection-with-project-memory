import "server-only";
import { projectIdSchema, projectInputSchema } from "@/lib/contracts";
import { database, db } from "./db";
import { AppError } from "./errors";

const select = { id: true, name: true, scopeRevision: true, createdAt: true } as const;
export async function listProjects(ownerId: string) {
  const projects = await database(() => db().project.findMany({ where: { ownerId }, select: { ...select, baseline: { select: { id: true } }, _count: { select: { requests: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }));
  return projects.map(({ baseline, _count, ...project }) => ({ ...project, baselineConfirmed: !!baseline, requestCount: _count.requests }));
}
export async function createProject(input: unknown, ownerId: string) {
  const data = projectInputSchema.parse(input);
  return database(() => db().$transaction(async tx => {
    const project = await tx.project.create({ data: { ...data, ownerId }, select });
    await tx.auditEvent.create({ data: { projectId: project.id, entityType: "project", entityId: project.id, action: "created", actorType: "freelancer", metadataJson: { schemaVersion: 1 } } });
    return project;
  }));
}
export async function getProject(id: string, ownerId?: string) {
  if (!projectIdSchema.safeParse(id).success) throw new AppError("NOT_FOUND", "Project not found.", 404);
  const effectiveOwnerId = ownerId ?? (await (await import("./auth")).requireSession()).userId;
  const project = await database(() => db().project.findFirst({ where: { id, ownerId: effectiveOwnerId }, select }));
  if (!project) throw new AppError("NOT_FOUND", "Project not found.", 404);
  return project;
}
