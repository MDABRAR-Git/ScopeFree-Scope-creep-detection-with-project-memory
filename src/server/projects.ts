import "server-only";
import { projectIdSchema, projectInputSchema } from "@/lib/contracts";
import { database, db } from "./db";
import { AppError } from "./errors";

const select = { id: true, name: true, scopeRevision: true, createdAt: true } as const;
export async function listProjects() { return database(() => db().project.findMany({ select, orderBy: [{ createdAt: "desc" }, { id: "asc" }] })); }
export async function createProject(input: unknown) {
  const data = projectInputSchema.parse(input);
  return database(() => db().$transaction(async tx => {
    const project = await tx.project.create({ data, select });
    await tx.auditEvent.create({ data: { projectId: project.id, entityType: "project", entityId: project.id, action: "created", actorType: "freelancer", metadataJson: { schemaVersion: 1 } } });
    return project;
  }));
}
export async function getProject(id: string) {
  if (!projectIdSchema.safeParse(id).success) throw new AppError("NOT_FOUND", "Project not found.", 404);
  const project = await database(() => db().project.findUnique({ where: { id }, select }));
  if (!project) throw new AppError("NOT_FOUND", "Project not found.", 404);
  return project;
}
