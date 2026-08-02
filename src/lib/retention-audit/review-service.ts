import { createHash, randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { retentionAuditConfig } from "@/lib/retention-audit/config";
import { enqueueRetentionAuditApprovalEmail } from "@/lib/retention-audit/email-jobs";

export type AuditReviewErrorCode =
    | "NOT_FOUND"
    | "REPORT_MISSING"
    | "INVALID_STATUS"
    | "CONCURRENT_UPDATE";

export class AuditReviewError extends Error {
    constructor(
        public readonly code: AuditReviewErrorCode,
        message: string,
    ) {
        super(message);

        this.name = "AuditReviewError";

        Object.setPrototypeOf(
            this,
            AuditReviewError.prototype,
        );
    }
}

type ApproveRetentionAuditInput = {
    auditId: string;
    notes?: string | null;
    reviewerId?: string | null;
};

type RejectRetentionAuditInput = {
    auditId: string;
    reason: string;
    reviewerId?: string | null;
};

type ResendRetentionAuditApprovalEmailInput = {
    auditId: string;
    reviewerId?: string | null;
};

function createSecureToken() {
    return randomBytes(32).toString("base64url");
}

function hashToken(token: string) {
    return createHash("sha256")
        .update(token)
        .digest("hex");
}

function normaliseReviewNote(
    value?: string | null,
) {
    const trimmed = value
        ?.trim()
        .slice(0, 1000);

    return trimmed || null;
}

function createReportExpiryDate() {
    const days =
        retentionAuditConfig.reportTtlDays();

    if (days === null) {
        return null;
    }

    const expiresAt = new Date();

    expiresAt.setUTCDate(
        expiresAt.getUTCDate() + days,
    );

    return expiresAt;
}

export async function approveRetentionAudit(
    input: ApproveRetentionAuditInput,
) {
    const audit =
        await prisma.retentionAuditRequest.findUnique({
            where: {
                id: input.auditId,
            },
            include: {
                report: {
                    select: {
                        id: true,
                    },
                },
            },
        });

    if (!audit) {
        throw new AuditReviewError(
            "NOT_FOUND",
            "The audit could not be found.",
        );
    }

    if (!audit.report) {
        throw new AuditReviewError(
            "REPORT_MISSING",
            "The audit report has not been generated yet.",
        );
    }

    if (
        audit.status !== "PENDING_REVIEW" &&
        audit.status !== "REJECTED"
    ) {
        throw new AuditReviewError(
            "INVALID_STATUS",
            `An audit with status ${audit.status} cannot be approved.`,
        );
    }

    const notes = normaliseReviewNote(
        input.notes,
    );

    const publicToken = createSecureToken();
    const publicTokenHash =
        hashToken(publicToken);

    const approvedAt = new Date();
    const publicTokenExpiresAt =
        createReportExpiryDate();

    const result = await prisma.$transaction(
        async (transaction) => {
            const claimed =
                await transaction.retentionAuditRequest.updateMany(
                    {
                        where: {
                            id: audit.id,
                            status: {
                                in: [
                                    "PENDING_REVIEW",
                                    "REJECTED",
                                ],
                            },
                        },
                        data: {
                            status: "APPROVED",

                            approvedAt,
                            rejectedAt: null,

                            notes,
                            failureReason: null,

                            publicTokenHash,
                            publicTokenCreatedAt:
                                approvedAt,
                            publicTokenExpiresAt,
                            publicTokenRevokedAt: null,

                            approvalEmailStatus:
                                "PENDING",
                            approvalEmailSentAt: null,
                            approvalEmailLastError:
                                null,
                            approvalEmailAttempts: {
                                increment: 1,
                            },

                            approvedBy:
                                input.reviewerId ??
                                null,
                            rejectedBy: null,
                        },
                    },
                );

            if (claimed.count !== 1) {
                return null;
            }

            const job =
                await enqueueRetentionAuditApprovalEmail(
                    transaction,
                    {
                        auditId: audit.id,
                        reportToken: publicToken,
                    },
                );

            await transaction.retentionAuditReviewEvent.create(
                {
                    data: {
                        auditId: audit.id,
                        action: "APPROVED",

                        reviewerId:
                            input.reviewerId ??
                            null,

                        previousStatus:
                            audit.status,
                        newStatus: "APPROVED",

                        note: notes,

                        metadata: {
                            emailJobId: job.id,
                            publicTokenCreatedAt:
                                approvedAt.toISOString(),
                            publicTokenExpiresAt:
                                publicTokenExpiresAt?.toISOString() ??
                                null,
                        },
                    },
                },
            );

            return {
                auditId: audit.id,
                emailJobId: job.id,
                emailQueued: true as const,
            };
        },
    );

    if (!result) {
        throw new AuditReviewError(
            "CONCURRENT_UPDATE",
            "This audit was changed by another request. Refresh the page and try again.",
        );
    }

    return result;
}

export async function rejectRetentionAudit(
    input: RejectRetentionAuditInput,
) {
    const reason = normaliseReviewNote(
        input.reason,
    );

    if (!reason) {
        throw new AuditReviewError(
            "INVALID_STATUS",
            "Enter a rejection reason.",
        );
    }

    const audit =
        await prisma.retentionAuditRequest.findUnique({
            where: {
                id: input.auditId,
            },
            select: {
                id: true,
                status: true,
            },
        });

    if (!audit) {
        throw new AuditReviewError(
            "NOT_FOUND",
            "The audit could not be found.",
        );
    }

    if (audit.status !== "PENDING_REVIEW") {
        throw new AuditReviewError(
            "INVALID_STATUS",
            "Only an audit pending review can be rejected.",
        );
    }

    const rejectedAt = new Date();

    const updated = await prisma.$transaction(
        async (transaction) => {
            const result =
                await transaction.retentionAuditRequest.updateMany(
                    {
                        where: {
                            id: audit.id,
                            status: "PENDING_REVIEW",
                        },
                        data: {
                            status: "REJECTED",

                            notes: reason,
                            failureReason: null,

                            approvedAt: null,
                            approvedBy: null,

                            rejectedAt,
                            rejectedBy:
                                input.reviewerId ??
                                null,

                            publicTokenHash: null,
                            publicTokenCreatedAt: null,
                            publicTokenExpiresAt: null,
                            publicTokenRevokedAt:
                                rejectedAt,

                            approvalEmailStatus:
                                "NOT_SENT",
                            approvalEmailSentAt: null,
                            approvalEmailLastError:
                                null,
                            approvalEmailAttempts: 0,
                        },
                    },
                );

            if (result.count !== 1) {
                return false;
            }

            await transaction.retentionAuditEmailJob.updateMany(
                {
                    where: {
                        auditId: audit.id,
                        status: {
                            in: [
                                "PENDING",
                                "PROCESSING",
                            ],
                        },
                    },
                    data: {
                        status: "FAILED",

                        lastError:
                            "The audit was rejected before the approval email was delivered.",

                        lockedAt: null,
                        lockedBy: null,

                        tokenCiphertext: "",
                        tokenIv: "",
                        tokenAuthTag: "",
                    },
                },
            );

            await transaction.retentionAuditReviewEvent.create(
                {
                    data: {
                        auditId: audit.id,
                        action: "REJECTED",

                        reviewerId:
                            input.reviewerId ??
                            null,

                        previousStatus:
                            audit.status,
                        newStatus: "REJECTED",

                        note: reason,
                    },
                },
            );

            return true;
        },
    );

    if (!updated) {
        throw new AuditReviewError(
            "CONCURRENT_UPDATE",
            "This audit was changed by another request. Refresh the page and try again.",
        );
    }

    return {
        auditId: audit.id,
    };
}

export async function resendRetentionAuditApprovalEmail(
    input: ResendRetentionAuditApprovalEmailInput,
) {
    const audit =
        await prisma.retentionAuditRequest.findUnique({
            where: {
                id: input.auditId,
            },
            select: {
                id: true,
                status: true,
                publicTokenHash: true,
            },
        });

    if (!audit) {
        throw new AuditReviewError(
            "NOT_FOUND",
            "The audit could not be found.",
        );
    }

    if (audit.status !== "APPROVED") {
        throw new AuditReviewError(
            "INVALID_STATUS",
            "Only an approved audit can be emailed again.",
        );
    }

    if (!audit.publicTokenHash) {
        throw new AuditReviewError(
            "INVALID_STATUS",
            "The approved audit does not have an active report link.",
        );
    }

    const publicToken = createSecureToken();
    const publicTokenHash =
        hashToken(publicToken);

    const publicTokenCreatedAt =
        new Date();

    const publicTokenExpiresAt =
        createReportExpiryDate();

    const result = await prisma.$transaction(
        async (transaction) => {
            const rotated =
                await transaction.retentionAuditRequest.updateMany(
                    {
                        where: {
                            id: audit.id,
                            status: "APPROVED",
                            publicTokenHash:
                                audit.publicTokenHash,
                        },
                        data: {
                            publicTokenHash,
                            publicTokenCreatedAt,
                            publicTokenExpiresAt,
                            publicTokenRevokedAt: null,

                            approvalEmailStatus:
                                "PENDING",
                            approvalEmailSentAt: null,
                            approvalEmailLastError:
                                null,
                            approvalEmailAttempts: {
                                increment: 1,
                            },
                        },
                    },
                );

            if (rotated.count !== 1) {
                return null;
            }

            /*
             * A resend rotates the report token because only
             * the token hash is stored on the audit record.
             *
             * Cancel older jobs so they cannot send an obsolete
             * report link after this new token is issued.
             */
            await transaction.retentionAuditEmailJob.updateMany(
                {
                    where: {
                        auditId: audit.id,
                        status: {
                            in: [
                                "PENDING",
                                "PROCESSING",
                            ],
                        },
                    },
                    data: {
                        status: "FAILED",

                        lastError:
                            "This email job was replaced by a newer approval email.",

                        lockedAt: null,
                        lockedBy: null,

                        tokenCiphertext: "",
                        tokenIv: "",
                        tokenAuthTag: "",
                    },
                },
            );

            const job =
                await enqueueRetentionAuditApprovalEmail(
                    transaction,
                    {
                        auditId: audit.id,
                        reportToken: publicToken,
                    },
                );

            await transaction.retentionAuditReviewEvent.create(
                {
                    data: {
                        auditId: audit.id,
                        action:
                            "APPROVAL_EMAIL_RESENT",

                        reviewerId:
                            input.reviewerId ??
                            null,

                        previousStatus:
                            "APPROVED",
                        newStatus: "APPROVED",

                        metadata: {
                            queued: true,
                            emailJobId: job.id,
                            publicTokenCreatedAt:
                                publicTokenCreatedAt.toISOString(),
                            publicTokenExpiresAt:
                                publicTokenExpiresAt?.toISOString() ??
                                null,
                        },
                    },
                },
            );

            return {
                auditId: audit.id,
                emailJobId: job.id,
                emailQueued: true as const,
            };
        },
    );

    if (!result) {
        throw new AuditReviewError(
            "CONCURRENT_UPDATE",
            "This audit changed while the approval email was being prepared.",
        );
    }

    return result;
}