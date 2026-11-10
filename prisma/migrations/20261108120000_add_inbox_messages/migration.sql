-- Two-way inbox: inbound customer replies and outbound replies sent from the inbox.
CREATE TABLE "inbox_messages" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerId" TEXT,
    "threadKey" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "inReplyTo" TEXT,
    "actionExecutionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "channel" TEXT,
    "bodyHtml" TEXT,
    "readAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inbox_messages_providerMessageId_key" ON "inbox_messages"("providerMessageId");
CREATE INDEX "inbox_messages_workspaceId_createdAt_idx" ON "inbox_messages"("workspaceId", "createdAt");
CREATE INDEX "inbox_messages_workspaceId_threadKey_idx" ON "inbox_messages"("workspaceId", "threadKey");
CREATE INDEX "inbox_messages_customerId_idx" ON "inbox_messages"("customerId");

ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Per-conversation state (starred, archived).
CREATE TABLE "inbox_thread_states" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "threadKey" TEXT NOT NULL,
    "starredAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbox_thread_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inbox_thread_states_workspaceId_threadKey_key" ON "inbox_thread_states"("workspaceId", "threadKey");

ALTER TABLE "inbox_thread_states" ADD CONSTRAINT "inbox_thread_states_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
