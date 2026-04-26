import { prisma } from "@/lib/prisma";

type ProgressKind = "email" | "notification" | "retry_payment";

type ProgressRow = {
    id: string;
    accountId?: string;
    customerId?: string;
    account: string;
    kind: ProgressKind;
    action: string;
    aiReason: string;
    outcome: "success" | "pending" | "failed";
    mrrSavedMinor: number;
    riskScore: number;
    date: string;
};

type RecentSavedRow = {
    id: string;
    account: string;
    mrrSavedMinor: number;
};

type PriorityAccountRow = {
    id: string;
    account: string;
    aiReason: string;
    mrrMinor: number;
    riskScore: number;
};

type ActionPerformanceRow = {
    id: string;
    action: string;
    executions: number;
    mrrSavedMinor: number;
    avgRiskDecreasePct: number;
};

type InternalActionRow = {
    id: string;
    accountId?: string;
    customerId?: string;
    account: string;
    kind: ProgressKind;
    action: string;
    aiReason: string;
    outcome: "success" | "pending" | "failed";
    mrrSavedMinor: number;
    riskScore: number;
    date: string;
    actionType: string;
    riskBefore: number | null;
    riskAfter: number | null;
};

function getProgressKind(actionType?: string | null): ProgressKind {
    const value = (actionType || "").toLowerCase();

    if (
        value.includes("retry_payment") ||
        value.includes("payment_retry") ||
        value.includes("billing_retry") ||
        value.includes("retry")
    ) {
        return "retry_payment";
    }

    if (
        value.includes("notification") ||
        value.includes("alert") ||
        value.includes("reminder") ||
        value.includes("in_app")
    ) {
        return "notification";
    }

    return "email";
}

function actionTypeLabel(type?: string | null) {
    switch ((type || "").toLowerCase()) {
        case "billing_recovery_email":
            return "Billing recovery email";
        case "reengagement_email":
            return "Re-engagement email";
        case "checkin_email":
            return "Check-in email";
        case "expansion_email":
            return "Expansion email";

        case "renewal_notification":
            return "Renewal reminder notification";
        case "health_alert_notification":
            return "Customer health alert";
        case "billing_warning_notification":
            return "Billing warning notification";
        case "in_app_notification":
            return "In-app notification";

        case "retry_payment":
            return "Retry payment workflow";
        case "retry_payment_scheduled":
            return "Retry payment scheduled";
        case "retry_payment_recovered":
            return "Retry payment recovered";
        case "retry_payment_failed":
            return "Retry payment failed";

        default:
            return "Retention action";
    }
}

function percentDelta(current: number, previous: number) {
    if (!previous) return current ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
}

function outcomeFromStatus(status?: string | null): "success" | "pending" | "failed" {
    const s = (status || "").toLowerCase();

    if (s === "recovered" || s === "retained" || s === "success") return "success";
    if (s === "failed") return "failed";
    return "pending";
}

function safeNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function startOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function previousMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth() - 1, 1, 0, 0, 0, 0);
}

export async function getLiveProgress(
    workspaceId: string,
    workspaceTier: string,
    connectedIntegrations: string[]
) {
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const currentMonthEnd = endOfMonth(now);

    const previousMonthDate = previousMonth(now);
    const previousMonthStart = startOfMonth(previousMonthDate);
    const previousMonthEnd = endOfMonth(previousMonthDate);

    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [actions, priorityRisks] = await Promise.all([
        prisma.actionExecution.findMany({
            where: {
                workspaceId,
                sentAt: { gte: ninetyDaysAgo },
            },
            orderBy: { sentAt: "desc" },
            include: {
                customer: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                outcomeSnapshots: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                },
            },
        }),
        prisma.accountRisk.findMany({
            where: {
                workspaceId,
                riskScore: { gte: 50 },
            },
            include: {
                customer: {
                    select: {
                        id: true,
                        name: true,
                        mrr: true,
                    },
                },
            },
            orderBy: [{ riskScore: "desc" }, { updatedAt: "desc" }],
            take: 5,
        }),
    ]);

    const actionRows: InternalActionRow[] = actions.map((action) => {
        const snapshot = action.outcomeSnapshots[0] || null;
        const outcome = outcomeFromStatus(action.status);

        const riskScore =
            snapshot?.riskScoreAfter ??
            snapshot?.riskScoreBefore ??
            0;

        const customerId = action.customerId || undefined;
        const accountId = action.accountRiskId || undefined;
        const stableEntityId = customerId || accountId || action.id;
        const actionDate = action.sentAt || action.createdAt;
        const actionType = action.actionType || "retention_action";
        const kind = getProgressKind(actionType);

        return {
            id: stableEntityId,
            customerId,
            accountId,
            account: action.customer?.name || "Unknown account",
            kind,
            action: actionTypeLabel(actionType),
            aiReason:
                action.reason ||
                action.aiHeadline ||
                action.subject ||
                "Retention workflow triggered",
            outcome,
            mrrSavedMinor: safeNumber(snapshot?.retainedRevenueMinor),
            riskScore: safeNumber(riskScore),
            date: actionDate.toISOString(),
            actionType,
            riskBefore: snapshot?.riskScoreBefore ?? null,
            riskAfter: snapshot?.riskScoreAfter ?? null,
        };
    });

    const currentRows = actionRows.filter((row) => {
        const d = new Date(row.date);
        return d >= currentMonthStart && d <= currentMonthEnd;
    });

    const previousRows = actionRows.filter((row) => {
        const d = new Date(row.date);
        return d >= previousMonthStart && d <= previousMonthEnd;
    });

    const currentSuccessRows = currentRows.filter((row) => row.outcome === "success");
    const previousSuccessRows = previousRows.filter((row) => row.outcome === "success");

    const mrrProtectedMinor = currentSuccessRows.reduce(
        (sum, row) => sum + safeNumber(row.mrrSavedMinor),
        0
    );

    const previousMrrProtectedMinor = previousSuccessRows.reduce(
        (sum, row) => sum + safeNumber(row.mrrSavedMinor),
        0
    );

    const accountsSaved = new Set(
        currentSuccessRows.map((row) => row.customerId || row.accountId || row.id)
    ).size;

    const previousAccountsSaved = new Set(
        previousSuccessRows.map((row) => row.customerId || row.accountId || row.id)
    ).size;

    const actionsExecuted = currentRows.length;
    const previousActionsExecuted = previousRows.length;

    const successRate = actionsExecuted
        ? Math.round((currentSuccessRows.length / actionsExecuted) * 100)
        : 0;

    const previousSuccessRate = previousActionsExecuted
        ? Math.round((previousSuccessRows.length / previousActionsExecuted) * 100)
        : 0;

    const recentMrrSaved: RecentSavedRow[] = [...currentSuccessRows]
        .sort((a, b) => b.mrrSavedMinor - a.mrrSavedMinor)
        .slice(0, 5)
        .map((row) => ({
            id: row.customerId || row.accountId || row.id,
            account: row.account,
            mrrSavedMinor: row.mrrSavedMinor,
        }));

    const nextPriorityAccounts: PriorityAccountRow[] = priorityRisks.map((risk) => ({
        id: risk.customer?.id || risk.id,
        account: risk.customer?.name || risk.companyName,
        aiReason: risk.reasonLabel,
        mrrMinor: Math.max(0, Math.round(Number(risk.customer?.mrr || risk.mrr || 0) * 100)),
        riskScore: risk.riskScore,
    }));

    const progressBreakdown: ProgressRow[] = currentRows.map((row) => ({
        id: row.id,
        customerId: row.customerId,
        accountId: row.accountId,
        account: row.account,
        kind: row.kind,
        action: row.action,
        aiReason: row.aiReason,
        outcome: row.outcome,
        mrrSavedMinor: row.mrrSavedMinor,
        riskScore: row.riskScore,
        date: row.date,
    }));

    const performanceMap = new Map<
        string,
        {
            action: string;
            executions: number;
            mrrSavedMinor: number;
            riskDecreasePcts: number[];
        }
    >();

    for (const row of currentRows) {
        const key = row.actionType;
        const current =
            performanceMap.get(key) || {
                action: actionTypeLabel(row.actionType),
                executions: 0,
                mrrSavedMinor: 0,
                riskDecreasePcts: [],
            };

        current.executions += 1;
        current.mrrSavedMinor += row.outcome === "success" ? row.mrrSavedMinor : 0;

        if (
            typeof row.riskBefore === "number" &&
            typeof row.riskAfter === "number" &&
            row.riskBefore > 0 &&
            row.riskAfter < row.riskBefore
        ) {
            current.riskDecreasePcts.push(
                Math.round(((row.riskBefore - row.riskAfter) / row.riskBefore) * 100)
            );
        }

        performanceMap.set(key, current);
    }

    const actionPerformance: ActionPerformanceRow[] = Array.from(performanceMap.entries()).map(
        ([key, value]) => ({
            id: key,
            action: value.action,
            executions: value.executions,
            mrrSavedMinor: value.mrrSavedMinor,
            avgRiskDecreasePct: value.riskDecreasePcts.length
                ? Math.round(
                    value.riskDecreasePcts.reduce((sum, n) => sum + n, 0) /
                    value.riskDecreasePcts.length
                )
                : 0,
        })
    );

    return {
        mode: "live" as const,
        workspaceTier,
        connectedIntegrations,
        kpis: {
            mrrProtectedMinor,
            accountsSaved,
            actionsExecuted,
            successRate,
            mrrProtectedPct: percentDelta(mrrProtectedMinor, previousMrrProtectedMinor),
            accountsSavedPct: percentDelta(accountsSaved, previousAccountsSaved),
            actionsExecutedPct: percentDelta(actionsExecuted, previousActionsExecuted),
            successRatePct: percentDelta(successRate, previousSuccessRate),
        },
        recentMrrSaved,
        nextPriorityAccounts,
        progressBreakdown,
        actionPerformance,
    };
}