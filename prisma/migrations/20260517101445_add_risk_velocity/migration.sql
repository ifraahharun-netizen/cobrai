-- AlterTable
ALTER TABLE "AccountRiskSnapshot" ADD COLUMN     "accelerationScore" DOUBLE PRECISION,
ADD COLUMN     "momentumScore" INTEGER,
ADD COLUMN     "velocityScore" DOUBLE PRECISION;
