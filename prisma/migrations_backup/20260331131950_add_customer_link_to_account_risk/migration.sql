-- AlterTable
ALTER TABLE "AccountRisk" ADD COLUMN     "customerId" TEXT;

-- CreateIndex
CREATE INDEX "AccountRisk_customerId_idx" ON "AccountRisk"("customerId");

-- AddForeignKey
ALTER TABLE "AccountRisk" ADD CONSTRAINT "AccountRisk_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
