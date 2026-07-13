-- AlterTable
ALTER TABLE "workspace" ADD COLUMN     "trialStartedAt" TIMESTAMP(3),
ADD COLUMN     "trialUsed" BOOLEAN NOT NULL DEFAULT false;
