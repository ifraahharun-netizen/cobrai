-- CreateTable
CREATE TABLE "ai_usage_runs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'openai',
    "type" TEXT NOT NULL DEFAULT 'workspace_insights',
    "timeframe" TEXT NOT NULL DEFAULT 'week',
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "costMinor" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_runs_workspaceId_createdAt_idx" ON "ai_usage_runs"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_runs_workspaceId_source_createdAt_idx" ON "ai_usage_runs"("workspaceId", "source", "createdAt");

-- AddForeignKey
ALTER TABLE "ai_usage_runs" ADD CONSTRAINT "ai_usage_runs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
