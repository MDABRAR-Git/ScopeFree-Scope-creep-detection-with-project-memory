CREATE TABLE "User" (
  "id" UUID PRIMARY KEY,
  "email" VARCHAR(254) NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "normalized_user_email" CHECK ("email" = LOWER(BTRIM("email")))
);

ALTER TABLE "Project" ADD COLUMN "ownerId" UUID REFERENCES "User"("id") ON DELETE RESTRICT;
CREATE INDEX "Project_ownerId_createdAt_idx" ON "Project"("ownerId", "createdAt");

-- Old shared-password sessions have no account identity and cannot remain valid.
DELETE FROM "WorkspaceSession";
ALTER TABLE "WorkspaceSession" ADD COLUMN "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE;
CREATE INDEX "WorkspaceSession_userId_expiresAt_idx" ON "WorkspaceSession"("userId", "expiresAt");

CREATE FUNCTION protect_project_owner() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW."ownerId" IS NULL THEN
    RAISE EXCEPTION 'New projects require an owner' USING ERRCODE='23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."ownerId" IS NOT NULL AND NEW."ownerId" IS DISTINCT FROM OLD."ownerId" THEN
    RAISE EXCEPTION 'Project ownership is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER protect_project_owner BEFORE INSERT OR UPDATE ON "Project" FOR EACH ROW EXECUTE FUNCTION protect_project_owner();
