-- AlterTable
ALTER TABLE "AccountTimelineEvent" ADD COLUMN     "providerEventId" TEXT;

-- AlterTable
ALTER TABLE "ActionExecution" ADD COLUMN     "clickedAt" TIMESTAMP(3),
ADD COLUMN     "openedAt" TIMESTAMP(3),
ADD COLUMN     "providerMessageId" TEXT,
ADD COLUMN     "repliedAt" TIMESTAMP(3);
