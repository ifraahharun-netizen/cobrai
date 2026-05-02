-- AlterTable
ALTER TABLE "workspace" ADD COLUMN     "emailActionsUsedThisWeek" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "emailResetAt" TIMESTAMP(3);
