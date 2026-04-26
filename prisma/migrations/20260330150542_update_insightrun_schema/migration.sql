/*
  Warnings:

  - You are about to drop the column `isDemo` on the `InsightRun` table. All the data in the column will be lost.
  - You are about to drop the column `payload` on the `InsightRun` table. All the data in the column will be lost.
  - You are about to drop the column `timeframe` on the `InsightRun` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "InsightRun" DROP COLUMN "isDemo",
DROP COLUMN "payload",
DROP COLUMN "timeframe";

-- CreateTable
CREATE TABLE "ActionImpact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT,
    "actionType" TEXT,
    "aiReason" TEXT,
    "status" TEXT,
    "mrrSavedMinor" INTEGER,
    "riskScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionImpact_pkey" PRIMARY KEY ("id")
);
