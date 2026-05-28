"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase.client";
import styles from "./actionImpact.module.css";
import { getUpgradeMessage } from "@/lib/permissions";

type OutcomeFilter = "all" | "success" | "pending" | "failed";
type ProgressKind = "email" | "retry_payment";
type ConfidenceLevel = "High" | "Medium" | "Low";

type RetentionSignal = {
    label: string;
    severity: "low" | "medium" | "high";
};

type ActionFirstRecommendation = {
    customerId: string;
    customerName: string;
    actionTitle: string;
    actionType: string;
    reason: string;
    priority: string;
    severity?: "critical" | "high" | "medium" | "low";
    mrrAtRiskMinor?: number | null;
    riskScore?: number | null;
};

type AiWorkspaceRes = {
    insights?: unknown[];
    actions?: ActionFirstRecommendation[];
    operationalSummary?: {
        headline: string;
        summary: string;
        confidence: "Low" | "Medium" | "High";
        primaryAction: {
            title: string;
            description: string;
            type: string;
        };
    };
    cached?: boolean;
    source?: "ai" | "fallback" | "cache" | "fallback_after_error";
    timeframe?: string;
    promptVersion?: string;
};

type ProgressRow = {
    id: string;
    accountId?: string;
    customerId?: string;
    account: string;
    email?: string | null;
    action: string;
    aiReason: string;
    aiRecommendation?: string;
    aiSignals?: RetentionSignal[];
    outcome: "success" | "pending" | "failed";
    mrrSavedMinor: number;
    riskScore: number;
    effectivenessScore?: number;
    confidence?: ConfidenceLevel;
    date: string;
    kind?: ProgressKind;
};

type ApiResponse = {
    ok?: boolean;
    mode?: "demo" | "live";
    workspaceTier?: string;
    trialEndsAt?: string | null;
    locked?: boolean;
    requiredPlan?: string;
    message?: string;
    currency?: string;
    connectedIntegrations?: string[];
    kpis?: {
        mrrProtectedMinor: number;
        accountsSaved: number;
        actionsExecuted: number;
        successRate: number;
        mrrProtectedPct: number;
        accountsSavedPct: number;
        actionsExecutedPct: number;
        successRatePct: number;
    };
    aiInsight?: {
        headline: string;
        summary: string;
        confidence: ConfidenceLevel;
        nextBestAction: string;
        topDriver?: string;
    };
    nextPriorityAccounts?: {
        id: string;
        account: string;
        aiReason: string;
        aiAction?: string;
        mrrMinor: number;
        riskScore: number;
    }[];
    progressBreakdown?: ProgressRow[];
};

type PriorityAccount = {
    id: string;
    account: string;
    aiReason: string;
    aiAction?: string;
    mrrMinor: number;
    riskScore: number;
};

function formatMoney(minor?: number | null, currency = "GBP") {
    const safeCurrency = /^[A-Z]{3}$/.test(currency) ? currency : "GBP";

    return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: safeCurrency,
        maximumFractionDigits: 0,
    }).format((Number(minor || 0) || 0) / 100);
}

function formatDate(value?: string) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function fallbackEmail() {
    return "No email available";
}

function cleanText(value?: string | null) {
    return String(value || "")
        .replaceAll("_", " ")
        .replace(/\s+/g, " ")
        .trim();
}

function trendLabel(
    current: number,
    pct: number,
    type: "money" | "number" | "rate",
    currency = "GBP"
) {
    const direction = pct >= 0 ? "↑" : "↓";
    const absolutePct = Math.abs(Number(pct || 0));

    let previousValue = "";

    if (type === "rate") {
        previousValue = `${Math.max(0, Math.round(current - pct))}%`;
    } else {
        const previous = current / (1 + pct / 100);

        previousValue =
            type === "money"
                ? formatMoney(previous, currency)
                : String(Math.max(0, Math.round(previous)));
    }

    return {
        isPositive: pct >= 0,
        text: `${absolutePct}% ${direction} vs ${previousValue} previous month`,
    };
}

function outcomeLabel(outcome: ProgressRow["outcome"] | OutcomeFilter) {
    if (outcome === "success") return "Success";
    if (outcome === "failed") return "Failed";
    if (outcome === "pending") return "Pending";
    return "All";
}

function getRiskColor(score: number) {
    if (score >= 80) return "#ef4444";
    if (score >= 65) return "#f97316";
    return "#10b981";
}

function getEffectivenessScore(row: ProgressRow) {
    if (typeof row.effectivenessScore === "number") {
        return Math.max(0, Math.min(100, Math.round(row.effectivenessScore)));
    }

    if (row.outcome !== "success") return null;

    const reducedRisk = Math.max(0, 100 - Number(row.riskScore || 0));
    const revenueWeight = Math.min(20, Math.round(Number(row.mrrSavedMinor || 0) / 1000));

    return Math.max(55, Math.min(98, reducedRisk + 45 + revenueWeight));
}

function getActionIcon(row: ProgressRow) {
    if (row.outcome === "success") return "✓";
    if (row.kind === "retry_payment") return "▣";
    return "✉";
}

export default function ProgressPage() {
    const router = useRouter();

    const [status, setStatus] = useState<"checking" | "authed" | "guest">("checking");
    const [user, setUser] = useState<User | null>(null);
    const [data, setData] = useState<ApiResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [workspaceAi, setWorkspaceAi] = useState<AiWorkspaceRes | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");
    const [page, setPage] = useState(1);

    const rowsPerPage = 10;

    async function loadWorkspaceAi(currentUser: User) {
        try {
            setAiLoading(true);

            const token = await currentUser.getIdToken();

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

            const json = (await res.json()) as AiWorkspaceRes;
            setWorkspaceAi(json);
        } catch (err) {
            console.error("AI LOAD ERROR:", err);
            setWorkspaceAi(null);
        } finally {
            setAiLoading(false);
        }
    }

    useEffect(() => {
        const auth = getFirebaseAuth();

        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            if (!firebaseUser) {
                setStatus("guest");
                setUser(null);
                setLoading(false);
                router.replace("/login");
                return;
            }

            setUser(firebaseUser);
            setStatus("authed");
        });

        return () => unsubscribe();
    }, [router]);

    useEffect(() => {
        if (status !== "authed" || !user) return;

        const currentUser = user;
        let cancelled = false;

        async function loadProgress() {
            try {
                setLoading(true);
                setError(null);

                const token = await currentUser.getIdToken();

                const res = await fetch("/api/progress", {
                    method: "GET",
                    cache: "no-store",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                const json = (await res.json()) as ApiResponse & { error?: string };

                if (res.status === 403 || json.locked) {
                    throw new Error(
                        json.message ||
                        getUpgradeMessage("retention-impact").description
                    );
                }

                if (!res.ok || json.ok === false) {
                    throw new Error(
                        json.message ||
                        json.error ||
                        "Progress API failed"
                    );
                }

                if (!cancelled) {
                    setData(json);
                }
            } catch (err) {
                console.error("Failed to load progress", err);

                if (!cancelled) {
                    setError("Could not load progress data.");
                    setData(null);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void loadProgress();

        const aiTimer = setTimeout(() => {
            if (!cancelled) {
                void loadWorkspaceAi(currentUser);
            }
        }, 800);

        return () => {
            cancelled = true;
            clearTimeout(aiTimer);
        };
    }, [status, user]);

    const kpis = data?.kpis;
    const currency = data?.currency || "GBP";

    const progressRows = useMemo(() => {
        const rows = Array.isArray(data?.progressBreakdown)
            ? data.progressBreakdown
            : [];

        if (outcomeFilter === "all") return rows;

        return rows.filter((row) => row.outcome === outcomeFilter);
    }, [data?.progressBreakdown, outcomeFilter]);

    const totalPages = Math.max(1, Math.ceil(progressRows.length / rowsPerPage));
    const safePage = Math.min(page, totalPages);

    const visibleRows =
        progressRows.length > 0
            ? progressRows.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage)
            : [];

    const priorityAccounts = useMemo<PriorityAccount[]>(() => {
        const seen = new Set<string>();
        const aiActions = workspaceAi?.actions ?? [];

        if (aiActions.length) {
            return aiActions
                .filter((action) => action.actionType !== "none")
                .filter((action) => {
                    const key = action.customerId || action.customerName;

                    if (seen.has(key)) return false;

                    seen.add(key);
                    return true;
                })
                .slice(0, 4)
                .map((action) => ({
                    id: action.customerId,
                    account: action.customerName,
                    aiReason: action.reason,
                    aiAction: action.actionTitle,
                    mrrMinor: Number(action.mrrAtRiskMinor || 0),
                    riskScore: Number(action.riskScore || 0),
                }));
        }

        return (data?.nextPriorityAccounts ?? [])
            .filter((item) => {
                const key = item.id || item.account;

                if (seen.has(key)) return false;

                seen.add(key);
                return true;
            })
            .slice(0, 4);
    }, [workspaceAi?.actions, data?.nextPriorityAccounts]);

    const mrrTrend = trendLabel(
        Number(kpis?.mrrProtectedMinor || 0),
        Number(kpis?.mrrProtectedPct || 0),
        "money",
        currency
    );

    const accountsTrend = trendLabel(
        Number(kpis?.accountsSaved || 0),
        Number(kpis?.accountsSavedPct || 0),
        "number"
    );

    const actionsTrend = trendLabel(
        Number(kpis?.actionsExecuted || 0),
        Number(kpis?.actionsExecutedPct || 0),
        "number"
    );

    const successTrend = trendLabel(
        Number(kpis?.successRate || 0),
        Number(kpis?.successRatePct || 0),
        "rate"
    );

    useEffect(() => {
        setPage(1);
    }, [outcomeFilter]);

    function goToAccount(id?: string) {
        if (!id) return;
        router.push(`/dashboard/accounts-at-risk/${id}`);
    }

    if (status === "checking" || loading) {
        return (
            <main className={styles.page}>
                <div className={styles.centerState}>
                    <div className={styles.loader} />
                    <p>Loading progress...</p>
                </div>
            </main>
        );
    }

    if (error) {
        return (
            <main className={styles.page}>
                <div className={styles.errorBox}>
                    <strong>Progress could not load</strong>
                    <p>{error}</p>
                </div>
            </main>
        );
    }

    return (
        <main className={styles.page}>
            <div className={styles.container}>
                <div className={styles.topHeaderRow}>
                    <section className={styles.hero}>
                        <h1>Retention activity</h1>
                        <p>
                            Revenue saved, completed workflows, and the next accounts that need attention.
                        </p>
                    </section>
                </div>

                <section className={styles.kpiGrid}>
                    <article className={styles.kpiCard}>
                        <div className={`${styles.kpiIcon} ${styles.greenIcon}`}>£</div>
                        <div>
                            <span>MRR protected</span>
                            <strong>{formatMoney(kpis?.mrrProtectedMinor, currency)}</strong>
                            <small className={mrrTrend.isPositive ? styles.trendUp : styles.trendDown}>
                                {mrrTrend.text}
                            </small>
                        </div>
                    </article>

                    <article className={styles.kpiCard}>
                        <div className={`${styles.kpiIcon} ${styles.blueIcon}`}>♙</div>
                        <div>
                            <span>Accounts saved</span>
                            <strong>{Number(kpis?.accountsSaved || 0)}</strong>
                            <small className={accountsTrend.isPositive ? styles.trendUp : styles.trendDown}>
                                {accountsTrend.text}
                            </small>
                        </div>
                    </article>

                    <article className={styles.kpiCard}>
                        <div className={`${styles.kpiIcon} ${styles.purpleIcon}`}>↯</div>
                        <div>
                            <span>Actions executed</span>
                            <strong>{Number(kpis?.actionsExecuted || 0)}</strong>
                            <small className={actionsTrend.isPositive ? styles.trendUp : styles.trendDown}>
                                {actionsTrend.text}
                            </small>
                        </div>
                    </article>

                    <article className={styles.kpiCard}>
                        <div className={`${styles.kpiIcon} ${styles.orangeIcon}`}>↗</div>
                        <div>
                            <span>Success rate</span>
                            <strong>{Number(kpis?.successRate || 0)}%</strong>
                            <small className={successTrend.isPositive ? styles.trendUp : styles.trendDown}>
                                {successTrend.text}
                            </small>
                        </div>
                    </article>
                </section>

                <section className={styles.contentGrid}>
                    <article className={styles.panel}>
                        <div className={styles.panelHeader}>
                            <div>
                                <h2>Progress breakdown</h2>
                                <p>Every retention action tracked across your accounts.</p>
                            </div>

                            <div className={styles.filterTabs}>
                                {(["all", "success", "pending", "failed"] as OutcomeFilter[]).map((filter) => (
                                    <button
                                        key={filter}
                                        type="button"
                                        className={outcomeFilter === filter ? styles.activeFilter : styles.filterBtn}
                                        onClick={() => setOutcomeFilter(filter)}
                                    >
                                        {outcomeLabel(filter)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {progressRows.length > 0 ? (
                            <>
                                <div className={styles.progressTableWrap}>
                                    <table className={styles.progressTable}>
                                        <thead>
                                            <tr>
                                                <th>Account</th>
                                                <th>AI reasoning & signals</th>
                                                <th>Action result</th>
                                                <th>Outcome</th>
                                                <th>MRR saved</th>
                                                <th>Risk score</th>
                                                <th>Date</th>
                                            </tr>
                                        </thead>

                                        <tbody>
                                            {visibleRows.map((row, index) => {
                                                const riskScore = Math.max(
                                                    0,
                                                    Math.min(100, Number(row.riskScore || 0))
                                                );

                                                const riskColor = getRiskColor(riskScore);
                                                const effectivenessScore = getEffectivenessScore(row);

                                                return (
                                                    <tr
                                                        key={`${row.id}-${index}`}
                                                        onClick={() => goToAccount(row.customerId || row.accountId)}
                                                    >
                                                        <td>
                                                            <div className={styles.accountCell}>
                                                                <div className={styles.accountAvatar}>
                                                                    {row.account?.charAt(0)}
                                                                </div>

                                                                <div className={styles.accountMeta}>
                                                                    <strong>{row.account}</strong>
                                                                    <span>{row.email || fallbackEmail()}</span>
                                                                </div>
                                                            </div>
                                                        </td>

                                                        <td>
                                                            <div className={styles.reasoningCell}>
                                                                <strong>{row.action}</strong>

                                                                <p>{cleanText(row.aiReason)}</p>

                                                                {!!row.aiSignals?.length && (
                                                                    <div className={styles.signalRow}>
                                                                        {row.aiSignals.map((signal, signalIndex) => (
                                                                            <span
                                                                                key={`${signal.label}-${signalIndex}`}
                                                                                className={`
                                                                                    ${styles.signalChip}
                                                                                    ${signal.severity === "high"
                                                                                        ? styles.highSignal
                                                                                        : signal.severity === "medium"
                                                                                            ? styles.mediumSignal
                                                                                            : styles.lowSignal
                                                                                    }
                                                                                `}
                                                                            >
                                                                                {signal.label}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>

                                                        <td>
                                                            {row.outcome === "success" ? (
                                                                <div className={styles.effectivenessCard}>
                                                                    <span className={styles.actionMiniIcon}>
                                                                        {getActionIcon(row)}
                                                                    </span>

                                                                    <div>
                                                                        <strong>
                                                                            {effectivenessScore ?? 0}% effectiveness
                                                                        </strong>

                                                                        <p>
                                                                            Action completed and revenue protection
                                                                            confirmed.
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className={styles.recommendationCard}>
                                                                    <span className={styles.actionMiniIcon}>
                                                                        {getActionIcon(row)}
                                                                    </span>

                                                                    <div>
                                                                        <strong>
                                                                            {cleanText(
                                                                                row.aiRecommendation ||
                                                                                "Review this account and take the recommended retention action."
                                                                            )}
                                                                        </strong>
                                                                    </div>

                                                                    <span className={styles.sparkleIcon}>✦</span>
                                                                </div>
                                                            )}
                                                        </td>

                                                        <td>
                                                            <span
                                                                className={`
                                                                    ${styles.outcomePill}
                                                                    ${row.outcome === "success"
                                                                        ? styles.outcomeSuccess
                                                                        : row.outcome === "failed"
                                                                            ? styles.outcomeFailed
                                                                            : styles.outcomePending
                                                                    }
                                                                `}
                                                            >
                                                                <span className={styles.statusDot} />
                                                                {outcomeLabel(row.outcome)}
                                                            </span>
                                                        </td>

                                                        <td className={styles.mrrCell}>
                                                            {formatMoney(row.mrrSavedMinor, currency)}
                                                        </td>

                                                        <td>
                                                            <div
                                                                className={styles.riskRing}
                                                                style={
                                                                    {
                                                                        "--risk-color": riskColor,
                                                                        "--risk-score": `${riskScore}%`,
                                                                    } as React.CSSProperties
                                                                }
                                                            >
                                                                <span>{riskScore}</span>
                                                            </div>
                                                        </td>

                                                        <td className={styles.dateCell}>{formatDate(row.date)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                <div className={styles.tableFooter}>
                                    <span>
                                        Showing {(safePage - 1) * rowsPerPage + 1} to{" "}
                                        {Math.min(safePage * rowsPerPage, progressRows.length)} of{" "}
                                        {progressRows.length} results
                                    </span>

                                    <div className={styles.paginationModern}>
                                        <button
                                            type="button"
                                            disabled={page === 1}
                                            onClick={() => setPage((current) => Math.max(1, current - 1))}
                                        >
                                            ‹
                                        </button>

                                        {Array.from({ length: totalPages }).map((_, index) => {
                                            const pageNumber = index + 1;

                                            return (
                                                <button
                                                    key={pageNumber}
                                                    type="button"
                                                    onClick={() => setPage(pageNumber)}
                                                    className={page === pageNumber ? styles.currentModernPage : ""}
                                                >
                                                    {pageNumber}
                                                </button>
                                            );
                                        })}

                                        <button
                                            type="button"
                                            disabled={page === totalPages}
                                            onClick={() =>
                                                setPage((current) => Math.min(totalPages, current + 1))
                                            }
                                        >
                                            ›
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className={styles.emptyState}>
                                <strong>No progress rows yet</strong>
                                <p>Your API loaded, but no progress breakdown rows were returned.</p>
                            </div>
                        )}
                    </article>
                </section>
            </div>
        </main>
    );
}