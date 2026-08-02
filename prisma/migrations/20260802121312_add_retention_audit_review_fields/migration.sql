/*
  Warnings:

  - You are about to drop the column `approvalEmailError` on the `retention_audit_requests` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "retention_audit_requests" DROP COLUMN "approvalEmailError",
ADD COLUMN     "approvalEmailLastError" TEXT;
