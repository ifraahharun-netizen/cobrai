/*
  Warnings:

  - You are about to drop the column `company` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `health` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `plan` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `risk` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `accountLimit` on the `Org` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Org` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `Org` table. All the data in the column will be lost.
  - You are about to drop the column `plan` on the `Org` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Org` table. All the data in the column will be lost.
  - You are about to drop the `Integration` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserPrefs` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `name` on table `Customer` required. This step will fail if there are existing NULL values in that column.
  - Made the column `mrr` on table `Customer` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_orgId_fkey";

-- DropForeignKey
ALTER TABLE "Integration" DROP CONSTRAINT "Integration_orgId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_orgId_fkey";

-- DropForeignKey
ALTER TABLE "UserPrefs" DROP CONSTRAINT "UserPrefs_userId_fkey";

-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "company",
DROP COLUMN "health",
DROP COLUMN "plan",
DROP COLUMN "risk",
ADD COLUMN     "churnRisk" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "segment" TEXT,
ADD COLUMN     "topDriver" TEXT,
ALTER COLUMN "name" SET NOT NULL,
ALTER COLUMN "mrr" SET NOT NULL,
ALTER COLUMN "mrr" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "Org" DROP COLUMN "accountLimit",
DROP COLUMN "createdAt",
DROP COLUMN "name",
DROP COLUMN "plan",
DROP COLUMN "updatedAt";

-- DropTable
DROP TABLE "Integration";

-- DropTable
DROP TABLE "User";

-- DropTable
DROP TABLE "UserPrefs";

-- DropEnum
DROP TYPE "IntegrationProvider";

-- DropEnum
DROP TYPE "IntegrationStatus";

-- DropEnum
DROP TYPE "Plan";

-- CreateTable
CREATE TABLE "CustomerEvent" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerEvent_customerId_idx" ON "CustomerEvent"("customerId");

-- CreateIndex
CREATE INDEX "Customer_orgId_idx" ON "Customer"("orgId");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerEvent" ADD CONSTRAINT "CustomerEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
