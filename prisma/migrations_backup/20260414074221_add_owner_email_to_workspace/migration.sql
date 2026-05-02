/*
  Warnings:

  - You are about to drop the column `ownerUid` on the `workspace` table. All the data in the column will be lost.
  - Added the required column `ownerEmail` to the `workspace` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "workspace_ownerUid_idx";

-- AlterTable
ALTER TABLE "workspace" DROP COLUMN "ownerUid",
ADD COLUMN     "ownerEmail" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "workspace_ownerEmail_idx" ON "workspace"("ownerEmail");
