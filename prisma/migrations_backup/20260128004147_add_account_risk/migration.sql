-- CreateTable
CREATE TABLE "AccountRisk" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "reasonKey" TEXT NOT NULL,
    "reasonLabel" TEXT NOT NULL,
    "mrr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountRisk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountRisk_workspaceId_idx" ON "AccountRisk"("workspaceId");

-- CreateIndex
CREATE INDEX "AccountRisk_reasonKey_idx" ON "AccountRisk"("reasonKey");

-- CreateIndex
CREATE INDEX "AccountRisk_riskScore_idx" ON "AccountRisk"("riskScore");

-- AddForeignKey
ALTER TABLE "AccountRisk" ADD CONSTRAINT "AccountRisk_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
