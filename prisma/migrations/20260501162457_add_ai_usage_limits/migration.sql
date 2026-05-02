-- AlterTable
ALTER TABLE "workspace" ADD COLUMN     "aiActionsUsedThisWeek" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "aiResetAt" TIMESTAMP(3);
