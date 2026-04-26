"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import EChart from "@/components/charts/EChart";
import { churnTrendOption, mrrProtectedOption } from "@/components/charts/options";
import { getFirebaseAuth } from "@/lib/firebase.client";
import { onAuthStateChanged } from "firebase/auth";
import type { EChartsOption } from "echarts";
import TrialBanner from "@/components/billing/Trialbanner";

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

type CustomerMix = {
    active: number;
    trial: number;
    upgraded: number;
    newSubscribers: number;
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

function formatGBPFromMinor(minor: number | null | undefined) {
    const value = Number(minor || 0) / 100;
    try {
        return new Intl.NumberFormat("en-GB", {
            style: "currency",
            currency: "GBP",
            maximumFractionDigits: 0,
        }).format(value);
    } catch {
        return `£${value.toFixed(0)}`;
    }
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

export default function DashboardPage() {
    const router = useRouter();
    const auth = useMemo(() => getFirebaseAuth(), []);

    const [upgradeOpen, setUpgradeOpen] = useState(false);

    async function testCheckout() {
        try {
            const res = await fetch("/api/stripe/checkout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    plan: "pro",
                    workspaceId: "test_workspace",
                    email: "test@test.com",
                }),
            });

            const data = await res.json();
            console.log("checkout response:", data);

            if (data.url) {
                window.location.href = data.url;
                return;
            }

            alert(data.error || "Checkout failed");
        } catch (error) {
            console.error("Checkout test failed:", error);
            alert("Checkout failed");
        }
    }

    const [billing, setBilling] = useState<DashboardBilling>({
        plan: "free",
        trialEndsAt: null,
    });

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

            if (!res.ok) {
                throw new Error("Failed to load billing summary");
            }

            const data = await res.json();

            setBilling({
                plan:
                    data.plan === "pro"
                        ? "pro"
                        : data.plan === "starter"
                            ? "starter"
                            : "free",
                trialEndsAt: data.trialEndsAt ?? null,
            });
        } catch (error) {
            console.error("[Dashboard] loadBilling failed:", error);
        }
    }

    const demoChurnMonths = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
    const demoChurnPct = [5.8, 5.1, 4.7, 4.3, 3.9, 3.4];

    const demoMrrMonths = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
    const demoMrrVals = [420, 510, 480, 620, 590, 710];

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
        {
            id: "4",
            company: "Peak Analytics",
            email: "ops@peakanalytics.com",
            reason: "Low feature adoption",
            risk: 59,
            mrr: 210,
            tags: ["adoption"],
            updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
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
        {
            id: "13",
            company: "CedarWorks",
            email: "hello@cedarworks.io",
            signal: "Recovered failed payment",
            upside: 64,
            updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6).toISOString(),
        },
    ];

    const demoCustomerMix: CustomerMix = {
        active: 128,
        trial: 22,
        upgraded: 14,
        newSubscribers: 16,
    };

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
        recentMrrSaved: [
            { id: "1", account: "Acme Ltd", mrrSavedMinor: 21900 },
            { id: "2", account: "Beta Systems", mrrSavedMinor: 12900 },
        ],
        nextPriorityAccounts: [
            { id: "3", account: "Northwind", aiReason: "Onboarding incomplete", mrrMinor: 34900, riskScore: 61 },
        ],
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
                date: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
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
            {
                id: "3",
                accountId: "3",
                account: "Northwind",
                action: "Onboarding push",
                aiReason: "Setup remains incomplete",
                outcome: "failed",
                mrrSavedMinor: 34900,
                riskScore: 61,
                date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
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

    const [churnMonths, setChurnMonths] = useState<string[]>([]);
    const [churnPct, setChurnPct] = useState<number[]>([]);
    const [mrrNames, setMrrNames] = useState<string[]>([]);
    const [mrrVals, setMrrVals] = useState<number[]>([]);
    const [riskAccounts, setRiskAccounts] = useState<RiskAccount[]>([]);
    const [opportunityAccounts, setOpportunityAccounts] = useState<OpportunityAccount[]>([]);
    const [progressData, setProgressData] = useState<ProgressApiResponse | null>(null);
    const [customerMix, setCustomerMix] = useState<CustomerMix | null>(null);
    const [isPro, setIsPro] = useState(false);
    const [apiDemoMode, setApiDemoMode] = useState<boolean | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    const [kpiTotalMrrCurrent, setKpiTotalMrrCurrent] = useState<number | null>(null);
    const [kpiTotalMrrPrevious, setKpiTotalMrrPrevious] = useState<number | null>(null);
    const [kpiMrrAtRiskCurrent, setKpiMrrAtRiskCurrent] = useState<number | null>(null);
    const [kpiMrrAtRiskPrevious, setKpiMrrAtRiskPrevious] = useState<number | null>(null);
    const [kpiChurnProxyCurrent, setKpiChurnProxyCurrent] = useState<number | null>(null);
    const [kpiChurnProxyPrevious, setKpiChurnProxyPrevious] = useState<number | null>(null);
    const [kpiMrrProtectedCurrent, setKpiMrrProtectedCurrent] = useState<number | null>(null);
    const [kpiMrrProtectedPrevious, setKpiMrrProtectedPrevious] = useState<number | null>(null);

    const resetDashboardState = () => {
        setChurnMonths([]);
        setChurnPct([]);
        setMrrNames([]);
        setMrrVals([]);
        setRiskAccounts([]);
        setOpportunityAccounts([]);
        setProgressData(null);
        setCustomerMix(null);
        setIsPro(false);
        setApiDemoMode(null);
        setIsLoaded(false);
        setBilling({
            plan: "free",
            trialEndsAt: null,
        });

        setKpiTotalMrrCurrent(null);
        setKpiTotalMrrPrevious(null);
        setKpiMrrAtRiskCurrent(null);
        setKpiMrrAtRiskPrevious(null);
        setKpiChurnProxyCurrent(null);
        setKpiChurnProxyPrevious(null);
        setKpiMrrProtectedCurrent(null);
        setKpiMrrProtectedPrevious(null);
    };

    const isDemoMode = isLoaded && apiDemoMode === true;
    const isLiveOnlyMode = isLoaded && apiDemoMode === false;

    const hasLiveChurn = churnMonths.length > 0 && churnPct.length > 0;
    const hasLiveMrr = mrrNames.length > 0 && mrrVals.length > 0;
    const hasLiveRisk = riskAccounts.length > 0;
    const hasLiveCustomerMix = Boolean(customerMix);
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

    const activeChurnMonths = !isLoaded
        ? demoChurnMonths
        : isLiveOnlyMode
            ? churnMonths
            : hasLiveChurn
                ? churnMonths
                : demoChurnMonths;

    const activeChurnPct = !isLoaded
        ? demoChurnPct
        : isLiveOnlyMode
            ? churnPct
            : hasLiveChurn
                ? churnPct
                : demoChurnPct;

    const activeMrrMonths = !isLoaded
        ? demoMrrMonths
        : isLiveOnlyMode
            ? mrrNames
            : hasLiveMrr
                ? mrrNames
                : demoMrrMonths;

    const activeMrrVals = !isLoaded
        ? demoMrrVals
        : isLiveOnlyMode
            ? mrrVals
            : hasLiveMrr
                ? mrrVals
                : demoMrrVals;

    const activeRiskAccounts = !isLoaded
        ? demoRiskAccounts
        : isLiveOnlyMode
            ? riskAccounts
            : hasLiveRisk
                ? riskAccounts
                : demoRiskAccounts;

    const activeOpportunityAccounts = !isLoaded
        ? demoOpportunities
        : isLiveOnlyMode
            ? opportunityAccounts
            : hasLiveOpportunities
                ? opportunityAccounts
                : demoOpportunities;

    const activeProgressData = !isLoaded
        ? demoProgressData
        : isLiveOnlyMode
            ? progressData
            : hasLiveProgress
                ? progressData
                : demoProgressData;

    const activeCustomerMix = !isLoaded
        ? demoCustomerMix
        : isLiveOnlyMode
            ? customerMix
            : hasLiveCustomerMix
                ? customerMix
                : demoCustomerMix;

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
            lowerIsBetter?: boolean;
            isCurrency?: boolean;
            suffix?: string;
        }
    ) => {
        const isCurrency = options?.isCurrency ?? false;
        const suffix = options?.suffix ?? "";

        if (!previousValue && previousValue !== 0) {
            return "No previous month data";
        }

        if (delta === 0) {
            if (isCurrency) {
                return `No change vs ${formatGBP(previousValue)} last month`;
            }

            return `No change vs ${previousValue}${suffix} last month`;
        }

        if (isCurrency) {
            return `${Math.abs(pct).toFixed(1)}% vs ${formatGBP(previousValue)} last month`;
        }

        return `${Math.abs(pct).toFixed(1)}% vs ${previousValue}${suffix} last month`;
    };

    const getSuggestedAction = (account: RiskAccount) => {
        const reason = account.reason.toLowerCase();
        const tags = account.tags ?? [];

        if (tags.includes("billing") || reason.includes("payment failed") || reason.includes("billing")) {
            return "Send billing recovery";
        }
        if (tags.includes("onboarding") || reason.includes("onboarding")) {
            return "Complete onboarding";
        }
        if (tags.includes("support") || reason.includes("ticket") || reason.includes("sentiment")) {
            return "Manual check-in";
        }
        if (tags.includes("adoption") || reason.includes("feature adoption")) {
            return "Send re-engagement";
        }
        if (tags.includes("usage") || reason.includes("no login") || reason.includes("usage")) {
            return "Trigger usage nudge";
        }

        return "Review account";
    };

    const getRiskBadgeStyle = (risk: number) => {
        if (risk >= 80) {
            return {
                background: "#fef2f2",
                color: "#dc2626",
                border: "1px solid #fecaca",
            };
        }
        if (risk >= 70) {
            return {
                background: "#fff7ed",
                color: "#ea580c",
                border: "1px solid #fed7aa",
            };
        }

        return {
            background: "#fefce8",
            color: "#a16207",
            border: "1px solid #fde68a",
        };
    };

    const getTrendMeta = (delta: number, lowerIsBetter = true) => {
        const isUp = delta > 0;
        const isNeutral = delta === 0;
        const isGood = lowerIsBetter ? delta < 0 : delta > 0;

        return {
            arrow: isNeutral ? "•" : isUp ? "↑" : "↓",
            color: isNeutral ? "#6b7280" : isGood ? "#16a34a" : "#dc2626",
        };
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

    const getRiskSignalLabel = (account: RiskAccount) => {
        const reason = account.reason.toLowerCase();
        const tags = account.tags ?? [];

        if (
            tags.includes("billing") ||
            reason.includes("payment failed") ||
            reason.includes("billing") ||
            reason.includes("invoice")
        ) {
            return "Failed payment";
        }

        if (
            tags.includes("usage") ||
            reason.includes("no login") ||
            reason.includes("inactive") ||
            reason.includes("inactivity")
        ) {
            return "Low engagement";
        }

        if (
            tags.includes("adoption") ||
            reason.includes("feature adoption") ||
            reason.includes("adoption")
        ) {
            return "Low adoption";
        }

        if (tags.includes("onboarding") || reason.includes("onboarding")) {
            return "Onboarding incomplete";
        }

        return "Risk detected";
    };

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

    const totalMrrDeltaVsPrevious = totalMrrCurrent - totalMrrPrevious;
    const totalMrrDeltaPct = formatPercentChange(totalMrrCurrent, totalMrrPrevious);

    const mrrAtRiskDeltaVsPrevious = mrrAtRiskCurrent - mrrAtRiskPrevious;
    const mrrAtRiskDeltaPct = formatPercentChange(mrrAtRiskCurrent, mrrAtRiskPrevious);

    const churnDeltaVsPrevious = churnProxyCurrent - churnProxyPrevious;
    const churnDeltaPct = churnProxyPrevious
        ? Math.abs((churnDeltaVsPrevious / churnProxyPrevious) * 100)
        : 0;

    const protectedDeltaVsPrevious = totalProtected - previousProtected;
    const protectedDeltaPct = formatPercentChange(totalProtected, previousProtected);

    const totalMrrTrend = getTrendMeta(totalMrrDeltaVsPrevious, false);
    const atRiskTrend = getTrendMeta(mrrAtRiskDeltaVsPrevious, true);
    const churnTrendMeta = getTrendMeta(churnDeltaVsPrevious, true);
    const protectedTrend = getTrendMeta(protectedDeltaVsPrevious, false);

    const topRiskAccounts = [...activeRiskAccounts].sort((a, b) => b.risk - a.risk).slice(0, 3);

    const totalSubscribers = activeCustomerMix
        ? activeCustomerMix.active +
        activeCustomerMix.trial +
        activeCustomerMix.upgraded +
        activeCustomerMix.newSubscribers
        : 0;

    const businessHealthScore = useMemo(() => {
        let score = 100;

        score -= Math.min(churnProxyCurrent * 6, 30);

        const atRiskShare = totalMrrCurrent > 0 ? (mrrAtRiskCurrent / totalMrrCurrent) * 100 : 0;
        score -= Math.min(atRiskShare * 1.2, 35);

        if (protectedDeltaVsPrevious > 0) score += 8;
        else if (protectedDeltaVsPrevious < 0) score -= 6;

        const activeShare = totalSubscribers > 0 ? (activeCustomerMix?.active ?? 0) / totalSubscribers : 0;
        if (activeShare >= 0.65) score += 6;
        else if (activeShare < 0.45) score -= 6;

        const upgradedShare = totalSubscribers > 0 ? (activeCustomerMix?.upgraded ?? 0) / totalSubscribers : 0;
        if (upgradedShare >= 0.08) score += 4;

        const newSubscribersCount = activeCustomerMix?.newSubscribers ?? 0;
        if (newSubscribersCount > 0) score += 4;

        return Math.max(0, Math.min(100, Math.round(score)));
    }, [
        churnProxyCurrent,
        mrrAtRiskCurrent,
        totalMrrCurrent,
        protectedDeltaVsPrevious,
        totalSubscribers,
        activeCustomerMix,
    ]);

    const businessHealthLabel =
        businessHealthScore >= 80 ? "Healthy" : businessHealthScore >= 60 ? "Stable" : "Needs attention";

    const businessHealthTone =
        businessHealthScore >= 80
            ? { background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0" }
            : businessHealthScore >= 60
                ? { background: "#fffbeb", color: "#b45309", border: "1px solid #fde68a" }
                : { background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" };

    const churnImprovedValue =
        churnDeltaVsPrevious < 0
            ? `${Math.abs(churnDeltaVsPrevious).toFixed(1)} pts lower vs last month`
            : churnDeltaVsPrevious > 0
                ? `${Math.abs(churnDeltaVsPrevious).toFixed(1)} pts higher vs last month`
                : "No change vs last month";

    const businessHealthDrivers = [
        churnDeltaVsPrevious < 0
            ? `Churn improved — ${churnImprovedValue}`
            : churnDeltaVsPrevious > 0
                ? `Churn increased — ${churnImprovedValue}`
                : `Churn steady — ${churnImprovedValue}`,
        totalProtected > 0
            ? `${formatGBP(totalProtected)} protected this month`
            : "No protected revenue yet",
        `${(activeCustomerMix?.trial ?? 0).toLocaleString()} trial accounts`,
    ];

    const customerPieOption = useMemo<EChartsOption | null>(() => {
        if (!activeCustomerMix) return null;

        return {
            animation: false,
            tooltip: {
                trigger: "item",
                formatter: "{b}: {c} ({d}%)",
            },
            legend: {
                show: false,
            },
            series: [
                {
                    name: "Customer mix",
                    type: "pie",
                    radius: ["56%", "74%"],
                    center: ["50%", "50%"],
                    avoidLabelOverlap: true,
                    silent: true,
                    itemStyle: {
                        borderColor: "#ffffff",
                        borderWidth: 2,
                    },
                    label: { show: false },
                    emphasis: {
                        scale: false,
                        label: { show: false },
                    },
                    data: [
                        { value: activeCustomerMix.active, name: "Active", itemStyle: { color: "#3b82f6" } },
                        { value: activeCustomerMix.trial, name: "Trial", itemStyle: { color: "#06b6d4" } },
                        { value: activeCustomerMix.upgraded, name: "Upgraded", itemStyle: { color: "#8b5cf6" } },
                        {
                            value: activeCustomerMix.newSubscribers,
                            name: "New subscribers",
                            itemStyle: { color: "#fbbf24" },
                        },
                    ],
                },
            ],
        };
    }, [activeCustomerMix]);

    const kpis = [
        {
            label: "Total MRR",
            value: formatGBP(totalMrrCurrent),
            subtext: formatKpiSubtext(totalMrrDeltaVsPrevious, totalMrrDeltaPct, totalMrrPrevious, {
                isCurrency: true,
                lowerIsBetter: false,
            }),
            trend: totalMrrTrend,
            valueColor: "#111827",
        },
        {
            label: "MRR at risk",
            value: formatGBP(mrrAtRiskCurrent),
            subtext: formatKpiSubtext(mrrAtRiskDeltaVsPrevious, mrrAtRiskDeltaPct, mrrAtRiskPrevious, {
                isCurrency: true,
                lowerIsBetter: true,
            }),
            trend: atRiskTrend,
            valueColor: "#111827",
        },
        {
            label: "Churn proxy",
            value: `${churnProxyCurrent.toFixed(1)}%`,
            subtext: `${Math.abs(churnDeltaPct).toFixed(1)}% vs last month`,
            trend: churnTrendMeta,
            valueColor: "#111827",
        },
        {
            label: "MRR protected",
            value: formatGBP(totalProtected),
            subtext: formatKpiSubtext(protectedDeltaVsPrevious, protectedDeltaPct, previousProtected, {
                isCurrency: true,
                lowerIsBetter: false,
            }),
            trend: protectedTrend,
            valueColor: "#111827",
        },
    ];

    const insightFeed = useMemo<InsightFeedItem[]>(() => {
        const progressItems: InsightFeedItem[] = (activeProgressData?.progressBreakdown ?? [])
            .filter((row) => isCurrentMonth(row.date))
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 2)
            .map((row) => {
                const amountTone =
                    row.outcome === "success" ? "opportunity" : row.outcome === "failed" ? "risk" : "neutral";

                const amountLabel =
                    row.mrrSavedMinor > 0
                        ? row.outcome === "failed"
                            ? `-${formatGBPFromMinor(row.mrrSavedMinor)}`
                            : `+${formatGBPFromMinor(row.mrrSavedMinor)}`
                        : undefined;

                const summary =
                    row.outcome === "success"
                        ? `${row.action} succeeded for ${row.account}. ${row.aiReason}`
                        : row.outcome === "pending"
                            ? `${row.action} is in progress for ${row.account}. ${row.aiReason}`
                            : `${row.action} failed for ${row.account}. ${row.aiReason}`;

                const targetId = row.accountId || row.customerId;

                return {
                    id: `progress-${row.id}`,
                    type: "progress",
                    title: `Progress update — ${row.account}`,
                    summary,
                    meta: `Action Impact • ${formatCompactDate(row.date)}`,
                    amountLabel,
                    amountTone,
                    href: targetId ? `/dashboard/accounts-at-risk/${targetId}` : undefined,
                    sortTime: new Date(row.date).getTime(),
                };
            });

        const riskItems: InsightFeedItem[] = activeRiskAccounts
            .filter((account) => isCurrentMonth(account.updatedAt))
            .sort((a, b) => {
                const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
                return bTime - aTime;
            })
            .slice(0, 2)
            .map((account) => ({
                id: `risk-${account.id}`,
                type: "risk" as const,
                title: `${account.company} — ${getRiskSignalLabel(account)}`,
                summary: account.reason,
                meta: formatRecentDate(account.updatedAt),
                amountLabel: formatGBP(account.mrr),
                amountTone: "risk" as const,
                href: `/dashboard/accounts-at-risk/${account.id}`,
                sortTime: account.updatedAt ? new Date(account.updatedAt).getTime() : 0,
            }));

        const opportunityItems: InsightFeedItem[] = activeOpportunityAccounts
            .filter((account) => isCurrentMonth(account.updatedAt))
            .sort((a, b) => {
                const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
                return bTime - aTime;
            })
            .slice(0, 2)
            .map((account) => ({
                id: `opp-${account.id}`,
                type: "opportunity" as const,
                title: `${account.company} — Opportunity`,
                summary: account.signal,
                meta: formatRecentDate(account.updatedAt),
                amountLabel: `+${formatGBP(account.upside)}`,
                amountTone: "opportunity" as const,
                href: `/dashboard/accounts-at-risk/${account.id}`,
                sortTime: account.updatedAt ? new Date(account.updatedAt).getTime() : 0,
            }));

        return [...progressItems, ...riskItems, ...opportunityItems]
            .sort((a, b) => b.sortTime - a.sortTime)
            .slice(0, isPro ? 999 : 5);
    }, [activeOpportunityAccounts, activeProgressData, activeRiskAccounts, isPro]);

    const hasConnectedIntegrations = (progressData?.connectedIntegrations?.length ?? 0) > 0;
    const hasAnyInsightData =
        activeRiskAccounts.length > 0 ||
        activeOpportunityAccounts.length > 0 ||
        (activeProgressData?.progressBreakdown?.length ?? 0) > 0;

    function renderInsightCards() {
        return (
            <div className={styles.insightsList}>
                {insightFeed.length > 0 ? (
                    insightFeed.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                                if (!item.href) return;

                                const href = item.href.trim();

                                if (!href || href === "undefined" || href === "null") return;

                                router.push(href);
                            }}
                            style={{
                                width: "100%",
                                textAlign: "left",
                                border: "1px solid #eef2f7",
                                background: "#fff",
                                borderRadius: 14,
                                padding: "12px 14px",
                                cursor: item.href ? "pointer" : "default",
                                transition: "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",
                                boxShadow: "0 0 0 rgba(0,0,0,0)",
                            }}
                            onMouseEnter={(e) => {
                                if (!item.href) return;
                                e.currentTarget.style.transform = "translateY(-1px)";
                                e.currentTarget.style.boxShadow = "0 8px 20px rgba(15,23,42,0.06)";
                                e.currentTarget.style.borderColor = "#dbe4ee";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = "translateY(0)";
                                e.currentTarget.style.boxShadow = "0 0 0 rgba(0,0,0,0)";
                                e.currentTarget.style.borderColor = "#eef2f7";
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "flex-start",
                                    gap: 12,
                                }}
                            >
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <div
                                        style={{
                                            fontSize: 13,
                                            fontWeight: 700,
                                            color: "#111827",
                                            lineHeight: 1.4,
                                        }}
                                    >
                                        {item.title}
                                    </div>

                                    <div
                                        style={{
                                            marginTop: 4,
                                            fontSize: 12,
                                            color: "#4b5563",
                                            lineHeight: 1.45,
                                        }}
                                    >
                                        {item.summary}
                                    </div>

                                    {item.meta ? (
                                        <div
                                            style={{
                                                marginTop: 5,
                                                fontSize: 11,
                                                fontWeight: 600,
                                                color: "#6b7280",
                                            }}
                                        >
                                            {item.meta}
                                        </div>
                                    ) : null}
                                </div>

                                {item.amountLabel ? (
                                    <div
                                        style={{
                                            flexShrink: 0,
                                            fontSize: 13,
                                            fontWeight: 800,
                                            color:
                                                item.amountTone === "risk"
                                                    ? "#dc2626"
                                                    : item.amountTone === "opportunity"
                                                        ? "#16a34a"
                                                        : "#111827",
                                        }}
                                    >
                                        {item.amountLabel}
                                    </div>
                                ) : null}
                            </div>
                        </button>
                    ))
                ) : (
                    <div style={{ fontSize: 14, color: "#6b7280", paddingTop: 8 }}>
                        No recent insight activity yet.
                    </div>
                )}
            </div>
        );
    }

    function renderAiInsightsContent() {
        if (!isLoaded) {
            return (
                <div style={{ fontSize: 14, color: "#6b7280", paddingTop: 8 }}>
                    Analyzing your customer data...
                </div>
            );
        }

        if (apiDemoMode === true) {
            return renderInsightCards();
        }

        if (apiDemoMode === false && !hasConnectedIntegrations) {
            return (
                <div
                    style={{
                        border: "1px dashed #dbe4ee",
                        borderRadius: 14,
                        padding: 16,
                        background: "#fcfcfd",
                    }}
                >
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>
                        Connect a data source to unlock AI insights
                    </div>
                    <div style={{ marginTop: 6, fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>
                        Connect Stripe, HubSpot, or another source so Cobrai can analyze churn risk,
                        billing issues, usage changes, and retention opportunities.
                    </div>
                </div>
            );
        }

        if (apiDemoMode === false && hasConnectedIntegrations && !hasAnyInsightData) {
            return (
                <div
                    style={{
                        border: "1px dashed #dbe4ee",
                        borderRadius: 14,
                        padding: 16,
                        background: "#fcfcfd",
                    }}
                >
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>
                        AI insights are getting ready
                    </div>
                    <div style={{ marginTop: 6, fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>
                        Your integrations are connected. Once more customer activity, billing, and risk data
                        sync in, Cobrai will start generating account-level AI insights here.
                    </div>
                </div>
            );
        }

        return renderInsightCards();
    }

    useEffect(() => {
        let cancelled = false;

        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                resetDashboardState();
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

                const resolvedDemoMode = typeof data?.demoMode === "boolean" ? data.demoMode : true;
                setApiDemoMode(resolvedDemoMode);

                if (Array.isArray(data?.churnTrend?.months) && Array.isArray(data?.churnTrend?.values)) {
                    setChurnMonths(data.churnTrend.months);
                    setChurnPct(data.churnTrend.values.map((v: unknown) => Number(v ?? 0)));
                } else {
                    setChurnMonths([]);
                    setChurnPct([]);
                }

                if (Array.isArray(data?.mrrProtectedChart?.months) && Array.isArray(data?.mrrProtectedChart?.values)) {
                    setMrrNames(data.mrrProtectedChart.months);
                    setMrrVals(data.mrrProtectedChart.values.map((v: unknown) => Number(v ?? 0)));
                } else {
                    setMrrNames([]);
                    setMrrVals([]);
                }

                setKpiTotalMrrCurrent(
                    typeof data?.totalMrrTrend?.current === "number" ? data.totalMrrTrend.current : null
                );
                setKpiTotalMrrPrevious(
                    typeof data?.totalMrrTrend?.previous === "number" ? data.totalMrrTrend.previous : null
                );

                setKpiMrrAtRiskCurrent(
                    typeof data?.mrrAtRiskTrend?.current === "number" ? data.mrrAtRiskTrend.current : null
                );
                setKpiMrrAtRiskPrevious(
                    typeof data?.mrrAtRiskTrend?.previous === "number" ? data.mrrAtRiskTrend.previous : null
                );

                setKpiChurnProxyCurrent(
                    typeof data?.churnProxyTrend?.current === "number" ? data.churnProxyTrend.current : null
                );
                setKpiChurnProxyPrevious(
                    typeof data?.churnProxyTrend?.previous === "number" ? data.churnProxyTrend.previous : null
                );

                setKpiMrrProtectedCurrent(
                    typeof data?.mrrProtected?.current === "number" ? data.mrrProtected.current : null
                );
                setKpiMrrProtectedPrevious(
                    typeof data?.mrrProtected?.previous === "number" ? data.mrrProtected.previous : null
                );

                if (Array.isArray(data?.riskAccounts)) {
                    setRiskAccounts(
                        data.riskAccounts.map((a: any) => ({
                            id: String(a.id ?? ""),
                            company: String(a.company ?? "Unknown account"),
                            email: a.email ?? "",
                            reason: String(a.reason ?? "Risk detected"),
                            risk: Number(a.risk ?? 0),
                            mrr: Number(a.mrr ?? 0),
                            tags: Array.isArray(a.tags) ? a.tags : [],
                            updatedAt: a.updatedAt ?? "",
                        }))
                    );
                } else {
                    setRiskAccounts([]);
                }

                if (Array.isArray(data?.opportunities)) {
                    setOpportunityAccounts(
                        data.opportunities.map((a: any) => ({
                            id: String(a.id ?? ""),
                            company: String(a.company ?? "Unknown account"),
                            email: a.email ?? "",
                            signal: a.signal ?? "Growth signal",
                            upside: Number(a.upside ?? 0),
                            updatedAt: a.updatedAt ?? "",
                        }))
                    );
                } else {
                    setOpportunityAccounts([]);
                }

                if (data?.customerMix && typeof data.customerMix === "object") {
                    setCustomerMix({
                        active: Number(data.customerMix.active ?? 0),
                        trial: Number(data.customerMix.trial ?? 0),
                        upgraded: Number(data.customerMix.upgraded ?? 0),
                        newSubscribers: Number(data.customerMix.newSubscribers ?? 0),
                    });
                } else {
                    setCustomerMix(null);
                }

                setIsPro(data?.tier === "pro" || data?.tier === "scale");

                try {
                    const progressRes = await fetch("/api/progress", {
                        method: "GET",
                        cache: "no-store",
                        headers: { Authorization: `Bearer ${token}` },
                    });

                    if (!progressRes.ok) {
                        setProgressData(null);
                    } else {
                        const progressJson = await progressRes.json();

                        const normalizedProgress: ProgressApiResponse = {
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
                                ? progressJson.recentMrrSaved.map((item: any) => ({
                                    id: String(item?.id ?? ""),
                                    account: String(item?.account ?? ""),
                                    mrrSavedMinor: Number(item?.mrrSavedMinor ?? 0),
                                }))
                                : [],
                            nextPriorityAccounts: Array.isArray(progressJson?.nextPriorityAccounts)
                                ? progressJson.nextPriorityAccounts.map((item: any) => ({
                                    id: String(item?.id ?? ""),
                                    account: String(item?.account ?? ""),
                                    aiReason: String(item?.aiReason ?? ""),
                                    mrrMinor: Number(item?.mrrMinor ?? 0),
                                    riskScore: Number(item?.riskScore ?? 0),
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
                            actionPerformance: Array.isArray(progressJson?.actionPerformance)
                                ? progressJson.actionPerformance.map((row: any) => ({
                                    id: String(row?.id ?? ""),
                                    action: String(row?.action ?? ""),
                                    executions: Number(row?.executions ?? 0),
                                    mrrSavedMinor: Number(row?.mrrSavedMinor ?? 0),
                                    avgRiskDecreasePct: Number(row?.avgRiskDecreasePct ?? 0),
                                }))
                                : [],
                        };

                        if (!cancelled) {
                            setProgressData(normalizedProgress);
                        }
                    }
                } catch {
                    if (!cancelled) {
                        setProgressData(null);
                    }
                }

                if (!cancelled) {
                    await loadBilling();
                    setIsLoaded(true);
                }
            } catch (err) {
                console.error("Failed to load dashboard summary", err);

                if (!cancelled) {
                    setChurnMonths([]);
                    setChurnPct([]);
                    setMrrNames([]);
                    setMrrVals([]);
                    setRiskAccounts([]);
                    setOpportunityAccounts([]);
                    setCustomerMix(null);
                    setProgressData(null);
                    setApiDemoMode(true);
                    setBilling({
                        plan: "free",
                        trialEndsAt: null,
                    });
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
        !hasLiveCustomerMix &&
        !hasLiveOpportunities &&
        !hasLiveProgress &&
        !hasLiveKpis;

    return (
        <div className={styles.page}>
            <div className={styles.content}>
                <div className={styles.header}>
                    <div>
                        <h1 className={styles.title}>Dashboard</h1>
                        <p className={styles.subtitle}>
                            Retention intelligence — clear actions that protect revenue.
                        </p>
                    </div>
                </div>

                <TrialBanner plan={billing.plan} trialEndsAt={billing.trialEndsAt} />

                {showLiveEmptyState && (
                    <div className={styles.card} style={{ marginBottom: 16, padding: 18 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
                            No live dashboard data yet
                        </div>
                        <div style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>
                            Your workspace is in live mode, so demo data is hidden. Connect data
                            sources and complete the first sync to populate charts, risks, insights, and customer mix.
                        </div>
                    </div>
                )}

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                        gap: 16,
                        marginBottom: 16,
                    }}
                >
                    {kpis.map((kpi) => (
                        <div key={kpi.label} className={styles.card} style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>
                                {kpi.label}
                            </div>

                            <div
                                style={{
                                    marginTop: 8,
                                    fontSize: 19,
                                    lineHeight: 1.1,
                                    fontWeight: 800,
                                    color: kpi.valueColor,
                                }}
                            >
                                {kpi.value}
                            </div>

                            <div
                                style={{
                                    marginTop: 6,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    fontSize: 12,
                                    color: "#6b7280",
                                    flexWrap: "wrap",
                                }}
                            >
                                <span
                                    style={{
                                        color: kpi.trend.color,
                                        fontWeight: 700,
                                        fontSize: 12,
                                    }}
                                >
                                    {kpi.trend.arrow}
                                </span>
                                <span>{kpi.subtext}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className={styles.midGrid}>
                    <div className={styles.card}>
                        <div
                            className={styles.cardHeader}
                            style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}
                        >
                            <div>
                                <h4>Churn Trend</h4>
                                <div
                                    style={{
                                        marginTop: 8,
                                        fontSize: 13,
                                        lineHeight: 1.5,
                                        color: "#6b7280",
                                    }}
                                >
                                    Monthly churn rate over time.
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => router.push("/dashboard/analytics")}
                                style={{
                                    border: "1px solid #e5e7eb",
                                    background: "#fff",
                                    borderRadius: 8,
                                    padding: "6px 10px",
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: "#000000",
                                    cursor: "pointer",
                                    flexShrink: 0,
                                }}
                            >
                                View full churn trend
                            </button>
                        </div>

                        <div className={styles.chartPreview}>
                            {activeChurnMonths.length > 0 && activeChurnPct.length > 0 ? (
                                <EChart option={churnTrendOption(activeChurnMonths, activeChurnPct, isPro)} />
                            ) : (
                                <div style={{ fontSize: 14, color: "#6b7280", padding: 16 }}>
                                    No churn data yet.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={styles.card}>
                        <div
                            className={styles.cardHeader}
                            style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}
                        >
                            <div>
                                <h4>MRR Protected</h4>
                                <div
                                    style={{
                                        marginTop: 8,
                                        fontSize: 13,
                                        lineHeight: 1.5,
                                        color: "#6b7280",
                                    }}
                                >
                                    Revenue protected across recent retention activity.
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => router.push("/dashboard/analytics")}
                                style={{
                                    border: "1px solid #e5e7eb",
                                    background: "#fff",
                                    borderRadius: 8,
                                    padding: "6px 10px",
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: "#000000",
                                    cursor: "pointer",
                                    flexShrink: 0,
                                }}
                            >
                                View full MRR chart
                            </button>
                        </div>

                        <div className={styles.chartPreview}>
                            {activeMrrMonths.length > 0 && activeMrrVals.length > 0 ? (
                                <EChart option={mrrProtectedOption(activeMrrMonths, activeMrrVals, isPro)} />
                            ) : (
                                <div style={{ fontSize: 14, color: "#6b7280", padding: 16 }}>
                                    No MRR data yet.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1.28fr) minmax(340px, 0.72fr)",
                        gap: 16,
                        alignItems: "start",
                    }}
                >
                    <div style={{ display: "grid", gap: 16 }}>
                        <div className={styles.card}>
                            <div
                                className={styles.cardTop}
                                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                            >
                                <div>
                                    <h4>Accounts at Risk</h4>
                                    <div style={{ marginTop: 6, fontSize: 13, color: "#6b7280" }}>
                                        Top {Math.min(topRiskAccounts.length, 3)} accounts by revenue risk, reason, and suggested next action.
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => router.push("/dashboard/accounts-at-risk")}
                                    style={{
                                        border: "1px solid #e5e7eb",
                                        background: "#fff",
                                        borderRadius: 8,
                                        padding: "6px 10px",
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: "#000000",
                                        cursor: "pointer",
                                        flexShrink: 0,
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
                                            style={{
                                                width: "100%",
                                                textAlign: "left",
                                                alignItems: "stretch",
                                                gap: 14,
                                                paddingTop: 14,
                                                paddingBottom: 14,
                                                border: "none",
                                                background: "#fff",
                                                cursor: "pointer",
                                                borderRadius: 14,
                                                transition: "transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease",
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.transform = "translateY(-1px)";
                                                e.currentTarget.style.boxShadow = "0 8px 20px rgba(15,23,42,0.06)";
                                                e.currentTarget.style.background = "#fcfcfd";
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.transform = "translateY(0)";
                                                e.currentTarget.style.boxShadow = "none";
                                                e.currentTarget.style.background = "#fff";
                                            }}
                                        >
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "space-between",
                                                        gap: 12,
                                                        marginBottom: 8,
                                                    }}
                                                >
                                                    <strong style={{ color: "#111827" }}>{a.company}</strong>

                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: 8,
                                                            flexShrink: 0,
                                                        }}
                                                    >
                                                        <span className={styles.badge} style={getRiskBadgeStyle(a.risk)}>
                                                            {a.risk}
                                                        </span>

                                                        <span
                                                            className={styles.mrr}
                                                            style={{
                                                                fontWeight: 800,
                                                                color: "#dc2626",
                                                            }}
                                                        >
                                                            {formatGBP(a.mrr)}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div style={{ display: "grid", gap: 8 }}>
                                                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                                                        <span style={{ fontWeight: 600, color: "#111827" }}>Reason:</span>{" "}
                                                        {a.reason}
                                                    </div>

                                                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                                                        <span style={{ fontWeight: 600, color: "#111827" }}>Suggested action:</span>{" "}
                                                        {getSuggestedAction(a)}
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    ))
                                ) : (
                                    <div style={{ fontSize: 14, color: "#6b7280", paddingTop: 8 }}>
                                        No at-risk accounts yet.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className={styles.card} style={{ minHeight: 0 }}>
                            <div
                                className={styles.cardTop}
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "flex-start",
                                    gap: 16,
                                }}
                            >
                                <div>
                                    <h4>Customer Health Overview</h4>
                                    <div style={{ marginTop: 6, fontSize: 13, color: "#6b7280" }}>
                                        Customer mix, subscriber growth, and overall business health in one view.
                                    </div>
                                </div>

                                <div style={{ textAlign: "right", flexShrink: 0 }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>
                                        Total subscribers
                                    </div>
                                    <div style={{ marginTop: 4, fontSize: 22, fontWeight: 800, color: "#111827" }}>
                                        {totalSubscribers.toLocaleString()}
                                    </div>
                                </div>
                            </div>

                            {customerPieOption ? (
                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "160px 190px minmax(250px, 1fr)",
                                        gap: 16,
                                        alignItems: "start",
                                        marginTop: 16,
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "center",
                                            gap: 10,
                                            paddingTop: 4,
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: 146,
                                                height: 146,
                                                flexShrink: 0,
                                            }}
                                        >
                                            <EChart option={customerPieOption} />
                                        </div>

                                        <div
                                            style={{
                                                display: "grid",
                                                gap: 6,
                                                width: "100%",
                                                maxWidth: 140,
                                            }}
                                        >
                                            {[
                                                { label: "Active", color: "#3b82f6" },
                                                { label: "Trial", color: "#06b6d4" },
                                                { label: "Upgraded", color: "#8b5cf6" },
                                                { label: "New subscribers", color: "#fbbf24" },
                                            ].map((item) => (
                                                <div
                                                    key={item.label}
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 8,
                                                        fontSize: 11.5,
                                                        color: "#6b7280",
                                                        lineHeight: 1.3,
                                                    }}
                                                >
                                                    <span
                                                        style={{
                                                            width: 8,
                                                            height: 8,
                                                            borderRadius: 999,
                                                            background: item.color,
                                                            flexShrink: 0,
                                                        }}
                                                    />
                                                    <span>{item.label}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div
                                        style={{
                                            display: "grid",
                                            gap: 8,
                                            alignSelf: "center",
                                        }}
                                    >
                                        {[
                                            { label: "Active", value: activeCustomerMix?.active ?? 0 },
                                            { label: "Trial", value: activeCustomerMix?.trial ?? 0 },
                                            { label: "Upgraded", value: activeCustomerMix?.upgraded ?? 0 },
                                            { label: "New subscribers", value: activeCustomerMix?.newSubscribers ?? 0 },
                                        ].map((item) => (
                                            <div
                                                key={item.label}
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    alignItems: "center",
                                                    border: "1px solid #eef2f7",
                                                    borderRadius: 10,
                                                    padding: "10px 12px",
                                                    background: "#fff",
                                                    minHeight: 44,
                                                }}
                                            >
                                                <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
                                                    {item.label}
                                                </span>
                                                <span style={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>
                                                    {item.value.toLocaleString()}
                                                </span>
                                            </div>
                                        ))}
                                    </div>

                                    <div
                                        style={{
                                            border: "1px solid #eef2f7",
                                            borderRadius: 14,
                                            padding: 16,
                                            background: "#fcfcfd",
                                            minWidth: 0,
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center",
                                                gap: 10,
                                            }}
                                        >
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>
                                                    Business Health Score
                                                </div>
                                                <div
                                                    style={{
                                                        marginTop: 4,
                                                        fontSize: 12,
                                                        color: "#6b7280",
                                                        lineHeight: 1.5,
                                                    }}
                                                >
                                                    Churn, recovery, risk, and subscriber mix.
                                                </div>
                                            </div>

                                            <span
                                                style={{
                                                    ...businessHealthTone,
                                                    borderRadius: 999,
                                                    padding: "5px 9px",
                                                    fontSize: 11,
                                                    fontWeight: 700,
                                                    flexShrink: 0,
                                                }}
                                            >
                                                {businessHealthLabel}
                                            </span>
                                        </div>

                                        <div
                                            style={{
                                                marginTop: 16,
                                                display: "flex",
                                                alignItems: "baseline",
                                                gap: 6,
                                            }}
                                        >
                                            <div style={{ fontSize: 36, lineHeight: 1, fontWeight: 800, color: "#111827" }}>
                                                {businessHealthScore}
                                            </div>
                                            <div style={{ fontSize: 14, fontWeight: 700, color: "#6b7280" }}>
                                                / 100
                                            </div>
                                        </div>

                                        <div
                                            style={{
                                                marginTop: 10,
                                                fontSize: 12,
                                                color: "#4b5563",
                                                lineHeight: 1.55,
                                            }}
                                        >
                                            {businessHealthScore >= 80
                                                ? "Strong overall retention health."
                                                : businessHealthScore >= 60
                                                    ? "Stable overall health."
                                                    : "Overall health needs attention."}
                                        </div>

                                        <div
                                            style={{
                                                marginTop: 14,
                                                display: "grid",
                                                gap: 8,
                                            }}
                                        >
                                            {businessHealthDrivers.slice(0, 3).map((driver) => {
                                                const isPositive =
                                                    driver.includes("improved") || driver.includes("protected");

                                                const isNeutral = driver.includes("steady");

                                                return (
                                                    <div
                                                        key={driver}
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "space-between",
                                                            gap: 10,
                                                            padding: "10px 12px",
                                                            borderRadius: 10,
                                                            background: "#fff",
                                                            border: "1px solid #eef2f7",
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                display: "flex",
                                                                alignItems: "center",
                                                                gap: 8,
                                                                minWidth: 0,
                                                            }}
                                                        >
                                                            <span
                                                                style={{
                                                                    width: 7,
                                                                    height: 7,
                                                                    borderRadius: "50%",
                                                                    background: isPositive
                                                                        ? "#16a34a"
                                                                        : isNeutral
                                                                            ? "#9ca3af"
                                                                            : "#dc2626",
                                                                    flexShrink: 0,
                                                                }}
                                                            />
                                                            <span
                                                                style={{
                                                                    fontSize: 11.5,
                                                                    fontWeight: 600,
                                                                    color: "#374151",
                                                                    lineHeight: 1.4,
                                                                }}
                                                            >
                                                                {driver}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ fontSize: 14, color: "#6b7280", paddingTop: 12 }}>
                                    No customer mix data yet.
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: "grid", gap: 16 }}>
                        <div className={styles.card}>
                            <div
                                className={styles.cardTop}
                                style={{
                                    marginBottom: 14,
                                }}
                            >
                                <div style={{ minWidth: 0 }}>
                                    <h4
                                        style={{
                                            margin: 0,
                                            fontSize: 15,
                                            fontWeight: 800,
                                            lineHeight: 1.2,
                                            color: "#111827",
                                        }}
                                    >
                                        AI Insights
                                    </h4>

                                    {isPro ? (
                                        <div
                                            style={{
                                                marginTop: 8,
                                                fontSize: 14,
                                                fontWeight: 600,
                                                lineHeight: 1.45,
                                                color: "#4b5563",
                                            }}
                                        >
                                            Live insights across account risk, actions, and revenue impact.
                                        </div>
                                    ) : (
                                        <div
                                            style={{
                                                marginTop: 8,
                                                fontSize: 14,
                                                lineHeight: 1.5,
                                            }}
                                        >
                                            <span
                                                style={{
                                                    fontWeight: 600,
                                                    color: "#4b5563",
                                                }}
                                            >
                                                Live insights across account risk, actions, and revenue impact.
                                            </span>{" "}
                                            <span
                                                style={{
                                                    color: "#9ca3af",
                                                    fontWeight: 500,
                                                }}
                                            >
                                                Upgrade to Pro for unlimited AI insights.
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {renderAiInsightsContent()}
                        </div>
                    </div>
                </div>
            </div>

            {upgradeOpen && (
                <>
                    <div
                        onClick={() => setUpgradeOpen(false)}
                        style={{
                            position: "fixed",
                            inset: 0,
                            background: "rgba(15, 23, 42, 0.28)",
                            zIndex: 70,
                        }}
                    />

                    <div
                        style={{
                            position: "fixed",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                            width: 420,
                            maxWidth: "92vw",
                            background: "#fff",
                            border: "1px solid #e5e7eb",
                            borderRadius: 18,
                            boxShadow: "0 20px 50px rgba(0,0,0,0.12)",
                            zIndex: 80,
                            padding: 24,
                        }}
                    >
                        <div style={{ fontSize: 22, fontWeight: 700, color: "#111827", marginBottom: 8 }}>
                            Upgrade to Pro
                        </div>

                        <div style={{ fontSize: 14, lineHeight: 1.6, color: "#4b5563", marginBottom: 18 }}>
                            Viewing deeper insight drivers is available on Pro. Upgrade to unlock account-level
                            drivers, deeper attribution, and priority actions.
                        </div>

                        <div
                            style={{
                                display: "flex",
                                gap: 10,
                                justifyContent: "flex-end",
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => setUpgradeOpen(false)}
                                style={{
                                    border: "1px solid #e5e7eb",
                                    background: "#fff",
                                    borderRadius: 10,
                                    padding: "10px 14px",
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                }}
                            >
                                Not now
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setUpgradeOpen(false);
                                    router.push("/dashboard/settings");
                                }}
                                style={{
                                    border: "1px solid #111827",
                                    background: "#111827",
                                    color: "#fff",
                                    borderRadius: 10,
                                    padding: "10px 14px",
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                }}
                            >
                                Upgrade to Pro
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}