ALTER TABLE "ChangeRequest" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'freelancer';
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "request_origin" CHECK ("origin" IN ('freelancer','client'));
DROP INDEX "Proposal_estimateId_key";
ALTER TABLE "Proposal" ADD COLUMN "replacesProposalId" UUID REFERENCES "Proposal"("id") ON DELETE RESTRICT;
CREATE UNIQUE INDEX "Proposal_replacesProposalId_key" ON "Proposal"("replacesProposalId");
CREATE INDEX "Proposal_estimateId_createdAt_idx" ON "Proposal"("estimateId","createdAt");
CREATE UNIQUE INDEX "one_pending_offer" ON "Proposal"("estimateId") WHERE "status"='PENDING';
ALTER TABLE "Estimate" ADD COLUMN "currentProposalId" UUID REFERENCES "Proposal"("id") ON DELETE RESTRICT;
CREATE UNIQUE INDEX "Estimate_currentProposalId_key" ON "Estimate"("currentProposalId");
UPDATE "Estimate" e SET "currentProposalId"=p."id" FROM "Proposal" p WHERE p."estimateId"=e."id";

CREATE TABLE "ClientIntakeLink" (
  "id" UUID PRIMARY KEY, "projectId" UUID NOT NULL REFERENCES "Project"("id") ON DELETE RESTRICT,
  "tokenHash" TEXT NOT NULL UNIQUE, "expiresAt" TIMESTAMPTZ(3) NOT NULL, "revokedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(), "attempts" INTEGER NOT NULL DEFAULT 0,
  "windowStart" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW()
);
CREATE INDEX "ClientIntakeLink_projectId_createdAt_idx" ON "ClientIntakeLink"("projectId","createdAt");
CREATE UNIQUE INDEX "one_active_intake_link" ON "ClientIntakeLink"("projectId") WHERE "revokedAt" IS NULL;
CREATE TABLE "OperationReceipt" (
  "scope" TEXT NOT NULL, "key" UUID NOT NULL, "bodyHash" TEXT NOT NULL, "resultJson" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(), PRIMARY KEY ("scope","key")
);

CREATE FUNCTION protect_offer() RETURNS trigger AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Offers cannot be deleted' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD."status" IN ('ACCEPTED','DECLINED','REVOKED') AND NEW IS DISTINCT FROM OLD
      THEN RAISE EXCEPTION 'Finalized offers are immutable' USING ERRCODE='23514'; END IF;
    IF ROW(NEW."id",NEW."projectId",NEW."estimateId",NEW."approvedRevisionId",NEW."snapshotJson",NEW."basedOnScopeRevision",NEW."createdAt",NEW."replacesProposalId")
      IS DISTINCT FROM ROW(OLD."id",OLD."projectId",OLD."estimateId",OLD."approvedRevisionId",OLD."snapshotJson",OLD."basedOnScopeRevision",OLD."createdAt",OLD."replacesProposalId")
      THEN RAISE EXCEPTION 'Offer content is immutable' USING ERRCODE='23514'; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Estimate" e JOIN "ChangeRequest" r ON r."id"=e."requestId" JOIN "EstimateRevision" v ON v."estimateId"=e."id" WHERE e."id"=NEW."estimateId" AND r."projectId"=NEW."projectId" AND v."id"=NEW."approvedRevisionId")
    THEN RAISE EXCEPTION 'Offer ownership is inconsistent' USING ERRCODE='23514'; END IF;
  IF NEW."replacesProposalId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Proposal" WHERE "id"=NEW."replacesProposalId" AND "estimateId"=NEW."estimateId" AND "status"='REVOKED')
    THEN RAISE EXCEPTION 'Only a revoked offer of this estimate can be replaced' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER protect_offer BEFORE INSERT OR UPDATE OR DELETE ON "Proposal" FOR EACH ROW EXECUTE FUNCTION protect_offer();

CREATE FUNCTION protect_current_offer() RETURNS trigger AS $$
BEGIN
  IF NEW."currentProposalId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Proposal" WHERE "id"=NEW."currentProposalId" AND "estimateId"=NEW."id")
    THEN RAISE EXCEPTION 'Current offer must belong to this estimate' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER protect_current_offer BEFORE INSERT OR UPDATE ON "Estimate" FOR EACH ROW EXECUTE FUNCTION protect_current_offer();

CREATE FUNCTION protect_project_decision() RETURNS trigger AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Final decisions are immutable' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM "Proposal" WHERE "id"=NEW."proposalId" AND "projectId"=NEW."projectId")
    THEN RAISE EXCEPTION 'Decision ownership is inconsistent' USING ERRCODE='23514'; END IF;
  IF NEW."supersedesDecisionId" IS NOT NULL AND (NEW."outcome" <> 'ACCEPTED' OR NOT EXISTS (SELECT 1 FROM "ProjectDecision" WHERE "id"=NEW."supersedesDecisionId" AND "projectId"=NEW."projectId" AND "outcome"='ACCEPTED'))
    THEN RAISE EXCEPTION 'Only an accepted decision can replace an accepted decision in the same project' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER protect_project_decision BEFORE INSERT OR UPDATE OR DELETE ON "ProjectDecision" FOR EACH ROW EXECUTE FUNCTION protect_project_decision();
