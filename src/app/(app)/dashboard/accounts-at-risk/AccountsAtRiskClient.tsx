"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./risk.module.css";
import { getFirebaseAuth } from "@/lib/firebase.client";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import type { PlanTier } from "@/lib/permissions";

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
};

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

function formatSignedPct(value?: number) {
    const n = Number(value || 0);
    if (n > 0) return `+${n}%`;
    return `${n}%`;
}

function formatSignedNumber(value?: number) {
    const n = Number(value || 0);
    if (n > 0) return `+${n}`;
    return `${n}`;
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

export default function AccountsAtRiskClient() {
    const router = useRouter();

    const [rows, setRows] = useState<RiskRow[]>(DEMO_ROWS);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(DEMO_ROWS.length);
    const [criticalTotal, setCriticalTotal] = useState(
        DEMO_ROWS.filter((row) => row.riskScore >= 85).length
    );

    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<"all" | "critical">("all");
    const [tier, setTier] = useState<PlanTier>("starter");
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    const [summary, setSummary] = useState<Summary>(DEMO_SUMMARY);
    const [hasLiveData, setHasLiveData] = useState(false);

    const PAGE_SIZE = 10;

    useEffect(() => {
        const auth = getFirebaseAuth();

        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                setRows(DEMO_ROWS);
                setTotal(DEMO_ROWS.length);
                setCriticalTotal(DEMO_ROWS.filter((row) => row.riskScore >= 85).length);
                setSummary(DEMO_SUMMARY);
                setHasLiveData(false);
                setTier("starter");
                setLoading(false);
                return;
            }

            const token = await user.getIdToken();

            try {
                setLoading(true);

                const [accountsRes, summaryRes] = await Promise.all([
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
                ]);

                const data: ApiResponse = await accountsRes.json();
                const summaryData: DashboardSummaryResponse = await summaryRes.json();

                setTier(summaryData?.tier === "pro" ? "pro" : "starter");

                const liveRows = Array.isArray(data?.rows) ? data.rows : [];
                const liveMode = Boolean(data?.ok && data?.hasLiveData && liveRows.length > 0);

                if (liveMode) {
                    setRows(liveRows);
                    setTotal(Number(data.total || liveRows.length));
                    setCriticalTotal(Number(data.criticalTotal || 0));
                    setSummary(data.summary || DEMO_SUMMARY);
                    setHasLiveData(true);
                } else {
                    setRows(DEMO_ROWS);
                    setTotal(DEMO_ROWS.length);
                    setCriticalTotal(DEMO_ROWS.filter((row) => row.riskScore >= 85).length);
                    setSummary(DEMO_SUMMARY);
                    setHasLiveData(false);
                }
            } catch (err) {
                console.error("Failed to fetch accounts", err);
                setRows(DEMO_ROWS);
                setTotal(DEMO_ROWS.length);
                setCriticalTotal(DEMO_ROWS.filter((row) => row.riskScore >= 85).length);
                setSummary(DEMO_SUMMARY);
                setHasLiveData(false);
                setTier("starter");
            } finally {
                setLoading(false);
            }
        });

        return () => unsub();
    }, [page, search, filter]);

    useEffect(() => {
        setPage(1);
    }, [search, filter]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const displayedRows = useMemo(() => {
        const sourceRows =
            filter === "critical"
                ? rows.filter((row) => row.riskScore >= 85)
                : rows;

        if (!search.trim()) return sourceRows;

        const query = search.trim().toLowerCase();

        return sourceRows.filter((row) => {
            return (
                row.companyName.toLowerCase().includes(query) ||
                String(row.email || "").toLowerCase().includes(query) ||
                row.reasonLabel.toLowerCase().includes(query)
            );
        });
    }, [filter, rows, search]);

    const allButtonCount = hasLiveData ? total : DEMO_ROWS.length;

    const criticalButtonCount = hasLiveData
        ? criticalTotal
        : DEMO_ROWS.filter((row) => row.riskScore >= 85).length;

    const handleCriticalClick = () => {
        if (tier !== "pro") {
            setShowUpgradeModal(true);
            return;
        }

        setFilter("critical");
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

                    <div className={styles.topActions}>
                        <button className={styles.roundIconBtn} type="button">?</button>
                        <button className={styles.roundIconBtn} type="button">⌁</button>
                        <button className={styles.filterBtn} type="button">Filters</button>
                    </div>
                </div>

                <div className={styles.header}>
                    <h1 className={styles.title}>Customers</h1>
                    <p className={styles.subtitle}>
                        Accounts most likely to churn, prioritised by risk and revenue.
                    </p>
                </div>

                <div className={styles.kpiRow}>
                    <div className={styles.kpiCard}>
                        <div>
                            <div className={styles.kpiLabel}>Revenue at risk</div>
                            <div className={styles.kpiValue}>{formatGBP(summary.mrrAtRisk)}</div>
                            <div className={styles.kpiSubline}>
                                {formatSignedPct(summary.mrrAtRiskDeltaPct)} vs previous month
                            </div>
                        </div>
                        <div className={styles.kpiIcon}>♙</div>
                    </div>

                    <div className={styles.kpiCard}>
                        <div>
                            <div className={styles.kpiLabel}>Churn exposure</div>
                            <div className={styles.kpiValue}>{summary.riskScore}%</div>
                            <div className={styles.kpiSubline}>
                                {formatSignedPct(summary.churnProbabilityDeltaPct)} vs previous month
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
                                {formatSignedNumber(summary.totalCustomersDelta)} vs previous month
                            </div>
                        </div>
                        <div className={styles.kpiIcon}>♧</div>
                    </div>

                    <div className={styles.kpiCard}>
                        <div>
                            <div className={styles.kpiLabel}>Customer health index</div>
                            <div className={styles.kpiValue}>{healthIndex}</div>
                            <div className={styles.kpiSubline}>—0 vs previous month</div>
                        </div>
                        <div className={styles.kpiIcon}>♡</div>
                    </div>
                </div>

                <div className={styles.riskGroupButtons}>
                    <button
                        className={filter === "all" ? styles.riskFilterBtnActive : styles.riskFilterBtn}
                        onClick={() => setFilter("all")}
                        type="button"
                    >
                        All ({allButtonCount})
                    </button>

                    <button
                        className={filter === "critical" ? styles.riskFilterBtnActive : styles.riskFilterBtn}
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
                                <th className={styles.thActions}>Action</th>
                            </tr>
                        </thead>

                        <tbody>
                            {displayedRows.map((row) => (
                                <tr key={row.id}>
                                    <td>
                                        <div className={styles.accountWrap}>
                                            <div className={styles.avatar}>{initials(row.companyName)}</div>
                                            <div>
                                                <div className={styles.companyName}>{row.companyName}</div>
                                                <div className={styles.companySub}>{row.email || "—"}</div>
                                            </div>
                                        </div>
                                    </td>

                                    <td>
                                        <span className={`${styles.riskScorePill} ${riskPillClass(row.riskLevel)}`}>
                                            {row.riskScore}
                                        </span>
                                    </td>

                                    <td>
                                        <div className={styles.reasonMain}>{row.reasonLabel}</div>
                                        {row.nextAction ? (
                                            <div className={styles.reasonSubAction}>{row.nextAction}</div>
                                        ) : null}
                                    </td>

                                    <td className={styles.mrrCell}>{formatGBP(row.mrr)}</td>

                                    <td className={styles.tdActions}>
                                        <button
                                            className={styles.viewBtn}
                                            type="button"
                                            onClick={() => {
                                                router.push(
                                                    row.customerId
                                                        ? `/dashboard/accounts-at-risk/${row.customerId}`
                                                        : `/dashboard/accounts-at-risk/${row.id}`
                                                );
                                            }}
                                        >
                                            View
                                        </button>
                                    </td>
                                </tr>
                            ))}

                            {!loading && displayedRows.length === 0 && (
                                <tr>
                                    <td colSpan={5} className={styles.emptyState}>
                                        No accounts found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className={styles.paginationRow}>
                    <div className={styles.paginationInfo}>
                        Showing {total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–
                        {Math.min(page * PAGE_SIZE, total)} of {total}
                    </div>

                    <div className={styles.paginationBtns}>
                        <button
                            className={styles.viewBtn}
                            disabled={page === 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            type="button"
                        >
                            Prev
                        </button>

                        <div className={styles.pagePill}>{page} / {totalPages}</div>

                        <button
                            className={styles.viewBtn}
                            disabled={page === totalPages}
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
                                <div className={styles.modalTitle}>Unlock critical-risk filtering</div>
                                <p className={styles.modalText}>
                                    Upgrade to Pro to filter your highest-risk accounts and focus on the customers most likely to churn.
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