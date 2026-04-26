-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "canceledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "customers_workspaceId_canceledAt_idx" ON "customers"("workspaceId", "canceledAt");

-- CreateIndex
CREATE INDEX "customers_workspaceId_lastActiveAt_idx" ON "customers"("workspaceId", "lastActiveAt");
