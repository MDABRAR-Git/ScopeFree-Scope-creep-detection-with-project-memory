import "server-only";
import { createHash } from "node:crypto";
import { baselineInputSchema, baselineSnapshotSchema, requestInputSchema } from "@/lib/intake";
import { db, database } from "./db";
import { getProject } from "./projects";
import { AppError } from "./errors";

export async function getBaseline(projectId: string) {
  await getProject(projectId);
  const baseline = await database(() => db().baseline.findUnique({ where: { projectId } }));
  if (!baseline) return null;
  const snapshot = baselineSnapshotSchema.safeParse(baseline.clausesJson);
  if (!snapshot.success) throw new AppError("BASELINE_INVALID", "The stored baseline needs operator attention. It cannot be silently replaced.", 422);
  return { id: baseline.id, projectId: baseline.projectId, text: baseline.text, snapshot: snapshot.data, contentHash: baseline.contentHash, confirmedAt: baseline.confirmedAt.toISOString(), confirmedBy: baseline.confirmedBy };
}
export type SavedBaseline = NonNullable<Awaited<ReturnType<typeof getBaseline>>>;

export async function confirmBaseline(projectId: string, input: unknown) {
  await getProject(projectId);
  const parsed = baselineInputSchema.safeParse(input);
  if (!parsed.success) throw new AppError("BASELINE_INVALID", parsed.error.issues[0]?.message ?? "Review the baseline text and clauses.", 422);
  const { text, snapshot } = parsed.data;
  // Hash the text AND clause boundaries/IDs: these are the future evidence identifiers.
  const contentHash = createHash("sha256").update(JSON.stringify({ text, snapshot })).digest("hex");
  await database(() => db().$transaction(async tx => {
    // Serialize competing baseline confirmations and intake against this project's scope authority.
    await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId}::uuid FOR UPDATE`;
    if (await tx.baseline.findUnique({ where: { projectId }, select: { id: true } })) throw new AppError("BASELINE_ALREADY_CONFIRMED", "This project already has an original baseline. Open the saved baseline; corrections require a new project.", 409);
    const baseline = await tx.baseline.create({ data: { projectId, text, clausesJson: snapshot, contentHash, confirmedAt: new Date(), confirmedBy: "freelancer" } });
    await tx.auditEvent.create({ data: { projectId, entityType: "baseline", entityId: baseline.id, action: "confirmed", actorType: "freelancer", metadataJson: { schemaVersion: 1, contentHash, clauseCount: snapshot.clauses.length } } });
  }));
  return getBaseline(projectId);
}

const requestSelect = { id: true, projectId: true, text: true, hourlyRatePaise: true, basedOnScopeRevision: true, createdAt: true } as const;
export async function listRequests(projectId: string) {
  await getProject(projectId);
  const requests = await database(() => db().changeRequest.findMany({ where: { projectId }, select: requestSelect, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }));
  return requests.map(request => ({ ...request, createdAt: request.createdAt.toISOString() }));
}
export type SavedRequest = Awaited<ReturnType<typeof listRequests>>[number];
export async function saveRequest(projectId: string, input: unknown) {
  await getProject(projectId);
  const data = requestInputSchema.parse(input);
  return database(() => db().$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${projectId}::uuid FOR UPDATE`;
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
    const baseline = await tx.baseline.findUnique({ where: { projectId } });
    if (!baseline) throw new AppError("BASELINE_REQUIRED", "Confirm this project's original baseline before saving a request.", 422);
    if (!baselineSnapshotSchema.safeParse(baseline.clausesJson).success) throw new AppError("BASELINE_INVALID", "The stored baseline needs operator attention before request intake.", 422);
    const request = await tx.changeRequest.create({ data: { ...data, projectId, basedOnScopeRevision: project.scopeRevision }, select: requestSelect });
    await tx.auditEvent.create({ data: { projectId, entityType: "request", entityId: request.id, action: "submitted", actorType: "freelancer", metadataJson: { schemaVersion: 1, basedOnScopeRevision: project.scopeRevision } } });
    return { ...request, createdAt: request.createdAt.toISOString() };
  }));
}
