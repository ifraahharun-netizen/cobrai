-- AlterTable
ALTER TABLE "integrations" ADD COLUMN     "connectedAt" TIMESTAMP(3),
ADD COLUMN     "disconnectedAt" TIMESTAMP(3),
ADD COLUMN     "externalAccountEmail" TEXT,
ADD COLUMN     "externalAccountName" TEXT,
ADD COLUMN     "scopes" TEXT;

-- CreateTable
CREATE TABLE "stripe_oauth_states" (
    "id" TEXT NOT NULL,
    "stateToken" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stripe_oauth_states_stateToken_key" ON "stripe_oauth_states"("stateToken");

-- CreateIndex
CREATE INDEX "stripe_oauth_states_expiresAt_idx" ON "stripe_oauth_states"("expiresAt");

-- CreateIndex
CREATE INDEX "stripe_oauth_states_uid_idx" ON "stripe_oauth_states"("uid");
