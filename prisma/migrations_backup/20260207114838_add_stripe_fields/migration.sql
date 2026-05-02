-- AlterTable
ALTER TABLE "workspace" ADD COLUMN     "stripeLastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "stripeSecretKeyEnc" TEXT;
