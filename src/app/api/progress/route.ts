import { NextResponse } from "next/server";
import { getDemoProgress } from "@/lib/demo/progress";
import { getLiveProgress } from "@/lib/live/progress";
import { refreshRecentActionOutcomes } from "@/lib/live/refreshActionOutcomes";
import { getWorkspaceDataMode } from "@/lib/workspace/getWorkspaceDataMode";
import { canAccessFeature, type PlanTier } from "@/lib/permissions";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STARTER_RETENTION_ACTIVITY_LIMIT = 10;

type ProgressKind = "email" | "retry_payment";
type ConfidenceLevel = "High" | "Medium" | "Low";

type RetentionSignal = {
    label: string;
    severity: "low" | "medium" | "high";
}

type ProgressRow = {
    id: string;
    accountId?: string;
    email?: string;
    customerId?: string;
    account: string;
    action: string;
    aiReason: string;
    aiRecommendation?: string;
    aiSignals?: RetentionSignal[];
    effectivenessScore?: number;
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
    currency?: string;
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
        const aiReason = String(item.aiReason || "");
        const riskScore = Number(item.riskScore || 0);

        const id = String(
            item.id || item.accountId || item.customerId || `progress-${index + 1}`
        );

        const aiSignals = Array.isArray(item.aiSignals)
            ? item.aiSignals
                .map((signal) => ({
                    label: String(signal?.label || "").trim(),
                    severity:
                        signal?.severity === "high" ||
                            signal?.severity === "medium" ||
                            signal?.severity === "low"
                            ? signal.severity
                            : "medium",
                }))
                .filter((signal) => signal.label.length > 0)
            : [];

        return {
            id,
            accountId: item.accountId ? String(item.accountId) : id,
            email: item.email ? String(item.email) : undefined,
            customerId: item.customerId ? String(item.customerId) : id,
            account: String(item.account || "Unknown account"),
            action,
            aiReason,
            aiRecommendation: item.aiRecommendation
                ? String(item.aiRecommendation)
                : buildAiAction(aiReason, riskScore),
            aiSignals,
            effectivenessScore:
                typeof item.effectivenessScore === "number"
                    ? Number(item.effectivenessScore)
                    : undefined,
            outcome:
                item.outcome === "success" ||
                    item.outcome === "pending" ||
                    item.outcome === "failed"
                    ? item.outcome
                    : "pending",
            mrrSavedMinor: Number(item.mrrSavedMinor || 0),
            riskScore,
            date: String(item.date || new Date().toISOString()),
            kind:
                item.kind === "email" || item.kind === "retry_payment"
                    ? item.kind
                    : inferProgressKind(action),
        };
    });
}

function normalizeCurrency(value?: string | null) {
    const currency = String(value || "GBP").trim().toUpperCase();

    if (/^[A-Z]{3}$/.test(currency)) return currency;

    return "GBP";
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

function formatMoneyFromMinor(minor: number, currency = "GBP") {
    return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: normalizeCurrency(currency),
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
function buildProgressAiInsight(
    data: ProgressResponseShape,
    currency = "GBP"
): ProgressAiInsight {
    const mrrProtectedMinor =
        Number(data.kpis?.mrrProtectedMinor || 0);

    const actionsExecuted =
        Number(data.kpis?.actionsExecuted || 0);

    const successRate =
        Number(data.kpis?.successRate || 0);

    const accountsSaved =
        Number(data.kpis?.accountsSaved || 0);

    const progressRows =
        data.progressBreakdown || [];

    const successCount =
        progressRows.filter(
            (r) => r.outcome === "success"
        ).length;

    const failedCount =
        progressRows.filter(
            (r) => r.outcome === "failed"
        ).length;

    const pendingCount =
        progressRows.filter(
            (r) => r.outcome === "pending"
        ).length;

    const total =
        progressRows.length;

    const failureRate =
        total > 0
            ? Math.round(
                (failedCount / total) * 100
            )
            : 0;

    let health: string =
        "Stable";

    if (
        successRate >= 65 &&
        failureRate <= 15
    ) {
        health = "Strong";
    } else if (
        successRate >= 40
    ) {
        health = "Stable";
    } else if (
        failureRate >= 40
    ) {
        health = "At risk";
    } else {
        health = "Needs attention";
    }

    let headline = "";

    if (health === "Strong") {
        headline =
            "Retention performance is strong";
    } else if (
        health === "Stable"
    ) {
        headline =
            "Retention performance is stable";
    } else if (
        health === "At risk"
    ) {
        headline =
            "Retention performance is declining";
    } else {
        headline =
            "Retention workflows need attention";
    }

    let summary = "";

    if (actionsExecuted <= 0) {
        summary =
            "No retention workflows have been executed yet. Connect billing and customer activity signals to start tracking churn prevention performance.";
    } else {
        summary =
            `${accountsSaved} account${accountsSaved === 1 ? "" : "s"
            } recovered, ${successCount} successful workflow${successCount === 1 ? "" : "s"
            }, ${failedCount} failed, and ${pendingCount} still pending. ${formatMoneyFromMinor(mrrProtectedMinor, currency)
            } in revenue has been protected so far.`;
    }

    let nextBestAction = "";

    if (failureRate >= 40) {
        nextBestAction =
            "Review failed retention workflows and prioritise accounts with accelerating churn risk.";
    } else if (
        pendingCount >= 5
    ) {
        nextBestAction =
            "Follow up on pending retention workflows before risk escalates further.";
    } else if (
        successRate >= 65
    ) {
        nextBestAction =
            "Scale the highest-performing retention workflows across more at-risk accounts.";
    } else {
        nextBestAction =
            "Focus on improving customer engagement and reducing unresolved billing risk.";
    }

    return {
        headline,

        summary,

        confidence:
            pickConfidence(
                actionsExecuted,
                successRate
            ),

        nextBestAction,

        topDriver: health,
    };
}

function buildFinalResponse({
    data,
    mode,
    workspaceTier,
    trialEndsAt,
    connectedIntegrations,
    applyStarterLimit,
    currency,
}: {
    data: ProgressResponseShape;
    mode: "demo" | "live";
    workspaceTier: string;
    trialEndsAt: string | Date | null;
    connectedIntegrations: string[];
    applyStarterLimit: boolean;
    currency?: string;
}) {
    const normalizedData = normalizeProgressResponse(data);

    const finalData = applyStarterLimit
        ? applyProgressPlanLimits(normalizedData, workspaceTier)
        : normalizedData;

    return {
        ...finalData,
        ok: true,
        currency: normalizeCurrency(currency || finalData.currency),
        aiInsight: buildProgressAiInsight(finalData, currency || finalData.currency),
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

        // -------------------------------------------------
        // NO AUTH → FULL DEMO
        // -------------------------------------------------

        if (!workspaceAuth?.workspaceId) {
            return NextResponse.json(
                buildDemoResponse(),
                { status: 200 }
            );
        }

        const { workspaceId, trialEndsAt } = workspaceAuth;

        // -------------------------------------------------
        // WORKSPACE MODE
        // -------------------------------------------------

        const modeInfo = await getWorkspaceDataMode(workspaceId);

        const workspaceTier = String(
            modeInfo.workspaceTier || "starter"
        );

        const trialEndsAtMs = trialEndsAt
            ? new Date(trialEndsAt).getTime()
            : 0;

        const isTrialActive =
            Boolean(trialEndsAtMs) &&
            Number.isFinite(trialEndsAtMs) &&
            trialEndsAtMs > Date.now();

        const isDemoMode = modeInfo.mode !== "live";

        const canAccessRetentionImpact = canAccessFeature({
            plan: workspaceTier as PlanTier,
            feature: "retention-impact",
            trialEndsAt,
            isDemoMode,
        });

        if (!canAccessRetentionImpact) {
            return NextResponse.json(
                {
                    ok: false,
                    locked: true,
                    requiredPlan: "pro",
                    message: "Retention impact is available on Pro or during the 14-day free trial.",
                },
                { status: 403 }
            );
        }

        const connectedIntegrations = Array.isArray(
            modeInfo.connectedIntegrations
        )
            ? modeInfo.connectedIntegrations
            : [];



        // -------------------------------------------------
        // DEMO MODE
        // -------------------------------------------------

        if (modeInfo.mode !== "live") {
            return NextResponse.json(
                buildFinalResponse({
                    data: getDemoProgress() as ProgressResponseShape,
                    mode: "demo",
                    workspaceTier,
                    trialEndsAt,
                    connectedIntegrations,
                    applyStarterLimit: false,
                }),
                { status: 200 }
            );
        }

        // -------------------------------------------------
        // LIVE MODE
        // -------------------------------------------------

        await refreshRecentActionOutcomes(workspaceId);

        const liveData = (await getLiveProgress(
            workspaceId,
            workspaceTier,
            connectedIntegrations
        )) as ProgressResponseShape;

        const normalizedLiveData =
            normalizeProgressResponse(liveData);

        // -------------------------------------------------
        // CRITICAL LIVE DATA CHECK
        // -------------------------------------------------

        const hasLiveProgressBreakdown =
            Array.isArray(
                normalizedLiveData.progressBreakdown
            ) &&
            normalizedLiveData.progressBreakdown.length > 0;

        // -------------------------------------------------
        // NO LIVE RETENTION ACTIVITY YET
        // SHOW DEMO CONTENT INSTEAD
        // -------------------------------------------------

        if (!hasLiveProgressBreakdown) {
            return NextResponse.json(
                buildFinalResponse({
                    data: {
                        kpis: {
                            mrrProtectedMinor: 0,
                            accountsSaved: 0,
                            actionsExecuted: 0,
                            successRate: 0,
                            mrrProtectedPct: 0,
                            accountsSavedPct: 0,
                            actionsExecutedPct: 0,
                            successRatePct: 0,
                        },
                        recentMrrSaved: [],
                        nextPriorityAccounts: [],
                        progressBreakdown: [],
                        actionPerformance: [],
                    },
                    mode: "live",
                    workspaceTier,
                    trialEndsAt,
                    connectedIntegrations,
                    applyStarterLimit: workspaceTier.toLowerCase() === "starter",
                }),
                { status: 200 }
            );
        }

        // -------------------------------------------------
        // LIVE RESPONSE
        // -------------------------------------------------

        return NextResponse.json(
            buildFinalResponse({
                data: normalizedLiveData,
                mode: "live",
                workspaceTier,
                trialEndsAt,
                connectedIntegrations,
                applyStarterLimit:
                    workspaceTier.toLowerCase() === "starter",
            }),
            { status: 200 }
        );
    } catch (error) {
        console.error("GET /api/progress failed", error);

        return NextResponse.json(
            {
                ok: false,
                error: "Failed to load progress data.",
            },
            { status: 500 }
        );
    }
}