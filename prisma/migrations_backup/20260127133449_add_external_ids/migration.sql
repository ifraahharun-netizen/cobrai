/*
  Warnings:

  - A unique constraint covering the columns `[workspaceId,hubspotCompanyId]` on the table `customers` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[workspaceId,stripeCustomerId]` on the table `customers` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "hubspotCompanyId" TEXT,
ADD COLUMN     "stripeCustomerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "customers_workspaceId_hubspotCompanyId_key" ON "customers"("workspaceId", "hubspotCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_workspaceId_stripeCustomerId_key" ON "customers"("workspaceId", "stripeCustomerId");
