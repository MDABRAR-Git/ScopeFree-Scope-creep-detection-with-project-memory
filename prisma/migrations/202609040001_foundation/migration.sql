-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('REVIEW_REQUIRED', 'APPROVED', 'PROPOSED');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED');

-- CreateEnum
CREATE TYPE "DecisionOutcome" AS ENUM ('ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "scopeRevision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Baseline" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "clausesJson" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3) NOT NULL,
    "confirmedBy" TEXT NOT NULL,

    CONSTRAINT "Baseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "basedOnScopeRevision" INTEGER NOT NULL,
    "supersedesDecisionId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estimate" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "originalAiJson" JSONB NOT NULL,
    "originalInputJson" JSONB NOT NULL,
    "originalCalculatedJson" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "currentRevision" INTEGER NOT NULL,
    "status" "EstimateStatus" NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "approvedRevisionId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateRevision" (
    "id" UUID NOT NULL,
    "estimateId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "editReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstimateRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "estimateId" UUID NOT NULL,
    "approvedRevisionId" UUID NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "basedOnScopeRevision" INTEGER NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "decidedAt" TIMESTAMPTZ(3),
    "decisionComment" VARCHAR(500),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDecision" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "outcome" "DecisionOutcome" NOT NULL,
    "title" TEXT NOT NULL,
    "tagsJson" JSONB NOT NULL,
    "finalDecisionText" TEXT NOT NULL,
    "sourceReferencesJson" JSONB NOT NULL,
    "approvedSnapshotJson" JSONB NOT NULL,
    "amendmentClausesJson" JSONB NOT NULL,
    "supersedesDecisionId" UUID,
    "scopeRevisionAfter" INTEGER NOT NULL,
    "decidedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProjectDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "revisionId" UUID,
    "metadataJson" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceSession" (
    "id" UUID NOT NULL,
    "credentialVersion" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginThrottle" (
    "id" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Baseline_projectId_key" ON "Baseline"("projectId");

-- CreateIndex
CREATE INDEX "ChangeRequest_projectId_createdAt_idx" ON "ChangeRequest"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_requestId_key" ON "Estimate"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_approvedRevisionId_key" ON "Estimate"("approvedRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "EstimateRevision_estimateId_revision_key" ON "EstimateRevision"("estimateId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_estimateId_key" ON "Proposal"("estimateId");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_tokenHash_key" ON "Proposal"("tokenHash");

-- CreateIndex
CREATE INDEX "Proposal_projectId_createdAt_idx" ON "Proposal"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectDecision_proposalId_key" ON "ProjectDecision"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectDecision_supersedesDecisionId_key" ON "ProjectDecision"("supersedesDecisionId");

-- CreateIndex
CREATE INDEX "ProjectDecision_projectId_decidedAt_idx" ON "ProjectDecision"("projectId", "decidedAt");

-- CreateIndex
CREATE INDEX "AuditEvent_projectId_createdAt_idx" ON "AuditEvent"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkspaceSession_expiresAt_idx" ON "WorkspaceSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "Baseline" ADD CONSTRAINT "Baseline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_supersedesDecisionId_fkey" FOREIGN KEY ("supersedesDecisionId") REFERENCES "ProjectDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ChangeRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_approvedRevisionId_fkey" FOREIGN KEY ("approvedRevisionId") REFERENCES "EstimateRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateRevision" ADD CONSTRAINT "EstimateRevision_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_approvedRevisionId_fkey" FOREIGN KEY ("approvedRevisionId") REFERENCES "EstimateRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDecision" ADD CONSTRAINT "ProjectDecision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDecision" ADD CONSTRAINT "ProjectDecision_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDecision" ADD CONSTRAINT "ProjectDecision_supersedesDecisionId_fkey" FOREIGN KEY ("supersedesDecisionId") REFERENCES "ProjectDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "EstimateRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
