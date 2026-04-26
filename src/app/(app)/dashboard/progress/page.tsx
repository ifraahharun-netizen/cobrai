"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getFirebaseAuth } from "@/lib/firebase.client";
import styles from "./actionImpact.module.css";

type OutcomeFilter = "all" | "success" | "pending" | "failed";
type DownloadFilter = "all" | "success" | "failed";
type TimeFilter = "recent" | "last_month" | "all";
type ProgressKind = "email" | "notification" | "retry_payment";
type ConfidenceLevel = "High" | "Medium" | "Low";

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
    kind?: ProgressKind;
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
    aiInsight: {
        headline: string;
        summary: string;
        confidence: ConfidenceLevel;
        nextBestAction: string;
        topDriver?: string;
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

const PAGE_SIZE = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

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

function previousFromPercentDelta(current: number, pct: number) {
    const divisor = 1 + pct / 100;
    if (!Number.isFinite(divisor) || divisor === 0) return current;
    return current / divisor;
}

function getDeltaClass(value: number) {
    if (value > 0) return styles.deltaUp;
    if (value < 0) return styles.deltaDown;
    return styles.deltaFlat;
}

function getMinorDeltaFromPct(currentMinor: number, pct: number) {
    const previous = previousFromPercentDelta(currentMinor, pct);
    return Math.round(currentMinor - previous);
}

function getCountDeltaFromPct(current: number, pct: number) {
    const previous = previousFromPercentDelta(current, pct);
    return Math.round(current - previous);
}

function formatSignedCurrencyDelta(minor: number) {
    if (minor === 0) return formatGBPFromMinor(0);
    const sign = minor > 0 ? "+" : "-";
    return `${sign}${formatGBPFromMinor(Math.abs(minor))}`;
}

function formatSignedCountDelta(
    value: number,
    singular: string,
    plural?: string
) {
    const label = Math.abs(value) === 1 ? singular : plural ?? `${singular}s`;
    if (value === 0) return `0 ${label}`;
    return `${value > 0 ? "+" : "-"}${Math.abs(value)} ${label}`;
}

function escapeCsvValue(value: string | number) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function inferProgressKind(action: string): ProgressKind {
    const value = String(action || "").toLowerCase();

    if (
        value.includes("retry") ||
        value.includes("payment retry") ||
        value.includes("retry payment") ||
        value.includes("recovered payment") ||
        value.includes("payment recovered") ||
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

function getRowTargetId(row: Pick<ProgressRow, "customerId" | "accountId" | "id">) {
    return row.customerId || row.accountId || row.id;
}

function formatTimeFilterLabel(timeFilter: TimeFilter) {
    if (timeFilter === "recent") return "previous 30 days";
    if (timeFilter === "last_month") return "month before last";
    return "previous period";
}

function getRowDate(row: Pick<ProgressRow, "date">) {
    const d = new Date(row.date);
    return Number.isNaN(d.getTime()) ? null : d;
}

function countOutcome(rows: ProgressRow[], outcome: Exclude<OutcomeFilter, "all">) {
    return rows.filter((row) => row.outcome === outcome).length;
}

function getCurrentPeriodRows(rows: ProgressRow[], timeFilter: TimeFilter) {
    const now = new Date();

    if (timeFilter === "all") {
        return rows;
    }

    if (timeFilter === "recent") {
        const recentStart = new Date(now.getTime() - 30 * DAY_MS);
        return rows.filter((row) => {
            const rowDate = getRowDate(row);
            return Boolean(rowDate && rowDate >= recentStart && rowDate <= now);
        });
    }

    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(
        now.getFullYear(),
        now.getMonth(),
        0,
        23,
        59,
        59,
        999
    );

    return rows.filter((row) => {
        const rowDate = getRowDate(row);
        return Boolean(
            rowDate &&
            rowDate >= startOfLastMonth &&
            rowDate <= endOfLastMonth &&
            rowDate < startOfCurrentMonth
        );
    });
}

function getPreviousPeriodRows(rows: ProgressRow[], timeFilter: TimeFilter) {
    const now = new Date();

    if (timeFilter === "recent") {
        const currentStart = new Date(now.getTime() - 30 * DAY_MS);
        const previousStart = new Date(now.getTime() - 60 * DAY_MS);
        const previousEnd = new Date(currentStart.getTime() - 1);

        return rows.filter((row) => {
            const rowDate = getRowDate(row);
            return Boolean(rowDate && rowDate >= previousStart && rowDate <= previousEnd);
        });
    }

    if (timeFilter === "last_month") {
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const startOfMonthBeforeLast = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        const endOfMonthBeforeLast = new Date(
            now.getFullYear(),
            now.getMonth() - 1,
            0,
            23,
            59,
            59,
            999
        );

        return rows.filter((row) => {
            const rowDate = getRowDate(row);
            return Boolean(
                rowDate &&
                rowDate >= startOfMonthBeforeLast &&
                rowDate <= endOfMonthBeforeLast &&
                rowDate < startOfLastMonth
            );
        });
    }

    const validDates = rows.map(getRowDate).filter((d): d is Date => Boolean(d));
    if (!validDates.length) return [];

    const earliest = new Date(Math.min(...validDates.map((d) => d.getTime())));
    const latest = new Date(Math.max(...validDates.map((d) => d.getTime())));
    const durationMs = Math.max(DAY_MS, latest.getTime() - earliest.getTime() + DAY_MS);

    const previousEnd = new Date(earliest.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - durationMs + 1);

    return rows.filter((row) => {
        const rowDate = getRowDate(row);
        return Boolean(rowDate && rowDate >= previousStart && rowDate <= previousEnd);
    });
}

function FilterButton({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`${styles.filterButton} ${active ? styles.filterButtonActive : ""}`}
        >
            {children}
        </button>
    );
}

function MoneySigned({
    amountMinor,
    positive = true,
}: {
    amountMinor: number;
    positive?: boolean;
}) {
    return (
        <span className={positive ? styles.moneyPositive : styles.moneyNegative}>
            {positive ? "+" : "-"}
            {formatGBPFromMinor(amountMinor)}
        </span>
    );
}

export default function ProgressPage() {
    const router = useRouter();

    const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");
    const [timeFilter, setTimeFilter] = useState<TimeFilter>("recent");

    const [runningAutomation, setRunningAutomation] = useState(false);
    const [automationError, setAutomationError] = useState<string | null>(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<ProgressApiResponse | null>(null);

    const [currentPage, setCurrentPage] = useState(1);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [showDownloadModal, setShowDownloadModal] = useState(false);

    async function getAuthHeaders(): Promise<Headers> {
        const headers = new Headers();
        const auth = getFirebaseAuth();
        const user = auth.currentUser;

        if (!user) return headers;

        try {
            const token = await user.getIdToken();
            if (token) {
                headers.set("authorization", `Bearer ${token}`);
            }
        } catch {
            // demo mode fallback
        }

        return headers;
    }

    async function loadProgress() {
        try {
            setLoading(true);
            setError(null);

            const headers = await getAuthHeaders();

            const res = await fetch("/api/progress", {
                method: "GET",
                cache: "no-store",
                headers,
            });

            if (!res.ok) {
                const payload = await res.json().catch(() => null);
                throw new Error(payload?.error || "Failed to load progress");
            }

            const json = (await res.json()) as ProgressApiResponse;
            setData(json);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load progress");
        } finally {
            setLoading(false);
        }
    }

    const workspaceTier = String(data?.workspaceTier || "").toLowerCase();
    const isDemoMode = data?.mode === "demo";
    const isStarter = !isDemoMode && workspaceTier === "starter";
    const isPro = isDemoMode || workspaceTier === "pro" || workspaceTier === "scale";

    async function handleRunAiActions() {
        if (isStarter) {
            setShowUpgradeModal(true);
            return;
        }

        try {
            setRunningAutomation(true);
            setAutomationError(null);

            const headers = await getAuthHeaders();

            const res = await fetch("/api/automation/run-workspace", {
                method: "POST",
                headers,
            });

            if (!res.ok) {
                const payload = await res.json().catch(() => null);
                throw new Error(payload?.error || "Failed to run AI actions");
            }

            await loadProgress();
            router.refresh();
        } catch (err) {
            setAutomationError(err instanceof Error ? err.message : "Failed to run AI actions");
        } finally {
            setRunningAutomation(false);
        }
    }

    useEffect(() => {
        loadProgress();
    }, []);

    const normalizedRows = useMemo(() => {
        if (!data) return [];

        return data.progressBreakdown.map((row) => ({
            ...row,
            kind: row.kind ?? inferProgressKind(row.action),
        }));
    }, [data]);

    const timeFilteredRows = useMemo(
        () => getCurrentPeriodRows(normalizedRows, timeFilter),
        [normalizedRows, timeFilter]
    );

    const previousPeriodRows = useMemo(
        () => getPreviousPeriodRows(normalizedRows, timeFilter),
        [normalizedRows, timeFilter]
    );

    const filteredProgressRows = useMemo(() => {
        if (outcomeFilter === "all") return timeFilteredRows;
        return timeFilteredRows.filter((row) => row.outcome === outcomeFilter);
    }, [timeFilteredRows, outcomeFilter]);

    const paginatedProgressRows = useMemo(() => {
        const startIndex = (currentPage - 1) * PAGE_SIZE;
        return filteredProgressRows.slice(startIndex, startIndex + PAGE_SIZE);
    }, [filteredProgressRows, currentPage]);

    const sortedActionPerformance = useMemo(() => {
        if (!data) return [];

        return [...data.actionPerformance].sort((a, b) => {
            if (b.mrrSavedMinor !== a.mrrSavedMinor) return b.mrrSavedMinor - a.mrrSavedMinor;
            if (b.avgRiskDecreasePct !== a.avgRiskDecreasePct) {
                return b.avgRiskDecreasePct - a.avgRiskDecreasePct;
            }
            return b.executions - a.executions;
        });
    }, [data]);

    const successCount = countOutcome(timeFilteredRows, "success");
    const pendingCount = countOutcome(timeFilteredRows, "pending");
    const failedCount = countOutcome(timeFilteredRows, "failed");

    const previousSuccessCount = countOutcome(previousPeriodRows, "success");
    const previousPendingCount = countOutcome(previousPeriodRows, "pending");
    const previousFailedCount = countOutcome(previousPeriodRows, "failed");

    const successDelta = successCount - previousSuccessCount;
    const pendingDelta = pendingCount - previousPendingCount;
    const failedDelta = failedCount - previousFailedCount;

    const totalPages = Math.max(1, Math.ceil(filteredProgressRows.length / PAGE_SIZE));
    const canGoNext = currentPage < totalPages;
    const canGoPrevious = currentPage > 1;

    useEffect(() => {
        setCurrentPage(1);
    }, [outcomeFilter, timeFilter, data]);

    function goToAccount(targetId: string) {
        if (!targetId) return;
        router.push(`/dashboard/customer/${encodeURIComponent(targetId)}`);
    }

    function handleNextPage() {
        if (!canGoNext) return;

        const nextPage = currentPage + 1;
        const nextPageStartIndex = (nextPage - 1) * PAGE_SIZE;

        if (isStarter && nextPageStartIndex >= 10) {
            setShowUpgradeModal(true);
            return;
        }

        setCurrentPage(nextPage);
    }

    function handleDownloadClick() {
        if (isStarter) {
            setShowUpgradeModal(true);
            return;
        }

        setShowDownloadModal(true);
    }

    function downloadCsv(filter: DownloadFilter) {
        if (isStarter) {
            setShowDownloadModal(false);
            setShowUpgradeModal(true);
            return;
        }

        const rowsByOutcome =
            filter === "all"
                ? timeFilteredRows
                : timeFilteredRows.filter((row) => row.outcome === filter);

        if (!rowsByOutcome.length) {
            setShowDownloadModal(false);
            return;
        }

        const headers = [
            "Account",
            "Action",
            "AI reason",
            "Outcome",
            "MRR saved",
            "Risk score",
            "Date",
        ];

        const csvRows = rowsByOutcome.map((row) => [
            row.account,
            row.action,
            row.aiReason,
            row.outcome,
            `${row.outcome === "failed" ? "-" : "+"}${formatGBPFromMinor(row.mrrSavedMinor)}`,
            String(row.riskScore),
            row.date,
        ]);

        const csvContent = [headers, ...csvRows]
            .map((row) => row.map(escapeCsvValue).join(","))
            .join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const dateStamp = new Date().toISOString().slice(0, 10);

        link.href = url;
        link.download = `workflow-progress-${filter}-${dateStamp}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        setShowDownloadModal(false);
    }

    const mrrProtectedDeltaMinor = data
        ? getMinorDeltaFromPct(data.kpis.mrrProtectedMinor, data.kpis.mrrProtectedPct)
        : 0;

    const accountsSavedDelta = data
        ? getCountDeltaFromPct(data.kpis.accountsSaved, data.kpis.accountsSavedPct)
        : 0;

    const actionsExecutedDelta = data
        ? getCountDeltaFromPct(data.kpis.actionsExecuted, data.kpis.actionsExecutedPct)
        : 0;

    const previousMrrProtected = data
        ? previousFromPercentDelta(data.kpis.mrrProtectedMinor, data.kpis.mrrProtectedPct)
        : 0;

    const previousAccountsSaved = data
        ? previousFromPercentDelta(data.kpis.accountsSaved, data.kpis.accountsSavedPct)
        : 0;

    const previousActionsExecuted = data
        ? previousFromPercentDelta(data.kpis.actionsExecuted, data.kpis.actionsExecutedPct)
        : 0;

    if (loading) {
        return (
            <div className={styles.page}>
                <div className={styles.container}>
                    <div className={styles.header}>
                        <div>
                            <div className={styles.badge}>Loading</div>
                            <h1 className={styles.title}>Workflow Progress</h1>
                            <p className={styles.subtitle}>
                                Loading retention performance and workflow activity...
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className={styles.page}>
                <div className={styles.container}>
                    <div className={styles.header}>
                        <div>
                            <div className={styles.badge}>Unavailable</div>
                            <h1 className={styles.title}>Workflow Progress</h1>
                            <p className={styles.subtitle}>
                                {error || "Failed to load progress data."}
                            </p>
                        </div>

                        <button
                            type="button"
                            className={styles.runAiButton}
                            onClick={loadProgress}
                        >
                            Retry
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const pageStart = filteredProgressRows.length
        ? (currentPage - 1) * PAGE_SIZE + 1
        : 0;

    const pageEnd = filteredProgressRows.length
        ? Math.min(currentPage * PAGE_SIZE, filteredProgressRows.length)
        : 0;

    const previousPeriodLabel = formatTimeFilterLabel(timeFilter);

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                <div className={styles.topbar}>
                    <div>
                        <div className={styles.badge}>
                            {isDemoMode ? "Demo" : isPro ? "Pro" : "Starter"}
                        </div>
                        <h1 className={styles.title}>Workflow Progress</h1>
                        <p className={styles.subtitle}>
                            Track email automations, notifications, retry payments, and the revenue they protect.
                        </p>
                        {automationError ? (
                            <p className={styles.errorText}>{automationError}</p>
                        ) : null}
                    </div>

                    <div className={styles.headerActions}>
                        <button
                            type="button"
                            className={styles.filterButton}
                            onClick={handleDownloadClick}
                        >
                            Download CSV
                        </button>

                        <button
                            type="button"
                            className={styles.runAiButton}
                            onClick={handleRunAiActions}
                            disabled={runningAutomation}
                        >
                            {runningAutomation ? "Running..." : "Run AI actions"}
                        </button>
                    </div>
                </div>

                <div className={styles.lockedPageSection}>
                    <div className={!isPro ? styles.lockedPageBlur : ""}>
                        <div className={styles.heroGrid}>
                            <section className={`${styles.card} ${styles.heroRevenueCard}`}>
                                <div className={styles.heroEyebrow}>Revenue protected</div>
                                <div className={styles.heroValue}>
                                    {formatGBPFromMinor(data.kpis.mrrProtectedMinor)}
                                </div>
                                <div className={`${styles.heroDelta} ${getDeltaClass(mrrProtectedDeltaMinor)}`}>
                                    {formatSignedCurrencyDelta(mrrProtectedDeltaMinor)} vs{" "}
                                    {formatGBPFromMinor(previousMrrProtected)} last month
                                </div>
                                <div className={styles.heroHelper}>
                                    Revenue currently retained from completed saves
                                </div>
                            </section>

                            <section className={`${styles.card} ${styles.heroAiCard}`}>
                                <div className={styles.heroEyebrow}>AI insight</div>
                                <div className={styles.aiHeadline}>{data.aiInsight.headline}</div>
                                <div className={styles.aiSubtext}>{data.aiInsight.summary}</div>
                                <div className={styles.aiMeta}>
                                    Confidence: {data.aiInsight.confidence}
                                </div>
                                <div className={styles.aiNextAction}>
                                    {data.aiInsight.nextBestAction}
                                </div>
                            </section>
                        </div>

                        <div className={styles.metricStrip}>
                            <div className={styles.metricStripItem}>
                                <div className={styles.metricStripLabel}>Accounts saved</div>
                                <div className={styles.metricStripValue}>{data.kpis.accountsSaved}</div>
                                <div className={`${styles.metricStripDelta} ${getDeltaClass(accountsSavedDelta)}`}>
                                    {formatSignedCountDelta(accountsSavedDelta, "account")} vs{" "}
                                    {Math.round(previousAccountsSaved)} last month
                                </div>
                            </div>

                            <div className={styles.metricStripItem}>
                                <div className={styles.metricStripLabel}>Actions executed</div>
                                <div className={styles.metricStripValue}>{data.kpis.actionsExecuted}</div>
                                <div className={`${styles.metricStripDelta} ${getDeltaClass(actionsExecutedDelta)}`}>
                                    {formatSignedCountDelta(actionsExecutedDelta, "action")} vs{" "}
                                    {Math.round(previousActionsExecuted)} last month
                                </div>
                            </div>

                            <div className={styles.metricStripItem}>
                                <div className={styles.metricStripLabel}>Success</div>
                                <div className={`${styles.metricStripValue} ${styles.successText}`}>
                                    {successCount}
                                </div>
                                <div className={`${styles.metricStripDelta} ${getDeltaClass(successDelta)}`}>
                                    {formatSignedCountDelta(successDelta, "workflow")} vs {previousSuccessCount}{" "}
                                    {previousPeriodLabel}
                                </div>
                            </div>

                            <div className={styles.metricStripItem}>
                                <div className={styles.metricStripLabel}>Pending</div>
                                <div className={`${styles.metricStripValue} ${styles.pendingText}`}>
                                    {pendingCount}
                                </div>
                                <div className={`${styles.metricStripDelta} ${getDeltaClass(pendingDelta)}`}>
                                    {formatSignedCountDelta(pendingDelta, "workflow")} vs {previousPendingCount}{" "}
                                    {previousPeriodLabel}
                                </div>
                            </div>

                            <div className={styles.metricStripItem}>
                                <div className={styles.metricStripLabel}>Failed</div>
                                <div className={`${styles.metricStripValue} ${styles.failedText}`}>
                                    {failedCount}
                                </div>
                                <div className={`${styles.metricStripDelta} ${getDeltaClass(failedDelta)}`}>
                                    {formatSignedCountDelta(failedDelta, "workflow")} vs {previousFailedCount}{" "}
                                    {previousPeriodLabel}
                                </div>
                            </div>
                        </div>

                        <div className={styles.mainGrid}>
                            <div className={styles.mainLeft}>
                                <section className={styles.card}>
                                    <div className={styles.cardHeader}>
                                        <div>
                                            <h2 className={styles.cardTitle}>Revenue Retained</h2>
                                            <p className={styles.cardSubtext}>
                                                Revenue preserved from at-risk accounts (last 30 days)
                                            </p>
                                        </div>
                                    </div>

                                    <div className={styles.recentSavedList}>
                                        {data.recentMrrSaved.length ? (
                                            data.recentMrrSaved.map((row) => (
                                                <button
                                                    key={row.id}
                                                    type="button"
                                                    className={`${styles.recentSavedRow} ${styles.clickableCard}`}
                                                    onClick={() => goToAccount(row.id)}
                                                >
                                                    <div className={styles.recentSavedName}>{row.account}</div>
                                                    <div className={styles.recentSavedValue}>
                                                        <MoneySigned amountMinor={row.mrrSavedMinor} positive />
                                                    </div>
                                                </button>
                                            ))
                                        ) : (
                                            <div className={styles.emptyState}>No saved revenue yet.</div>
                                        )}
                                    </div>
                                </section>

                                <section className={styles.card}>
                                    <div className={styles.cardHeaderTable}>
                                        <div>
                                            <h2 className={styles.cardTitle}>Workflow Activity</h2>
                                            <p className={styles.cardSubtext}>
                                                Measured outcomes from recent interventions
                                            </p>
                                        </div>

                                        <div className={styles.filterPanel}>
                                            <div className={styles.filterBar}>
                                                <FilterButton
                                                    active={timeFilter === "recent"}
                                                    onClick={() => {
                                                        setTimeFilter("recent");
                                                        setOutcomeFilter("all");
                                                    }}
                                                >
                                                    Recent
                                                </FilterButton>

                                                <FilterButton
                                                    active={timeFilter === "last_month"}
                                                    onClick={() => {
                                                        setTimeFilter("last_month");
                                                        setOutcomeFilter("all");
                                                    }}
                                                >
                                                    Last month
                                                </FilterButton>

                                                <FilterButton
                                                    active={timeFilter === "all"}
                                                    onClick={() => {
                                                        setTimeFilter("all");
                                                        setOutcomeFilter("all");
                                                    }}
                                                >
                                                    All
                                                </FilterButton>
                                            </div>

                                            <div className={styles.filterGroup}>
                                              

                                                <FilterButton
                                                    active={outcomeFilter === "success"}
                                                    onClick={() => setOutcomeFilter("success")}
                                                >
                                                    Success
                                                </FilterButton>

                                                <FilterButton
                                                    active={outcomeFilter === "pending"}
                                                    onClick={() => setOutcomeFilter("pending")}
                                                >
                                                    Pending
                                                </FilterButton>

                                                <FilterButton
                                                    active={outcomeFilter === "failed"}
                                                    onClick={() => setOutcomeFilter("failed")}
                                                >
                                                    Failed
                                                </FilterButton>
                                            </div>
                                        </div>
                                    </div>

                                    <div className={styles.tableWrap}>
                                        <table className={styles.table}>
                                            <thead>
                                                <tr>
                                                    <th>Account</th>
                                                    <th>Action</th>
                                                    <th>AI reason</th>
                                                    <th>Outcome</th>
                                                    <th>MRR saved</th>
                                                    <th>Date</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedProgressRows.length ? (
                                                    paginatedProgressRows.map((row) => {
                                                        const targetId = getRowTargetId(row);

                                                        return (
                                                            <tr
                                                                key={`${row.id}-${row.date}`}
                                                                className={styles.clickableRow}
                                                                onClick={() => goToAccount(targetId)}
                                                                role="button"
                                                                tabIndex={0}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === "Enter" || e.key === " ") {
                                                                        e.preventDefault();
                                                                        goToAccount(targetId);
                                                                    }
                                                                }}
                                                            >
                                                                <td className={styles.cellStrong}>{row.account}</td>
                                                                <td>{row.action}</td>
                                                                <td className={styles.reasonCell}>{row.aiReason}</td>
                                                                <td>
                                                                    <span
                                                                        className={`${styles.statusBadge} ${row.outcome === "success"
                                                                                ? styles.statusSaved
                                                                                : row.outcome === "pending"
                                                                                    ? styles.statusInProgress
                                                                                    : styles.statusAtRisk
                                                                            }`}
                                                                    >
                                                                        {row.outcome === "success"
                                                                            ? "Success"
                                                                            : row.outcome === "pending"
                                                                                ? "Pending"
                                                                                : "Failed"}
                                                                    </span>
                                                                </td>
                                                                <td
                                                                    className={
                                                                        row.outcome === "failed"
                                                                            ? styles.moneyNegative
                                                                            : styles.moneyPositive
                                                                    }
                                                                >
                                                                    <MoneySigned
                                                                        amountMinor={row.mrrSavedMinor}
                                                                        positive={row.outcome !== "failed"}
                                                                    />
                                                                </td>
                                                                <td>{formatCompactDate(row.date)}</td>
                                                            </tr>
                                                        );
                                                    })
                                                ) : (
                                                    <tr>
                                                        <td colSpan={6} className={styles.emptyTableCell}>
                                                            No workflows found for this filter.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {filteredProgressRows.length ? (
                                        <div className={styles.tableFooter}>
                                            <div className={styles.tableFooterText}>
                                                Showing {pageStart}-{pageEnd} of {filteredProgressRows.length} outcomes
                                            </div>

                                            <div className={styles.tableFooterActions}>
                                                <button
                                                    type="button"
                                                    className={styles.filterButton}
                                                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                                                    disabled={!canGoPrevious}
                                                >
                                                    Previous
                                                </button>

                                                <button
                                                    type="button"
                                                    className={`${styles.filterButton} ${styles.filterButtonActive}`}
                                                    onClick={handleNextPage}
                                                    disabled={!canGoNext}
                                                >
                                                    Next page
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}
                                </section>
                            </div>

                            <div className={styles.mainRight}>
                                <section className={styles.card}>
                                    <div className={styles.cardHeader}>
                                        <div>
                                            <h2 className={styles.cardTitle}>Retention Opportunities</h2>
                                            <p className={styles.cardSubtext}>
                                                Accounts requiring immediate attention to prevent churn
                                            </p>
                                        </div>
                                    </div>

                                    <div className={styles.priorityList}>
                                        {data.nextPriorityAccounts.length ? (
                                            data.nextPriorityAccounts.map((row) => (
                                                <button
                                                    key={row.id}
                                                    type="button"
                                                    className={`${styles.priorityRow} ${styles.clickableCard}`}
                                                    onClick={() => goToAccount(row.id)}
                                                >
                                                    <div className={styles.priorityTop}>
                                                        <div className={styles.priorityName}>{row.account}</div>
                                                        <div className={styles.priorityRisk}>
                                                            Risk {row.riskScore}
                                                        </div>
                                                    </div>

                                                    <div className={styles.priorityReason}>{row.aiReason}</div>

                                                    <div className={styles.priorityBottom}>
                                                        <div className={styles.priorityMeta}>
                                                            <span>
                                                                MRR{" "}
                                                                <MoneySigned
                                                                    amountMinor={row.mrrMinor}
                                                                    positive={false}
                                                                />
                                                            </span>
                                                        </div>
                                                    </div>
                                                </button>
                                            ))
                                        ) : (
                                            <div className={styles.emptyState}>
                                                No priority accounts right now.
                                            </div>
                                        )}
                                    </div>
                                </section>

                                <section className={styles.card}>
                                    <div className={styles.cardHeader}>
                                        <div>
                                            <h2 className={styles.cardTitle}>Execution Impact</h2>
                                            <p className={styles.cardSubtext}>
                                                Effectiveness of workflows in reducing churn risk
                                            </p>
                                        </div>
                                    </div>

                                    <div className={styles.performanceList}>
                                        {sortedActionPerformance.length ? (
                                            sortedActionPerformance.map((row) => (
                                                <div key={row.id} className={styles.performanceItem}>
                                                    <div className={styles.performanceTopRow}>
                                                        <div className={styles.performanceAction}>{row.action}</div>
                                                        <div className={styles.performanceExecutions}>{row.executions}x</div>
                                                    </div>

                                                    <div className={styles.performanceMetaRow}>
                                                        <span className={styles.performanceRisk}>
                                                            {row.avgRiskDecreasePct}% avg risk decrease
                                                        </span>
                                                        <span className={styles.performanceImpact}>
                                                            <MoneySigned amountMinor={row.mrrSavedMinor} positive /> MRR saved
                                                        </span>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className={styles.emptyState}>No action performance data yet.</div>
                                        )}
                                    </div>
                                </section>
                            </div>
                        </div>
                    </div>

                    {!isPro ? (
                        <div className={styles.lockedPageOverlay}>
                            <div className={styles.lockedPageCard}>
                                <div className={styles.lockedBadge}>Pro feature</div>
                                <h3 className={styles.lockedTitle}>Unlock workflow progress</h3>
                                <p className={styles.lockedText}>
                                    Track email automations, notifications, retry payments, and complete retention outcomes in one place.
                                </p>

                                <div className={styles.lockedFeatures}>
                                    <span>Full workflow history</span>
                                    <span>Retry payment recovery</span>
                                    <span>Notification tracking</span>
                                    <span>Complete export access</span>
                                </div>

                                <div className={styles.lockedActions}>
                                    <button
                                        type="button"
                                        className={styles.filterButton}
                                        onClick={() => setShowUpgradeModal(true)}
                                    >
                                        Learn more
                                    </button>

                                    <button
                                        type="button"
                                        className={`${styles.filterButton} ${styles.filterButtonActive}`}
                                        onClick={() => router.push("/dashboard/billing")}
                                    >
                                        Upgrade to Pro
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>

            {showDownloadModal ? (
                <div
                    className={styles.modalOverlay}
                    onClick={() => setShowDownloadModal(false)}
                >
                    <div
                        className={styles.upgradeModal}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className={styles.upgradeModalTitle}>Download CSV</h3>
                        <p className={styles.upgradeModalText}>
                            Choose which workflow activity you want to export.
                        </p>

                        <div className={styles.upgradeModalActions}>
                            <button
                                type="button"
                                className={styles.filterButton}
                                onClick={() => downloadCsv("all")}
                            >
                                Download all
                            </button>

                            <button
                                type="button"
                                className={styles.filterButton}
                                onClick={() => downloadCsv("success")}
                            >
                                Download success
                            </button>

                            <button
                                type="button"
                                className={styles.filterButton}
                                onClick={() => downloadCsv("failed")}
                            >
                                Download failed
                            </button>

                            <button
                                type="button"
                                className={`${styles.filterButton} ${styles.filterButtonActive}`}
                                onClick={() => setShowDownloadModal(false)}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {showUpgradeModal ? (
                <div
                    className={styles.modalOverlay}
                    onClick={() => setShowUpgradeModal(false)}
                >
                    <div
                        className={styles.upgradeModal}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className={styles.upgradeModalTitle}>Upgrade to Pro</h3>
                        <p className={styles.upgradeModalText}>
                            Unlock complete workflow progress, notification tracking, retry payment recovery, and full retention visibility.
                        </p>

                        <div className={styles.upgradeModalActions}>
                            <button
                                type="button"
                                className={styles.filterButton}
                                onClick={() => setShowUpgradeModal(false)}
                            >
                                Close
                            </button>

                            <button
                                type="button"
                                className={`${styles.filterButton} ${styles.filterButtonActive}`}
                                onClick={() => router.push("/dashboard/billing")}
                            >
                                Upgrade
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}