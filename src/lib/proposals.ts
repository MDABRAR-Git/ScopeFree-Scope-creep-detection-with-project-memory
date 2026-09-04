import { z } from "zod";
import { classificationSchema, hoursSchema, projectIdSchema } from "./contracts";
import { agreementRevisionSchema } from "./review";
import { agreementSchema } from "./agreement";
import { calculatedSchema } from "./pricing";

export const operationInputSchema = z.strictObject({ idempotencyKey: z.uuid() });
// Normalized (trimmed, lowercased) client email. This is a delivery destination, not a verified
// client identity; the secure bearer token continues to authorize portal access.
export const clientEmailSchema = z.string().trim().max(254, "Use 254 characters or fewer.").transform(value => value.toLowerCase()).pipe(z.email("Enter a valid client email address."));
export const generateProposalInputSchema = operationInputSchema.extend({ expectedRevision: z.number().int().positive() });
export const emailProposalInputSchema = generateProposalInputSchema.extend({ clientEmail: clientEmailSchema });
export const resendProposalInputSchema = generateProposalInputSchema.extend({ confirmed: z.literal(true) });
export const proposalActionInputSchema = generateProposalInputSchema.extend({ confirmed: z.literal(true) });
export type ProposalDeliveryStatus = "NONE" | "SENDING" | "SENT" | "FAILED";
export type ProposalDelivery = { status: ProposalDeliveryStatus; clientEmail: string | null; sentAt: string | null; failedAt: string | null; attempts: number; failureCategory: string | null; failureMessage: string | null };
export const decisionInputSchema = operationInputSchema.extend({ decision: z.enum(["accept", "decline"]), confirmed: z.literal(true), comment: z.string().trim().max(500).default("") });
export const clientRequestInputSchema = operationInputSchema.extend({ text: z.string().trim().min(10).max(4000).refine(t => !t.includes("\u0000"), "Remove null characters.") });

export const publicOfferSchema = z.strictObject({
  projectName: z.string().min(1).max(120), requestNumber: z.number().int().positive(), requestText: z.string().min(10).max(4000),
  approvedRevision: z.number().int().positive(), hourlyRatePaise: z.number().int().positive().max(10000000),
  tasks: z.array(z.strictObject({
    id: z.string(), title: z.string(), classification: classificationSchema, estimatedHours: hoursSchema,
    assumptions: z.array(z.string()), evidence: z.array(z.strictObject({ sourceType: z.string(), clauseId: z.string(), quote: z.string() })),
  })).min(1).max(20),
  calculated: calculatedSchema, additionalChargeReason: z.string(), agreement: agreementSchema,
  replacesDecision: z.strictObject({ id: projectIdSchema, title: z.string(), decidedAt: z.iso.datetime() }).nullable(),
});
export const clientProposalSnapshotSchema = z.strictObject({ schemaVersion: z.literal(2), reviewed: agreementRevisionSchema, client: publicOfferSchema });
export type PublicOffer = z.infer<typeof publicOfferSchema>;
export type ClientProposalView = { offer: PublicOffer; status: "PENDING" | "ACCEPTED" | "DECLINED"; expiresAt: string; decision: { outcome: "ACCEPTED" | "DECLINED"; comment: string; decidedAt: string } | null };
