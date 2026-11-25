-- Trial conversion: reminder email marker and funnel events. Additive only, so
-- it's safe to apply before deploying the code that uses it.
ALTER TABLE "workspace" ADD COLUMN IF NOT EXISTS "trialEndingEmailSentAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "ConversionEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ConversionEvent_name_createdAt_idx" ON "ConversionEvent"("name", "createdAt");
CREATE INDEX IF NOT EXISTS "ConversionEvent_workspaceId_createdAt_idx" ON "ConversionEvent"("workspaceId", "createdAt");

DO $$ BEGIN
    ALTER TABLE "ConversionEvent" ADD CONSTRAINT "ConversionEvent_workspaceId_fkey"
        FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
