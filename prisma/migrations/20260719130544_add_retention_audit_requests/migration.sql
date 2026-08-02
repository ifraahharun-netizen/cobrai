-- CreateTable
CREATE TABLE "RetentionAuditRequest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "mrrRange" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "source" TEXT,
    "notes" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionAuditRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetentionAuditRequest_email_idx" ON "RetentionAuditRequest"("email");

-- CreateIndex
CREATE INDEX "RetentionAuditRequest_status_idx" ON "RetentionAuditRequest"("status");

-- CreateIndex
CREATE INDEX "RetentionAuditRequest_createdAt_idx" ON "RetentionAuditRequest"("createdAt");
