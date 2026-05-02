-- AlterTable
ALTER TABLE "AccountRisk" ADD COLUMN     "previousRiskScore" INTEGER,
ADD COLUMN     "previousUpdatedAt" TIMESTAMP(3);
