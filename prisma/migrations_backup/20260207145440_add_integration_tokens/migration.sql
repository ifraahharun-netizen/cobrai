-- AlterTable
ALTER TABLE "integrations" ADD COLUMN     "accessTokenEnc" TEXT,
ADD COLUMN     "lastSyncError" TEXT,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "refreshTokenEnc" TEXT;
