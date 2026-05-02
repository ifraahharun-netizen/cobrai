/*
  Warnings:

  - You are about to drop the column `externalId` on the `integrations` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "integrations" DROP COLUMN "externalId",
ADD COLUMN     "externalAccountId" TEXT;
