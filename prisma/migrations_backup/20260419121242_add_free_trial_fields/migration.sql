-- AlterTable
ALTER TABLE "workspace" ADD COLUMN     "trialEndsAt" TIMESTAMP(3),
ALTER COLUMN "tier" SET DEFAULT 'free',
ALTER COLUMN "demoMode" SET DEFAULT false;
