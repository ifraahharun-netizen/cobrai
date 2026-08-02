import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { retentionAuditConfig } from "@/lib/retention-audit/config";
import { sendRetentionAuditApprovedEmail } from "@/lib/retention-audit/email";
import {
    decryptReportToken,
    encryptReportToken,
} from "@/lib/retention-audit/token-crypto";

function safeErrorMessage(error: unknown) {
    return error instanceof Error
        ? error.message.trim().slice(0, 500)
        : "The approval email could not be sent.";
}

function nextRetryDate(attempts: number) {
    const delaySeconds = Math.min(
        60 * 60,
        30 * 2 ** Math.max(0, attempts - 1),
    );

    return new Date(Date.now() + delaySeconds * 1000);
}

export async function enqueueRetentionAuditApprovalEmail(
    transaction: Parameters<
        Parameters<typeof prisma.$transaction>[0]
    >[0],
    input: {
        auditId: string;
        reportToken: string;
    },
) {
    const encrypted = encryptReportToken(input.reportToken);

    return transaction.retentionAuditEmailJob.create({
        data: {
            auditId: input.auditId,
            tokenCiphertext: encrypted.ciphertext,
            tokenIv: encrypted.iv,
            tokenAuthTag: encrypted.authTag,
            maxAttempts:
                retentionAuditConfig.emailMaxAttempts(),
        },
        select: {
            id: true,
        },
    });
}

async function claimNextJob(workerId: string) {
    const now = new Date();
    const staleLock = new Date(
        now.getTime() -
        retentionAuditConfig.workerLockMinutes() *
        60 *
        1000,
    );

    const candidate =
        await prisma.retentionAuditEmailJob.findFirst({
            where: {
                status: {
                    in: ["PENDING", "PROCESSING"],
                },
                nextAttemptAt: {
                    lte: now,
                },
                OR: [
                    {
                        lockedAt: null,
                    },
                    {
                        lockedAt: {
                            lte: staleLock,
                        },
                    },
                ],
            },
            orderBy: [
                {
                    nextAttemptAt: "asc",
                },
                {
                    createdAt: "asc",
                },
            ],
            select: {
                id: true,
            },
        });

    if (!candidate) {
        return null;
    }

    const claimed =
        await prisma.retentionAuditEmailJob.updateMany({
            where: {
                id: candidate.id,
                status: {
                    in: ["PENDING", "PROCESSING"],
                },
                OR: [
                    {
                        lockedAt: null,
                    },
                    {
                        lockedAt: {
                            lte: staleLock,
                        },
                    },
                ],
            },
            data: {
                status: "PROCESSING",
                lockedAt: now,
                lockedBy: workerId,
                attempts: {
                    increment: 1,
                },
            },
        });

    if (claimed.count !== 1) {
        return null;
    }

    return prisma.retentionAuditEmailJob.findUnique({
        where: {
            id: candidate.id,
        },
        include: {
            audit: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    website: true,
                    status: true,
                    publicTokenHash: true,
                },
            },
        },
    });
}

async function processJob(
    job: NonNullable<
        Awaited<ReturnType<typeof claimNextJob>>
    >,
) {
    try {
        if (job.audit.status !== "APPROVED") {
            throw new Error(
                "The audit is no longer approved.",
            );
        }

        const reportToken = decryptReportToken({
            ciphertext: job.tokenCiphertext,
            iv: job.tokenIv,
            authTag: job.tokenAuthTag,
        });

        const reportUrl =
            `${retentionAuditConfig.appUrl()}/retention-audit/report/` +
            encodeURIComponent(reportToken);

        await sendRetentionAuditApprovedEmail({
            to: job.audit.email,
            name: job.audit.name,
            website: job.audit.website,
            reportUrl,
        });

        const sentAt = new Date();

        await prisma.$transaction([
            prisma.retentionAuditEmailJob.update({
                where: {
                    id: job.id,
                },
                data: {
                    status: "SENT",
                    sentAt,
                    lockedAt: null,
                    lockedBy: null,
                    lastError: null,
                    tokenCiphertext: "",
                    tokenIv: "",
                    tokenAuthTag: "",
                },
            }),
            prisma.retentionAuditRequest.update({
                where: {
                    id: job.audit.id,
                },
                data: {
                    approvalEmailStatus: "SENT",
                    approvalEmailSentAt: sentAt,
                    approvalEmailLastError: null,
                },
            }),
            prisma.retentionAuditReviewEvent.create({
                data: {
                    auditId: job.audit.id,
                    action:
                        job.attempts > 1
                            ? "APPROVAL_EMAIL_RESENT"
                            : "APPROVAL_EMAIL_SENT",
                    previousStatus: "APPROVED",
                    newStatus: "APPROVED",
                    metadata: {
                        jobId: job.id,
                        attempts: job.attempts,
                        sentAt: sentAt.toISOString(),
                    },
                },
            }),
        ]);

        return {
            id: job.id,
            status: "SENT" as const,
        };
    } catch (error) {
        const lastError = safeErrorMessage(error);
        const exhausted =
            job.attempts >= job.maxAttempts;

        await prisma.$transaction([
            prisma.retentionAuditEmailJob.update({
                where: {
                    id: job.id,
                },
                data: {
                    status: exhausted
                        ? "FAILED"
                        : "PENDING",
                    nextAttemptAt: exhausted
                        ? job.nextAttemptAt
                        : nextRetryDate(job.attempts),
                    lockedAt: null,
                    lockedBy: null,
                    lastError,
                },
            }),
            prisma.retentionAuditRequest.update({
                where: {
                    id: job.audit.id,
                },
                data: {
                    approvalEmailStatus: exhausted
                        ? "FAILED"
                        : "PENDING",
                    approvalEmailLastError: lastError,
                },
            }),
            prisma.retentionAuditReviewEvent.create({
                data: {
                    auditId: job.audit.id,
                    action: "APPROVAL_EMAIL_FAILED",
                    previousStatus: "APPROVED",
                    newStatus: "APPROVED",
                    errorMessage: lastError,
                    metadata: {
                        jobId: job.id,
                        attempts: job.attempts,
                        exhausted,
                    },
                },
            }),
        ]);

        return {
            id: job.id,
            status: exhausted
                ? ("FAILED" as const)
                : ("RETRYING" as const),
        };
    }
}

export async function processRetentionAuditEmailJobs() {
    const workerId = randomUUID();
    const results: Array<{
        id: string;
        status: "SENT" | "FAILED" | "RETRYING";
    }> = [];

    for (
        let index = 0;
        index < retentionAuditConfig.workerBatchSize();
        index += 1
    ) {
        const job = await claimNextJob(workerId);

        if (!job) {
            break;
        }

        results.push(await processJob(job));
    }

    return results;
}
