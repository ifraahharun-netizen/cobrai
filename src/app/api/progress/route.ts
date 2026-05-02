import { NextResponse } from "next/server";
import { getDemoProgress } from "@/lib/demo/progress";
import { getLiveProgress } from "@/lib/live/progress";
import { refreshRecentActionOutcomes } from "@/lib/live/refreshActionOutcomes";
import { getWorkspaceDataMode } from "@/lib/workspace/getWorkspaceDataMode";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STARTER_RETENTION_ACTIVITY_LIMIT = 10;

type ProgressKind = "email" | "notification" | "retry_payment";
type ConfidenceLevel = "High" | "Medium" | "Low";

type ProgressRow = {
    id: string;
    accountId?: string;
    email?: string;
    customerId?: string;
    account: string;
    action: string;
    aiReason: string;
    outcome: "success" | "pending" | "failed";
    mrrSavedMinor: number;
    riskScore: number;
    date: string;
    kind?: ProgressKind;
};

type NextPriorityAccount = {
    id: string;
    account: string;
    aiReason: string;
    aiAction?: string;
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

type ProgressAiInsight = {
    headline: string;
    summary: string;
    confidence: ConfidenceLevel;
    nextBestAction: string;
    topDriver?: string;
};

type ProgressResponseShape = {
    ok?: boolean;
    mode?: "demo" | "live";
    workspaceTier?: string;
    trialEndsAt?: string | Date | null;
    connectedIntegrations?: string[];
    kpis: {
        mrrProtectedMinor: number;
        accountsSaved: number;
        actionsExecuted: number;
        successRate: number;
        mrrProtectedPct: number;
        accountsSavedPct: number;
        actionsExecutedPct: number;
        successRatePct: number;
    };
    aiInsight?: ProgressAiInsight;
    recentMrrSaved?: {
        id: string;
        account: string;
        mrrSavedMinor: number;
        date?: string;
    }[];
    nextPriorityAccounts?: NextPriorityAccount[];
    progressBreakdown?: ProgressRow[];
    actionPerformance?: ActionPerformanceRow[];
};

async function getWorkspaceAuthFromRequest(req: Request) {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;

    const idToken = authHeader.slice("Bearer ".length).trim();
    if (!idToken) return null;

    const decoded = await verifyFirebaseIdToken(idToken);

    const user = await prisma.user.findFirst({
        where: { firebaseUid: decoded.uid },
        select: {
            workspaceId: true,
            workspace: {
                select: {
                    trialEndsAt: true,
                },
            },
        },
    });

    if (!user?.workspaceId) return null;

    return {
        workspaceId: user.workspaceId,
        trialEndsAt: user.workspace?.trialEndsAt ?? null,
    };
}

function inferProgressKind(action: string): ProgressKind {
    const value = String(action || "").toLowerCase();

    if (
        value.includes("retry") ||
        value.includes("payment") ||
        value.includes("billing")
    ) {
        return "retry_payment";
    }

    if (
        value.includes("notification") ||
        value.includes("alert") ||
        value.includes("reminder") ||
        value.includes("in-app")
    ) {
        return "notification";
    }

    return "email";
}

function buildAiAction(aiReason: string, riskScore: number) {
    const reason = String(aiReason || "").toLowerCase();

    if (reason.includes("payment") || reason.includes("billing") || reason.includes("card")) {
        return "Send a billing recovery email and confirm the correct payment contact.";
    }

    if (reason.includes("engagement") || reason.includes("activity") || reason.includes("usage")) {
        return "Send a personalised check-in with a usage recap and offer a quick success call.";
    }

    if (reason.includes("renewal")) {
        return "Send a renewal reminder with clear value delivered and next-step support.";
    }

    if (reason.includes("support")) {
        return "Follow up on the open support issue and confirm the customer is unblocked.";
    }

    if (riskScore >= 85) {
        return "Contact this account today with a high-priority retention message.";
    }

    if (riskScore >= 70) {
        return "Send a personalised retention check-in this week.";
    }

    return "Monitor engagement and send a value recap if activity keeps dropping.";
}

function normalizeProgressBreakdown(rows: unknown): ProgressRow[] {
    if (!Array.isArray(rows)) return [];

    return rows.map((row, index) => {
        const item = row as Partial<ProgressRow>;
        const action = String(item.action || "Unknown action");
        const id = String(
            item.id || item.accountId || item.customerId || `progress-${index + 1}`
        );

        return {
            id,
            accountId: item.accountId ? String(item.accountId) : id,
            email: item.email ? String(item.email) : undefined,
            customerId: item.customerId ? String(item.customerId) : id,
            account: String(item.account || "Unknown account"),
            action,
            aiReason: String(item.aiReason || ""),
            outcome:
                item.outcome === "success" ||
                    item.outcome === "pending" ||
                    item.outcome === "failed"
                    ? item.outcome
                    : "pending",
            mrrSavedMinor: Number(item.mrrSavedMinor || 0),
            riskScore: Number(item.riskScore || 0),
            date: String(item.date || new Date().toISOString()),
            kind:
                item.kind === "email" ||
                    item.kind === "notification" ||
                    item.kind === "retry_payment"
                    ? item.kind
                    : inferProgressKind(action),
        };
    });
}

function normalizeNextPriorityAccounts(rows: unknown): NextPriorityAccount[] {
    if (!Array.isArray(rows)) return [];

    return rows.map((row, index) => {
        const item = row as Partial<NextPriorityAccount>;
        const id = String(item.id || `priority-${index + 1}`);
        const aiReason = String(
            item.aiReason || "AI detected increased churn risk from recent account signals."
        );
        const riskScore = Number(item.riskScore || 0);

        return {
            id,
            account: String(item.account || "Unknown account"),
            aiReason,
            aiAction: item.aiAction ? String(item.aiAction) : buildAiAction(aiReason, riskScore),
            mrrMinor: Number(item.mrrMinor || 0),
            riskScore,
        };
    });
}

function normalizeArray<T>(value: T[] | undefined): T[] {
    return Array.isArray(value) ? value : [];
}

function normalizeProgressResponse(data: ProgressResponseShape): ProgressResponseShape {
    return {
        ...data,
        ok: true,
        kpis: {
            mrrProtectedMinor: Number(data.kpis?.mrrProtectedMinor || 0),
            accountsSaved: Number(data.kpis?.accountsSaved || 0),
            actionsExecuted: Number(data.kpis?.actionsExecuted || 0),
            successRate: Number(data.kpis?.successRate || 0),
            mrrProtectedPct: Number(data.kpis?.mrrProtectedPct || 0),
            accountsSavedPct: Number(data.kpis?.accountsSavedPct || 0),
            actionsExecutedPct: Number(data.kpis?.actionsExecutedPct || 0),
            successRatePct: Number(data.kpis?.successRatePct || 0),
        },
        recentMrrSaved: normalizeArray(data.recentMrrSaved),
        nextPriorityAccounts: normalizeNextPriorityAccounts(data.nextPriorityAccounts),
        progressBreakdown: normalizeProgressBreakdown(data.progressBreakdown),
        actionPerformance: normalizeArray(data.actionPerformance),
    };
}

function applyProgressPlanLimits(data: ProgressResponseShape, workspaceTier: string) {
    const isStarter = String(workspaceTier || "").toLowerCase() === "starter";

    if (!isStarter) return data;

    return {
        ...data,
        progressBreakdown: Array.isArray(data.progressBreakdown)
            ? data.progressBreakdown.slice(0, STARTER_RETENTION_ACTIVITY_LIMIT)
            : [],
    };
}

function hasNoProgressContent(data: ProgressResponseShape) {
    return (
        !data.progressBreakdown?.length &&
        !data.recentMrrSaved?.length &&
        !data.nextPriorityAccounts?.length &&
        !data.actionPerformance?.length
    );
}

function formatGBPFromMinor(minor: number) {
    return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: 0,
    }).format((minor || 0) / 100);
}

function humanizeActionLabel(label?: string | null) {
    const value = String(label || "").trim();
    if (!value) return "retention workflows";

    const lowered = value.toLowerCase();

    if (lowered.includes("billing recovery")) return "billing recovery workflows";
    if (lowered.includes("re-engagement")) return "re-engagement workflows";
    if (lowered.includes("retry payment")) return "retry payment workflows";
    if (lowered.includes("renewal reminder")) return "renewal reminder workflows";
    if (lowered.includes("notification")) return "notification workflows";
    if (lowered.includes("check-in")) return "check-in workflows";

    return value.toLowerCase();
}

function pickConfidence(actionsExecuted: number, successRate: number): ConfidenceLevel {
    if (actionsExecuted >= 10 && successRate >= 45) return "High";
    if (actionsExecuted >= 5) return "Medium";
    return "Low";
}

function buildNextBestAction(
    topDriver: string,
    failedCount: number,
    pendingCount: number,
    topPriorityReason?: string
) {
    if (failedCount > 0) {
        return `Review failed workflows and strengthen ${topDriver} coverage for at-risk accounts.`;
    }

    if (pendingCount > 0) {
        return `Follow up on pending workflows and prioritise ${topDriver} for accounts still showing churn risk.`;
    }

    if (topPriorityReason) {
        return `Prioritise accounts showing ${topPriorityReason.toLowerCase()} and expand ${topDriver}.`;
    }

    return `Scale ${topDriver} across the highest-risk accounts to protect more revenue.`;
}

function buildProgressAiInsight(data: ProgressResponseShape): ProgressAiInsight {
    const mrrProtectedMinor = Number(data.kpis?.mrrProtectedMinor || 0);
    const mrrProtectedPct = Number(data.kpis?.mrrProtectedPct || 0);
    const actionsExecuted = Number(data.kpis?.actionsExecuted || 0);
    const successRate = Number(data.kpis?.successRate || 0);

    const actionPerformance = [...(data.actionPerformance || [])].sort((a, b) => {
        if (b.mrrSavedMinor !== a.mrrSavedMinor) return b.mrrSavedMinor - a.mrrSavedMinor;
        if (b.executions !== a.executions) return b.executions - a.executions;
        return b.avgRiskDecreasePct - a.avgRiskDecreasePct;
    });

    const progressBreakdown = data.progressBreakdown || [];
    const nextPriorityAccounts = data.nextPriorityAccounts || [];

    const topAction = actionPerformance[0];
    const topDriver = humanizeActionLabel(topAction?.action);

    const failedCount = progressBreakdown.filter((row) => row.outcome === "failed").length;
    const pendingCount = progressBreakdown.filter((row) => row.outcome === "pending").length;
    const successCount = progressBreakdown.filter((row) => row.outcome === "success").length;

    const topPriorityReason = nextPriorityAccounts[0]?.aiReason?.trim();

    const headline =
        mrrProtectedMinor > 0
            ? `${formatGBPFromMinor(mrrProtectedMinor)} protected this month`
            : "No retained revenue recorded yet";

    let summary = "";

    if (mrrProtectedMinor <= 0 && actionsExecuted <= 0) {
        summary =
            "No workflow activity has been recorded yet. Connect activity and billing signals to generate retention insights.";
    } else if (mrrProtectedPct >= 0) {
        summary = `Performance improved vs last month, driven by ${topDriver}. ${successCount} workflow${successCount === 1 ? "" : "s"
            } completed successfully${topPriorityReason
                ? `, while the main remaining risk is ${topPriorityReason.toLowerCase()}.`
                : "."
            }`;
    } else {
        summary = `Performance softened vs last month. ${topDriver} is still the strongest driver, but ${failedCount} failed workflow${failedCount === 1 ? "" : "s"
            } and ${pendingCount} pending workflow${pendingCount === 1 ? "" : "s"
            } are limiting protected revenue${topPriorityReason
                ? `, especially in accounts showing ${topPriorityReason.toLowerCase()}.`
                : "."
            }`;
    }

    return {
        headline,
        summary,
        confidence: pickConfidence(actionsExecuted, successRate),
        nextBestAction: buildNextBestAction(
            topDriver,
            failedCount,
            pendingCount,
            topPriorityReason
        ),
        topDriver: topAction?.action || undefined,
    };
}

function buildFinalResponse({
    data,
    mode,
    workspaceTier,
    trialEndsAt,
    connectedIntegrations,
    applyStarterLimit,
}: {
    data: ProgressResponseShape;
    mode: "demo" | "live";
    workspaceTier: string;
    trialEndsAt: string | Date | null;
    connectedIntegrations: string[];
    applyStarterLimit: boolean;
}) {
    const normalizedData = normalizeProgressResponse(data);

    const finalData = applyStarterLimit
        ? applyProgressPlanLimits(normalizedData, workspaceTier)
        : normalizedData;

    return {
        ...finalData,
        ok: true,
        aiInsight: buildProgressAiInsight(finalData),
        mode,
        workspaceTier,
        trialEndsAt,
        connectedIntegrations,
    };
}

function buildDemoResponse({
    workspaceTier = "starter",
    trialEndsAt = null,
    connectedIntegrations = [],
}: {
    workspaceTier?: string;
    trialEndsAt?: string | Date | null;
    connectedIntegrations?: string[];
} = {}) {
    const demoData = getDemoProgress() as ProgressResponseShape;

    return buildFinalResponse({
        data: demoData,
        mode: "demo",
        workspaceTier,
        trialEndsAt,
        connectedIntegrations,
        applyStarterLimit: false,
    });
}

export async function GET(req: Request) {
    try {
        const workspaceAuth = await getWorkspaceAuthFromRequest(req);

        if (!workspaceAuth?.workspaceId) {
            return NextResponse.json(buildDemoResponse(), { status: 200 });
        }

        const { workspaceId, trialEndsAt } = workspaceAuth;

        const modeInfo = await getWorkspaceDataMode(workspaceId);
        const workspaceTier = String(modeInfo.workspaceTier || "starter");

        const connectedIntegrations = Array.isArray(modeInfo.connectedIntegrations)
            ? modeInfo.connectedIntegrations
            : [];

        const trialEndsAtMs = trialEndsAt ? new Date(trialEndsAt).getTime() : 0;

        const isTrialActive =
            Boolean(trialEndsAtMs) &&
            Number.isFinite(trialEndsAtMs) &&
            trialEndsAtMs > Date.now();

        if (isTrialActive) {
            return NextResponse.json(
                buildDemoResponse({
                    workspaceTier,
                    trialEndsAt,
                    connectedIntegrations,
                }),
                { status: 200 }
            );
        }

        if (modeInfo.mode === "live") {
            await refreshRecentActionOutcomes(workspaceId);

            const liveData = (await getLiveProgress(
                workspaceId,
                workspaceTier,
                connectedIntegrations
            )) as ProgressResponseShape;

            const normalizedLiveData = normalizeProgressResponse(liveData);

            if (hasNoProgressContent(normalizedLiveData)) {
                return NextResponse.json(
                    buildDemoResponse({
                        workspaceTier,
                        trialEndsAt,
                        connectedIntegrations,
                    }),
                    { status: 200 }
                );
            }

            return NextResponse.json(
                buildFinalResponse({
                    data: normalizedLiveData,
                    mode: "live",
                    workspaceTier,
                    trialEndsAt,
                    connectedIntegrations,
                    applyStarterLimit: workspaceTier.toLowerCase() === "starter",
                }),
                { status: 200 }
            );
        }

        return NextResponse.json(
            buildDemoResponse({
                workspaceTier,
                trialEndsAt,
                connectedIntegrations,
            }),
            { status: 200 }
        );
    } catch (error) {
        console.error("GET /api/progress failed", error);
        return NextResponse.json(buildDemoResponse(), { status: 200 });
    }
}