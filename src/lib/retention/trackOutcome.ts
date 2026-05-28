import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type OutcomeInput = {
    workspaceId: string;
    actionExecutionId: string;

    riskScoreBefore?: number | null;
    riskScoreAfter?: number | null;

    mrrBefore?: number | null;
    mrrAfter?: number | null;

    churnRiskBefore?: number | null;
    churnRiskAfter?: number | null;

    wasOpened?: boolean;
    wasClicked?: boolean;
    wasReplied?: boolean;
    paymentRecovered?: boolean;

    retainedRevenueMinor?: number | null;
    outcomeLabel?: string | null;

    metadata?: Prisma.InputJsonValue;
};

export async function trackActionOutcome(input: OutcomeInput) {
    return prisma.actionOutcomeSnapshot.create({
        data: {
            workspaceId: input.workspaceId,
            actionExecutionId: input.actionExecutionId,

            riskScoreBefore: input.riskScoreBefore ?? null,
            riskScoreAfter: input.riskScoreAfter ?? null,

            mrrBefore: input.mrrBefore ?? null,
            mrrAfter: input.mrrAfter ?? null,

            churnRiskBefore: input.churnRiskBefore ?? null,
            churnRiskAfter: input.churnRiskAfter ?? null,

            wasOpened: input.wasOpened ?? null,
            wasClicked: input.wasClicked ?? null,
            wasReplied: input.wasReplied ?? null,
            paymentRecovered: input.paymentRecovered ?? null,

            retainedRevenueMinor: input.retainedRevenueMinor ?? null,
            outcomeLabel: input.outcomeLabel ?? null,

            metadata: input.metadata ?? Prisma.JsonNull,
        },
    });
}