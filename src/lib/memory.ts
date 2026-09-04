import { z } from "zod";
import { projectIdSchema, scenarioAmountsSchema } from "./contracts";
import { scenarios } from "./pricing";
import type { readRevision } from "./review";

export const memoryStatusSchema = z.enum(["ALL", "PENDING", "ACCEPTED", "DECLINED", "SUPERSEDED"]);
export const memoryQuerySchema = z.strictObject({
  q: z.string().trim().max(200, "Search must be 200 characters or fewer.").default(""),
  status: memoryStatusSchema.default("ALL"),
});
export type MemoryQuery = z.infer<typeof memoryQuerySchema>;
export type MemoryStatus = z.infer<typeof memoryStatusSchema>;
export type PendingAvailability = "ACTIVE" | "EXPIRED" | "STALE";

export const memoryRowSchema = z.strictObject({
  id: projectIdSchema,
  kind: z.enum(["DECISION", "PENDING_OFFER"]),
  status: memoryStatusSchema.exclude(["ALL"]),
  availability: z.enum(["ACTIVE", "EXPIRED", "STALE"]).nullable(),
  requestId: projectIdSchema,
  estimateId: projectIdSchema,
  requestNumber: z.number().int().positive(),
  requestText: z.string(),
  title: z.string(),
  occurredAt: z.iso.datetime(),
  changesScope: z.boolean(),
  clientCommentPresent: z.boolean(),
  approvedRevision: z.number().int().positive(),
  totalChargePaise: scenarioAmountsSchema,
  supersedesDecisionId: projectIdSchema.nullable(),
  supersededByDecisionId: projectIdSchema.nullable(),
});
export type MemoryRow = z.infer<typeof memoryRowSchema>;

export function normalizeMemorySearch(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}
export function deriveDecisionStatus(outcome: "ACCEPTED" | "DECLINED", acceptedReplacement: boolean): Exclude<MemoryStatus, "ALL" | "PENDING"> {
  if (outcome === "DECLINED") return "DECLINED";
  return acceptedReplacement ? "SUPERSEDED" : "ACCEPTED";
}
export function pendingAvailability(input: { expiresAt: Date; basedOnScopeRevision: number; projectScopeRevision: number; approvedRevisionId: string; currentApprovedRevisionId: string | null }, now = new Date()): PendingAvailability {
  if (input.expiresAt <= now) return "EXPIRED";
  if (input.basedOnScopeRevision !== input.projectScopeRevision || input.approvedRevisionId !== input.currentApprovedRevisionId) return "STALE";
  return "ACTIVE";
}
export function sortMemoryRows<T extends Pick<MemoryRow, "occurredAt" | "id">>(rows: T[]) {
  return rows.toSorted((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id));
}
export function matchesMemorySearch(searchText: string, query: string) {
  const normalized = normalizeMemorySearch(query);
  return !normalized || normalizeMemorySearch(searchText).includes(normalized);
}

type Revision = ReturnType<typeof readRevision>;
export type RevisionComparison = {
  tasks: { id: string; kind: "ADDED" | "REMOVED" | "CHANGED"; title: string; fields: string[] }[];
  hourlyRatePaise: { before: number; after: number; delta: number };
  additionalChargePaise: { before: number; after: number; delta: number };
  totalChargePaise: Record<(typeof scenarios)[number], { before: number; after: number; delta: number }>;
};
export function compareRevisions(before: Revision, after: Revision): RevisionComparison {
  const prior = new Map(before.analysis.tasks.map(task => [task.id, task]));
  const next = new Map(after.analysis.tasks.map(task => [task.id, task]));
  const tasks: RevisionComparison["tasks"] = [];
  for (const task of before.analysis.tasks) if (!next.has(task.id)) tasks.push({ id: task.id, kind: "REMOVED", title: task.title, fields: [] });
  for (const task of after.analysis.tasks) {
    const old = prior.get(task.id);
    if (!old) tasks.push({ id: task.id, kind: "ADDED", title: task.title, fields: [] });
    else {
      const fields: string[] = [];
      if (old.title !== task.title) fields.push("title");
      if (old.classification !== task.classification) fields.push("classification");
      if (JSON.stringify(old.estimatedHours) !== JSON.stringify(task.estimatedHours)) fields.push("hours");
      if (JSON.stringify(old.assumptions) !== JSON.stringify(task.assumptions)) fields.push("assumptions");
      if (fields.length) tasks.push({ id: task.id, kind: "CHANGED", title: task.title, fields });
    }
  }
  const amount = (beforeValue: number, afterValue: number) => ({ before: beforeValue, after: afterValue, delta: afterValue - beforeValue });
  return {
    tasks,
    hourlyRatePaise: amount(before.hourlyRatePaise, after.hourlyRatePaise),
    additionalChargePaise: amount(before.additionalChargePaise, after.additionalChargePaise),
    totalChargePaise: Object.fromEntries(scenarios.map(s => [s, amount(before.calculated.totalChargePaise[s], after.calculated.totalChargePaise[s])])) as RevisionComparison["totalChargePaise"],
  };
}
