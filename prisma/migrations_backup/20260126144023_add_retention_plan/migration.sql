-- CreateTable
CREATE TABLE "RetentionPlan" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tier" TEXT NOT NULL,
    "scopes" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "expected" JSONB NOT NULL,
    "workspaceId" TEXT,
    "createdByUserId" TEXT,

    CONSTRAINT "RetentionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RetentionPlan_createdAt_idx" ON "RetentionPlan"("createdAt");

-- CreateIndex
CREATE INDEX "Task_workspaceId_createdAt_idx" ON "Task"("workspaceId", "createdAt");
