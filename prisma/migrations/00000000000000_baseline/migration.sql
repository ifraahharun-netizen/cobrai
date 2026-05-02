-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stripeLastSyncedAt" TIMESTAMP(3),
    "stripeSecretKeyEnc" TEXT,
    "stripeAccessTokenEnc" TEXT,
    "stripeAccountId" TEXT,
    "stripeConnectedAt" TIMESTAMP(3),
    "stripeRefreshTokenEnc" TEXT,
    "stripeScope" TEXT,
    "ownerEmail" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'free',
    "emailActionsUsedThisWeek" INTEGER NOT NULL DEFAULT 0,
    "emailResetAt" TIMESTAMP(3),
    "demoClearedAt" TIMESTAMP(3),
    "demoMode" BOOLEAN NOT NULL DEFAULT false,
    "demoSeededAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "resendDomainId" TEXT,
    "sendingDomain" TEXT,
    "sendingDomainStatus" TEXT,
    "sendingDomainRecords" JSONB,
    "senderName" TEXT,
    "senderEmail" TEXT,
    "senderReplyTo" TEXT,
    "senderVerifiedAt" TIMESTAMP(3),

    CONSTRAINT "workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "mrr" INTEGER NOT NULL DEFAULT 0,
    "churnRisk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "healthScore" INTEGER NOT NULL DEFAULT 50,
    "lastActiveAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "plan" TEXT,
    "website" TEXT,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "workspaceId" TEXT NOT NULL,
    "hubspotCompanyId" TEXT,
    "stripeCustomerId" TEXT,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "value" DOUBLE PRECISION,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Action" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "customerId" TEXT,
    "title" TEXT NOT NULL,
    "priority" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsightRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountRisk" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerId" TEXT,
    "companyName" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "reasonKey" TEXT NOT NULL,
    "reasonLabel" TEXT NOT NULL,
    "mrr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "previousRiskScore" INTEGER,
    "previousUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "AccountRisk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "firebaseUid" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "workspaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "metadata" JSONB,
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "externalAccountId" TEXT,
    "externalAccountName" TEXT,
    "externalAccountEmail" TEXT,
    "scopes" TEXT,
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeCustomer" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "stripeId" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeSubscription" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "stripeId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currency" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MrrSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "mrrMinor" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "firstSeenMonth" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MrrSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionPlan" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT,
    "goal" TEXT NOT NULL,
    "lastRunId" TEXT,
    "name" TEXT NOT NULL,
    "reasoning" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "steps" JSONB NOT NULL,
    "suggested" JSONB,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RetentionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionImpact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT,
    "actionType" TEXT,
    "aiReason" TEXT,
    "status" TEXT,
    "mrrSavedMinor" INTEGER,
    "riskScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionImpact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionAction" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" TEXT,
    "customerName" TEXT,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "appliedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RetentionAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanRun" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'idle',
    "mrrProtectedMinor" INTEGER NOT NULL DEFAULT 0,
    "accountsRecovered" INTEGER NOT NULL DEFAULT 0,
    "riskReducedPct" INTEGER NOT NULL DEFAULT 0,
    "actionsCompleted" INTEGER NOT NULL DEFAULT 0,
    "actionsTotal" INTEGER NOT NULL DEFAULT 0,
    "primaryDriver" TEXT,
    "protectedAccounts" JSONB,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PlanRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PlanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionExecution" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actionId" TEXT,
    "isDemo" BOOLEAN,
    "provider" TEXT,
    "request" JSONB,
    "response" JSONB,
    "workspaceId" TEXT,
    "customerId" TEXT,
    "retentionActionId" TEXT,
    "accountRiskId" TEXT,
    "actionType" TEXT NOT NULL DEFAULT 'checkin_email',
    "channel" TEXT,
    "title" TEXT,
    "subject" TEXT,
    "body" TEXT,
    "reason" TEXT,
    "aiHeadline" TEXT,
    "aiConfidence" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "outcomeAt" TIMESTAMP(3),
    "metadata" JSONB,

    CONSTRAINT "ActionExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "customerId" TEXT,
    "riskScore" INTEGER NOT NULL,
    "churnProb" DOUBLE PRECISION,
    "mrrAtRisk" INTEGER,
    "bucketDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountRiskSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountRiskId" TEXT,
    "companyName" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "reasonKey" TEXT NOT NULL,
    "reasonLabel" TEXT NOT NULL,
    "mrrMinor" INTEGER NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountRiskSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionOutcomeSnapshot" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,
    "actionExecutionId" TEXT NOT NULL,
    "riskScoreBefore" INTEGER,
    "riskScoreAfter" INTEGER,
    "mrrBefore" INTEGER,
    "mrrAfter" INTEGER,
    "churnRiskBefore" INTEGER,
    "churnRiskAfter" INTEGER,
    "wasOpened" BOOLEAN,
    "wasClicked" BOOLEAN,
    "wasReplied" BOOLEAN,
    "paymentRecovered" BOOLEAN,
    "retainedRevenueMinor" INTEGER,
    "outcomeLabel" TEXT,
    "metadata" JSONB,

    CONSTRAINT "ActionOutcomeSnapshot_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "SupportRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workspace_ownerEmail_idx" ON "workspace"("ownerEmail");

-- CreateIndex
CREATE INDEX "workspace_sendingDomain_idx" ON "workspace"("sendingDomain");

-- CreateIndex
CREATE INDEX "workspace_resendDomainId_idx" ON "workspace"("resendDomainId");

-- CreateIndex
CREATE INDEX "customers_workspaceId_idx" ON "customers"("workspaceId");

-- CreateIndex
CREATE INDEX "customers_workspaceId_churnRisk_idx" ON "customers"("workspaceId", "churnRisk");

-- CreateIndex
CREATE INDEX "customers_workspaceId_canceledAt_idx" ON "customers"("workspaceId", "canceledAt");

-- CreateIndex
CREATE INDEX "customers_workspaceId_lastActiveAt_idx" ON "customers"("workspaceId", "lastActiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "customers_workspaceId_hubspotCompanyId_key" ON "customers"("workspaceId", "hubspotCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_workspaceId_stripeCustomerId_key" ON "customers"("workspaceId", "stripeCustomerId");

-- CreateIndex
CREATE INDEX "Event_workspaceId_occurredAt_idx" ON "Event"("workspaceId", "occurredAt");

-- CreateIndex
CREATE INDEX "Event_customerId_occurredAt_idx" ON "Event"("customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "Invoice_workspaceId_dueAt_idx" ON "Invoice"("workspaceId", "dueAt");

-- CreateIndex
CREATE INDEX "Invoice_customerId_status_idx" ON "Invoice"("customerId", "status");

-- CreateIndex
CREATE INDEX "InsightRun_workspaceId_type_createdAt_idx" ON "InsightRun"("workspaceId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "Task_workspaceId_createdAt_idx" ON "Task"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AccountRisk_workspaceId_idx" ON "AccountRisk"("workspaceId");

-- CreateIndex
CREATE INDEX "AccountRisk_customerId_idx" ON "AccountRisk"("customerId");

-- CreateIndex
CREATE INDEX "AccountRisk_reasonKey_idx" ON "AccountRisk"("reasonKey");

-- CreateIndex
CREATE INDEX "AccountRisk_riskScore_idx" ON "AccountRisk"("riskScore");

-- CreateIndex
CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");

-- CreateIndex
CREATE INDEX "User_workspaceId_idx" ON "User"("workspaceId");

-- CreateIndex
CREATE INDEX "integrations_workspaceId_idx" ON "integrations"("workspaceId");

-- CreateIndex
CREATE INDEX "integrations_provider_idx" ON "integrations"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_workspaceId_provider_key" ON "integrations"("workspaceId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "StripeCustomer_stripeId_key" ON "StripeCustomer"("stripeId");

-- CreateIndex
CREATE UNIQUE INDEX "StripeSubscription_stripeId_key" ON "StripeSubscription"("stripeId");

-- CreateIndex
CREATE INDEX "StripeSubscription_workspaceId_idx" ON "StripeSubscription"("workspaceId");

-- CreateIndex
CREATE INDEX "StripeSubscription_stripeCustomerId_idx" ON "StripeSubscription"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "MrrSnapshot_workspaceId_month_idx" ON "MrrSnapshot"("workspaceId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "MrrSnapshot_workspaceId_stripeCustomerId_month_key" ON "MrrSnapshot"("workspaceId", "stripeCustomerId", "month");

-- CreateIndex
CREATE INDEX "RetentionPlan_workspaceId_createdAt_idx" ON "RetentionPlan"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "RetentionAction_planId_createdAt_idx" ON "RetentionAction"("planId", "createdAt");

-- CreateIndex
CREATE INDEX "PlanRun_planId_createdAt_idx" ON "PlanRun"("planId", "createdAt");

-- CreateIndex
CREATE INDEX "PlanEvent_runId_createdAt_idx" ON "PlanEvent"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "ActionExecution_workspaceId_createdAt_idx" ON "ActionExecution"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ActionExecution_customerId_createdAt_idx" ON "ActionExecution"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "ActionExecution_retentionActionId_createdAt_idx" ON "ActionExecution"("retentionActionId", "createdAt");

-- CreateIndex
CREATE INDEX "ActionExecution_actionType_status_idx" ON "ActionExecution"("actionType", "status");

-- CreateIndex
CREATE INDEX "RiskSnapshot_workspaceId_bucketDate_idx" ON "RiskSnapshot"("workspaceId", "bucketDate");

-- CreateIndex
CREATE INDEX "RiskSnapshot_workspaceId_customerId_bucketDate_idx" ON "RiskSnapshot"("workspaceId", "customerId", "bucketDate");

-- CreateIndex
CREATE UNIQUE INDEX "RiskSnapshot_workspaceId_customerId_bucketDate_key" ON "RiskSnapshot"("workspaceId", "customerId", "bucketDate");

-- CreateIndex
CREATE INDEX "StripeEvent_workspaceId_idx" ON "StripeEvent"("workspaceId");

-- CreateIndex
CREATE INDEX "AccountRiskSnapshot_workspaceId_snapshotDate_idx" ON "AccountRiskSnapshot"("workspaceId", "snapshotDate");

-- CreateIndex
CREATE INDEX "AccountRiskSnapshot_workspaceId_companyName_snapshotDate_idx" ON "AccountRiskSnapshot"("workspaceId", "companyName", "snapshotDate");

-- CreateIndex
CREATE INDEX "AccountRiskSnapshot_workspaceId_accountRiskId_snapshotDate_idx" ON "AccountRiskSnapshot"("workspaceId", "accountRiskId", "snapshotDate");

-- CreateIndex
CREATE INDEX "ActionOutcomeSnapshot_workspaceId_createdAt_idx" ON "ActionOutcomeSnapshot"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ActionOutcomeSnapshot_actionExecutionId_idx" ON "ActionOutcomeSnapshot"("actionExecutionId");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_oauth_states_stateToken_key" ON "stripe_oauth_states"("stateToken");

-- CreateIndex
CREATE INDEX "stripe_oauth_states_expiresAt_idx" ON "stripe_oauth_states"("expiresAt");

-- CreateIndex
CREATE INDEX "stripe_oauth_states_uid_idx" ON "stripe_oauth_states"("uid");

-- CreateIndex
CREATE INDEX "SupportRequest_workspaceId_idx" ON "SupportRequest"("workspaceId");

-- CreateIndex
CREATE INDEX "SupportRequest_email_idx" ON "SupportRequest"("email");

-- CreateIndex
CREATE INDEX "SupportRequest_createdAt_idx" ON "SupportRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightRun" ADD CONSTRAINT "InsightRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountRisk" ADD CONSTRAINT "AccountRisk_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountRisk" ADD CONSTRAINT "AccountRisk_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripeCustomer" ADD CONSTRAINT "StripeCustomer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripeSubscription" ADD CONSTRAINT "StripeSubscription_stripeCustomerId_fkey" FOREIGN KEY ("stripeCustomerId") REFERENCES "StripeCustomer"("stripeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripeSubscription" ADD CONSTRAINT "StripeSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MrrSnapshot" ADD CONSTRAINT "MrrSnapshot_stripeCustomerId_fkey" FOREIGN KEY ("stripeCustomerId") REFERENCES "StripeCustomer"("stripeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MrrSnapshot" ADD CONSTRAINT "MrrSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionAction" ADD CONSTRAINT "RetentionAction_planId_fkey" FOREIGN KEY ("planId") REFERENCES "RetentionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanRun" ADD CONSTRAINT "PlanRun_planId_fkey" FOREIGN KEY ("planId") REFERENCES "RetentionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanEvent" ADD CONSTRAINT "PlanEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PlanRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionExecution" ADD CONSTRAINT "ActionExecution_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionExecution" ADD CONSTRAINT "ActionExecution_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionExecution" ADD CONSTRAINT "ActionExecution_retentionActionId_fkey" FOREIGN KEY ("retentionActionId") REFERENCES "RetentionAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountRiskSnapshot" ADD CONSTRAINT "AccountRiskSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionOutcomeSnapshot" ADD CONSTRAINT "ActionOutcomeSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionOutcomeSnapshot" ADD CONSTRAINT "ActionOutcomeSnapshot_actionExecutionId_fkey" FOREIGN KEY ("actionExecutionId") REFERENCES "ActionExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

