ALTER TABLE "workspace"
ADD COLUMN "ownerUid" TEXT NOT NULL DEFAULT '__BOOTSTRAP__';

UPDATE "workspace"
SET "ownerUid" = 'AbR9tr0VWFNfVzZomtzKFAEGNhd2'
WHERE "ownerUid" = '__BOOTSTRAP__';

ALTER TABLE "workspace"
ALTER COLUMN "ownerUid" DROP DEFAULT;

CREATE INDEX IF NOT EXISTS "workspace_ownerUid_idx" ON "workspace" ("ownerUid");
