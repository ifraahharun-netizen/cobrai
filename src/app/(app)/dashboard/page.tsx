"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import EChart from "@/components/charts/EChart";
import { churnTrendOption, mrrProtectedOption } from "@/components/charts/options";
import { getFirebaseAuth } from "@/lib/firebase.client";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import {
    PoundSterling,
    AlertTriangle,
    TrendingDown,
    ShieldCheck,
    Clock3,
    Crown,
    Settings,
    LogOut,
    ChevronDown,
    type LucideIcon,
} from "lucide-react";

import type { ActionFirstRecommendation, Insight } from "@/lib/ai/types";
import { canAccessFeature } from "@/lib/permissions";

import styles from "./dashboardshell.module.css";

type RiskAccount = {
    id: string;
    company: string;
    email?: string;
    reason: string;
    risk: number;
    mrr: number;
    tags?: string[];
    updatedAt?: string;
};

type OpportunityAccount = {
    id: string;
    company: string;
    email?: string;
    signal: string;
    upside: number;
    updatedAt?: string;
};

type DashboardBilling = {
    plan: "free" | "starter" | "pro";
    trialEndsAt: string | null;
};

type ProgressRow = {
    id: string;
    accountId?: string;
    customerId?: string;
    account: string;
    action: string;
    aiReason: string;
    outcome: "success" | "pending" | "failed";
    mrrSavedMinor: number;
    riskScore: number;
    date: string;
};

type AiWorkspaceRes = {
    insights: Insight[];
    actions: ActionFirstRecommendation[];
    cached: boolean;
    source: "ai" | "fallback" | "cache" | "fallback_after_error";
    timeframe: string;
    promptVersion: string;
};

type ProgressApiResponse = {
    mode: "demo" | "live";
    workspaceTier: string;
    connectedIntegrations: string[];
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
    recentMrrSaved: Array<{
        id: string;
        account: string;
        mrrSavedMinor: number;
    }>;
    nextPriorityAccounts: Array<{
        id: string;
        account: string;
        aiReason: string;
        mrrMinor: number;
        riskScore: number;
    }>;
    progressBreakdown: ProgressRow[];
    actionPerformance: Array<{
        id: string;
        action: string;
        executions: number;
        mrrSavedMinor: number;
        avgRiskDecreasePct: number;
    }>;
};

type InsightFeedItem = {
    id: string;
    type: "progress" | "risk" | "opportunity";
    title: string;
    summary: string;
    meta?: string;
    amountLabel?: string;
    amountTone?: "risk" | "opportunity" | "neutral";
    href?: string;
    sortTime: number;
};

type KPI = {
    label: string;
    value: string;
    subtext: string;
    trend: {
        arrow: string;
        color: string;
    };
    Icon: LucideIcon;
};

function formatGBPFromMinor(minor: number | null | undefined) {
    const value = Number(minor || 0) / 100;

    return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: 0,
    }).format(value);
}

function formatCompactDate(iso?: string | null) {
    if (!iso) return "—";

    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";

    return d.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
    });
}

function normalizeDashboardChurnPct(value: unknown) {
    const num = Number(value ?? 0);

    if (!Number.isFinite(num)) return 0;
    if (num > 20) return Number((num / 10).toFixed(1));

    return Number(num.toFixed(1));
}

function accountDateTime(value?: string) {
    return value ? new Date(value).getTime() : 0;
}

function getInitials(user: User | null) {
    const name = user?.displayName || user?.email || "User";

    return name
        .split(/[ @.]/)
        .filter(Boolean)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
}

function getTrialDaysLeft(trialEndsAt: string | null) {
    if (!trialEndsAt) return null;

    const end = new Date(trialEndsAt).getTime();
    if (!Number.isFinite(end)) return null;

    const diff = end - Date.now();
    if (diff <= 0) return 0;

    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatRefreshTime(value: string | null) {
    if (!value) return "Not refreshed yet";

    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "Not refreshed yet";

    return `Last refreshed ${d.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    })}`;
}

export default function DashboardPage() {
    const router = useRouter();
    const auth = useMemo(() => getFirebaseAuth(), []);

    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [profileOpen, setProfileOpen] = useState(false);
    const [upgradeOpen, setUpgradeOpen] = useState(false);
    const [insightsRefreshedAt, setInsightsRefreshedAt] = useState<string | null>(null);

    const [billing, setBilling] = useState<DashboardBilling>({
        plan: "free",
        trialEndsAt: null,
    });

    const [churnMonths, setChurnMonths] = useState<string[]>([]);
    const [churnPct, setChurnPct] = useState<number[]>([]);
    const [mrrNames, setMrrNames] = useState<string[]>([]);
    const [mrrVals, setMrrVals] = useState<number[]>([]);
    const [riskAccounts, setRiskAccounts] = useState<RiskAccount[]>([]);
    const [opportunityAccounts, setOpportunityAccounts] = useState<OpportunityAccount[]>([]);
    const [progressData, setProgressData] = useState<ProgressApiResponse | null>(null);
    const [isPro, setIsPro] = useState(false);
    const [apiDemoMode, setApiDemoMode] = useState<boolean | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [workspaceAi, setWorkspaceAi] = useState<AiWorkspaceRes | null>(null);

    const [kpiTotalMrrCurrent, setKpiTotalMrrCurrent] = useState<number | null>(null);
    const [kpiTotalMrrPrevious, setKpiTotalMrrPrevious] = useState<number | null>(null);
    const [kpiMrrAtRiskCurrent, setKpiMrrAtRiskCurrent] = useState<number | null>(null);
    const [kpiMrrAtRiskPrevious, setKpiMrrAtRiskPrevious] = useState<number | null>(null);
    const [kpiChurnProxyCurrent, setKpiChurnProxyCurrent] = useState<number | null>(null);
    const [kpiChurnProxyPrevious, setKpiChurnProxyPrevious] = useState<number | null>(null);
    const [kpiMrrProtectedCurrent, setKpiMrrProtectedCurrent] = useState<number | null>(null);
    const [kpiMrrProtectedPrevious, setKpiMrrProtectedPrevious] = useState<number | null>(null);

    const demoChurnMonths = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
    const demoChurnPct = [5.8, 5.1, 4.7, 4.3, 3.9, 3.4];

    const demoMrrMonths = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
    const demoMrrVals = [690, 520, 420, 330, 200, 95];

    const demoRiskAccounts: RiskAccount[] = [
        {
            id: "1",
            company: "Acme Ltd",
            email: "success@acmeltd.com",
            reason: "Low feature adoption + unresolved tickets",
            risk: 88,
            mrr: 219,
            tags: ["adoption", "support"],
            updatedAt: new Date().toISOString(),
        },
        {
            id: "2",
            company: "Beta Systems",
            email: "billing@betasystems.com",
            reason: "Payment failed + no login in 10 days",
            risk: 82,
            mrr: 129,
            tags: ["billing", "usage"],
            updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
        },
        {
            id: "3",
            company: "Northwind",
            email: "team@northwind.com",
            reason: "Onboarding incomplete + negative sentiment",
            risk: 61,
            mrr: 349,
            tags: ["onboarding", "support"],
            updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
        },
    ];

    const demoOpportunities: OpportunityAccount[] = [
        {
            id: "11",
            company: "BrightOps",
            email: "ops@brightops.com",
            signal: "Annual plan upgrade",
            upside: 133,
            updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
        },
        {
            id: "12",
            company: "KiteCRM",
            email: "finance@kitecrm.com",
            signal: "New subscription started",
            upside: 98,
            updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
        },
    ];

    const demoProgressData: ProgressApiResponse = {
        mode: "demo",
        workspaceTier: "pro",
        connectedIntegrations: [],
        kpis: {
            mrrProtectedMinor: 142000,
            accountsSaved: 7,
            actionsExecuted: 18,
            successRate: 61,
            mrrProtectedPct: 18,
            accountsSavedPct: 12,
            actionsExecutedPct: 9,
            successRatePct: 6,
        },
        recentMrrSaved: [],
        nextPriorityAccounts: [],
        progressBreakdown: [
            {
                id: "1",
                accountId: "1",
                account: "Acme Ltd",
                action: "Re-engagement email",
                aiReason: "Adoption improved after outreach",
                outcome: "success",
                mrrSavedMinor: 21900,
                riskScore: 88,
                date: new Date().toISOString(),
            },
            {
                id: "2",
                accountId: "2",
                account: "Beta Systems",
                action: "Billing recovery",
                aiReason: "Payment issue still unresolved",
                outcome: "pending",
                mrrSavedMinor: 12900,
                riskScore: 82,
                date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
            },
        ],
        actionPerformance: [],
    };

    const demoKpis = {
        totalMrrCurrent: 69700,
        totalMrrPrevious: 64200,
        mrrAtRiskCurrent: 12300,
        mrrAtRiskPrevious: 14100,
        churnProxyCurrent: 3.4,
        churnProxyPrevious: 3.9,
        mrrProtectedCurrent: 1420,
        mrrProtectedPrevious: 1200,
    };

    const isDemoMode = apiDemoMode === true;
    const isLiveOnlyMode = apiDemoMode === false;

    const trialDaysLeft = getTrialDaysLeft(billing.trialEndsAt);
    const showTrialPill =
        billing.plan === "free" && typeof trialDaysLeft === "number" && trialDaysLeft > 0;

    const hasUnlimitedLiveInsights =
        isPro || (billing.plan === "free" && typeof trialDaysLeft === "number" && trialDaysLeft > 0);

    const liveInsightLimit = hasUnlimitedLiveInsights ? 999 : 4;

    const formatGBP = (value: number) => `£${Math.round(value).toLocaleString()}`;

    const formatPercentChange = (current: number, previous: number) => {
        if (!previous) return 0;
        return ((current - previous) / previous) * 100;
    };

    const formatKpiSubtext = (
        delta: number,
        pct: number,
        previousValue?: number | null,
        options?: {
            isCurrency?: boolean;
            suffix?: string;
        }
    ) => {
        const isCurrency = options?.isCurrency ?? false;
        const suffix = options?.suffix ?? "";

        if (!previousValue && previousValue !== 0) return "No previous month data";

        if (delta === 0) {
            return isCurrency
                ? `No change vs ${formatGBP(previousValue)} last month`
                : `No change vs ${previousValue}${suffix} last month`;
        }

        return isCurrency
            ? `${Math.abs(pct).toFixed(1)}% vs ${formatGBP(previousValue)} last month`
            : `${Math.abs(pct).toFixed(1)}% vs ${previousValue}${suffix} last month`;
    };

    const getTrendMeta = (delta: number, lowerIsBetter = true) => {
        const isUp = delta > 0;
        const isNeutral = delta === 0;
        const isGood = lowerIsBetter ? delta < 0 : delta > 0;

        return {
            arrow: isNeutral ? "•" : isUp ? "↑" : "↓",
            color: isNeutral ? "#6b7280" : isGood ? "#119f5dff" : "#d32c2cff",
        };
    };

    const hasLiveChurn =
        apiDemoMode === false &&
        churnMonths.length >= 6 &&
        churnPct.length >= 6 &&
        churnPct.every((v) => Number.isFinite(v) && v > 0 && v <= 20);

    const hasLiveMrr =
        apiDemoMode === false &&
        mrrNames.length >= 6 &&
        mrrVals.length >= 6 &&
        mrrVals.every((v) => Number.isFinite(v) && v >= 0);

    const hasLiveRisk = riskAccounts.length > 0;
    const hasLiveOpportunities = opportunityAccounts.length > 0;
    const hasLiveProgress = Boolean(progressData?.progressBreakdown?.length);

    const hasLiveKpis =
        typeof kpiTotalMrrCurrent === "number" &&
        typeof kpiTotalMrrPrevious === "number" &&
        typeof kpiMrrAtRiskCurrent === "number" &&
        typeof kpiMrrAtRiskPrevious === "number" &&
        typeof kpiChurnProxyCurrent === "number" &&
        typeof kpiChurnProxyPrevious === "number" &&
        typeof kpiMrrProtectedCurrent === "number" &&
        typeof kpiMrrProtectedPrevious === "number";

    const canViewCriticalAccounts = canAccessFeature({
        plan: billing.plan,
        feature: "full-risk-list",
        trialEndsAt: billing.trialEndsAt,
        isDemoMode,
    });

    const activeChurnMonths = hasLiveChurn ? churnMonths : demoChurnMonths;
    const activeChurnPct = hasLiveChurn ? churnPct : demoChurnPct;

    const activeMrrMonths = hasLiveMrr ? mrrNames : demoMrrMonths;
    const activeMrrVals = hasLiveMrr ? mrrVals : demoMrrVals;

    const activeRiskAccounts = isDemoMode ? demoRiskAccounts : riskAccounts;
    const activeOpportunityAccounts = isDemoMode ? demoOpportunities : opportunityAccounts;
    const activeProgressData = isDemoMode ? demoProgressData : progressData;

    const totalMrrCurrent = isDemoMode
        ? demoKpis.totalMrrCurrent
        : typeof kpiTotalMrrCurrent === "number"
            ? kpiTotalMrrCurrent
            : 0;

    const totalMrrPrevious = isDemoMode
        ? demoKpis.totalMrrPrevious
        : typeof kpiTotalMrrPrevious === "number"
            ? kpiTotalMrrPrevious
            : 0;

    const mrrAtRiskCurrent = isDemoMode
        ? demoKpis.mrrAtRiskCurrent
        : typeof kpiMrrAtRiskCurrent === "number"
            ? kpiMrrAtRiskCurrent
            : 0;

    const mrrAtRiskPrevious = isDemoMode
        ? demoKpis.mrrAtRiskPrevious
        : typeof kpiMrrAtRiskPrevious === "number"
            ? kpiMrrAtRiskPrevious
            : 0;

    const churnProxyCurrent = isDemoMode
        ? demoKpis.churnProxyCurrent
        : typeof kpiChurnProxyCurrent === "number"
            ? kpiChurnProxyCurrent
            : 0;

    const churnProxyPrevious = isDemoMode
        ? demoKpis.churnProxyPrevious
        : typeof kpiChurnProxyPrevious === "number"
            ? kpiChurnProxyPrevious
            : 0;

    const totalProtected = isDemoMode
        ? demoKpis.mrrProtectedCurrent
        : typeof kpiMrrProtectedCurrent === "number"
            ? kpiMrrProtectedCurrent
            : 0;

    const previousProtected = isDemoMode
        ? demoKpis.mrrProtectedPrevious
        : typeof kpiMrrProtectedPrevious === "number"
            ? kpiMrrProtectedPrevious
            : 0;

    const totalMrrDelta = totalMrrCurrent - totalMrrPrevious;
    const mrrAtRiskDelta = mrrAtRiskCurrent - mrrAtRiskPrevious;
    const churnDelta = churnProxyCurrent - churnProxyPrevious;
    const protectedDelta = totalProtected - previousProtected;

    const kpis: KPI[] = [
        {
            label: "Total MRR",
            value: formatGBP(totalMrrCurrent),
            subtext: formatKpiSubtext(
                totalMrrDelta,
                formatPercentChange(totalMrrCurrent, totalMrrPrevious),
                totalMrrPrevious,
                { isCurrency: true }
            ),
            trend: getTrendMeta(totalMrrDelta, false),
            Icon: PoundSterling,
        },
        {
            label: "MRR at risk",
            value: formatGBP(mrrAtRiskCurrent),
            subtext: formatKpiSubtext(
                mrrAtRiskDelta,
                formatPercentChange(mrrAtRiskCurrent, mrrAtRiskPrevious),
                mrrAtRiskPrevious,
                { isCurrency: true }
            ),
            trend: getTrendMeta(mrrAtRiskDelta, true),
            Icon: AlertTriangle,
        },
        {
            label: "Churn proxy",
            value: `${churnProxyCurrent.toFixed(1)}%`,
            subtext: `${Math.abs(formatPercentChange(churnProxyCurrent, churnProxyPrevious)).toFixed(1)}% vs last month`,
            trend: getTrendMeta(churnDelta, true),
            Icon: TrendingDown,
        },
        {
            label: "MRR protected",
            value: formatGBP(totalProtected),
            subtext: formatKpiSubtext(
                protectedDelta,
                formatPercentChange(totalProtected, previousProtected),
                previousProtected,
                { isCurrency: true }
            ),
            trend: getTrendMeta(protectedDelta, false),
            Icon: ShieldCheck,
        },
    ];

    const topRiskAccounts = [...activeRiskAccounts]
        .sort((a, b) => b.risk - a.risk)
        .slice(0, 3);

    const getSuggestedAction = (account: RiskAccount) => {
        const reason = account.reason.toLowerCase();
        const tags = account.tags ?? [];

        if (tags.includes("billing") || reason.includes("payment")) return "Send billing recovery";
        if (tags.includes("onboarding") || reason.includes("onboarding")) return "Complete onboarding";
        if (tags.includes("support") || reason.includes("ticket")) return "Manual check-in";
        if (tags.includes("adoption") || reason.includes("adoption")) return "Send re-engagement";
        if (tags.includes("usage") || reason.includes("login")) return "Trigger usage nudge";

        return "Review account";
    };

    const formatRecentDate = (value?: string) => {
        if (!value) return "Recent";

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "Recent";

        return date.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
        });
    };

    const isCurrentMonth = (value?: string) => {
        if (!value) return false;

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return false;

        const now = new Date();
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    };

    const aiInsightFeed = useMemo<InsightFeedItem[]>(() => {
        const actions = workspaceAi?.actions ?? [];

        if (!actions.length) return [];

        return actions
            .filter((action) => action.actionType !== "none")
            .slice(0, liveInsightLimit)
            .map((action, index) => ({
                id: `ai-${action.customerId}-${action.actionType}-${index}`,
                type: "risk",
                title: action.actionTitle,
                summary: action.reason,
                meta: `${action.customerName} • ${action.priority} priority`,
                amountLabel: action.mrrAtRiskMinor
                    ? formatGBPFromMinor(action.mrrAtRiskMinor)
                    : `${action.riskScore}/100 risk`,
                amountTone: "risk",
                href: `/dashboard/accounts-at-risk/${action.customerId}`,
                sortTime: Date.now() - index,
            }));
    }, [workspaceAi?.actions, liveInsightLimit]);

    const insightFeed = useMemo<InsightFeedItem[]>(() => {
        if (aiInsightFeed.length) return aiInsightFeed;

        const progressItems: InsightFeedItem[] = (activeProgressData?.progressBreakdown ?? [])
            .filter((row) => isCurrentMonth(row.date))
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 2)
            .map((row) => {
                const targetId = row.accountId || row.customerId;

                return {
                    id: `progress-${row.id}`,
                    type: "progress",
                    title: `Progress update — ${row.account}`,
                    summary: `${row.action} ${row.outcome === "success" ? "succeeded" : "is in progress"
                        }. ${row.aiReason}`,
                    meta: `Action Impact • ${formatCompactDate(row.date)}`,
                    amountLabel: row.mrrSavedMinor
                        ? `+${formatGBPFromMinor(row.mrrSavedMinor)}`
                        : undefined,
                    amountTone: row.outcome === "success" ? "opportunity" : "neutral",
                    href: targetId ? `/dashboard/accounts-at-risk/${targetId}` : undefined,
                    sortTime: new Date(row.date).getTime(),
                };
            });

        const riskItems: InsightFeedItem[] = activeRiskAccounts
            .filter((account) => isCurrentMonth(account.updatedAt))
            .slice(0, 2)
            .map((account) => ({
                id: `risk-${account.id}`,
                type: "risk",
                title: `${account.company} — Risk detected`,
                summary: account.reason,
                meta: formatRecentDate(account.updatedAt),
                amountLabel: formatGBP(account.mrr),
                amountTone: "risk",
                href: `/dashboard/accounts-at-risk/${account.id}`,
                sortTime: accountDateTime(account.updatedAt),
            }));

        const opportunityItems: InsightFeedItem[] = activeOpportunityAccounts
            .filter((account) => isCurrentMonth(account.updatedAt))
            .slice(0, 2)
            .map((account) => ({
                id: `opp-${account.id}`,
                type: "opportunity",
                title: `${account.company} — Opportunity`,
                summary: account.signal,
                meta: formatRecentDate(account.updatedAt),
                amountLabel: `+${formatGBP(account.upside)}`,
                amountTone: "opportunity",
                href: `/dashboard/accounts-at-risk/${account.id}`,
                sortTime: accountDateTime(account.updatedAt),
            }));

        return [...progressItems, ...riskItems, ...opportunityItems]
            .sort((a, b) => b.sortTime - a.sortTime)
            .slice(0, liveInsightLimit);
    }, [
        activeOpportunityAccounts,
        activeProgressData,
        activeRiskAccounts,
        liveInsightLimit,
        aiInsightFeed,
    ]);

    async function loadWorkspaceAi(user: User) {
        try {
            const token = await user.getIdToken();

            const res = await fetch("/api/dashboard/ai/insights", {
                method: "POST",
                cache: "no-store",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ timeframe: "week" }),
            });

            if (!res.ok) {
                setWorkspaceAi(null);
                return;
            }

            const data = (await res.json()) as AiWorkspaceRes;
            setWorkspaceAi(data);
            setInsightsRefreshedAt(new Date().toISOString());
        } catch (err) {
            console.error("AI LOAD ERROR:", err);
            setWorkspaceAi(null);
        }
    }

    async function loadBilling() {
        try {
            if (!auth.currentUser) return;

            const token = await auth.currentUser.getIdToken();

            const res = await fetch("/api/stripe/billing-summary", {
                method: "GET",
                cache: "no-store",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!res.ok) return;

            const data = await res.json();

            setBilling({
                plan: data.plan === "pro" ? "pro" : data.plan === "starter" ? "starter" : "free",
                trialEndsAt: data.trialEndsAt ?? null,
            });
        } catch (error) {
            console.error("[Dashboard] loadBilling failed:", error);
        }
    }

    const resetDashboardState = () => {
        setCurrentUser(null);
        setChurnMonths([]);
        setChurnPct([]);
        setMrrNames([]);
        setMrrVals([]);
        setRiskAccounts([]);
        setOpportunityAccounts([]);
        setProgressData(null);
        setIsPro(false);
        setApiDemoMode(null);
        setIsLoaded(false);
        setWorkspaceAi(null);
        setInsightsRefreshedAt(null);
        setBilling({ plan: "free", trialEndsAt: null });
    };

    useEffect(() => {
        let cancelled = false;

        const unsub = onAuthStateChanged(auth, async (user) => {
            setCurrentUser(user);

            if (!user) {
                resetDashboardState();
                return;
            }

            try {
                const token = await user.getIdToken();

                void loadWorkspaceAi(user);

                const summaryRes = await fetch("/api/dashboard/summary", {
                    headers: { Authorization: `Bearer ${token}` },
                    cache: "no-store",
                });

                if (!summaryRes.ok) {
                    throw new Error(`Dashboard summary failed: ${summaryRes.status}`);
                }

                const data = await summaryRes.json();
                if (cancelled) return;

                setApiDemoMode(typeof data?.demoMode === "boolean" ? data.demoMode : true);

                setChurnMonths(Array.isArray(data?.churnTrend?.months) ? data.churnTrend.months : []);
                setChurnPct(
                    Array.isArray(data?.churnTrend?.values)
                        ? data.churnTrend.values.map((v: unknown) => normalizeDashboardChurnPct(v))
                        : []
                );

                setMrrNames(
                    Array.isArray(data?.mrrProtectedChart?.months)
                        ? data.mrrProtectedChart.months
                        : []
                );
                setMrrVals(
                    Array.isArray(data?.mrrProtectedChart?.values)
                        ? data.mrrProtectedChart.values.map((v: unknown) => Number(v ?? 0))
                        : []
                );

                setKpiTotalMrrCurrent(
                    typeof data?.totalMrrTrend?.current === "number"
                        ? data.totalMrrTrend.current
                        : null
                );
                setKpiTotalMrrPrevious(
                    typeof data?.totalMrrTrend?.previous === "number"
                        ? data.totalMrrTrend.previous
                        : null
                );
                setKpiMrrAtRiskCurrent(
                    typeof data?.mrrAtRiskTrend?.current === "number"
                        ? data.mrrAtRiskTrend.current
                        : null
                );
                setKpiMrrAtRiskPrevious(
                    typeof data?.mrrAtRiskTrend?.previous === "number"
                        ? data.mrrAtRiskTrend.previous
                        : null
                );
                setKpiChurnProxyCurrent(
                    typeof data?.churnProxyTrend?.current === "number"
                        ? data.churnProxyTrend.current
                        : null
                );
                setKpiChurnProxyPrevious(
                    typeof data?.churnProxyTrend?.previous === "number"
                        ? data.churnProxyTrend.previous
                        : null
                );
                setKpiMrrProtectedCurrent(
                    typeof data?.mrrProtected?.current === "number" ? data.mrrProtected.current : null
                );
                setKpiMrrProtectedPrevious(
                    typeof data?.mrrProtected?.previous === "number" ? data.mrrProtected.previous : null
                );

                setRiskAccounts(
                    Array.isArray(data?.riskAccounts)
                        ? data.riskAccounts.map((a: any) => ({
                            id: String(a.id ?? ""),
                            company: String(a.company ?? "Unknown account"),
                            email: a.email ?? "",
                            reason: String(a.reason ?? "Risk detected"),
                            risk: Number(a.risk ?? 0),
                            mrr: Number(a.mrr ?? 0),
                            tags: Array.isArray(a.tags) ? a.tags : [],
                            updatedAt: a.updatedAt ?? "",
                        }))
                        : []
                );

                setOpportunityAccounts(
                    Array.isArray(data?.opportunities)
                        ? data.opportunities.map((a: any) => ({
                            id: String(a.id ?? ""),
                            company: String(a.company ?? "Unknown account"),
                            email: a.email ?? "",
                            signal: a.signal ?? "Growth signal",
                            upside: Number(a.upside ?? 0),
                            updatedAt: a.updatedAt ?? "",
                        }))
                        : []
                );

                setIsPro(data?.tier === "pro" || data?.tier === "scale");

                try {
                    const progressRes = await fetch("/api/progress", {
                        method: "GET",
                        cache: "no-store",
                        headers: { Authorization: `Bearer ${token}` },
                    });

                    if (progressRes.ok) {
                        const progressJson = await progressRes.json();

                        setProgressData({
                            mode: progressJson?.mode === "live" ? "live" : "demo",
                            workspaceTier: String(progressJson?.workspaceTier ?? ""),
                            connectedIntegrations: Array.isArray(progressJson?.connectedIntegrations)
                                ? progressJson.connectedIntegrations
                                : [],
                            kpis: {
                                mrrProtectedMinor: Number(progressJson?.kpis?.mrrProtectedMinor ?? 0),
                                accountsSaved: Number(progressJson?.kpis?.accountsSaved ?? 0),
                                actionsExecuted: Number(progressJson?.kpis?.actionsExecuted ?? 0),
                                successRate: Number(progressJson?.kpis?.successRate ?? 0),
                                mrrProtectedPct: Number(progressJson?.kpis?.mrrProtectedPct ?? 0),
                                accountsSavedPct: Number(progressJson?.kpis?.accountsSavedPct ?? 0),
                                actionsExecutedPct: Number(progressJson?.kpis?.actionsExecutedPct ?? 0),
                                successRatePct: Number(progressJson?.kpis?.successRatePct ?? 0),
                            },
                            recentMrrSaved: [],
                            nextPriorityAccounts: [],
                            progressBreakdown: Array.isArray(progressJson?.progressBreakdown)
                                ? progressJson.progressBreakdown.map((row: any) => ({
                                    id: String(row?.id ?? ""),
                                    accountId: row?.accountId ? String(row.accountId) : undefined,
                                    customerId: row?.customerId ? String(row.customerId) : undefined,
                                    account: String(row?.account ?? ""),
                                    action: String(row?.action ?? ""),
                                    aiReason: String(row?.aiReason ?? ""),
                                    outcome:
                                        row?.outcome === "success" ||
                                            row?.outcome === "pending" ||
                                            row?.outcome === "failed"
                                            ? row.outcome
                                            : "pending",
                                    mrrSavedMinor: Number(row?.mrrSavedMinor ?? 0),
                                    riskScore: Number(row?.riskScore ?? 0),
                                    date: String(row?.date ?? ""),
                                }))
                                : [],
                            actionPerformance: [],
                        });
                    } else {
                        setProgressData(null);
                    }
                } catch {
                    setProgressData(null);
                }

                await loadBilling();

                if (!cancelled) {
                    setIsLoaded(true);
                }
            } catch (err) {
                console.error("Failed to load dashboard summary", err);

                if (!cancelled) {
                    setApiDemoMode(true);
                    setIsLoaded(true);
                }
            }
        });

        return () => {
            cancelled = true;
            unsub();
        };
    }, [auth]);

    const showLiveEmptyState =
        isLoaded &&
        isLiveOnlyMode &&
        !hasLiveChurn &&
        !hasLiveMrr &&
        !hasLiveRisk &&
        !hasLiveOpportunities &&
        !hasLiveProgress &&
        !hasLiveKpis;

    return (
        <div className={styles.page}>
            <div className={styles.content}>
                <div className={styles.topUtilityBar}>
                    <div />

                    <div className={styles.topRightControls}>
                        {showTrialPill ? (
                            <button
                                type="button"
                                className={styles.trialPill}
                                onClick={() => router.push("/dashboard/settings?tab=manage-plan")}
                            >
                                <Clock3 size={14} strokeWidth={1.8} />
                                <span>
                                    Trial ends in <strong>{trialDaysLeft} days</strong>
                                </span>
                            </button>
                        ) : null}

                        <div className={styles.profileWrap}>
                            <button
                                type="button"
                                className={styles.profileButton}
                                onClick={() => setProfileOpen((v) => !v)}
                            >
                                <span className={styles.profileCircle}>{getInitials(currentUser)}</span>
                                <span className={styles.profileName}>
                                    {currentUser?.displayName ||
                                        currentUser?.email?.split("@")[0] ||
                                        "Account"}
                                </span>
                                <ChevronDown size={14} strokeWidth={1.8} />
                            </button>

                            {profileOpen ? (
                                <div className={styles.profileMenu}>
                                    <div className={styles.profileMenuHeader}>
                                        <span className={styles.profileCircleLarge}>
                                            {getInitials(currentUser)}
                                        </span>
                                        <div>
                                            <div className={styles.profileMenuName}>
                                                {currentUser?.displayName || "Cobrai user"}
                                            </div>
                                            <div className={styles.profileMenuEmail}>
                                                {currentUser?.email || "No email"}
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        className={styles.profileMenuItem}
                                        onClick={() => {
                                            setProfileOpen(false);
                                            router.push("/dashboard/settings?tab=manage-plan");
                                        }}
                                    >
                                        <Crown size={15} strokeWidth={1.8} />
                                        Manage plan
                                    </button>

                                    <button
                                        type="button"
                                        className={styles.profileMenuItem}
                                        onClick={() => {
                                            setProfileOpen(false);
                                            router.push("/dashboard/settings");
                                        }}
                                    >
                                        <Settings size={15} strokeWidth={1.8} />
                                        Settings
                                    </button>

                                    <button
                                        type="button"
                                        className={styles.profileMenuItem}
                                        onClick={async () => {
                                            setProfileOpen(false);
                                            await signOut(auth);
                                            router.push("/login");
                                        }}
                                    >
                                        <LogOut size={15} strokeWidth={1.8} />
                                        Sign out
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>

                <div className={styles.header}>
                    <div>
                        <h1 className={styles.title}>Dashboard</h1>
                        <p className={styles.subtitle}>
                            Retention intelligence — clear actions that protect revenue.
                        </p>
                    </div>
                </div>

                {showLiveEmptyState && (
                    <div className={styles.card} style={{ marginBottom: 16, padding: 18 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
                            No live dashboard data yet
                        </div>
                        <div style={{ fontSize: 13, color: "#666666", lineHeight: 1.6 }}>
                            Your workspace is in live mode. Connect data sources and complete the first
                            sync to populate your dashboard.
                        </div>
                    </div>
                )}

                <div className={styles.kpiGrid}>
                    {kpis.map((kpi) => {
                        const Icon = kpi.Icon;

                        return (
                            <div key={kpi.label} className={styles.kpiCard}>
                                <div>
                                    <div className={styles.kpiLabel}>{kpi.label}</div>
                                    <div className={styles.kpiValue}>{kpi.value}</div>

                                    <div className={styles.kpiSubline}>
                                        <span style={{ color: kpi.trend.color, fontWeight: 600 }}>
                                            {kpi.trend.arrow}
                                        </span>
                                        <span>{kpi.subtext}</span>
                                    </div>
                                </div>

                                <div className={styles.kpiIcon}>
                                    <Icon size={16} strokeWidth={1.8} />
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className={styles.midGrid}>
                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <div>
                                <h4>Churn Trend</h4>
                                <p>Monthly churn rate.</p>
                            </div>

                            <button
                                type="button"
                                className={styles.softButton}
                                onClick={() => router.push("/dashboard/analytics")}
                            >
                                View full churn trend
                            </button>
                        </div>

                        <div className={styles.chartPreview}>
                            <EChart option={churnTrendOption(activeChurnMonths, activeChurnPct, isPro)} />
                        </div>
                    </div>

                    <div className={styles.card}>
                        <div className={styles.cardHeader}>
                            <div>
                                <h4>MRR Protected</h4>
                                <p>Revenue protected across recent retention activity.</p>
                            </div>

                            <button
                                type="button"
                                className={styles.softButton}
                                onClick={() => router.push("/dashboard/analytics")}
                            >
                                View full MRR chart
                            </button>
                        </div>

                        <div className={styles.chartPreview}>
                            <EChart option={mrrProtectedOption(activeMrrMonths, activeMrrVals, isPro)} />
                        </div>
                    </div>
                </div>

                <div className={styles.bottomGrid}>
                    <div className={styles.card}>
                        <div className={styles.cardTop}>
                            <div>
                                <h4>Accounts at Risk</h4>
                                <p>
                                    {topRiskAccounts.length === 0
                                        ? "No urgent churn risk right now"
                                        : "Act now to protect revenue"}
                                </p>
                            </div>

                            <button
                                type="button"
                                className={styles.softButton}
                                onClick={() => {
                                    if (!canViewCriticalAccounts) {
                                        setUpgradeOpen(true);
                                        return;
                                    }
                                    router.push("/dashboard/accounts-at-risk?filter=critical");
                                }}
                            >
                                View all accounts at risk
                            </button>
                        </div>

                        <div className={styles.riskList}>
                            {topRiskAccounts.length > 0 ? (
                                topRiskAccounts.map((a) => (
                                    <button
                                        key={a.id}
                                        type="button"
                                        onClick={() => router.push(`/dashboard/accounts-at-risk/${a.id}`)}
                                        className={styles.riskRow}
                                    >
                                        <div>
                                            <strong>{a.company}</strong>
                                            <span>{a.reason}</span>
                                            <small>Suggested action: {getSuggestedAction(a)}</small>
                                        </div>

                                        <div className={styles.riskRowRight}>
                                            <span
                                                className={`${styles.badge} ${a.risk >= 80
                                                        ? styles.riskCritical
                                                        : a.risk >= 65
                                                            ? styles.riskMedium
                                                            : styles.riskLow
                                                    }`}
                                            >
                                                {a.risk}
                                            </span>
                                            <span className={styles.mrr}>{formatGBP(a.mrr)}</span>
                                        </div>
                                    </button>
                                ))
                            ) : (
                                <div className={styles.emptyText}>No at-risk accounts yet.</div>
                            )}
                        </div>
                    </div>

                    <div className={styles.card}>
                        <div className={styles.cardTop}>
                            <div className={styles.insightsHeaderLeft}>
                                <h4 className={styles.insightsTitle}>AI Insights</h4>

                                <p className={styles.insightsSubheading}>
                                    Priority actions based on revenue risk, billing, and customer activity.
                                </p>

                                <div className={styles.insightsMeta}>
                                    <Clock3 size={13} strokeWidth={1.8} />
                                    <span>{formatRefreshTime(insightsRefreshedAt)}</span>
                                </div>
                            </div>

                            <button
                                type="button"
                                className={styles.softButton}
                                onClick={() => {
                                    if (!hasUnlimitedLiveInsights) {
                                        setUpgradeOpen(true);
                                        return;
                                    }

                                    if (currentUser) {
                                        void loadWorkspaceAi(currentUser);
                                    }
                                }}
                            >
                                Refresh
                            </button>
                        </div>

                        <div className={styles.insightsList}>
                            {insightFeed.length > 0 ? (
                                insightFeed.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        className={styles.insightCard}
                                        onClick={() => {
                                            if (item.href) router.push(item.href);
                                        }}
                                    >
                                        <div>
                                            <strong>{item.title}</strong>
                                            <span>{item.summary}</span>
                                            {item.meta ? <small>{item.meta}</small> : null}
                                        </div>

                                        {item.amountLabel ? (
                                            <b
                                                className={
                                                    item.amountTone === "risk"
                                                        ? styles.amountRisk
                                                        : item.amountTone === "opportunity"
                                                            ? styles.amountOpportunity
                                                            : styles.amountNeutral
                                                }
                                            >
                                                {item.amountLabel}
                                            </b>
                                        ) : null}
                                    </button>
                                ))
                            ) : (
                                <div className={styles.emptyText}>No recent insight activity yet.</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {upgradeOpen ? (
                <div className={styles.upgradeOverlay}>
                    <div className={styles.upgradeModal}>
                        <h3>Upgrade to Pro</h3>
                        <p>
                            Upgrade to Pro for unlimited live insights, deeper customer behaviour signals,
                            and priority retention actions.
                        </p>

                        <div className={styles.modalActions}>
                            <button type="button" onClick={() => setUpgradeOpen(false)}>
                                Not now
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setUpgradeOpen(false);
                                    router.push("/dashboard/settings?tab=manage-plan");
                                }}
                            >
                                Upgrade to Pro
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}