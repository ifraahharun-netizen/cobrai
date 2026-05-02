/*
  Warnings:

  - You are about to drop the column `error` on the `ActionExecution` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "ActionExecution" DROP CONSTRAINT "ActionExecution_actionId_fkey";

-- DropIndex
DROP INDEX "ActionExecution_actionId_createdAt_idx";

-- AlterTable
ALTER TABLE "ActionExecution" DROP COLUMN "error",
ADD COLUMN     "accountRiskId" TEXT,
ADD COLUMN     "actionType" TEXT NOT NULL DEFAULT 'checkin_email',
ADD COLUMN     "aiConfidence" INTEGER,
ADD COLUMN     "aiHeadline" TEXT,
ADD COLUMN     "body" TEXT,
ADD COLUMN     "channel" TEXT,
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "outcomeAt" TIMESTAMP(3),
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "retentionActionId" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "subject" TEXT,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "workspaceId" TEXT,
ALTER COLUMN "actionId" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'pending',
ALTER COLUMN "isDemo" DROP NOT NULL,
ALTER COLUMN "isDemo" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ActionOutcomeSnapshot" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,
    "actionExecutionId" TEXT NOT NULL,
    "riskScoreBefore" INTEGER,
    "riskScoreAfter" INTEGER,
    "mrrBefore" INTEGER,
    "mrrAfter" INTEGER,
    "churnRiskBefore" INTEGER,
    "churnRiskAfter" INTEGER,
    "wasOpened" BOOLEAN,
    "wasClicked" BOOLEAN,
    "wasReplied" BOOLEAN,
    "paymentRecovered" BOOLEAN,
    "retainedRevenueMinor" INTEGER,
    "outcomeLabel" TEXT,
    "metadata" JSONB,

    CONSTRAINT "ActionOutcomeSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionOutcomeSnapshot_workspaceId_createdAt_idx" ON "ActionOutcomeSnapshot"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ActionOutcomeSnapshot_actionExecutionId_idx" ON "ActionOutcomeSnapshot"("actionExecutionId");

-- CreateIndex
CREATE INDEX "ActionExecution_workspaceId_createdAt_idx" ON "ActionExecution"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ActionExecution_customerId_createdAt_idx" ON "ActionExecution"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "ActionExecution_retentionActionId_createdAt_idx" ON "ActionExecution"("retentionActionId", "createdAt");

-- CreateIndex
CREATE INDEX "ActionExecution_actionType_status_idx" ON "ActionExecution"("actionType", "status");

-- AddForeignKey
ALTER TABLE "ActionExecution" ADD CONSTRAINT "ActionExecution_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionExecution" ADD CONSTRAINT "ActionExecution_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionExecution" ADD CONSTRAINT "ActionExecution_retentionActionId_fkey" FOREIGN KEY ("retentionActionId") REFERENCES "RetentionAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionOutcomeSnapshot" ADD CONSTRAINT "ActionOutcomeSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionOutcomeSnapshot" ADD CONSTRAINT "ActionOutcomeSnapshot_actionExecutionId_fkey" FOREIGN KEY ("actionExecutionId") REFERENCES "ActionExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
