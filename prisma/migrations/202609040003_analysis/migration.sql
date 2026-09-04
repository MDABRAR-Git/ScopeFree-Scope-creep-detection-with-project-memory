ALTER TABLE "Estimate" ALTER COLUMN "originalCalculatedJson" DROP NOT NULL;
CREATE TABLE "AnalysisJob" (
  "requestId" UUID PRIMARY KEY REFERENCES "ChangeRequest"("id") ON DELETE RESTRICT,
  "leaseId" UUID NOT NULL UNIQUE,
  "idempotencyKey" UUID NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE TABLE "AnalysisThrottle" (
  "sessionId" UUID PRIMARY KEY,
  "attempts" INTEGER NOT NULL,
  "windowStart" TIMESTAMPTZ(3) NOT NULL
);
CREATE FUNCTION protect_estimate_original() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Original estimates cannot be deleted' USING ERRCODE = '23514'; END IF;
  IF NEW."requestId" IS DISTINCT FROM OLD."requestId"
     OR NEW."originalAiJson" IS DISTINCT FROM OLD."originalAiJson"
     OR NEW."originalInputJson" IS DISTINCT FROM OLD."originalInputJson"
     OR NEW."provider" IS DISTINCT FROM OLD."provider"
     OR NEW."model" IS DISTINCT FROM OLD."model"
     OR NEW."promptVersion" IS DISTINCT FROM OLD."promptVersion"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
     OR (OLD."originalCalculatedJson" IS NOT NULL AND NEW."originalCalculatedJson" IS DISTINCT FROM OLD."originalCalculatedJson")
  THEN RAISE EXCEPTION 'Original estimate fields are immutable' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER protect_estimate_original BEFORE UPDATE OR DELETE ON "Estimate" FOR EACH ROW EXECUTE FUNCTION protect_estimate_original();
CREATE FUNCTION protect_estimate_revision() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Saved estimate revisions are immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER protect_estimate_revision BEFORE UPDATE OR DELETE ON "EstimateRevision" FOR EACH ROW EXECUTE FUNCTION protect_estimate_revision();
