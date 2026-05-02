-- AlterTable
ALTER TABLE "workspace" ADD COLUMN     "stripeAccessTokenEnc" TEXT,
ADD COLUMN     "stripeAccountId" TEXT,
ADD COLUMN     "stripeConnectedAt" TIMESTAMP(3),
ADD COLUMN     "stripeRefreshTokenEnc" TEXT,
ADD COLUMN     "stripeScope" TEXT;
