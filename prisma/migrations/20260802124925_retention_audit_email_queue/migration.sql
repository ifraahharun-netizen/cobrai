-- CreateEnum
CREATE TYPE "RetentionAuditEmailJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "retention_audit_email_jobs" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "status" "RetentionAuditEmailJobStatus" NOT NULL DEFAULT 'PENDING',
    "tokenCiphertext" TEXT NOT NULL,
    "tokenIv" TEXT NOT NULL,
    "tokenAuthTag" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_audit_email_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_audit_rate_limits" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_audit_rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "retention_audit_email_jobs_status_nextAttemptAt_idx" ON "retention_audit_email_jobs"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "retention_audit_email_jobs_auditId_idx" ON "retention_audit_email_jobs"("auditId");

-- CreateIndex
CREATE INDEX "retention_audit_email_jobs_lockedAt_idx" ON "retention_audit_email_jobs"("lockedAt");

-- CreateIndex
CREATE INDEX "retention_audit_rate_limits_expiresAt_idx" ON "retention_audit_rate_limits"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "retention_audit_rate_limits_key_windowStart_key" ON "retention_audit_rate_limits"("key", "windowStart");

-- AddForeignKey
ALTER TABLE "retention_audit_email_jobs" ADD CONSTRAINT "retention_audit_email_jobs_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "retention_audit_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
