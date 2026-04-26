"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./risk.module.css";
import { getFirebaseAuth } from "@/lib/firebase.client";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import type { PlanTier } from "@/lib/permissions";

type RiskLevel = "critical" | "high" | "medium" | "low";
type HealthDirection = "improving" | "declining" | "stable";

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

type CustomerHealthInsight = {
    direction: HealthDirection;
    drivers: string[];
    summary: string;
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

function deltaClass(value?: number) {
    const n = Number(value || 0);
    if (n > 0) return styles.kpiDeltaUp;
    if (n < 0) return styles.kpiDeltaDown;
    return styles.kpiDeltaFlat;
}

function deltaArrow(value?: number) {
    const n = Number(value || 0);
    if (n > 0) return "↑";
    if (n < 0) return "↓";
    return "→";
}

function riskPillClass(level: RiskLevel) {
    if (level === "critical") return styles.riskScoreCritical;
    if (level === "high") return styles.riskScoreHigh;
    if (level === "medium") return styles.riskScoreMedium;
    return styles.riskScoreLow;
}

function normaliseDriver(reason?: string) {
    const value = String(reason || "").toLowerCase();

    if (
        value.includes("billing") ||
        value.includes("payment failed") ||
        value.includes("payment") ||
        value.includes("invoice")
    ) {
        return "billing issues";
    }

    if (
        value.includes("low engagement") ||
        value.includes("no activity") ||
        value.includes("inactive") ||
        value.includes("usage") ||
        value.includes("declining weekly usage")
    ) {
        return "low engagement";
    }

    if (value.includes("support")) {
        return "support issues";
    }

    if (value.includes("churn")) {
        return "high churn risk";
    }

    return "";
}

function buildCustomerHealthInsight(
    rows: RiskRow[],
    churnProbabilityDeltaPct?: number
): CustomerHealthInsight {
    const driverCounts = new Map<string, number>();

    for (const row of rows) {
        const driver = normaliseDriver(row.reasonLabel);
        if (!driver) continue;
        driverCounts.set(driver, (driverCounts.get(driver) || 0) + 1);
    }

    const drivers = Array.from(driverCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([label]) => label);

    const delta = Number(churnProbabilityDeltaPct || 0);
    const hasCritical = rows.some((row) => row.riskScore >= 85);

    let direction: HealthDirection = "stable";

    if (delta > 0 || hasCritical) direction = "declining";
    else if (delta < 0) direction = "improving";

    const driverText = drivers.length ? drivers.join(", ") : "mixed account signals";

    if (direction === "declining") {
        return {
            direction,
            drivers,
            summary: `Declining due to ${driverText}.`,
        };
    }

    if (direction === "improving") {
        return {
            direction,
            drivers,
            summary: `Improving as pressure from ${driverText} is easing.`,
        };
    }

    return {
        direction,
        drivers,
        summary: `Stable, mainly shaped by ${driverText}.`,
    };
}

const DEMO_TOTAL_CUSTOMERS = 12;

export default function AccountsAtRiskClient() {
    const [rows, setRows] = useState<RiskRow[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [criticalTotal, setCriticalTotal] = useState(0);

    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<"all" | "critical">("all");
    const [tier, setTier] = useState<PlanTier>("starter");
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    const [summary, setSummary] = useState<Summary>({
        mrrAtRisk: 0,
        accountsAtRisk: 0,
        totalCustomers: 0,
        totalCustomersDelta: 0,
        riskScore: 0,
        mrrAtRiskDeltaPct: 0,
        churnProbabilityDeltaPct: 0,
    });

    const [hasLiveData, setHasLiveData] = useState(false);

    const PAGE_SIZE = 10;

    useEffect(() => {
        const auth = getFirebaseAuth();

        const unsub = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                setRows([]);
                setTotal(0);
                setCriticalTotal(0);
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

                if (summaryData?.tier === "pro" || summaryData?.tier === "scale") {
                    setTier(summaryData.tier);
                } else {
                    setTier("starter");
                }

                if (data.ok) {
                    setRows(data.rows || []);
                    setTotal(Number(data.total || 0));
                    setCriticalTotal(Number(data.criticalTotal || 0));
                    setSummary(
                        data.summary || {
                            mrrAtRisk: 0,
                            accountsAtRisk: 0,
                            totalCustomers: 0,
                            totalCustomersDelta: 0,
                            riskScore: 0,
                            mrrAtRiskDeltaPct: 0,
                            churnProbabilityDeltaPct: 0,
                        }
                    );
                    setHasLiveData(Boolean(data.hasLiveData));
                } else {
                    setRows([]);
                    setTotal(0);
                    setCriticalTotal(0);
                    setHasLiveData(false);
                }
            } catch (err) {
                console.error("Failed to fetch accounts", err);
                setRows([]);
                setTotal(0);
                setCriticalTotal(0);
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
        return filter === "critical"
            ? rows.filter((row) => row.riskScore >= 85)
            : rows;
    }, [filter, rows]);

    const totalCustomersDisplay =
        summary.totalCustomers > 0 ? summary.totalCustomers : !hasLiveData ? DEMO_TOTAL_CUSTOMERS : 0;

    const allButtonCount = totalCustomersDisplay;
    const criticalButtonCount =
        criticalTotal > 0 ? criticalTotal : !hasLiveData ? displayedRows.filter((r) => r.riskScore >= 85).length : 0;

    const handleCriticalClick = () => {
        if (tier !== "pro" && tier !== "scale") {
            setShowUpgradeModal(true);
            return;
        }
        setFilter("critical");
    };

    const healthIndex = Math.max(0, 100 - summary.riskScore);
    const healthIndexDelta =
        typeof summary.churnProbabilityDeltaPct === "number"
            ? -summary.churnProbabilityDeltaPct
            : 0;

    const customerHealthInsight = useMemo(() => {
        return buildCustomerHealthInsight(rows, summary.churnProbabilityDeltaPct);
    }, [rows, summary.churnProbabilityDeltaPct]);

    return (
        <>
            <div className={styles.page}>
                <div className={styles.header}>
                    <div>
                        <h1 className={styles.title}>Customers</h1>
                        <p className={styles.subtitle}>
                            Accounts most likely to churn — prioritised by revenue and risk.
                        </p>
                    </div>
                </div>

                <div className={styles.kpiRow}>
                    <div className={`${styles.kpiCard} ${styles.kpiCardSquare}`}>
                        <div className={styles.kpiLabel}>Revenue at risk</div>
                        <div className={styles.kpiValue}>{formatGBP(summary.mrrAtRisk)}</div>
                        <div className={styles.kpiSubline}>
                            <span className={`${styles.kpiDeltaInline} ${deltaClass(summary.mrrAtRiskDeltaPct)}`}>
                                <span className={styles.kpiDeltaArrow}>{deltaArrow(summary.mrrAtRiskDeltaPct)}</span>
                                {formatSignedPct(summary.mrrAtRiskDeltaPct)}
                            </span>
                            <span className={styles.kpiSubtext}>vs previous month</span>
                        </div>
                    </div>

                    <div className={`${styles.kpiCard} ${styles.kpiCardSquare}`}>
                        <div className={styles.kpiLabel}>Churn exposure</div>
                        <div className={styles.kpiValue}>{summary.riskScore}%</div>
                        <div className={styles.kpiSubline}>
                            <span className={`${styles.kpiDeltaInline} ${deltaClass(summary.churnProbabilityDeltaPct)}`}>
                                <span className={styles.kpiDeltaArrow}>{deltaArrow(summary.churnProbabilityDeltaPct)}</span>
                                {formatSignedPct(summary.churnProbabilityDeltaPct)}
                            </span>
                            <span className={styles.kpiSubtext}>vs previous month</span>
                        </div>
                    </div>

                    <div className={`${styles.kpiCard} ${styles.kpiCardSquare}`}>
                        <div className={styles.kpiLabel}>Total customers</div>
                        <div className={styles.kpiValue}>{totalCustomersDisplay}</div>
                        <div className={styles.kpiSubline}>
                            <span className={`${styles.kpiDeltaInline} ${deltaClass(summary.totalCustomersDelta)}`}>
                                <span className={styles.kpiDeltaArrow}>{deltaArrow(summary.totalCustomersDelta)}</span>
                                {formatSignedNumber(summary.totalCustomersDelta)}
                            </span>
                            <span className={styles.kpiSubtext}>vs previous month</span>
                        </div>
                    </div>

                    <div className={`${styles.kpiCard} ${styles.kpiCardSquare}`}>
                        <div className={styles.kpiLabel}>Customer health</div>
                        <div className={styles.kpiValue}>{healthIndex}%</div>
                        <div className={styles.kpiSubline}>
                            <span className={`${styles.kpiDeltaInline} ${deltaClass(healthIndexDelta)}`}>
                                <span className={styles.kpiDeltaArrow}>{deltaArrow(healthIndexDelta)}</span>
                                {formatSignedPct(healthIndexDelta)}
                            </span>
                            <span className={styles.kpiSubtext}>vs previous month</span>
                        </div>

                        <div className={styles.healthInsightBlock}>
                            <div
                                className={`${styles.healthInsightBadge} ${customerHealthInsight.direction === "declining"
                                    ? styles.healthInsightBad
                                    : customerHealthInsight.direction === "improving"
                                        ? styles.healthInsightGood
                                        : styles.healthInsightNeutral
                                    }`}
                            >
                                {customerHealthInsight.direction === "declining"
                                    ? "Declining"
                                    : customerHealthInsight.direction === "improving"
                                        ? "Improving"
                                        : "Stable"}
                            </div>

                            <div className={styles.healthInsightText}>
                                {customerHealthInsight.summary}
                            </div>

                            {customerHealthInsight.drivers.length ? (
                                <div className={styles.healthDriversRow}>
                                    {customerHealthInsight.drivers.map((driver) => (
                                        <span key={driver} className={styles.healthDriverPill}>
                                            {driver}
                                        </span>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>

                <div className={styles.controlsRow}>
                    <div className={styles.controlsLeft}>
                        <div className={styles.searchWrap}>
                            <input
                                className={styles.searchInput}
                                placeholder="Search company..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
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
                    </div>
                </div>

                <div className={styles.tableSection}>
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
                                    <tr key={row.id} className={styles.tr}>
                                        <td>
                                            <div className={styles.companyCell}>
                                                <div className={styles.companyName}>{row.companyName}</div>
                                                <div className={styles.companySub}>{row.email || "—"}</div>
                                            </div>
                                        </td>

                                        <td>
                                            <div className={styles.riskCell}>
                                                <span className={`${styles.riskScorePill} ${riskPillClass(row.riskLevel)}`}>
                                                    {row.riskScore}
                                                </span>
                                            </div>
                                        </td>

                                        <td>
                                            <div className={styles.reasonCell}>
                                                <div className={styles.reasonMain}>{row.reasonLabel}</div>
                                                {row.nextAction ? (
                                                    <div className={styles.reasonSubAction}>{row.nextAction}</div>
                                                ) : null}
                                            </div>
                                        </td>

                                        <td>{formatGBP(row.mrr)}</td>

                                        <td className={styles.tdActions}>
                                            <button
                                                className={styles.secondaryBtn}
                                                type="button"
                                                onClick={() => {
                                                    if (row.customerId) {
                                                        router.push(`/dashboard/accounts-at-risk/${row.customerId}`);
                                                    } else {
                                                        router.push(`/dashboard/accounts-at-risk/${row.id}`);
                                                    }
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
                            Showing {total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
                        </div>

                        <div className={styles.paginationBtns}>
                            <button
                                className={styles.secondaryBtn}
                                disabled={page === 1}
                                onClick={() => setPage((p) => p - 1)}
                                type="button"
                            >
                                Prev
                            </button>

                            <div className={styles.pagePill}>
                                {page} / {totalPages}
                            </div>

                            <button
                                className={styles.secondaryBtn}
                                disabled={page === totalPages}
                                onClick={() => setPage((p) => p + 1)}
                                type="button"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {showUpgradeModal ? (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(15, 23, 42, 0.45)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 20,
                        zIndex: 1000,
                    }}
                >
                    <div
                        style={{
                            width: "100%",
                            maxWidth: 460,
                            background: "#ffffff",
                            borderRadius: 24,
                            padding: 24,
                            boxShadow: "0 24px 80px rgba(15, 23, 42, 0.18)",
                            border: "1px solid rgba(15, 23, 42, 0.08)",
                        }}
                    >
                        <div
                            style={{
                                display: "inline-flex",
                                padding: "6px 12px",
                                borderRadius: 999,
                                background: "rgba(15, 23, 42, 0.06)",
                                fontSize: 12,
                                fontWeight: 700,
                                color: "#0f172a",
                                letterSpacing: "0.04em",
                                textTransform: "uppercase",
                                marginBottom: 14,
                            }}
                        >
                            Pro feature
                        </div>

                        <h3
                            style={{
                                margin: 0,
                                fontSize: 24,
                                lineHeight: 1.2,
                                color: "#0f172a",
                                fontWeight: 700,
                            }}
                        >
                            Unlock critical-risk filtering
                        </h3>

                        <p
                            style={{
                                margin: "12px 0 0",
                                fontSize: 15,
                                lineHeight: 1.65,
                                color: "#5f6b7a",
                            }}
                        >
                            Upgrade to Pro to view only your highest-risk accounts and prioritise the customers most likely to churn.
                        </p>

                        <div
                            style={{
                                display: "flex",
                                gap: 12,
                                marginTop: 22,
                                flexWrap: "wrap",
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => setShowUpgradeModal(false)}
                                style={{
                                    border: "1px solid rgba(15, 23, 42, 0.12)",
                                    background: "#ffffff",
                                    color: "#0f172a",
                                    borderRadius: 999,
                                    padding: "11px 16px",
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
                                    setShowUpgradeModal(false);
                                    router.push("/dashboard/settings?tab=manage-plan");
                                }}
                                style={{
                                    border: "none",
                                    background: "#0f172a",
                                    color: "#ffffff",
                                    borderRadius: 999,
                                    padding: "11px 18px",
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: "pointer",
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