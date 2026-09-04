-- Proposal email delivery amendment (supersedes manual copy-link sharing).
-- Forward-only: existing proposals keep clientEmail NULL and deliveryStatus NONE and remain readable.
CREATE TYPE "ProposalDeliveryStatus" AS ENUM ('NONE', 'SENDING', 'SENT', 'FAILED');

ALTER TABLE "Proposal" ADD COLUMN "clientEmail" VARCHAR(254);
ALTER TABLE "Proposal" ADD COLUMN "deliveryStatus" "ProposalDeliveryStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Proposal" ADD COLUMN "deliverySentAt" TIMESTAMPTZ(3);
ALTER TABLE "Proposal" ADD COLUMN "deliveryFailedAt" TIMESTAMPTZ(3);
ALTER TABLE "Proposal" ADD COLUMN "deliveryAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Proposal" ADD COLUMN "deliveryFailureCategory" VARCHAR(64);
ALTER TABLE "Proposal" ADD COLUMN "deliveryFailureMessage" VARCHAR(300);
ALTER TABLE "Proposal" ADD COLUMN "deliveryProviderMessageId" VARCHAR(200);

-- The email must be a normalized (lowercased, trimmed) address when present.
ALTER TABLE "Proposal" ADD CONSTRAINT "proposal_client_email_normalized"
  CHECK ("clientEmail" IS NULL OR "clientEmail" = LOWER(BTRIM("clientEmail")));

-- Extend the immutable-content guard so the emailed destination cannot be silently changed
-- after a proposal exists, while the mutable delivery-status columns above stay writable
-- (only for a still-pending offer, per the existing finalized-offer lock).
CREATE OR REPLACE FUNCTION protect_offer() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Offers cannot be deleted' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD."status" IN ('ACCEPTED','DECLINED','REVOKED') AND NEW IS DISTINCT FROM OLD
      THEN RAISE EXCEPTION 'Finalized offers are immutable' USING ERRCODE='23514'; END IF;
    IF ROW(NEW."id",NEW."projectId",NEW."estimateId",NEW."approvedRevisionId",NEW."snapshotJson",NEW."basedOnScopeRevision",NEW."createdAt",NEW."replacesProposalId",NEW."clientEmail")
      IS DISTINCT FROM ROW(OLD."id",OLD."projectId",OLD."estimateId",OLD."approvedRevisionId",OLD."snapshotJson",OLD."basedOnScopeRevision",OLD."createdAt",OLD."replacesProposalId",OLD."clientEmail")
      THEN RAISE EXCEPTION 'Offer content is immutable' USING ERRCODE='23514'; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Estimate" e JOIN "ChangeRequest" r ON r."id"=e."requestId" JOIN "EstimateRevision" v ON v."estimateId"=e."id" WHERE e."id"=NEW."estimateId" AND r."projectId"=NEW."projectId" AND v."id"=NEW."approvedRevisionId")
    THEN RAISE EXCEPTION 'Offer ownership is inconsistent' USING ERRCODE='23514'; END IF;
  IF NEW."replacesProposalId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Proposal" WHERE "id"=NEW."replacesProposalId" AND "estimateId"=NEW."estimateId" AND "status"='REVOKED')
    THEN RAISE EXCEPTION 'Only a revoked offer of this estimate can be replaced' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
