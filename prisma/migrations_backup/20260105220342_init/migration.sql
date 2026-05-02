/*
  Warnings:

  - You are about to drop the column `lastSeenAt` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `orgId` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `segment` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `topDriver` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the `CustomerEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Org` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `workspaceId` to the `Customer` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_orgId_fkey";

-- DropForeignKey
ALTER TABLE "CustomerEvent" DROP CONSTRAINT "CustomerEvent_customerId_fkey";

-- DropIndex
DROP INDEX "Customer_orgId_idx";

-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "lastSeenAt",
DROP COLUMN "orgId",
DROP COLUMN "segment",
DROP COLUMN "topDriver",
DROP COLUMN "updatedAt",
ADD COLUMN     "healthScore" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "lastActiveAt" TIMESTAMP(3),
ADD COLUMN     "plan" TEXT,
ADD COLUMN     "seats" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "workspaceId" TEXT NOT NULL,
ALTER COLUMN "churnRisk" SET DEFAULT 0,
ALTER COLUMN "churnRisk" SET DATA TYPE DOUBLE PRECISION;

-- DropTable
DROP TABLE "CustomerEvent";

-- DropTable
DROP TABLE "Org";

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "value" DOUBLE PRECISION,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Action" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerId" TEXT,
    "title" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),

    CONSTRAINT "Action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    "result" JSONB NOT NULL,

    CONSTRAINT "InsightRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_workspaceId_occurredAt_idx" ON "Event"("workspaceId", "occurredAt");

-- CreateIndex
CREATE INDEX "Event_customerId_occurredAt_idx" ON "Event"("customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "Invoice_workspaceId_dueAt_idx" ON "Invoice"("workspaceId", "dueAt");

-- CreateIndex
CREATE INDEX "Invoice_customerId_status_idx" ON "Invoice"("customerId", "status");

-- CreateIndex
CREATE INDEX "Action_workspaceId_done_idx" ON "Action"("workspaceId", "done");

-- CreateIndex
CREATE INDEX "Action_workspaceId_createdAt_idx" ON "Action"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "InsightRun_workspaceId_createdAt_idx" ON "InsightRun"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Customer_workspaceId_idx" ON "Customer"("workspaceId");

-- CreateIndex
CREATE INDEX "Customer_workspaceId_churnRisk_idx" ON "Customer"("workspaceId", "churnRisk");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightRun" ADD CONSTRAINT "InsightRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
