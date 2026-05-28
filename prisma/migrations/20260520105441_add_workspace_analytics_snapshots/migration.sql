-- AlterTable
ALTER TABLE "AccountRiskSnapshot" ADD COLUMN     "escalationDetected" BOOLEAN,
ADD COLUMN     "predictedRisk14d" DOUBLE PRECISION,
ADD COLUMN     "predictedRisk30d" DOUBLE PRECISION,
ADD COLUMN     "predictedRisk7d" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ai_workspace_narratives" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "importance" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "ai_workspace_narratives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "recordsProcessed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "metadata" JSONB,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_analytics_snapshots" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "totalMrr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mrrAtRisk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retentionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "predictedChurnRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "atRiskAccounts" INTEGER NOT NULL DEFAULT 0,
    "activeCustomers" INTEGER NOT NULL DEFAULT 0,
    "churnedCustomers" INTEGER NOT NULL DEFAULT 0,
    "projectedMrr7d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "projectedMrr30d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "projectedChurn7d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "projectedChurn30d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "businessHealthScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_health_snapshots" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "healthScore" INTEGER NOT NULL,
    "churnRisk" DOUBLE PRECISION NOT NULL,
    "mrrMinor" INTEGER NOT NULL,
    "engagementScore" INTEGER,
    "productUsageScore" INTEGER,
    "billingScore" INTEGER,
    "supportScore" INTEGER,
    "activeDays7d" INTEGER,
    "activeDays30d" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_health_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_workspace_narratives_workspaceId_createdAt_idx" ON "ai_workspace_narratives"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_workspace_narratives_workspaceId_type_idx" ON "ai_workspace_narratives"("workspaceId", "type");

-- CreateIndex
CREATE INDEX "sync_runs_workspaceId_startedAt_idx" ON "sync_runs"("workspaceId", "startedAt");

-- CreateIndex
CREATE INDEX "sync_runs_provider_startedAt_idx" ON "sync_runs"("provider", "startedAt");

-- CreateIndex
CREATE INDEX "workspace_analytics_snapshots_workspaceId_snapshotDate_idx" ON "workspace_analytics_snapshots"("workspaceId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_analytics_snapshots_workspaceId_snapshotDate_key" ON "workspace_analytics_snapshots"("workspaceId", "snapshotDate");

-- CreateIndex
CREATE INDEX "customer_health_snapshots_workspaceId_snapshotDate_idx" ON "customer_health_snapshots"("workspaceId", "snapshotDate");

-- CreateIndex
CREATE INDEX "customer_health_snapshots_customerId_snapshotDate_idx" ON "customer_health_snapshots"("customerId", "snapshotDate");

-- AddForeignKey
ALTER TABLE "ai_workspace_narratives" ADD CONSTRAINT "ai_workspace_narratives_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_analytics_snapshots" ADD CONSTRAINT "workspace_analytics_snapshots_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_health_snapshots" ADD CONSTRAINT "customer_health_snapshots_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_health_snapshots" ADD CONSTRAINT "customer_health_snapshots_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountRiskSnapshot" ADD CONSTRAINT "AccountRiskSnapshot_accountRiskId_fkey" FOREIGN KEY ("accountRiskId") REFERENCES "AccountRisk"("id") ON DELETE SET NULL ON UPDATE CASCADE;
