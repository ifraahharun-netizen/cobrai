-- CreateTable
CREATE TABLE "RiskSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerId" TEXT,
    "riskScore" INTEGER NOT NULL,
    "churnProb" DOUBLE PRECISION,
    "mrrAtRisk" INTEGER,
    "bucketDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RiskSnapshot_workspaceId_bucketDate_idx" ON "RiskSnapshot"("workspaceId", "bucketDate");

-- CreateIndex
CREATE INDEX "RiskSnapshot_workspaceId_customerId_bucketDate_idx" ON "RiskSnapshot"("workspaceId", "customerId", "bucketDate");

-- CreateIndex
CREATE UNIQUE INDEX "RiskSnapshot_workspaceId_customerId_bucketDate_key" ON "RiskSnapshot"("workspaceId", "customerId", "bucketDate");
