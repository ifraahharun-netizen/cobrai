/*
  Safe migration for InsightRun:
  - Adds `type` safely
  - Preserves existing data
*/

-- DropIndex (keep this)
DROP INDEX "InsightRun_workspaceId_createdAt_idx";

-- Step 1: Add column as nullable
ALTER TABLE "InsightRun" ADD COLUMN "type" TEXT;

-- Step 2: Backfill existing rows
UPDATE "InsightRun"
SET "type" = 'general'
WHERE "type" IS NULL;

-- Step 3: Make it required
ALTER TABLE "InsightRun" ALTER COLUMN "type" SET NOT NULL;

-- ⚠️ DO NOT DROP THESE YET (keep data safe)
-- ALTER TABLE "InsightRun" DROP COLUMN "isDemo";
-- ALTER TABLE "InsightRun" DROP COLUMN "payload";
-- ALTER TABLE "InsightRun" DROP COLUMN "timeframe";

-- Step 4: Add new index
CREATE INDEX "InsightRun_workspaceId_type_createdAt_idx"
ON "InsightRun"("workspaceId", "type", "createdAt");