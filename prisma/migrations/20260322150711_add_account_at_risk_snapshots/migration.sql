-- CreateTable
CREATE TABLE "AccountRiskSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountRiskId" TEXT,
    "companyName" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "reasonKey" TEXT NOT NULL,
    "reasonLabel" TEXT NOT NULL,
    "mrrMinor" INTEGER NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountRiskSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountRiskSnapshot_workspaceId_snapshotDate_idx" ON "AccountRiskSnapshot"("workspaceId", "snapshotDate");

-- CreateIndex
CREATE INDEX "AccountRiskSnapshot_workspaceId_companyName_snapshotDate_idx" ON "AccountRiskSnapshot"("workspaceId", "companyName", "snapshotDate");

-- CreateIndex
CREATE INDEX "AccountRiskSnapshot_workspaceId_accountRiskId_snapshotDate_idx" ON "AccountRiskSnapshot"("workspaceId", "accountRiskId", "snapshotDate");

-- AddForeignKey
ALTER TABLE "AccountRiskSnapshot" ADD CONSTRAINT "AccountRiskSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
