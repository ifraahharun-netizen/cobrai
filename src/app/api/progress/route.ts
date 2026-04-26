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
    account: string;
    action: string;
    aiReason: string;
    outcome: "success" | "pending" | "failed";
    mrrSavedMinor: number;
    riskScore: number;
    date: string;
    kind?: ProgressKind;
};

type ActionPerformanceRow = {
    id: string;
    action: string;
    executions: number;
    mrrSavedMinor: number;
    avgRiskDecreasePct: number;
};

type ProgressResponseShape = {
    mode?: "demo" | "live";
    workspaceTier?: string;
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
    recentMrrSaved?: Array<{
        id: string;
        account: string;
        mrrSavedMinor: number;
    }>;
    nextPriorityAccounts?: Array<{
        id: string;
        account: string;
        aiReason: string;
        mrrMinor: number;
        riskScore: number;
    }>;
    progressBreakdown?: ProgressRow[];
    actionPerformance?: ActionPerformanceRow[];
};

type ProgressAiInsight = {
    headline: string;
    summary: string;
    confidence: ConfidenceLevel;
    nextBestAction: string;
    topDriver?: string;
};

async function getWorkspaceIdFromRequest(req: Request) {
    const authHeader = req.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
        return null;
    }

    const idToken = authHeader.slice("Bearer ".length).trim();

    if (!idToken) {
        return null;
    }

    const decoded = await verifyFirebaseIdToken(idToken);

    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { firebaseUid: decoded.uid },
                ...(decoded.email ? [{ email: decoded.email }] : []),
            ],
        },
        select: {
            workspaceId: true,
        },
    });

    if (!user?.workspaceId) {
        throw new Error("Workspace not found");
    }

    return user.workspaceId;
}

function inferProgressKind(action: string): ProgressKind {
    const value = String(action || "").toLowerCase();

    if (
        value.includes("retry") ||
        value.includes("payment retry") ||
        value.includes("retry payment") ||
        value.includes("payment recovered") ||
        value.includes("recovered payment") ||
        value.includes("billing retry")
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

function normalizeProgressBreakdown(rows: unknown): ProgressRow[] {
    if (!Array.isArray(rows)) return [];

    return rows.map((row) => {
        const item = row as Partial<ProgressRow>;

        return {
            id: String(item.id || ""),
            account: String(item.account || "Unknown account"),
            action: String(item.action || "Unknown action"),
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
                    : inferProgressKind(String(item.action || "")),
        };
    });
}

function applyProgressPlanLimits<
    T extends {
        progressBreakdown?: Array<unknown>;
    },
>(data: T, workspaceTier: string): T {
    const isStarter = String(workspaceTier || "").toLowerCase() === "starter";

    if (!isStarter) return data;

    return {
        ...data,
        progressBreakdown: Array.isArray(data.progressBreakdown)
            ? data.progressBreakdown.slice(0, STARTER_RETENTION_ACTIVITY_LIMIT)
            : [],
    };
}

function normalizeProgressResponse<
    T extends {
        progressBreakdown?: Array<unknown>;
    },
>(data: T): T & { progressBreakdown: ProgressRow[] } {
    return {
        ...data,
        progressBreakdown: normalizeProgressBreakdown(data.progressBreakdown),
    };
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
        summary = `Performance improved vs last month, driven by ${topDriver}. ${successCount} workflow${successCount === 1 ? "" : "s"} completed successfully${topPriorityReason ? `, while the main remaining risk is ${topPriorityReason.toLowerCase()}.` : "."
            }`;
    } else {
        summary = `Performance softened vs last month. ${topDriver} is still the strongest driver, but ${failedCount} failed workflow${failedCount === 1 ? "" : "s"
            } and ${pendingCount} pending workflow${pendingCount === 1 ? "" : "s"} are limiting protected revenue${topPriorityReason ? `, especially in accounts showing ${topPriorityReason.toLowerCase()}.` : "."
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

export async function GET(req: Request) {
    try {
        const workspaceId = await getWorkspaceIdFromRequest(req);

        if (!workspaceId) {
            const demoData = getDemoProgress();
            const normalizedDemoData = normalizeProgressResponse(demoData);
            const limitedDemoData = applyProgressPlanLimits(
                normalizedDemoData,
                demoData.workspaceTier || "starter"
            );
            const aiInsight = buildProgressAiInsight(limitedDemoData as ProgressResponseShape);

            return NextResponse.json({
                ...limitedDemoData,
                aiInsight,
                mode: "demo",
                workspaceTier: demoData.workspaceTier || "starter",
                connectedIntegrations: demoData.connectedIntegrations || [],
            });
        }

        const modeInfo = await getWorkspaceDataMode(workspaceId);

        if (modeInfo.mode === "live") {
            await refreshRecentActionOutcomes(workspaceId);

            const liveData = await getLiveProgress(
                workspaceId,
                modeInfo.workspaceTier,
                modeInfo.connectedIntegrations
            );

            const normalizedLiveData = normalizeProgressResponse(liveData);
            const limitedLiveData = applyProgressPlanLimits(
                normalizedLiveData,
                modeInfo.workspaceTier
            );
            const aiInsight = buildProgressAiInsight(limitedLiveData as ProgressResponseShape);

            return NextResponse.json({
                ...limitedLiveData,
                aiInsight,
                mode: "live",
                workspaceTier: modeInfo.workspaceTier,
                connectedIntegrations: modeInfo.connectedIntegrations,
            });
        }

        const demoData = getDemoProgress();
        const normalizedDemoData = normalizeProgressResponse(demoData);
        const limitedDemoData = applyProgressPlanLimits(
            normalizedDemoData,
            modeInfo.workspaceTier
        );
        const aiInsight = buildProgressAiInsight(limitedDemoData as ProgressResponseShape);

        return NextResponse.json({
            ...limitedDemoData,
            aiInsight,
            mode: "demo",
            workspaceTier: modeInfo.workspaceTier,
            connectedIntegrations: modeInfo.connectedIntegrations,
        });
    } catch (error: unknown) {
        console.error("GET /api/progress failed", error);

        const message =
            error instanceof Error ? error.message : "Failed to load progress";

        if (message === "Workspace not found") {
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 }
            );
        }

        return NextResponse.json(
            { error: "Failed to load progress" },
            { status: 500 }
        );
    }
}