/*
  Warnings:

  - You are about to drop the `RetentionAuditRequest` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "RetentionAuditStatus" AS ENUM ('NEW', 'DATA_UPLOADED', 'ANALYSING', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'FAILED');

-- DropTable
DROP TABLE "RetentionAuditRequest";

-- CreateTable
CREATE TABLE "retention_audit_requests" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "mrrRange" TEXT NOT NULL,
    "status" "RetentionAuditStatus" NOT NULL DEFAULT 'NEW',
    "source" TEXT NOT NULL DEFAULT 'retention-audit-landing-page',
    "uploadTokenHash" TEXT NOT NULL,
    "publicTokenHash" TEXT,
    "notes" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "analysedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_audit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_audit_datasets" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "columns" JSONB NOT NULL,
    "rows" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_audit_datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retention_audit_reports" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "healthScore" INTEGER NOT NULL,
    "totalCustomers" INTEGER NOT NULL,
    "healthyCustomers" INTEGER NOT NULL,
    "atRiskCustomers" INTEGER NOT NULL,
    "criticalCustomers" INTEGER NOT NULL,
    "totalMrrMinor" INTEGER NOT NULL,
    "revenueAtRiskMinor" INTEGER NOT NULL,
    "failedPaymentMinor" INTEGER NOT NULL,
    "deterministicData" JSONB NOT NULL,
    "narrative" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retention_audit_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "retention_audit_requests_uploadTokenHash_key" ON "retention_audit_requests"("uploadTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "retention_audit_requests_publicTokenHash_key" ON "retention_audit_requests"("publicTokenHash");

-- CreateIndex
CREATE INDEX "retention_audit_requests_email_idx" ON "retention_audit_requests"("email");

-- CreateIndex
CREATE INDEX "retention_audit_requests_status_idx" ON "retention_audit_requests"("status");

-- CreateIndex
CREATE INDEX "retention_audit_requests_createdAt_idx" ON "retention_audit_requests"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "retention_audit_datasets_auditId_key" ON "retention_audit_datasets"("auditId");

-- CreateIndex
CREATE INDEX "retention_audit_datasets_createdAt_idx" ON "retention_audit_datasets"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "retention_audit_reports_auditId_key" ON "retention_audit_reports"("auditId");

-- CreateIndex
CREATE INDEX "retention_audit_reports_healthScore_idx" ON "retention_audit_reports"("healthScore");

-- CreateIndex
CREATE INDEX "retention_audit_reports_revenueAtRiskMinor_idx" ON "retention_audit_reports"("revenueAtRiskMinor");

-- CreateIndex
CREATE INDEX "retention_audit_reports_createdAt_idx" ON "retention_audit_reports"("createdAt");

-- AddForeignKey
ALTER TABLE "retention_audit_datasets" ADD CONSTRAINT "retention_audit_datasets_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "retention_audit_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retention_audit_reports" ADD CONSTRAINT "retention_audit_reports_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "retention_audit_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
