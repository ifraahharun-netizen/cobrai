-- CreateTable
CREATE TABLE "AccountTimelineEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" TEXT,
    "source" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountTimelineEvent_workspaceId_idx" ON "AccountTimelineEvent"("workspaceId");

-- CreateIndex
CREATE INDEX "AccountTimelineEvent_customerId_idx" ON "AccountTimelineEvent"("customerId");

-- CreateIndex
CREATE INDEX "AccountTimelineEvent_createdAt_idx" ON "AccountTimelineEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "AccountTimelineEvent" ADD CONSTRAINT "AccountTimelineEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
