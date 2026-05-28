import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type TrackActionInput = {
    workspaceId: string;
    customerId?: string | null;
    retentionActionId?: string | null;
    accountRiskId?: string | null;

    actionType: string;

    channel:
    | "email"
    | "manual"
    | "task"
    | "call"
    | "retry_payment"
    | string;

    title?: string | null;
    subject?: string | null;
    body?: string | null;
    reason?: string | null;

    aiHeadline?: string | null;
    aiConfidence?: number | null;

    status?:
    | "pending"
    | "sent"
    | "success"
    | "failed"
    | string;

    provider?: string | null;
    providerMessageId?: string | null;

    metadata?: Prisma.InputJsonValue;
};

export async function trackActionExecution(
    input: TrackActionInput
) {
    return prisma.actionExecution.create({
        data: {
            workspaceId: input.workspaceId,

            customerId:
                input.customerId ?? null,

            retentionActionId:
                input.retentionActionId ?? null,

            accountRiskId:
                input.accountRiskId ?? null,

            actionType:
                input.actionType,

            channel:
                input.channel,

            title:
                input.title ?? null,

            subject:
                input.subject ?? null,

            body:
                input.body ?? null,

            reason:
                input.reason ?? null,

            aiHeadline:
                input.aiHeadline ?? null,

            aiConfidence:
                input.aiConfidence ?? null,

            status:
                input.status ?? "pending",

            provider:
                input.provider ?? null,

            providerMessageId:
                input.providerMessageId ?? null,

            sentAt:
                input.status === "sent" ||
                    input.status === "success"
                    ? new Date()
                    : null,

            metadata:
                input.metadata ?? Prisma.JsonNull,
        },
    });
}