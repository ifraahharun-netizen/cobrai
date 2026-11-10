"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { activeUsersLineOption, churnTrendOption, mrrProtectedOption } from "@/components/charts/options";
import { getFirebaseAuth } from "@/lib/firebase.client";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { getDemoDashboardData } from "@/lib/demo/dashboard";
import { buildDemoSeries } from "@/lib/demo/analytics";
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
    type LucideIcon,
} from "lucide-react";

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
type BehaviourRisk = "low" | "medium" | "high" | "critical";

type BehaviourRow = {
    customerId: string;
    customer: string;
    behaviour: string;
    interpretation: string;
    evidence: string[];
    risk: BehaviourRisk;
    trend: "improving" | "stable" | "declining";
    nextAction: string;
    confidence: "low" | "medium" | "high";
    mrr: number;
};

type BehaviourReport = {
    source: "live" | "demo";
    model: string;
    analysedAt: string;
    currency: string;
    summary: string;
    rows: BehaviourRow[];
};

/** One card style for every chart, matching the email queue chart cards. */
function TrendCard({
    title,
    description,
    headlineLabel,
    value,
    change,
    good = true,
    context,
    tabs,
    legend,
    children,
}: {
    title: string;
    description: string;
    headlineLabel: string;
    value: string;
    change?: string;
    good?: boolean;
    context?: string;
    tabs?: ReactNode;
    legend?: Array<{ label: string; colour: string }>;
    children: ReactNode;
}) {
    return (
        <section className={`${styles.card} ${styles.trendCard}`} aria-label={title}>
            <header className={styles.trendCardHead}>
                <div className={styles.trendCardTitle}>
                    <h3>{title}</h3>
                    <p>{description}</p>
                </div>

                <div className={styles.trendHeadline}>
                    <span>
                        {headlineLabel}
                        {change ? <em className={good ? styles.isUp : styles.isDown}>{change}</em> : null}
                    </span>
                    <strong>{value}</strong>
                    {context ? <small>{context}</small> : null}
                </div>
            </header>

            {tabs}

            <div className={styles.trendCardChart}>{children}</div>

            {legend ? (
                <div className={styles.trendLegend}>
                    {legend.map((item) => (
                        <span key={item.label}>
                            <i style={{ background: item.colour }} />
                            {item.label}
                        </span>
                    ))}
                </div>
            ) : null}
        </section>
    );
}

/** Underline tabs for the time range, like the email queue chart tabs. */
function RangeTabs<T extends number>({
    label,
    options,
    value,
    onChange,
}: {
    label: string;
    options: Array<{ label: string; value: T }>;
    value: T;
    onChange: (value: T) => void;
}) {
    return (
        <div className={styles.rangeTabs} role="tablist" aria-label={label}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={value === option.value}
                    className={value === option.value ? styles.rangeTabActive : undefined}
                    onClick={() => onChange(option.value)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

type FailedPaymentsResponse = {
    source: "live" | "demo";
    currency: string;
    total: number;
    count: number;
    items: Array<{
        id: string;
        customerId: string | null;
        customer: string;
        amount: number;
        failedAt: string;
    }>;
};

function formatDaysAgo(iso: string) {
    const time = new Date(iso).getTime();
    if (Number.isNaN(time)) return "";
    const days = Math.max(0, Math.round((Date.now() - time) / 86_400_000));
    if (days === 0) return "Failed today";
    if (days === 1) return "Failed yesterday";
    return `Failed ${days} days ago`;
}

const BEHAVIOUR_CACHE_KEY = "cobrai:claude-behaviour";

const BEHAVIOUR_RISK_LABEL: Record<BehaviourRisk, string> = {
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
};

const BEHAVIOUR_TREND_LABEL: Record<BehaviourRow["trend"], string> = {
    declining: "↓ Declining",
    stable: "→ Stable",
    improving: "↑ Improving",
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

type KpiSubtext = {
    /** Coloured percentage, e.g. "+0.7%". Null when there is nothing to compare. */
    change: string | null;
    /** Short grey context after it, e.g. "vs last month". */
    context: string;
    /** Fuller comparison shown on hover, e.g. "Last month: £81,250". */
    detail?: string;
};

type KPI = {
    label: string;
    value: string;
    subtext: KpiSubtext;
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

function getTrialDaysLeft(trialEndsAt: string | null) {
    if (!trialEndsAt) return null;

    const end = new Date(trialEndsAt).getTime();
    if (!Number.isFinite(end)) return null;

    const diff = end - Date.now();
    if (diff <= 0) return 0;

    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}


type DemoTrendPoint = {
    label: string;
    value: number;
};

/**
 * Expands monthly demo data into deterministic weekly-looking movement.
 *
 * It derives every point from buildDemoSeries(), so there are no fixed chart
 * values in this page. Live workspaces continue using the existing API series.
 */
function buildDetailedDemoTrend(
    months: string[],
    values: number[],
    mode: "mrr" | "churn"
): DemoTrendPoint[] {
    const safeLength = Math.min(months.length, values.length);

    if (safeLength === 0) return [];

    if (safeLength === 1) {
        return [{
            label: months[0],
            value: Number(values[0] || 0),
        }];
    }

    const pointsPerMonth = 4;
    const output: DemoTrendPoint[] = [];

    for (let monthIndex = 0; monthIndex < safeLength - 1; monthIndex += 1) {
        const start = Number(values[monthIndex] || 0);
        const end = Number(values[monthIndex + 1] || 0);
        const movement = end - start;

        const localScale =
            mode === "mrr"
                ? Math.max(Math.abs(movement) * 0.72, Math.abs(start) * 0.028)
                : Math.max(Math.abs(movement) * 0.8, 0.18);

        for (let step = 0; step < pointsPerMonth; step += 1) {
            const progress = step / pointsPerMonth;
            const baseline = start + movement * progress;

            const wave =
                Math.sin((monthIndex * pointsPerMonth + step) * 1.37) *
                localScale *
                0.58;

            const secondaryWave =
                Math.sin((monthIndex * pointsPerMonth + step) * 2.41 + 0.8) *
                localScale *
                0.27;

            const eventMovement =
                step === 1
                    ? localScale * (monthIndex % 2 === 0 ? 0.55 : -0.48)
                    : step === 3
                        ? localScale * (monthIndex % 3 === 0 ? -0.42 : 0.36)
                        : 0;

            const rawValue =
                baseline + wave + secondaryWave + eventMovement;

            output.push({
                label: step === 0 ? months[monthIndex] : "",
                value:
                    mode === "churn"
                        ? Number(Math.max(0.2, rawValue).toFixed(2))
                        : Number(Math.max(0, rawValue).toFixed(2)),
            });
        }
    }

    output.push({
        label: months[safeLength - 1],
        value: Number(values[safeLength - 1] || 0),
    });

    return output;
}

export default function DashboardPage() {
    const router = useRouter();
    const auth = useMemo(() => getFirebaseAuth(), []);

    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [upgradeOpen, setUpgradeOpen] = useState(false);
    const [insightsRefreshedAt, setInsightsRefreshedAt] = useState<string | null>(null);

    const [billing, setBilling] = useState<DashboardBilling>({
        plan: "free",
        trialEndsAt: null,
    });

    const [activeUsers24Hours, setActiveUsers24Hours] = useState<ActiveUsersPoint[]>([]);
    const [activeUsers7Days, setActiveUsers7Days] = useState<ActiveUsersPoint[]>([]);
    const [activeUsersRange, setActiveUsersRange] = useState<24 | 7>(7);
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
    // Last Claude analysis, cached in this browser so it shows straight away.
    const [behaviourReport, setBehaviourReport] = useState<BehaviourReport | null>(() => {
        if (typeof window === "undefined") return null;
        try {
            const cached = window.localStorage.getItem(BEHAVIOUR_CACHE_KEY);
            return cached ? (JSON.parse(cached) as BehaviourReport) : null;
        } catch {
            return null;
        }
    });
    const [behaviourLoading, setBehaviourLoading] = useState(false);
    const [behaviourError, setBehaviourError] = useState("");
    const [expandedBehaviourId, setExpandedBehaviourId] = useState<string | null>(null);

    const [failedPayments, setFailedPayments] = useState<FailedPaymentsResponse | null>(null);
    const [failedPaymentsError, setFailedPaymentsError] = useState(false);

    useEffect(() => {
        if (!currentUser) return;
        let cancelled = false;

        (async () => {
            try {
                const token = await currentUser.getIdToken();
                const res = await fetch("/api/dashboard/failed-payments", {
                    cache: "no-store",
                    headers: { Authorization: `Bearer ${token}` },
                });
                const data = (await res.json().catch(() => null)) as FailedPaymentsResponse | null;
                if (cancelled) return;
                if (!res.ok || !data || !Array.isArray(data.items)) throw new Error("bad response");
                setFailedPayments(data);
                setFailedPaymentsError(false);
            } catch {
                if (!cancelled) setFailedPaymentsError(true);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [currentUser]);

    async function analyseBehaviour() {
        const user = currentUser ?? getFirebaseAuth().currentUser;
        if (!user || behaviourLoading) return;

        setBehaviourLoading(true);
        setBehaviourError("");

        try {
            const token = await user.getIdToken();
            const res = await fetch("/api/dashboard/ai/customer-behaviour", {
                method: "POST",
                cache: "no-store",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            });

            const data = (await res.json().catch(() => null)) as
                | (BehaviourReport & { error?: string })
                | null;

            if (!res.ok || !data || !Array.isArray(data.rows)) {
                throw new Error(data?.error || "Claude could not analyse your customers right now.");
            }

            setBehaviourReport(data);
            setExpandedBehaviourId(null);

            try {
                window.localStorage.setItem(BEHAVIOUR_CACHE_KEY, JSON.stringify(data));
            } catch {
                // Not critical.
            }
        } catch (error) {
            setBehaviourError(
                error instanceof Error ? error.message : "Claude could not analyse your customers right now."
            );
        } finally {
            setBehaviourLoading(false);
        }
    }
    const [mrrTrendRange, setMrrTrendRange] = useState<1 | 3 | 6>(6);

    const [churnTrendRange, setChurnTrendRange] = useState<1 | 3 | 6>(6);

    const demoDashboardData = getDemoDashboardData(userLocale);
    const demoAnalyticsSeries = useMemo(() => buildDemoSeries(), []);

    /*
     * Use the same deterministic, realistic demo history as the Analytics page.
     * Live workspaces still use the existing dashboard API values automatically.
     */
    const baseDemoChurnMonths = demoAnalyticsSeries.churn.map(
        (point) => point.month
    );
    const baseDemoChurnPct = demoAnalyticsSeries.churn.map(
        (point) => Number(point.valuePct || 0)
    );

    const baseDemoMrrMonths = demoAnalyticsSeries.mrr.map(
        (point) => point.month
    );
    const baseDemoMrrVals = demoAnalyticsSeries.mrr.map(
        (point) => Number(point.valueMinor || 0) / 100
    );

    const detailedDemoMrrTrend = useMemo(
        () =>
            buildDetailedDemoTrend(
                baseDemoMrrMonths,
                baseDemoMrrVals,
                "mrr"
            ),
        [baseDemoMrrMonths.join("|"), baseDemoMrrVals.join("|")]
    );

    const detailedDemoChurnTrend = useMemo(
        () =>
            buildDetailedDemoTrend(
                baseDemoChurnMonths,
                baseDemoChurnPct,
                "churn"
            ),
        [baseDemoChurnMonths.join("|"), baseDemoChurnPct.join("|")]
    );

    const demoMrrMonths = detailedDemoMrrTrend.map(
        (point) => point.label
    );
    const demoMrrVals = detailedDemoMrrTrend.map(
        (point) => point.value
    );

    const demoChurnMonths = detailedDemoChurnTrend.map(
        (point) => point.label
    );
    const demoChurnPct = detailedDemoChurnTrend.map(
        (point) => point.value
    );

    const demoCurrentMonthDays = demoDashboardData.currentMonthDays;
    const demoCurrentMonthMrrVals =
        demoDashboardData.currentMonthMrrProtectedValues;
    const demoCurrentMonthChurnPct =
        demoDashboardData.currentMonthChurnPct;
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
    ): KpiSubtext => {
        const isCurrency = options?.isCurrency ?? false;
        const suffix = options?.suffix ?? "";

        if (!previousValue && previousValue !== 0) {
            return { change: null, context: "No previous month data" };
        }

        const previousLabel = isCurrency
            ? formatCurrency(previousValue)
            : `${previousValue}${suffix}`;
        const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";

        return {
            change: `${sign}${Math.abs(pct).toFixed(1)}%`,
            context: "vs last month",
            detail: `Last month: ${previousLabel}`,
        };
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

    // Same thresholds as the AI Action Queue: 60+ is at risk, 80+ is critical.
    const kpiAtRiskAccounts = activeRiskAccounts.filter(
        (account) => Number(account.risk ?? 0) >= 60
    ).length;
    const kpiCriticalAccounts = activeRiskAccounts.filter(
        (account) => Number(account.risk ?? 0) >= 80
    ).length;

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
            subtext: {
                change: `${churnDelta > 0 ? "+" : churnDelta < 0 ? "-" : ""}${Math.abs(
                    formatPercentChange(churnProxyCurrent, churnProxyPrevious)
                ).toFixed(1)}%`,
                context: "vs last month",
                detail: `Last month: ${churnProxyPrevious.toFixed(1)}%`,
            },
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
        {
            label: "Accounts at risk",
            value: kpiAtRiskAccounts.toLocaleString(userLocale),
            subtext: {
                change: kpiCriticalAccounts.toLocaleString(userLocale),
                context: "need immediate action",
                detail: "At risk: churn-risk score 60+. Immediate action: 80+.",
            },
            trend: {
                arrow: "•",
                color: kpiCriticalAccounts > 0 ? "#d32c2cff" : "#6b7280",
            },
            Icon: UsersRound,
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
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric",

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


                setActiveUsers24Hours(
                    Array.isArray(data?.activeUsers?.last24Hours)
                        ? data.activeUsers.last24Hours.map((point: any) => ({
                            timestamp: String(point?.timestamp ?? ""),
                            value: Number(point?.value ?? 0),
                        }))
                        : []
                );

                setActiveUsers7Days(
                    Array.isArray(data?.activeUsers?.last7Days)
                        ? data.activeUsers.last7Days.map((point: any) => ({
                            timestamp: String(point?.timestamp ?? ""),
                            value: Number(point?.value ?? 0),
                        }))
                        : []
                );

                setKpiTotalMrrCurrent(
                    typeof data?.totalMrrTrend?.current === "number"
                        ? data.totalMrrTrend.current
                        : null
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


    const buildActiveUsersRangeData = (
        points: ActiveUsersPoint[],
        range: 24 | 7
    ) => {
        if (!isDemoMode && points.length > 0) {
            return points.map((point) => {
                const date = new Date(point.timestamp);

                const timeLabel = date
                    .toLocaleTimeString(userLocale, {
                        hour: "numeric",
                        hour12: true,
                    })
                    .replace(/\s/g, "")
                    .toLowerCase();

                return {
                    label:
                        range === 24
                            ? timeLabel
                            : date.toLocaleDateString(userLocale, {
                                weekday: "short",
                            }),

                    tooltipLabel:
                        range === 24
                            ? timeLabel
                            : date.toLocaleDateString(userLocale, {
                                weekday: "short",
                                day: "numeric",
                                month: "short",
                            }),

                    value: Number(point.value || 0),
                };
            });
        }

        const fallbackValues = Array.isArray(demoDashboardData.activeUsersValues)
            ? demoDashboardData.activeUsersValues
            : [];

        const fallbackWindow =
            range === 24
                ? fallbackValues.slice(-24)
                : fallbackValues.slice(-7);

        return fallbackWindow.map((value: number, index: number) => {
            const date = new Date();

            if (range === 24) {
                date.setHours(date.getHours() - (fallbackWindow.length - 1 - index), 0, 0, 0);
            } else {
                date.setDate(date.getDate() - (fallbackWindow.length - 1 - index));
                date.setHours(0, 0, 0, 0);
            }

            const timeLabel = date
                .toLocaleTimeString(userLocale, {
                    hour: "numeric",
                    hour12: true,
                })
                .replace(/\s/g, "")
                .toLowerCase();

            return {
                label:
                    range === 24
                        ? timeLabel
                        : date.toLocaleDateString(userLocale, {
                            weekday: "short",
                        }),

                tooltipLabel:
                    range === 24
                        ? timeLabel
                        : date.toLocaleDateString(userLocale, {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                        }),

                value: Number(value || 0),
            };
        });
    };



    const activeUsersRangeData = buildActiveUsersRangeData(
        activeUsersSeries,
        activeUsersRange
    );

    const visibleActiveUsersSeries = activeUsersRangeData.map(
        (item) => Number(item.value || 0)
    );

    const activeUserBreakdownData = visibleActiveUsersSeries.map(
        (total, index) => {
            const previousTotal =
                index > 0
                    ? visibleActiveUsersSeries[index - 1]
                    : total;

            const acquired = Math.max(0, total - previousTotal);
            const retained = Math.max(0, total - acquired);

            return {
                label: activeUsersRangeData[index]?.label ?? "",
                tooltipLabel:
                    activeUsersRangeData[index]?.tooltipLabel ?? "",
                retained,
                acquired,
                total,
            };
        }
    );

    const latestActiveUserBreakdown =
        activeUserBreakdownData[activeUserBreakdownData.length - 1] ?? {
            retained: 0,
            acquired: 0,
            total: 0,
        };

    const activeUsersCurrent = latestActiveUserBreakdown.total;

    const activeUsersPrevious =
        activeUserBreakdownData[activeUserBreakdownData.length - 2]?.total ?? 0;

    const activeUsersPct = formatPercentChange(activeUsersCurrent, activeUsersPrevious);

    const filterChartRange = <T,>(
        labels: T[],
        values: number[],
        range: 1 | 3 | 6,
        pointsPerMonth = 1
    ) => {
        if (range === 1) {
            return {
                labels,
                values,
            };
        }

        const pointCount = Math.max(1, range * pointsPerMonth + 1);

        return {
            labels: labels.slice(-pointCount),
            values: values.slice(-pointCount),
        };
    };

    const mrrTrendData =
        mrrTrendRange === 1 && isDemoMode
            ? {
                labels: demoCurrentMonthDays,
                values: demoCurrentMonthMrrVals,
            }
            : filterChartRange(
                activeMrrMonths,
                activeMrrVals,
                mrrTrendRange,
                isDemoMode ? 4 : 1
            );

    const churnTrendData =
        churnTrendRange === 1 && isDemoMode
            ? {
                labels: demoCurrentMonthDays,
                values: demoCurrentMonthChurnPct,
            }
            : filterChartRange(
                activeChurnMonths,
                activeChurnPct,
                churnTrendRange,
                isDemoMode ? 4 : 1
            );

    // Headline numbers for the ticker-style chart cards: latest value and change over the range.
    const toTicker = (values: number[]) => {
        const clean = values.filter((value) => Number.isFinite(value));
        const first = clean[0] ?? 0;
        const last = clean[clean.length - 1] ?? 0;
        const change = last - first;
        return { last, change, pct: first ? (change / first) * 100 : 0 };
    };

    const mrrTicker = toTicker(mrrTrendData.values);
    const churnTicker = toTicker(churnTrendData.values);
    const trendRangeOptions: Array<{ label: string; short: string; value: 1 | 3 | 6 }> = [
        { label: "Current month", short: "1M", value: 1 },
        { label: "3 months", short: "3M", value: 3 },
        { label: "6 months", short: "6M", value: 6 },
    ];
    const visibleAccountsAtRisk = topRiskAccounts.slice(0, 3);

    return (

        <div className={styles.page}>


            <div className={styles.content}>


                <header className={styles.header}>
                    <div>
                        <h1 className={styles.title}>Dashboard</h1>
                        <p className={styles.subtitle}>
                            Retention intelligence — clear actions that protect revenue.
                        </p>
                    </div>

                    <span
                        className={`${styles.dataBadge} ${isDemoMode ? styles.dataBadgeDemo : styles.dataBadgeLive}`}
                    >
                        {isDemoMode ? "Demo data" : "Live data"}
                    </span>
                </header>

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

                <section className={styles.kpiGrid} aria-label="Key metrics">
                    {kpis.map((kpi) => {
                        const Icon = kpi.Icon;

                        return (
                            <div key={kpi.label} className={styles.kpiCard}>
                                <div className={styles.kpiTop}>
                                    <div className={styles.kpiLabel}>{kpi.label}</div>
                                    <div className={styles.kpiIcon}>
                                        <Icon size={16} strokeWidth={1.8} />
                                    </div>
                                </div>

                                <div className={styles.kpiValue}>{kpi.value}</div>

                                <div
                                    className={styles.kpiSubline}
                                    title={kpi.subtext.detail}
                                >
                                    {kpi.subtext.change ? (
                                        <span
                                            className={styles.kpiChange}
                                            style={{ color: kpi.trend.color }}
                                        >
                                            <span aria-hidden="true">{kpi.trend.arrow}</span>
                                            {kpi.subtext.change}
                                        </span>
                                    ) : null}
                                    <span className={styles.kpiContext}>
                                        {kpi.subtext.context}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </section>
                {/* Trends */}
                <div className={styles.chartGrid}>
                        <TrendCard
                            title="Revenue protected"
                            description="MRR saved by retention actions."
                            headlineLabel="Latest"
                            value={formatCurrency(mrrTicker.last)}
                            change={`${mrrTicker.change >= 0 ? "+" : "-"}${Math.abs(mrrTicker.pct).toFixed(1)}%`}
                            good={mrrTicker.change >= 0}
                            context="vs start of period"
                            tabs={
                                <RangeTabs
                                    label="Revenue range"
                                    options={trendRangeOptions}
                                    value={mrrTrendRange}
                                    onChange={setMrrTrendRange}
                                />
                            }
                        >
                            <EChart
                                key={`mrr-${mrrTrendRange}-${mrrTrendData.labels.join("-")}-${mrrTrendData.values.join("-")}`}
                                option={mrrProtectedOption(mrrTrendData.labels, mrrTrendData.values, isPro)}
                            />
                        </TrendCard>

                        <TrendCard
                            title="Churn rate"
                            description="Share of customers lost each period."
                            headlineLabel="Latest"
                            value={`${churnTicker.last.toFixed(1)}%`}
                            change={`${churnTicker.change >= 0 ? "+" : "-"}${Math.abs(churnTicker.change).toFixed(2)} pts`}
                            good={churnTicker.change <= 0}
                            context="vs start of period"
                            tabs={
                                <RangeTabs
                                    label="Churn range"
                                    options={trendRangeOptions}
                                    value={churnTrendRange}
                                    onChange={setChurnTrendRange}
                                />
                            }
                        >
                            <EChart
                                key={`churn-${churnTrendRange}-${churnTrendData.labels.join("-")}-${churnTrendData.values.join("-")}`}
                                option={churnTrendOption(churnTrendData.labels, churnTrendData.values, isPro)}
                            />
                        </TrendCard>
                    </div>

                {/* Customer insights from Claude */}
                <section className={styles.insightsSection} aria-labelledby="insights-title">
                    <div className={styles.sectionHead}>
                        <div>
                            <h2 id="insights-title" className={styles.sectionTitle}>
                                Customer insights
                                <span className={styles.claudeTag}>
                                    <Sparkles size={11} strokeWidth={2} aria-hidden="true" />
                                    Claude
                                </span>
                            </h2>
                            <p className={styles.sectionText}>
                                {behaviourReport?.summary && !behaviourLoading
                                    ? behaviourReport.summary
                                    : "Claude reads your account data and explains what each customer is doing."}
                            </p>
                        </div>

                        <div className={styles.sectionActions}>
                            <span className={styles.sectionMeta}>
                                {behaviourReport
                                    ? `Analysed ${new Date(behaviourReport.analysedAt).toLocaleString(userLocale, {
                                        day: "numeric",
                                        month: "short",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}${behaviourReport.source === "demo" ? " · demo data" : ""}`
                                    : "Not analysed yet"}
                            </span>
                            <button
                                type="button"
                                className={styles.consoleButton}
                                onClick={() => void analyseBehaviour()}
                                disabled={behaviourLoading}
                            >
                                {behaviourLoading ? "Analysing…" : behaviourReport ? "Re-analyse" : "Analyse"}
                            </button>
                        </div>
                    </div>

                    {behaviourError ? (
                        <div className={styles.behaviourError} role="alert">
                            {behaviourError}
                        </div>
                    ) : null}

                    <div className={styles.consoleTableWrap}>
                        {behaviourLoading ? (
                            <div aria-live="polite">
                                {[0, 1, 2, 3, 4].map((index) => (
                                    <div key={index} className={styles.consoleSkeleton}>
                                        <span />
                                        <span />
                                        <span />
                                    </div>
                                ))}
                            </div>
                        ) : behaviourReport && behaviourReport.rows.length > 0 ? (
                            <table className={styles.consoleTable}>
                                <thead>
                                    <tr>
                                        <th>Customer</th>
                                        <th>Pattern</th>
                                        <th>Next step</th>
                                        <th className={styles.consoleNum}>MRR</th>
                                        <th>Risk</th>
                                        <th aria-label="Details" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {behaviourReport.rows.map((row) => {
                                        const expanded = expandedBehaviourId === row.customerId;
                                        const toggle = () =>
                                            setExpandedBehaviourId(expanded ? null : row.customerId);

                                        return (
                                            <Fragment key={row.customerId}>
                                                <tr
                                                    className={`${styles.consoleRow} ${expanded ? styles.consoleRowOpen : ""}`}
                                                    onClick={toggle}
                                                    tabIndex={0}
                                                    aria-expanded={expanded}
                                                    onKeyDown={(event) => {
                                                        if (event.key === "Enter" || event.key === " ") {
                                                            event.preventDefault();
                                                            toggle();
                                                        }
                                                    }}
                                                >
                                                    <td className={styles.consoleStrong}>{row.customer}</td>
                                                    <td>{row.behaviour}</td>
                                                    <td className={styles.consoleMuted}>{row.nextAction}</td>
                                                    <td className={styles.consoleNum}>{formatCurrency(row.mrr)}</td>
                                                    <td>
                                                        <span className={`${styles.riskDot} ${styles[`riskDot_${row.risk}`]}`}>
                                                            {BEHAVIOUR_RISK_LABEL[row.risk]}
                                                        </span>
                                                    </td>
                                                    <td className={styles.consoleChevron} aria-hidden="true">
                                                        {expanded ? "−" : "+"}
                                                    </td>
                                                </tr>

                                                {expanded ? (
                                                    <tr className={styles.consoleDetailRow}>
                                                        <td colSpan={6}>
                                                            <p>{row.interpretation}</p>
                                                            <ul>
                                                                {row.evidence.map((item) => (
                                                                    <li key={item}>{item}</li>
                                                                ))}
                                                            </ul>
                                                            <span className={styles.consoleMuted}>
                                                                {BEHAVIOUR_TREND_LABEL[row.trend]} · Confidence{" "}
                                                                {row.confidence}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ) : null}
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        ) : (
                            <div className={styles.consoleEmpty}>
                                <strong>No analysis yet</strong>
                                <p>
                                    Claude looks at MRR, churn risk, health, activity and failed payments, then explains
                                    each customer&apos;s behaviour and the next step.
                                </p>
                                <button
                                    type="button"
                                    className={styles.consoleButtonPrimary}
                                    onClick={() => void analyseBehaviour()}
                                >
                                    Analyse with Claude
                                </button>
                            </div>
                        )}
                    </div>

                    <p className={styles.consoleFootnote}>Claude can make mistakes. Check before acting.</p>
                </section>

                {/* Active users + failed payments */}
                <div className={styles.bottomRow}>
                <TrendCard
                    title="Active users"
                    description={
                        activeUsersRange === 24
                            ? "Users active in each hour of the last day."
                            : "Users active on each of the last 7 days."
                    }
                    headlineLabel={activeUsersRange === 24 ? "This hour" : "Today"}
                    value={activeUsersCurrent.toLocaleString(userLocale)}
                    change={`${activeUsersPct >= 0 ? "+" : "-"}${Math.abs(activeUsersPct).toFixed(1)}%`}
                    good={activeUsersPct >= 0}
                    context={activeUsersRange === 24 ? "vs previous hour" : "vs yesterday"}
                    tabs={
                        <RangeTabs
                            label="Active users range"
                            options={[
                                { label: "Last 24 hours", value: 24 as const },
                                { label: "Last 7 days", value: 7 as const },
                            ]}
                            value={activeUsersRange}
                            onChange={setActiveUsersRange}
                        />
                    }
                >
                    <EChart
                        key={`active-users-${activeUsersRange}-${activeUserBreakdownData.map((row) => row.total).join("-")}`}
                        option={activeUsersLineOption(
                            activeUserBreakdownData.map((row) => row.label),
                            activeUserBreakdownData.map((row) => row.tooltipLabel),
                            activeUserBreakdownData.map((row) => row.total)
                        )}
                    />
                </TrendCard>

                    <section className={`${styles.card} ${styles.trendCard}`} aria-label="Failed payments">
                        <header className={styles.trendCardHead}>
                            <div className={styles.trendCardTitle}>
                                <h3>Failed payments</h3>
                                <p>Invoices that need a retry.</p>
                            </div>

                            <div className={styles.trendHeadline}>
                                <span>At risk</span>
                                <strong>{formatCurrency(failedPayments?.total ?? 0)}</strong>
                                <small>
                                    {failedPayments
                                        ? `${failedPayments.count} invoice${failedPayments.count === 1 ? "" : "s"}`
                                        : "Loading…"}
                                </small>
                            </div>
                        </header>

                        <div className={styles.paymentList}>
                            {failedPaymentsError ? (
                                <p className={styles.paymentEmpty}>Couldn&apos;t load failed payments.</p>
                            ) : !failedPayments ? (
                                <p className={styles.paymentEmpty}>Loading…</p>
                            ) : failedPayments.items.length === 0 ? (
                                <p className={styles.paymentEmpty}>No failed payments. Nice.</p>
                            ) : (
                                failedPayments.items.map((item) => (
                                    <div key={item.id} className={styles.paymentRow}>
                                        <div className={styles.paymentWho}>
                                            <strong>{item.customer}</strong>
                                            <span>{formatDaysAgo(item.failedAt)}</span>
                                        </div>
                                        <span className={styles.paymentAmount}>{formatCurrency(item.amount)}</span>
                                        {item.customerId ? (
                                            <button
                                                type="button"
                                                className={styles.consoleButton}
                                                onClick={() => router.push(`/dashboard/accounts-at-risk/${item.customerId}`)}
                                            >
                                                View
                                            </button>
                                        ) : (
                                            <span aria-hidden="true" />
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </section>
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