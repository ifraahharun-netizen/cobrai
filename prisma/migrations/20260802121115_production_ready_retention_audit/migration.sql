-- CreateEnum
CREATE TYPE "RetentionAuditEmailStatus" AS ENUM ('NOT_SENT', 'PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "RetentionAuditReviewAction" AS ENUM ('APPROVED', 'REJECTED', 'APPROVAL_EMAIL_SENT', 'APPROVAL_EMAIL_FAILED', 'APPROVAL_EMAIL_RESENT', 'PUBLIC_LINK_REVOKED');

-- AlterTable
ALTER TABLE "retention_audit_requests" ADD COLUMN     "approvalEmailAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "approvalEmailError" TEXT,
ADD COLUMN     "approvalEmailSentAt" TIMESTAMP(3),
ADD COLUMN     "approvalEmailStatus" "RetentionAuditEmailStatus" NOT NULL DEFAULT 'NOT_SENT',
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "locale" TEXT,
ADD COLUMN     "publicReportViewedAt" TIMESTAMP(3),
ADD COLUMN     "publicTokenCreatedAt" TIMESTAMP(3),
ADD COLUMN     "publicTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN     "publicTokenRevokedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedBy" TEXT,
ADD COLUMN     "timeZone" TEXT;

-- CreateTable
CREATE TABLE "retention_audit_review_events" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "action" "RetentionAuditReviewAction" NOT NULL,
    "reviewerId" TEXT,
    "previousStatus" "RetentionAuditStatus",
    "newStatus" "RetentionAuditStatus",
    "note" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retention_audit_review_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "retention_audit_review_events_auditId_createdAt_idx" ON "retention_audit_review_events"("auditId", "createdAt");

-- CreateIndex
CREATE INDEX "retention_audit_review_events_action_createdAt_idx" ON "retention_audit_review_events"("action", "createdAt");

-- CreateIndex
CREATE INDEX "retention_audit_review_events_reviewerId_idx" ON "retention_audit_review_events"("reviewerId");

-- CreateIndex
CREATE INDEX "retention_audit_requests_approvalEmailStatus_idx" ON "retention_audit_requests"("approvalEmailStatus");

-- CreateIndex
CREATE INDEX "retention_audit_requests_publicTokenExpiresAt_idx" ON "retention_audit_requests"("publicTokenExpiresAt");

-- AddForeignKey
ALTER TABLE "retention_audit_review_events" ADD CONSTRAINT "retention_audit_review_events_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "retention_audit_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
