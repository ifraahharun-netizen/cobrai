-- CreateTable
CREATE TABLE "ProviderEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "processingError" TEXT,

    CONSTRAINT "ProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderEvent_externalId_key" ON "ProviderEvent"("externalId");

-- CreateIndex
CREATE INDEX "ProviderEvent_provider_idx" ON "ProviderEvent"("provider");

-- CreateIndex
CREATE INDEX "ProviderEvent_workspaceId_idx" ON "ProviderEvent"("workspaceId");

-- CreateIndex
CREATE INDEX "ProviderEvent_type_idx" ON "ProviderEvent"("type");
