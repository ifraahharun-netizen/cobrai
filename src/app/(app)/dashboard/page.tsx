"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { churnTrendOption, mrrProtectedOption } from "@/components/charts/options";
import { getFirebaseAuth } from "@/lib/firebase.client";
import AIActionQueue from "@/components/AIActionQueue";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { getDemoDashboardData } from "@/lib/demo/dashboard";
import {
    PoundSterling,
    AlertTriangle,
    TrendingDown,
    ShieldCheck,
    Clock3,
    Crown,
    Settings,
    Flame,
    UsersRound,
    CreditCard,
    Activity,
    MessageCircleWarning,
    TrendingUp,
    Sparkles,
    LogOut,
    ChevronDown,
    type LucideIcon,
} from "lucide-react";
import type { EChartsOption } from "echarts";
import * as echarts from "echarts";

import type { ActionFirstRecommendation, Insight } from "@/lib/ai/types";
import { canAccessFeature } from "@/lib/permissions";

import styles from "./dashboardshell.module.css";
const EChart = dynamic(() => import("@/components/charts/EChart"), {
    ssr: false,
    loading: () => <div style={{ height: 260 }}>Loading chart...</div>,
});


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


type ActiveUsersPoint = {
    timestamp: string;
    value: number;
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
    type: "progress" | "risk" | "opportunity" | "billing" | "health";
    title: string;
    summary: string;
    meta?: string;
    amountLabel?: string;
    metricLabel?: string;
    badgeLabel?: string;
    amountTone?: "risk" | "opportunity" | "neutral" | "success" | "warning" | "insight";
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

const FALLBACK_LOCALE = "en-GB";

const REGION_CURRENCY: Record<string, string> = {
    GB: "GBP",
    US: "USD",
    CA: "CAD",
    AU: "AUD",
    NZ: "NZD",
    IE: "EUR",
    FR: "EUR",
    DE: "EUR",
    ES: "EUR",
    IT: "EUR",
    NL: "EUR",
    BE: "EUR",
    AT: "EUR",
    PT: "EUR",
    FI: "EUR",
    GR: "EUR",
    LU: "EUR",
    CY: "EUR",
    MT: "EUR",
    SK: "EUR",
    SI: "EUR",
    EE: "EUR",
    LV: "EUR",
    LT: "EUR",
    IN: "INR",
    AE: "AED",
    SA: "SAR",
    QA: "QAR",
    KW: "KWD",
    NG: "NGN",
    ZA: "ZAR",
    KE: "KES",
    JP: "JPY",
    CN: "CNY",
    SG: "SGD",
};

function getUserLocale() {
    if (typeof navigator !== "undefined" && navigator.language) {
        return navigator.language;
    }

    return FALLBACK_LOCALE;
}

function getCurrencyFromLocale(locale: string) {
    try {
        const region = new Intl.Locale(locale).region;

        if (region && REGION_CURRENCY[region]) {
            return REGION_CURRENCY[region];
        }
    } catch {
        return REGION_CURRENCY.GB;
    }

    return REGION_CURRENCY.GB;
}

const userLocale = getUserLocale();
const userCurrency = getCurrencyFromLocale(userLocale);

function formatCurrency(
    value: number,
    options?: {
        maximumFractionDigits?: number;
    }
) {
    return new Intl.NumberFormat(userLocale, {
        style: "currency",
        currency: userCurrency,
        maximumFractionDigits: options?.maximumFractionDigits ?? 0,
    }).format(Number(value || 0));
}

function formatGBPFromMinor(minor: number | null | undefined) {
    return formatCurrency(Number(minor || 0) / 100);
}

function formatCompactDate(iso?: string | null) {
    if (!iso) return "—";

    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";

    return d.toLocaleString(userLocale, {
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

    return `Last refreshed ${d.toLocaleString(userLocale, {
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

    const [activeUsers24Hours, setActiveUsers24Hours] = useState<ActiveUsersPoint[]>([]);
    const [activeUsers7Days, setActiveUsers7Days] = useState<ActiveUsersPoint[]>([]);
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
    const [activeUsersRange, setActiveUsersRange] = useState<24 | 7>(7); const [activeUsersFilterOpen, setActiveUsersFilterOpen] = useState(false);
    const [insightPage, setInsightPage] = useState(0);
    const [mrrTrendRange, setMrrTrendRange] = useState<1 | 3 | 6>(6);
    const [mrrTrendFilterOpen, setMrrTrendFilterOpen] = useState(false);

    const [churnTrendRange, setChurnTrendRange] = useState<1 | 3 | 6>(6);
    const [churnTrendFilterOpen, setChurnTrendFilterOpen] = useState(false);

    const demoDashboardData = getDemoDashboardData(userLocale);

    const demoChurnMonths = demoDashboardData.churnMonths;
    const demoChurnPct = demoDashboardData.churnPct;

    const demoMrrMonths = demoDashboardData.mrrProtectedMonths;
    const demoMrrVals = demoDashboardData.mrrProtectedValues;

    const demoCurrentMonthDays = demoDashboardData.currentMonthDays;
    const demoCurrentMonthMrrVals = demoDashboardData.currentMonthMrrProtectedValues;
    const demoCurrentMonthChurnPct = demoDashboardData.currentMonthChurnPct;
    const demoKpis = demoDashboardData.kpis;

    const demoRiskAccounts = demoDashboardData.riskAccounts;
    const demoOpportunities = demoDashboardData.opportunities;

    const demoProgressData: ProgressApiResponse = demoDashboardData.progressData;


    const isDemoMode =
        apiDemoMode === true || apiDemoMode === null;

    const effectivePlan = isDemoMode
        ? "pro"
        : billing.plan;

    const isLiveOnlyMode =
        apiDemoMode === false;

    const trialDaysLeft = getTrialDaysLeft(billing.trialEndsAt);
    const showTrialPill =
        effectivePlan === "free" && typeof trialDaysLeft === "number" && trialDaysLeft > 0;

    const isTrialActive =
        effectivePlan === "free" &&
        typeof trialDaysLeft === "number" &&
        trialDaysLeft > 0;

    const hasUnlimitedLiveInsights =
        isDemoMode
            ? true
            : isTrialActive || isPro;

    const liveInsightLimit =
        effectivePlan === "starter" && !hasUnlimitedLiveInsights
            ? 4
            : 999;

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
                ? `No change vs ${formatCurrency(previousValue)} last month`
                : `No change vs ${previousValue}${suffix} last month`;
        }

        return isCurrency
            ? `${Math.abs(pct).toFixed(1)}% vs ${formatCurrency(previousValue)} last month`
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

    const canViewRetentionImpact = canAccessFeature({
        plan: billing.plan,
        feature: "retention-impact",
        trialEndsAt: billing.trialEndsAt,
        isDemoMode,
    });

    const canViewRetryPayment = canAccessFeature({
        plan: billing.plan,
        feature: "retry-payment",
        trialEndsAt: billing.trialEndsAt,
        isDemoMode,
    });

    const showStarterInsightUpgradeCta =
        !isDemoMode &&
        !isTrialActive &&
        effectivePlan === "starter";

    const activeChurnMonths = isDemoMode
        ? demoChurnMonths
        : hasLiveChurn
            ? churnMonths
            : demoChurnMonths;

    const activeChurnPct = isDemoMode
        ? demoChurnPct
        : hasLiveChurn
            ? churnPct
            : demoChurnPct;

    const activeMrrMonths = isDemoMode
        ? demoMrrMonths
        : hasLiveMrr
            ? mrrNames
            : demoMrrMonths;

    const activeMrrVals = isDemoMode
        ? demoMrrVals
        : hasLiveMrr
            ? mrrVals
            : demoMrrVals;

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
            value: formatCurrency(totalMrrCurrent),
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
            value: formatCurrency(mrrAtRiskCurrent),
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
            value: formatCurrency(totalProtected),
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

    const filteredRiskAccounts = useMemo(() => {
        // DEMO MODE → showcase demo accounts
        if (isDemoMode) {
            return demoRiskAccounts
                .filter((account) => account.risk >= 60)
                .sort((a, b) => b.risk - a.risk);
        }

        // LIVE MODE → only genuinely risky live accounts
        return activeRiskAccounts
            .filter((account) => Number(account.risk ?? 0) >= 60)
            .sort((a, b) => b.risk - a.risk);
    }, [activeRiskAccounts, isDemoMode]);

    const topRiskAccounts = filteredRiskAccounts.slice(0, 5);

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

        return date.toLocaleDateString(userLocale, {
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

    const insightFeed = useMemo<InsightFeedItem[]>(() => {
        const progressItems: InsightFeedItem[] = canViewRetentionImpact
            ? (activeProgressData?.progressBreakdown ?? [])
                .filter((row) => isCurrentMonth(row.date))
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .slice(0, 4)
                .map((row) => {
                    const targetId = row.accountId || row.customerId;
                    const savedMinor = Number(row.mrrSavedMinor || 0);

                    return {
                        id: `progress-${row.id}`,
                        type: "progress",
                        title:
                            row.outcome === "success"
                                ? savedMinor > 0
                                    ? "MRR saved"
                                    : "Churn momentum reduced"
                                : row.outcome === "failed"
                                    ? "Retention action failed"
                                    : "Retention action pending",
                        summary: `${row.account}: ${row.action}. ${row.aiReason}`,
                        meta: `${row.account} • ${formatCompactDate(row.date)}`,
                        amountLabel:
                            savedMinor > 0
                                ? `+${formatGBPFromMinor(savedMinor)}`
                                : row.riskScore
                                    ? `${row.riskScore}/100`
                                    : undefined,
                        metricLabel:
                            savedMinor > 0
                                ? "MRR saved"
                                : row.outcome === "success"
                                    ? "Risk reduced"
                                    : "Action status",
                        badgeLabel:
                            row.outcome === "success"
                                ? "Impact recorded"
                                : row.outcome === "failed"
                                    ? "Needs follow-up"
                                    : "In progress",
                        amountTone: row.outcome === "success" ? "opportunity" : "neutral",
                        href: targetId ? `/dashboard/accounts-at-risk/${targetId}` : undefined,
                        sortTime: new Date(row.date).getTime(),
                    };
                })
            : [];

        const mrrSavedItems: InsightFeedItem[] = canViewRetentionImpact
            ? (activeProgressData?.recentMrrSaved ?? [])
                .slice(0, 2)
                .map((row, index) => ({
                    id: `recent-mrr-saved-${row.id}`,
                    type: "progress",
                    title: "MRR saved",
                    summary: `${row.account} had at-risk revenue protected by a recent retention action.`,
                    meta: `${row.account} • retention impact`,
                    amountLabel: `+${formatGBPFromMinor(row.mrrSavedMinor)}`,
                    metricLabel: "MRR saved",
                    badgeLabel: "Impact recorded",
                    amountTone: "opportunity",
                    href: undefined,
                    sortTime: Date.now() - index,
                }))
            : [];

        const retainedUsersItem: InsightFeedItem[] =
            canViewRetentionImpact && Number(activeProgressData?.kpis?.accountsSaved || 0) > 0
                ? [
                    {
                        id: "users-retained-summary",
                        type: "progress",
                        title: "Users retained",
                        summary: `${activeProgressData?.kpis.accountsSaved} at-risk customer${activeProgressData?.kpis.accountsSaved === 1 ? "" : "s"} recovered through recent retention actions.`,
                        meta: "Retention impact • current period",
                        amountLabel: `+${activeProgressData?.kpis.accountsSaved}`,
                        metricLabel: "Users retained",
                        badgeLabel: "Momentum gained",
                        amountTone: "opportunity",
                        href: "/dashboard/retention-impact",
                        sortTime: Date.now() - 20,
                    },
                ]
                : [];

        const aiItems: InsightFeedItem[] = isDemoMode
            ? []
            : (workspaceAi?.actions ?? [])
                .filter((action) => action.actionType !== "none")
                .slice(0, liveInsightLimit)
                .map((action, index): InsightFeedItem => {
                    const text =
                        `${action.actionType} ${action.actionTitle} ${action.reason}`.toLowerCase();

                    const isBilling =
                        text.includes("billing") ||
                        text.includes("invoice") ||
                        text.includes("payment");

                    const isExpansion =
                        text.includes("expand") ||
                        text.includes("upgrade") ||
                        text.includes("annual") ||
                        text.includes("growth");

                    const itemType: InsightFeedItem["type"] = isBilling
                        ? "billing"
                        : isExpansion
                            ? "opportunity"
                            : "risk";

                    const amountTone: InsightFeedItem["amountTone"] = isExpansion
                        ? "opportunity"
                        : "risk";

                    return {
                        id: `ai-${action.customerId}-${action.actionType}-${index}`,
                        type: itemType,
                        title: action.actionTitle,
                        summary: action.reason,
                        meta: `${action.customerName} • ${action.priority} priority`,
                        amountLabel: action.mrrAtRiskMinor
                            ? formatGBPFromMinor(action.mrrAtRiskMinor)
                            : `${action.riskScore}/100`,
                        metricLabel: isExpansion
                            ? "Expansion potential"
                            : isBilling
                                ? "Overdue MRR"
                                : "MRR at risk",
                        badgeLabel:
                            action.priority === "high"
                                ? "High priority"
                                : action.priority === "medium"
                                    ? "Medium priority"
                                    : "Low priority",
                        amountTone,
                        href: `/dashboard/accounts-at-risk/${action.customerId}`,
                        sortTime: Date.now() - index,
                    };
                })
                .filter((item) => item.type !== "billing" || canViewRetryPayment);
        const riskItems: InsightFeedItem[] = activeRiskAccounts
            .filter((account) => Number(account.risk ?? 0) >= 60)
            .slice(0, 3)
            .map((account) => ({
                id: `risk-${account.id}`,
                type: "risk",
                title: `${account.company} — churn risk detected`,
                summary: `${account.reason} Suggested manual action: ${getSuggestedAction(account)}.`,
                meta: `${account.company} • ${account.risk}/100 risk`,
                amountLabel: formatCurrency(account.mrr || 0),
                metricLabel: "MRR at risk",
                badgeLabel: account.risk >= 80 ? "High priority" : "Medium priority",
                amountTone: "risk",
                href: `/dashboard/accounts-at-risk/${account.id}`,
                sortTime: accountDateTime(account.updatedAt),
            }));

        const opportunityItems: InsightFeedItem[] = activeOpportunityAccounts
            .slice(0, 3)
            .map((account) => ({
                id: `opportunity-${account.id}`,
                type: "opportunity",
                title: `${account.company} — expansion opportunity`,
                summary: account.signal,
                meta: `${account.company} • growth signal`,
                amountLabel: `+${formatCurrency(account.upside)}`,
                metricLabel: "Expansion potential",
                badgeLabel: "Growth opportunity",
                amountTone: "opportunity",
                href: `/dashboard/accounts-at-risk/${account.id}`,
                sortTime: accountDateTime(account.updatedAt),
            }));

        const merged = [
            ...progressItems,
            ...mrrSavedItems,
            ...retainedUsersItem,
            ...aiItems,
            ...riskItems,
            ...opportunityItems,
        ].sort((a, b) => b.sortTime - a.sortTime);

        const seen = new Set<string>();

        return merged
            .filter((item) => {
                const accountKey =
                    item.meta?.split("•")[0]?.trim().toLowerCase() ||
                    item.title.toLowerCase();

                const typeKey = item.title.toLowerCase();
                const key = `${accountKey}-${typeKey}`;

                if (seen.has(key)) return false;

                seen.add(key);
                return true;
            })
            .slice(0, liveInsightLimit);
    }, [
        activeProgressData,
        workspaceAi,
        activeRiskAccounts,
        activeOpportunityAccounts,
        liveInsightLimit,
        canViewRetentionImpact,
        canViewRetryPayment,
    ]);
    const INSIGHTS_PER_PAGE = 5;

    const insightPageCount = Math.max(
        1,
        Math.ceil(insightFeed.length / INSIGHTS_PER_PAGE)
    );

    const visibleInsights = insightFeed.slice(
        insightPage * INSIGHTS_PER_PAGE,
        insightPage * INSIGHTS_PER_PAGE + INSIGHTS_PER_PAGE
    );


    async function loadWorkspaceAi(user: User) {
        try {
            const token = await user.getIdToken();
            setInsightsRefreshedAt(new Date().toISOString());
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
                console.error("AI insights request failed")
                return;
            }

            const data = (await res.json()) as AiWorkspaceRes;
            setWorkspaceAi(data);
            setInsightsRefreshedAt(new Date().toISOString());
        } catch (err) {
            console.error("AI LOAD ERROR:", err);
            console.error("AI LOAD ERROR:", err);
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
        setActiveUsers24Hours([]);
        setActiveUsers7Days([]);
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
                setTimeout(() => {
                    if (!auth.currentUser) {
                        resetDashboardState();
                    }
                }, 1200);

                return;
            }

            try {
                const token = await user.getIdToken();

                const summaryRes = await fetch("/api/dashboard/summary", {
                    headers: { Authorization: `Bearer ${token}` },
                    cache: "no-store",
                });

                if (!summaryRes.ok) {
                    throw new Error(`Dashboard summary failed: ${summaryRes.status}`);
                }

                const data = await summaryRes.json();
                if (cancelled) return;
                const dashboardIsDemo =
                    typeof data?.demoMode === "boolean" ? data.demoMode : true;

                setApiDemoMode(dashboardIsDemo);

                if (!dashboardIsDemo) {
                    void loadWorkspaceAi(user);
                }

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
                            recentMrrSaved: Array.isArray(progressJson?.recentMrrSaved)
                                ? progressJson.recentMrrSaved.map((row: any) => ({
                                    id: String(row?.id ?? ""),
                                    account: String(row?.account ?? ""),
                                    mrrSavedMinor: Number(row?.mrrSavedMinor ?? 0),
                                }))
                                : [],
                            nextPriorityAccounts: Array.isArray(progressJson?.nextPriorityAccounts)
                                ? progressJson.nextPriorityAccounts.map((row: any) => ({
                                    id: String(row?.id ?? ""),
                                    account: String(row?.account ?? ""),
                                    aiReason: String(row?.aiReason ?? ""),
                                    mrrMinor: Number(row?.mrrMinor ?? 0),
                                    riskScore: Number(row?.riskScore ?? 0),
                                }))
                                : [],
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

    const getInsightMeta = (item: InsightFeedItem) => {
        const text = `${item.title} ${item.summary} ${item.meta ?? ""}`.toLowerCase();
        const badge = `${item.badgeLabel ?? ""}`.toLowerCase();

        const isSuccess =
            item.amountTone === "opportunity" ||
            item.amountTone === "success" ||
            text.includes("saved") ||
            text.includes("retained") ||
            text.includes("recovered") ||
            text.includes("successful") ||
            badge.includes("impact") ||
            badge.includes("momentum");

        const isMedium =
            badge.includes("medium") ||
            text.includes("medium priority");

        if (isSuccess) {
            return { Icon: ShieldCheck, label: "Impact", tone: styles.insightPositive };
        }

        if (text.includes("billing") || text.includes("invoice") || text.includes("payment")) {
            return {
                Icon: CreditCard,
                label: "Billing",
                tone: isMedium ? styles.insightWarning : styles.insightUrgent,
            };
        }

        if (text.includes("support") || text.includes("ticket")) {
            return {
                Icon: MessageCircleWarning,
                label: "Support",
                tone: isMedium ? styles.insightWarning : styles.insightUrgent,
            };
        }

        if (text.includes("expand") || text.includes("upgrade") || text.includes("annual") || text.includes("growth")) {
            return { Icon: TrendingUp, label: "Expansion", tone: styles.insightPositive };
        }

        if (text.includes("usage") || text.includes("engagement") || text.includes("inactive")) {
            return {
                Icon: Activity,
                label: "Usage",
                tone: isMedium ? styles.insightWarning : styles.insightUrgent,
            };
        }

        if (item.type === "health") {
            return { Icon: Sparkles, label: "Insight", tone: styles.insightNeutral };
        }

        return { Icon: Sparkles, label: "Insight", tone: styles.insightNeutral };
    };
    const activeUsersSeries =
        activeUsersRange === 24
            ? activeUsers24Hours
            : activeUsers7Days;

    const activeUsersRangeLabel =
        activeUsersRange === 24 ? "24 hrs" : "7 days";

    const buildActiveUsersRangeData = (
        points: ActiveUsersPoint[],
        range: 24 | 7
    ) => {
        if (!isDemoMode && points.length > 0) {
            return points.map((point) => {
                const date = new Date(point.timestamp);

                return {
                    label:
                        range === 7
                            ? date.toLocaleDateString(userLocale, { weekday: "short" })
                            : date.toLocaleTimeString(userLocale, { hour: "2-digit" }),
                    tooltipLabel: date.toLocaleString(userLocale, {
                        weekday: range === 7 ? "short" : undefined,
                        hour: "2-digit",
                        minute: "2-digit",
                    }),
                    value: Number(point.value || 0),
                };
            });
        }

        const fallbackValues = Array.isArray(demoDashboardData.activeUsersValues)
            ? demoDashboardData.activeUsersValues
            : [];

        return fallbackValues.map((value: number, index: number) => ({
            label: String(index + 1),
            tooltipLabel: String(index + 1),
            value: Number(value || 0),
        }));
    };

    const activeUsersRangeData = buildActiveUsersRangeData(
        activeUsersSeries,
        activeUsersRange
    );

    const visibleActiveUsersMonths = activeUsersRangeData.map((item) => item.tooltipLabel);
    const visibleActiveUsersSeries = activeUsersRangeData.map((item) => item.value);
    const activeUsersCurrent =
        visibleActiveUsersSeries[visibleActiveUsersSeries.length - 1] ?? 0;

    const activeUsersPrevious =
        visibleActiveUsersSeries[visibleActiveUsersSeries.length - 2] ?? 0;

    const activeUsersDelta = activeUsersCurrent - activeUsersPrevious;

    const activeUsersPct = formatPercentChange(
        activeUsersCurrent,
        activeUsersPrevious
    );


    const activeUsersOption = (
        months: string[],
        values: number[]
    ): EChartsOption => {
        const safeMonths = Array.isArray(months) ? months : [];

        const safeValues = Array.isArray(values)
            ? values.map((value) => Number(value || 0))
            : [];

        const minValue = Math.min(...safeValues, 0);
        const maxValue = Math.max(...safeValues, 1);
        const padding = Math.max(8, Math.round((maxValue - minValue) * 0.18));

        return {
            animation: false,
            backgroundColor: "transparent",

            grid: {
                top: 8,
                right: 8,
                bottom: 28,
                left: 8,
                containLabel: false,
            },

            tooltip: {
                trigger: "axis",
                backgroundColor: "#ffffff",
                borderColor: "#eef2f7",
                borderWidth: 1,
                padding: 10,
                textStyle: {
                    color: "#111827",
                    fontFamily: "inherit",
                },
                extraCssText:
                    "border-radius:14px; box-shadow:0 10px 30px rgba(15,23,42,0.06);",
                formatter: (params: any) => {
                    const point = Array.isArray(params) ? params[0] : params;

                    return `
<div style="display:flex;flex-direction:column;gap:4px;">
<div style="font-size:12px;color:#6b7280;font-weight:500;">
${point?.axisValue ?? ""}
</div>
<div style="font-size:14px;font-weight:650;color:#111827;">
${Number(point?.value ?? 0).toLocaleString(userLocale)} active users
</div>
</div>
`;
                },
            },

            xAxis: {
                type: "category",
                data: safeMonths,
                boundaryGap: false,
                axisTick: { show: false },
                axisLine: { show: false },
                axisLabel: {
                    color: "#9ca3af",
                    fontSize: 10,
                    margin: 10,
                    fontWeight: 500,
                    interval: activeUsersRange === 7 ? 23 : 2,
                    formatter: (_value: string, index: number) => {
                        if (activeUsersRange === 7) {
                            const item = activeUsersRangeData[index];
                            return item?.label ?? "";
                        }

                        return _value;
                    },
                },
            },

            yAxis: {
                type: "value",
                min: Math.max(0, Math.floor((minValue - padding) / 10) * 10),
                max: Math.ceil((maxValue + padding) / 10) * 10,
                splitNumber: 4,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { show: false },
                splitLine: {
                    lineStyle: {
                        type: "dashed",
                        color: "rgba(148,163,184,0.16)",
                    },
                },
            },

            series: [
                {
                    name: "Active users",
                    type: "line",
                    data: safeValues,
                    smooth: false,
                    symbol: "none",
                    lineStyle: {
                        width: 2.5,
                        color: "#aca8ffff",
                    },
                },
            ],
        };
    };
    const filterChartRange = <T,>(
        labels: T[],
        values: number[],
        range: 1 | 3 | 6
    ) => {
        if (range === 1) {
            return {
                labels,
                values,
            };
        }

        return {
            labels: labels.slice(-range),
            values: values.slice(-range),
        };
    };

    const mrrTrendData =
        mrrTrendRange === 1 && isDemoMode
            ? {
                labels: demoCurrentMonthDays,
                values: demoCurrentMonthMrrVals,
            }
            : filterChartRange(activeMrrMonths, activeMrrVals, mrrTrendRange);
    const churnTrendData =
        churnTrendRange === 1 && isDemoMode
            ? {
                labels: demoCurrentMonthDays,
                values: demoCurrentMonthChurnPct,
            }
            : filterChartRange(activeChurnMonths, activeChurnPct, churnTrendRange);
    const trendRangeOptions: Array<{ label: string; value: 1 | 3 | 6 }> = [
        { label: "Current month", value: 1 },
        { label: "3 months", value: 3 },
        { label: "6 months", value: 6 },
    ];
    const churnedAccountsCurrent = Math.round(
        activeUsersCurrent * (churnProxyCurrent / 100)
    );

    const churnedAccountsPrevious = Math.round(
        activeUsersPrevious * (churnProxyPrevious / 100)
    );

    const churnedAccountsDelta = churnedAccountsCurrent - churnedAccountsPrevious;

    const atRiskAccountsCurrent = activeRiskAccounts.filter(
        (account) => Number(account.risk ?? 0) >= 60
    ).length;

    const averageAtRiskMrr =
        atRiskAccountsCurrent > 0
            ? mrrAtRiskCurrent / atRiskAccountsCurrent
            : mrrAtRiskCurrent || 1;

    const atRiskAccountsPrevious = Math.max(
        0,
        Math.round(mrrAtRiskPrevious / averageAtRiskMrr)
    );

    const atRiskAccountsDelta = atRiskAccountsCurrent - atRiskAccountsPrevious;

    const churnMetricItems = [
        {
            label: "Churn proxy",
            value: `${churnProxyCurrent.toFixed(1)}%`,
            subtext: `vs ${churnProxyPrevious.toFixed(1)}% last month`,
            delta: churnDelta,
            pct: formatPercentChange(churnProxyCurrent, churnProxyPrevious),
        },
        {
            label: "Accounts churned",
            value: churnedAccountsCurrent.toLocaleString(userLocale),
            subtext: `vs ${churnedAccountsPrevious.toLocaleString(userLocale)} last period`,
            delta: churnedAccountsDelta,
            pct: formatPercentChange(churnedAccountsCurrent, churnedAccountsPrevious),
        },
        {
            label: "At-risk accounts",
            value: atRiskAccountsCurrent.toLocaleString(userLocale),
            subtext: `vs ${atRiskAccountsPrevious.toLocaleString(userLocale)} last period`,
            delta: atRiskAccountsDelta,
            pct: formatPercentChange(atRiskAccountsCurrent, atRiskAccountsPrevious),
        },
    ];

    const visibleAccountsAtRisk = topRiskAccounts.slice(0, 3);

    return (

        <div className={styles.page}>


            <div className={styles.content}>


                <div className={styles.topUtilityBar}>
                    <div />

                    <div className={styles.topRightControls}>




                        <div className={styles.profileWrap}>


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
                <div className={styles.dashboardMainGrid}>
                    <div className={styles.leftDashboardStack}>
                        {/* Revenue Trend */}
                        <div className={`${styles.card} ${styles.mrrChartCard}`}>
                            <div className={styles.cardHeader}>
                                <div className={styles.revenueHeaderLeft}>
                                    <h4>Revenue Trend</h4>
                                    <p>Revenue protected across recent retention activity.</p>
                                </div>

                                <div className={styles.activeUsersFilterWrap}>
                                    <button
                                        type="button"
                                        className={styles.activeUsersFilter}
                                        onClick={() => setMrrTrendFilterOpen((open) => !open)}
                                    >
                                        <Clock3 size={13} strokeWidth={1.8} />
                                        <span>
                                            {
                                                trendRangeOptions.find(
                                                    (option) => option.value === mrrTrendRange
                                                )?.label
                                            }
                                        </span>
                                        <ChevronDown size={13} strokeWidth={1.8} />
                                    </button>

                                    {mrrTrendFilterOpen ? (
                                        <div className={styles.activeUsersFilterMenu}>
                                            {trendRangeOptions.map((option) => (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    className={
                                                        mrrTrendRange === option.value
                                                            ? styles.activeUsersFilterOptionActive
                                                            : styles.activeUsersFilterOption
                                                    }
                                                    onClick={() => {
                                                        setMrrTrendRange(option.value);
                                                        setMrrTrendFilterOpen(false);
                                                    }}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            <div className={styles.revenueInlineMetricRow}>
                                <div className={styles.revenueInlineMetric}>
                                    <strong>{activeProgressData?.kpis?.accountsSaved ?? 0}</strong>
                                    <span>
                                        ↑ {Math.abs(Number(activeProgressData?.kpis?.accountsSavedPct ?? 0)).toFixed(1)}%
                                    </span>
                                    <p>Retained customers that moved MRR</p>
                                </div>

                                <div className={styles.revenueInlineMetric}>
                                    <strong>
                                        {formatCurrency(
                                            activeOpportunityAccounts.reduce(
                                                (sum, item) => sum + Number(item.upside || 0),
                                                0
                                            )
                                        )}
                                    </strong>
                                    <span>Opportunity</span>
                                    <p>Expansion MRR</p>
                                </div>

                                <div className={styles.revenueInlineMetric}>
                                    <strong>{formatCurrency(totalProtected)}</strong>
                                    <span>
                                        ↑ {Math.abs(formatPercentChange(totalProtected, previousProtected)).toFixed(1)}%
                                    </span>
                                    <p>MRR protected</p>
                                </div>
                            </div>

                            <div className={styles.chartPreview}>
                                <EChart
                                    key={`mrr-${mrrTrendRange}-${mrrTrendData.labels.join("-")}-${mrrTrendData.values.join("-")}`}
                                    option={mrrProtectedOption(mrrTrendData.labels, mrrTrendData.values, isPro)}
                                />
                            </div>
                        </div>

                        {/* AI Insights */}
                        <div className={`${styles.card} ${styles.aiInsightsCard}`}>
                            <div className={styles.aiInsightsHeader}>
                                <div>
                                    <h4 className={styles.aiInsightsTitle}>✧ AI Insights</h4>
                                    <p className={styles.aiInsightsSubtitle}>
                                        Priority actions based on your customers and recent activity.
                                    </p>

                                    <div className={styles.aiInsightsMeta}>
                                        <Clock3 size={13} strokeWidth={1.8} />
                                        <span>{formatRefreshTime(insightsRefreshedAt)}</span>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    className={styles.softButton}
                                    onClick={() => {
                                        if (isDemoMode) {
                                            setInsightsRefreshedAt(new Date().toISOString());
                                            return;
                                        }

                                        const canRefresh = isTrialActive || isPro || effectivePlan === "starter";

                                        if (!canRefresh) {
                                            setUpgradeOpen(true);
                                            return;
                                        }

                                        if (currentUser) void loadWorkspaceAi(currentUser);
                                    }}
                                >
                                    Refresh
                                </button>
                            </div>

                            <div className={styles.aiInsightList}>
                                {visibleInsights.length > 0 ? (
                                    visibleInsights.map((item) => {
                                        const meta = getInsightMeta(item);
                                        const Icon = meta.Icon;

                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                className={`${styles.aiInsightRow} ${meta.tone}`}
                                                onClick={() => {
                                                    if (item.href) router.push(item.href);
                                                }}
                                            >
                                                <span className={`${styles.aiInsightIcon} ${meta.tone}`}>
                                                    <Icon size={20} strokeWidth={1.8} />
                                                </span>

                                                <div className={styles.aiInsightContent}>
                                                    <span className={styles.aiInsightLabel}>{meta.label}</span>
                                                    <strong>{item.title}</strong>
                                                    <p>{item.summary}</p>
                                                    {item.meta ? <small>{item.meta}</small> : null}
                                                </div>

                                                {item.amountLabel ? (
                                                    <div className={`${styles.aiInsightAmount} ${meta.tone}`}>
                                                        <span>{item.metricLabel ?? "Value"}</span>
                                                        <strong>{item.amountLabel}</strong>
                                                    </div>
                                                ) : null}
                                            </button>
                                        );
                                    })
                                ) : (
                                    <div className={styles.emptyText}>No recent insight activity yet.</div>
                                )}

                                {insightFeed.length > INSIGHTS_PER_PAGE ? (
                                    <div className={styles.aiInsightsPagination}>
                                        <button
                                            type="button"
                                            onClick={() => setInsightPage((page) => Math.max(0, page - 1))}
                                            disabled={insightPage === 0}
                                        >
                                            Previous
                                        </button>

                                        <span>
                                            {insightPage + 1} of {insightPageCount}
                                        </span>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                setInsightPage((page) =>
                                                    Math.min(insightPageCount - 1, page + 1)
                                                )
                                            }
                                            disabled={insightPage >= insightPageCount - 1}
                                        >
                                            Next
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    <div className={styles.rightDashboardStack}>
                        {/* Churn Trend */}
                        <div className={`${styles.card} ${styles.churnChartCard}`}>
                            <div className={styles.cardHeader}>
                                <div>
                                    <h4>Churn Trend</h4>
                                    <p>Monthly churn rate and customer risk signals.</p>
                                </div>

                                <div className={styles.activeUsersFilterWrap}>
                                    <button
                                        type="button"
                                        className={styles.activeUsersFilter}
                                        onClick={() => setChurnTrendFilterOpen((open) => !open)}
                                    >
                                        <Clock3 size={13} strokeWidth={1.8} />
                                        <span>
                                            {trendRangeOptions.find((option) => option.value === churnTrendRange)?.label}
                                        </span>
                                        <ChevronDown size={13} strokeWidth={1.8} />
                                    </button>

                                    {churnTrendFilterOpen ? (
                                        <div className={styles.activeUsersFilterMenu}>
                                            {trendRangeOptions.map((option) => (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    className={
                                                        churnTrendRange === option.value
                                                            ? styles.activeUsersFilterOptionActive
                                                            : styles.activeUsersFilterOption
                                                    }
                                                    onClick={() => {
                                                        setChurnTrendRange(option.value);
                                                        setChurnTrendFilterOpen(false);
                                                    }}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            <div className={styles.churnMetricRow}>
                                {churnMetricItems.map((item) => {
                                    const trend = getTrendMeta(item.delta, true);

                                    return (
                                        <div key={item.label} className={styles.churnMiniKpi}>
                                            <strong>{item.value}</strong>

                                            <div className={styles.churnMiniSubline}>
                                                <span style={{ color: trend.color }}>
                                                    {trend.arrow} {Math.abs(item.pct).toFixed(1)}%
                                                </span>
                                            </div>

                                            <p>{item.label}</p>
                                            <small>{item.subtext}</small>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className={styles.churnChartWrap}>
                                <EChart
                                    key={`churn-${churnTrendRange}-${churnTrendData.labels.join("-")}-${churnTrendData.values.join("-")}`}
                                    option={churnTrendOption(churnTrendData.labels, churnTrendData.values, isPro)}
                                />
                            </div>
                        </div>

                        {/* User Metrics */}
                        <div className={`${styles.card} ${styles.activeUsersCard}`}>
                            <div className={styles.activeUsersHeader}>
                                <div>
                                    <div className={styles.activeUsersTitle}>
                                        <UsersRound size={16} strokeWidth={1.9} />
                                        <span>User Metrics</span>
                                    </div>

                                    <p>An overview of your active users.</p>
                                </div>

                                <div className={styles.activeUsersHeaderRight}>
                                    <div className={styles.activeUsersFilterWrap}>
                                        <button
                                            type="button"
                                            className={styles.activeUsersFilter}
                                            onClick={() => setActiveUsersFilterOpen((open) => !open)}
                                        >
                                            <Clock3 size={13} strokeWidth={1.8} />
                                            <span>{activeUsersRangeLabel}</span>
                                            <ChevronDown size={13} strokeWidth={1.8} />
                                        </button>

                                        {activeUsersFilterOpen ? (
                                            <div className={styles.activeUsersFilterMenu}>
                                                {[
                                                    { label: "24 hrs", value: 24 },
                                                    { label: "7 days", value: 7 },
                                                ].map((range) => (
                                                    <button
                                                        key={range.value}
                                                        type="button"
                                                        className={
                                                            activeUsersRange === range.value
                                                                ? styles.activeUsersFilterOptionActive
                                                                : styles.activeUsersFilterOption
                                                        }
                                                        onClick={() => {
                                                            setActiveUsersRange(range.value as 24 | 7);
                                                            setActiveUsersFilterOpen(false);
                                                        }}
                                                    >
                                                        {range.label}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>

                                    <div className={styles.activeUsersMetricRow}>
                                        <strong>{activeUsersCurrent.toLocaleString(userLocale)}</strong>

                                        <div>
                                            <span
                                                className={
                                                    activeUsersDelta >= 0
                                                        ? styles.activeUsersUp
                                                        : styles.activeUsersDown
                                                }
                                            >
                                                {activeUsersDelta >= 0 ? "↑" : "↓"}{" "}
                                                {Math.abs(activeUsersPct).toFixed(1)}%{" "}
                                                ({activeUsersDelta >= 0 ? "+" : "-"}
                                                {Math.abs(activeUsersDelta).toLocaleString(userLocale)})
                                            </span>

                                            <p>
                                                vs. {activeUsersPrevious.toLocaleString(userLocale)} last period
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.activeUsersChartWrap}>
                                <EChart
                                    key={`active-users-${activeUsersRange}-${visibleActiveUsersMonths.join("-")}-${visibleActiveUsersSeries.join("-")}`}
                                    option={activeUsersOption(
                                        visibleActiveUsersMonths,
                                        visibleActiveUsersSeries
                                    )}
                                />
                            </div>
                        </div>

                        <AIActionQueue
                            accounts={activeRiskAccounts}
                            isDemoMode={isDemoMode}
                            canRetryPayment={canViewRetryPayment}
                            senderName={currentUser?.displayName || currentUser?.email?.split("@")[0] || "Team"}
                        />
                    </div>
                </div>

                {upgradeOpen && !isDemoMode ? (
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
        </div >




    );

}