-- Connected-Stripe metrics fixes. Adds nullable / defaulted columns only, so it
-- is safe to apply to a live database before deploying the code that uses it.
ALTER TABLE "workspace" ADD COLUMN IF NOT EXISTS "stripeHistoryBackfilledAt" TIMESTAMP(3);

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "currency" TEXT,
ADD COLUMN IF NOT EXISTS "customerSince" TIMESTAMP(3);

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "stripeInvoiceId" TEXT,
ADD COLUMN IF NOT EXISTS "currency" TEXT,
ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "failedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_stripeInvoiceId_key" ON "Invoice"("stripeInvoiceId");

ALTER TABLE "MrrSnapshot" ADD COLUMN IF NOT EXISTS "trialMrrMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "currency" TEXT;
