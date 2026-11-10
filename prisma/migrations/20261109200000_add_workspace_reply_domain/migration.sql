-- Receive-only reply subdomain per workspace (adds nullable columns only).
ALTER TABLE "workspace" ADD COLUMN "replyDomain" TEXT,
ADD COLUMN "resendReplyDomainId" TEXT,
ADD COLUMN "replyDomainStatus" TEXT,
ADD COLUMN "replyDomainRecords" JSONB;

CREATE INDEX "workspace_replyDomain_idx" ON "workspace"("replyDomain");
