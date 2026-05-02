"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./risk.module.css";
import { getFirebaseAuth } from "@/lib/firebase.client";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import type { PlanTier } from "@/lib/permissions";
import type { ActionFirstRecommendation, Insight } from "@/lib/ai/types";

type RiskLevel = "critical" | "high" | "medium" | "low";

type RiskRow = {
    id: string;
    customerId?: string | null;
    companyName: string;
    email?: string;
    riskScore: number;
    riskLevel: RiskLevel;
    reasonLabel: string;
    riskTrend?: "up" | "down" | "flat";
    riskDelta?: number;
    mrr: number;
    nextAction?: string;
    lastActiveAt?: string;
};

type AiWorkspaceRes = {
    insights: Insight[];
    actions: ActionFirstRecommendation[];
    cached: boolean;
    source: "ai" | "fallback" | "cache" | "fallback_after_error";
    timeframe: string;
    promptVersion: string;
};

type Summary = {
    mrrAtRisk: number;
    accountsAtRisk: number;
    totalCustomers: number;
    totalCustomersDelta: number;
    riskScore: number;
    mrrAtRiskDeltaPct?: number;
    churnProbabilityDeltaPct?: number;
};

type ApiResponse = {
    ok: boolean;
    mode?: "live" | "empty";
    hasLiveData?: boolean;
    rows: RiskRow[];
    total: number;
    criticalTotal?: number;
    page: number;
    pageSize: number;
    summary: Summary;
};

type DashboardSummaryResponse = {
    ok?: boolean;
    tier?: PlanTier;
    trialEndsAt?: string | null;
};

const PAGE_SIZE = 10;

const DEMO_ROWS: RiskRow[] = [
    {
        id: "demo-cedarworks",
        customerId: null,
        companyName: "CedarWorks",
        email: "support@cedarworks.io",
        riskScore: 91,
        riskLevel: "critical",
        reasonLabel: "Billing issue",
        mrr: 21900,
        nextAction: "Confirm billing contact and resolve payment today.",
        lastActiveAt: "2026-04-12T10:00:00.000Z",
    },
    {
        id: "demo-kite-labs",
        customerId: null,
        companyName: "Kite Labs",
        email: "finance@kitelabs.io",
        riskScore: 87,
        riskLevel: "critical",
        reasonLabel: "No activity in 25 days",
        mrr: 12900,
        nextAction: "Send a personal check-in and offer a quick walkthrough.",
        lastActiveAt: "2026-04-04T09:00:00.000Z",
    },
    {
        id: "demo-nova-pay",
        customerId: null,
        companyName: "NovaPay",
        email: "ops@novapay.io",
        riskScore: 76,
        riskLevel: "high",
        reasonLabel: "Usage dropped",
        mrr: 8400,
        nextAction: "Send a value recap and suggest a success call.",
        lastActiveAt: "2026-04-18T13:00:00.000Z",
    },
    {
        id: "demo-brightdesk",
        customerId: null,
        companyName: "BrightDesk",
        email: "hello@brightdesk.co",
        riskScore: 69,
        riskLevel: "medium",
        reasonLabel: "Reduced product activity",
        mrr: 7200,
        nextAction: "Highlight unused features and offer setup support.",
        lastActiveAt: "2026-04-20T16:00:00.000Z",
    },
    {
        id: "demo-orbit-crm",
        customerId: null,
        companyName: "Orbit CRM",
        email: "team@orbitcrm.com",
        riskScore: 63,
        riskLevel: "medium",
        reasonLabel: "Support issue unresolved",
        mrr: 6600,
        nextAction: "Follow up on the open support request.",
        lastActiveAt: "2026-04-21T11:00:00.000Z",
    },
    {
        id: "demo-flowbyte",
        customerId: null,
        companyName: "Flowbyte",
        email: "billing@flowbyte.io",
        riskScore: 58,
        riskLevel: "medium",
        reasonLabel: "Payment method needs attention",
        mrr: 5100,
        nextAction: "Ask customer to update payment details.",
        lastActiveAt: "2026-04-22T15:00:00.000Z",
    },
    {
        id: "demo-cloudora",
        customerId: null,
        companyName: "Cloudora",
        email: "success@cloudora.ai",
        riskScore: 48,
        riskLevel: "low",
        reasonLabel: "Slight decline in weekly usage",
        mrr: 4700,
        nextAction: "Send product tips to increase engagement.",
        lastActiveAt: "2026-04-25T10:00:00.000Z",
    },
    {
        id: "demo-signalstack",
        customerId: null,
        companyName: "SignalStack",
        email: "admin@signalstack.io",
        riskScore: 44,
        riskLevel: "low",
        reasonLabel: "Limited team adoption",
        mrr: 3900,
        nextAction: "Recommend inviting more users.",
        lastActiveAt: "2026-04-26T12:00:00.000Z",
    },
    {
        id: "demo-paypilot",
        customerId: null,
        companyName: "PayPilot",
        email: "accounts@paypilot.co",
        riskScore: 39,
        riskLevel: "low",
        reasonLabel: "Light engagement",
        mrr: 3200,
        nextAction: "Send monthly value summary.",
        lastActiveAt: "2026-04-27T09:00:00.000Z",
    },
    {
        id: "demo-retainly",
        customerId: null,
        companyName: "Retainly",
        email: "team@retainly.io",
        riskScore: 35,
        riskLevel: "low",
        reasonLabel: "Normal usage",
        mrr: 2800,
        nextAction: "Maintain normal check-in cadence.",
        lastActiveAt: "2026-04-28T10:00:00.000Z",
    },
    {
        id: "demo-launchgrid",
        customerId: null,
        companyName: "LaunchGrid",
        email: "hello@launchgrid.co",
        riskScore: 28,
        riskLevel: "low",
        reasonLabel: "Active usage",
        mrr: 2100,
        nextAction: "Share advanced feature recommendations.",
        lastActiveAt: "2026-04-28T14:00:00.000Z",
    },
    {
        id: "demo-metriclane",
        customerId: null,
        companyName: "MetricLane",
        email: "ops@metriclane.io",
        riskScore: 22,
        riskLevel: "low",
        reasonLabel: "Strong engagement",
        mrr: 1900,
        nextAction: "Offer expansion opportunity.",
        lastActiveAt: "2026-04-29T08:00:00.000Z",
    },
];

const DEMO_SUMMARY: Summary = {
    mrrAtRisk: 34800,
    accountsAtRisk: 2,
    totalCustomers: 12,
    totalCustomersDelta: 0,
    riskScore: 78,
    mrrAtRiskDeltaPct: 0,
    churnProbabilityDeltaPct: 0,
};

function formatGBP(v: number) {
    return `£${Math.round(Number(v || 0)).toLocaleString("en-GB")}`;
}

function formatLastActive(value?: string) {
    if (!value) return "Unknown";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown";

    return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function trendText(
    current: number,
    pct?: number,
    type: "money" | "number" | "percent" = "number"
) {
    const changePct = Number(pct || 0);
    const direction = changePct >= 0 ? "↑" : "↓";
    const previous = changePct === 0 ? current : current / (1 + changePct / 100);

    const formattedPrevious =
        type === "money"
            ? formatGBP(previous)
            : type === "percent"
                ? `${Math.round(previous)}%`
                : String(Math.round(previous));

    return `${Math.abs(changePct)}% ${direction} vs ${formattedPrevious} previous month`;
}

function csvEscape(value: string | number | undefined | null) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
}

function downloadCustomerCsv(rows: RiskRow[]) {
    const headers = [
        "Company",
        "Email",
        "Risk Score",
        "Risk Level",
        "Reason",
        "Next Action",
        "MRR",
        "Last Active",
    ];

    const csvRows = rows.map((row) => [
        row.companyName,
        row.email || "",
        row.riskScore,
        row.riskLevel,
        row.reasonLabel,
        row.nextAction || "",
        formatGBP(row.mrr),
        formatLastActive(row.lastActiveAt),
    ]);

    const csv = [
        headers.map(csvEscape).join(","),
        ...csvRows.map((row) => row.map(csvEscape).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "customer-list.csv";
    link.click();

    URL.revokeObjectURL(url);
}

function riskPillClass(level: RiskLevel) {
    if (level === "critical") return styles.riskScoreCritical;
    if (level === "high") return styles.riskScoreHigh;
    if (level === "medium") return styles.riskScoreMedium;
    return styles.riskScoreLow;
}

function initials(name: string) {
    return name
        .split(" ")
        .map((word) => word[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
}

function isTrialActive(trialEndsAt?: string | null) {
    if (!trialEndsAt) return false;
    const trialMs = new Date(trialEndsAt).getTime();
    return Number.isFinite(trialMs) && trialMs > Date.now();
}

function getProfileId(row: RiskRow) {
    return row.customerId || row.id;
}
async function authedPost(url: string, token: string, body?: unknown) {
    const res = await fetch(url, {
        method: "POST",
        cache: "no-store",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body ?? {}),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText} ${text}`);
    }

    return res.json();
}
export default function AccountsAtRiskClient() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [rows, setRows] = useState<RiskRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(DEMO_ROWS.length);
    const [criticalTotal, setCriticalTotal] = useState(
        DEMO_ROWS.filter((row) => row.riskScore >= 85).length
    );

    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<"all" | "critical">("all");
    const [tier, setTier] = useState<PlanTier>("starter");
    const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    const [summary, setSummary] = useState<Summary>(DEMO_SUMMARY);
    const [hasLiveData, setHasLiveData] = useState(false);
    const [workspaceAi, setWorkspaceAi] = useState<AiWorkspaceRes | null>(null);
    const canUseCriticalFilter =
        tier === "pro" || !hasLiveData || isTrialActive(trialEndsAt);

    useEffect(() => {
        if (searchParams.get("filter") === "critical") {
            setFilter("critical");
        }
    }, [searchParams]);

    useEffect(() => {
        setPage(1);
    }, [search, filter]);

    const demoFilteredRows = useMemo(() => {
        let sourceRows =
            filter === "critical"
                ? DEMO_ROWS.filter(
                    (row) => row.riskScore >= 85 || row.riskLevel === "critical"
                )
                : DEMO_ROWS;

        const query = search.trim().toLowerCase();

        if (query) {
            sourceRows = sourceRows.filter((row) => {
                return (
                    row.companyName.toLowerCase().includes(query) ||
                    String(row.email || "").toLowerCase().includes(query) ||
                    row.reasonLabel.toLowerCase().includes(query)
                );
            });
        }

        return sourceRows;
    }, [filter, search]);

    useEffect(() => {
        const auth = getFirebaseAuth();

        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                setRows([]);
                setTotal(demoFilteredRows.length);
                setCriticalTotal(DEMO_ROWS.filter((row) => row.riskScore >= 85).length);
                setSummary(DEMO_SUMMARY);
                setHasLiveData(false);
                setTier("starter");
                setTrialEndsAt(null);
                setLoading(false);
                return;
            }

            const token = await user.getIdToken();

            try {
                setLoading(true);

                const [accountsRes, summaryRes, aiRes] = await Promise.allSettled([
                    fetch(
                        `/api/dashboard/accounts-at-risk?${new URLSearchParams({
                            page: String(page),
                            pageSize: String(PAGE_SIZE),
                            q: search,
                            riskFilter: filter === "critical" ? "critical" : "all",
                        }).toString()}`,
                        {
                            headers: {
                                Authorization: `Bearer ${token}`,
                            },
                            cache: "no-store",
                        }
                    ),
                    fetch("/api/dashboard/summary", {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                        cache: "no-store",
                    }),
                    authedPost("/api/dashboard/ai/insights", token, {
                        timeframe: "week",
                    }) as Promise<AiWorkspaceRes>,
                ]);

                if (accountsRes.status !== "fulfilled") {
                    throw new Error("Accounts request failed");
                }

                if (summaryRes.status !== "fulfilled") {
                    throw new Error("Summary request failed");
                }

                const data: ApiResponse = await accountsRes.value.json();
                const summaryData: DashboardSummaryResponse = await summaryRes.value.json();

                if (aiRes.status === "fulfilled") {
                    setWorkspaceAi(aiRes.value);
                } else {
                    setWorkspaceAi(null);
                }

                setTier(summaryData?.tier === "pro" ? "pro" : "starter");
                setTrialEndsAt(summaryData?.trialEndsAt ?? null);

                const liveRows = Array.isArray(data?.rows) ? data.rows : [];
                const liveMode = Boolean(data?.ok && data?.hasLiveData);

                if (liveMode) {
                    setRows(liveRows);
                    setTotal(Number(data.total || 0));
                    setCriticalTotal(Number(data.criticalTotal || 0));
                    setSummary(data.summary || DEMO_SUMMARY);
                    setHasLiveData(true);
                } else {
                    setRows([]);
                    setTotal(demoFilteredRows.length);
                    setCriticalTotal(DEMO_ROWS.filter((row) => row.riskScore >= 85).length);
                    setSummary(DEMO_SUMMARY);
                    setHasLiveData(false);
                }
            } catch (err) {
                console.error("Failed to fetch accounts", err);

                setWorkspaceAi(null);

                setRows([]);
                setTotal(demoFilteredRows.length);
                setCriticalTotal(DEMO_ROWS.filter((row) => row.riskScore >= 85).length);
                setSummary(DEMO_SUMMARY);
                setHasLiveData(false);
                setTier("starter");
                setTrialEndsAt(null);
            } finally {
                setLoading(false);
            }
        });

        return () => unsub();
    }, [page, search, filter, demoFilteredRows.length]);

    const aiActionsByCustomerId = useMemo(() => {
        const map = new Map<string, ActionFirstRecommendation>();

        for (const action of workspaceAi?.actions ?? []) {
            map.set(action.customerId, action);
        }

        return map;
    }, [workspaceAi?.actions]);

    const displayedRows = useMemo(() => {
        const sourceRows = hasLiveData
            ? rows
            : demoFilteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

        return sourceRows.map((row) => {
            const profileId = getProfileId(row);
            const aiAction = aiActionsByCustomerId.get(profileId) || aiActionsByCustomerId.get(row.id);

            if (!aiAction) return row;

            return {
                ...row,
                nextAction: aiAction.actionTitle,
                reasonLabel: aiAction.reason || row.reasonLabel,
            };
        });
    }, [demoFilteredRows, hasLiveData, page, rows, aiActionsByCustomerId]);

    const effectiveTotal = hasLiveData ? total : demoFilteredRows.length;
    const totalPages = Math.max(1, Math.ceil(effectiveTotal / PAGE_SIZE));

    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages);
        }
    }, [page, totalPages]);

    const allButtonCount = hasLiveData ? total : DEMO_ROWS.length;

    const criticalButtonCount = hasLiveData
        ? criticalTotal
        : DEMO_ROWS.filter((row) => row.riskScore >= 85).length;

    const handleCriticalClick = () => {
        if (!canUseCriticalFilter) {
            setShowUpgradeModal(true);
            return;
        }

        setFilter("critical");
    };

    const handleDownloadCsv = async () => {
        if (!hasLiveData) {
            downloadCustomerCsv(demoFilteredRows);
            return;
        }

        try {
            const auth = getFirebaseAuth();
            const user = auth.currentUser;

            if (!user) {
                downloadCustomerCsv(rows);
                return;
            }

            const token = await user.getIdToken();

            const res = await fetch(
                `/api/dashboard/accounts-at-risk?${new URLSearchParams({
                    page: "1",
                    pageSize: "10000",
                    q: search,
                    riskFilter: filter === "critical" ? "critical" : "all",
                }).toString()}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                    cache: "no-store",
                }
            );

            const data: ApiResponse = await res.json();
            const exportRows = Array.isArray(data?.rows) ? data.rows : rows;

            downloadCustomerCsv(exportRows);
        } catch (err) {
            console.error("Failed to download CSV", err);
            downloadCustomerCsv(rows);
        }
    };

    const healthIndex = Math.max(0, 100 - Number(summary.riskScore || 0));

    return (
        <>
            <div className={styles.page}>
                <div className={styles.topBar}>
                    <div className={styles.searchWrap}>
                        <input
                            className={styles.searchInput}
                            placeholder="Search company..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        <span className={styles.searchIcon}>⌕</span>
                    </div>

                    <button
                        className={styles.downloadBtn}
                        type="button"
                        onClick={handleDownloadCsv}
                    >
                        Download CSV
                    </button>
                </div>

                <div className={styles.header}>
                    <h1 className={styles.title}>Customers</h1>
                    <p className={styles.subtitle}>
                        All accounts, ranked by churn risk and revenue impact.
                    </p>
                </div>

                <div className={styles.kpiRow}>
                    <div className={styles.kpiCard}>
                        <div>
                            <div className={styles.kpiLabel}>Revenue at risk</div>
                            <div className={styles.kpiValue}>{formatGBP(summary.mrrAtRisk)}</div>
                            <div className={styles.kpiSubline}>
                                {trendText(summary.mrrAtRisk, summary.mrrAtRiskDeltaPct, "money")}
                            </div>
                        </div>
                        <div className={styles.kpiIcon}>♙</div>
                    </div>

                    <div className={styles.kpiCard}>
                        <div>
                            <div className={styles.kpiLabel}>Churn exposure</div>
                            <div className={styles.kpiValue}>{summary.riskScore}%</div>
                            <div className={styles.kpiSubline}>
                                {trendText(
                                    summary.riskScore,
                                    summary.churnProbabilityDeltaPct,
                                    "percent"
                                )}
                            </div>
                        </div>
                        <div className={styles.kpiIcon}>◔</div>
                    </div>

                    <div className={styles.kpiCard}>
                        <div>
                            <div className={styles.kpiLabel}>Total customers</div>
                            <div className={styles.kpiValue}>
                                {summary.totalCustomers > 0 ? summary.totalCustomers : DEMO_ROWS.length}
                            </div>
                            <div className={styles.kpiSubline}>
                                {trendText(
                                    summary.totalCustomers > 0
                                        ? summary.totalCustomers
                                        : DEMO_ROWS.length,
                                    summary.totalCustomersDelta,
                                    "number"
                                )}
                            </div>
                        </div>
                        <div className={styles.kpiIcon}>♧</div>
                    </div>

                    <div className={styles.kpiCard}>
                        <div>
                            <div className={styles.kpiLabel}>Customer health index</div>
                            <div className={styles.kpiValue}>{healthIndex}</div>
                            <div className={styles.kpiSubline}>
                                0% ↑ vs {healthIndex} previous month
                            </div>
                        </div>
                        <div className={styles.kpiIcon}>♡</div>
                    </div>
                </div>

                <div className={styles.riskGroupButtons}>
                    <button
                        className={
                            filter === "all"
                                ? styles.riskFilterBtnActive
                                : styles.riskFilterBtn
                        }
                        onClick={() => setFilter("all")}
                        type="button"
                    >
                        All ({allButtonCount})
                    </button>

                    <button
                        className={
                            filter === "critical"
                                ? styles.riskFilterBtnActive
                                : styles.riskFilterBtn
                        }
                        onClick={handleCriticalClick}
                        type="button"
                    >
                        Critical ({criticalButtonCount})
                    </button>
                </div>

                <div className={styles.tableCard}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Account</th>
                                <th>Risk</th>
                                <th>Reason</th>
                                <th>MRR</th>
                                <th>Last active</th>
                                <th className={styles.thActions}>Action</th>
                            </tr>
                        </thead>

                        <tbody>
                            {displayedRows.map((row) => (
                                <tr key={row.id}>
                                    <td>
                                        <div className={styles.accountWrap}>
                                            <div className={styles.avatar}>
                                                {initials(row.companyName)}
                                            </div>
                                            <div>
                                                <div className={styles.companyName}>
                                                    {row.companyName}
                                                </div>
                                                <div className={styles.companySub}>
                                                    {row.email || "—"}
                                                </div>
                                            </div>
                                        </div>
                                    </td>

                                    <td>
                                        <span
                                            className={`${styles.riskScorePill} ${riskPillClass(
                                                row.riskLevel
                                            )}`}
                                        >
                                            {row.riskScore}
                                        </span>
                                    </td>

                                    <td>
                                        <div className={styles.reasonMain}>
                                            {row.nextAction || "Review account"}
                                        </div>
                                        <div className={styles.reasonSubAction}>
                                            {row.reasonLabel}
                                        </div>
                                    </td>

                                    <td className={styles.mrrCell}>{formatGBP(row.mrr)}</td>

                                    <td className={styles.lastActiveCell}>
                                        {formatLastActive(row.lastActiveAt)}
                                    </td>

                                    <td className={styles.tdActions}>
                                        <button
                                            className={styles.viewBtn}
                                            type="button"
                                            onClick={() =>
                                                router.push(
                                                    `/dashboard/accounts-at-risk/${getProfileId(row)}`
                                                )
                                            }
                                        >
                                            View
                                        </button>
                                    </td>
                                </tr>
                            ))}

                            {!loading && displayedRows.length === 0 && (
                                <tr>
                                    <td colSpan={6} className={styles.emptyState}>
                                        No accounts found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className={styles.paginationRow}>
                    <div className={styles.paginationInfo}>
                        Showing {effectiveTotal === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
                        {Math.min(page * PAGE_SIZE, effectiveTotal)} of {effectiveTotal}
                    </div>

                    <div className={styles.paginationBtns}>
                        <button
                            className={styles.viewBtn}
                            disabled={page <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            type="button"
                        >
                            Prev
                        </button>

                        <div className={styles.pagePill}>
                            {page} / {totalPages}
                        </div>

                        <button
                            className={styles.viewBtn}
                            disabled={page >= totalPages}
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            type="button"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>

            {showUpgradeModal ? (
                <div className={styles.modalOverlay}>
                    <div className={styles.modal}>
                        <div className={styles.modalTop}>
                            <div>
                                <div className={styles.modalTitle}>
                                    Unlock critical-risk filtering
                                </div>
                                <p className={styles.modalText}>
                                    Upgrade to Pro to filter your highest-risk accounts and focus on
                                    the customers most likely to churn.
                                </p>
                            </div>

                            <button
                                type="button"
                                className={styles.iconBtn}
                                onClick={() => setShowUpgradeModal(false)}
                            >
                                ✕
                            </button>
                        </div>

                        <div className={styles.modalActions}>
                            <button
                                type="button"
                                className={styles.viewBtn}
                                onClick={() => setShowUpgradeModal(false)}
                            >
                                Not now
                            </button>

                            <button
                                type="button"
                                className={styles.primaryBtn}
                                onClick={() => {
                                    setShowUpgradeModal(false);
                                    router.push("/dashboard/settings?tab=manage-plan");
                                }}
                            >
                                Upgrade to Pro
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}