ALTER TABLE "ChangeRequest" ADD COLUMN "requestNumber" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ChangeRequest" ADD COLUMN "summary" VARCHAR(120) NOT NULL DEFAULT '';
WITH numbered AS (
  SELECT "id", row_number() OVER (PARTITION BY "projectId" ORDER BY "createdAt", "id") AS n FROM "ChangeRequest"
) UPDATE "ChangeRequest" r SET "requestNumber"=numbered.n, "summary"=left(regexp_replace(btrim(r."text"), '\s+', ' ', 'g'),120) FROM numbered WHERE numbered."id"=r."id";
CREATE UNIQUE INDEX "ChangeRequest_projectId_requestNumber_key" ON "ChangeRequest"("projectId","requestNumber");
CREATE FUNCTION number_project_request() RETURNS trigger AS $$
BEGIN
  PERFORM "id" FROM "Project" WHERE "id"=NEW."projectId" FOR UPDATE;
  SELECT COALESCE(MAX("requestNumber"),0)+1 INTO NEW."requestNumber" FROM "ChangeRequest" WHERE "projectId"=NEW."projectId";
  NEW."summary"=left(regexp_replace(btrim(NEW."text"), '\s+', ' ', 'g'),120);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER number_project_request BEFORE INSERT ON "ChangeRequest" FOR EACH ROW EXECUTE FUNCTION number_project_request();
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "positive_request_number" CHECK ("requestNumber">0);

CREATE FUNCTION protect_estimate_approval() RETURNS trigger AS $$
BEGIN
  IF NEW."approvedRevisionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "EstimateRevision" WHERE "id"=NEW."approvedRevisionId" AND "estimateId"=NEW."id" AND "revision"=NEW."currentRevision"
  ) THEN RAISE EXCEPTION 'Approval must pin the current revision of this estimate' USING ERRCODE='23514'; END IF;
  IF NEW."status" IN ('APPROVED','PROPOSED') AND NEW."approvedRevisionId" IS NULL
     OR NEW."status"='REVIEW_REQUIRED' AND NEW."approvedRevisionId" IS NOT NULL
  THEN RAISE EXCEPTION 'Approval state is inconsistent' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER protect_estimate_approval BEFORE UPDATE ON "Estimate" FOR EACH ROW EXECUTE FUNCTION protect_estimate_approval();
