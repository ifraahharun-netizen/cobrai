/*
  Warnings:

  - You are about to drop the column `actions` on the `RetentionPlan` table. All the data in the column will be lost.
  - You are about to drop the column `createdByUserId` on the `RetentionPlan` table. All the data in the column will be lost.
  - You are about to drop the column `expected` on the `RetentionPlan` table. All the data in the column will be lost.
  - You are about to drop the column `scopes` on the `RetentionPlan` table. All the data in the column will be lost.
  - You are about to drop the column `summary` on the `RetentionPlan` table. All the data in the column will be lost.
  - You are about to drop the column `tier` on the `RetentionPlan` table. All the data in the column will be lost.
  - Added the required column `goal` to the `RetentionPlan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `RetentionPlan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `steps` to the `RetentionPlan` table without a default value. This is not possible if the table is not empty.
  - Made the column `workspaceId` on table `RetentionPlan` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "RetentionPlan_createdAt_idx";

-- AlterTable
ALTER TABLE "RetentionPlan" DROP COLUMN "actions",
DROP COLUMN "createdByUserId",
DROP COLUMN "expected",
DROP COLUMN "scopes",
DROP COLUMN "summary",
DROP COLUMN "tier",
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "goal" TEXT NOT NULL,
ADD COLUMN     "lastRunId" TEXT,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "reasoning" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ready',
ADD COLUMN     "steps" JSONB NOT NULL,
ADD COLUMN     "suggested" JSONB,
ALTER COLUMN "workspaceId" SET NOT NULL;

-- CreateTable
CREATE TABLE "RetentionAction" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" TEXT,
    "customerName" TEXT,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "appliedAt" TIMESTAMP(3),
    "lastError" TEXT,

    CONSTRAINT "RetentionAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanRun" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'idle',
    "mrrProtectedMinor" INTEGER NOT NULL DEFAULT 0,
    "accountsRecovered" INTEGER NOT NULL DEFAULT 0,
    "riskReducedPct" INTEGER NOT NULL DEFAULT 0,
    "actionsCompleted" INTEGER NOT NULL DEFAULT 0,
    "actionsTotal" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlanRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,

    CONSTRAINT "PlanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionExecution" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "provider" TEXT,
    "request" JSONB,
    "response" JSONB,
    "error" TEXT,

    CONSTRAINT "ActionExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetentionAction_planId_createdAt_idx" ON "RetentionAction"("planId", "createdAt");

-- CreateIndex
CREATE INDEX "PlanRun_planId_createdAt_idx" ON "PlanRun"("planId", "createdAt");

-- CreateIndex
CREATE INDEX "PlanEvent_runId_createdAt_idx" ON "PlanEvent"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "ActionExecution_actionId_createdAt_idx" ON "ActionExecution"("actionId", "createdAt");

-- CreateIndex
CREATE INDEX "RetentionPlan_workspaceId_createdAt_idx" ON "RetentionPlan"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "RetentionAction" ADD CONSTRAINT "RetentionAction_planId_fkey" FOREIGN KEY ("planId") REFERENCES "RetentionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanRun" ADD CONSTRAINT "PlanRun_planId_fkey" FOREIGN KEY ("planId") REFERENCES "RetentionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanEvent" ADD CONSTRAINT "PlanEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlanRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionExecution" ADD CONSTRAINT "ActionExecution_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "RetentionAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
