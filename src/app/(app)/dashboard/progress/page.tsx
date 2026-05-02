"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase.client";
import styles from "./actionImpact.module.css";

type OutcomeFilter = "all" | "success" | "pending" | "failed";
type ProgressKind = "email" | "notification" | "retry_payment";
type ConfidenceLevel = "High" | "Medium" | "Low";

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
    email?: string;
    action: string;
    aiReason: string;
    outcome: "success" | "pending" | "failed";
    mrrSavedMinor: number;
    riskScore: number;
    date: string;
    kind?: ProgressKind;
};

type ApiResponse = {
    ok?: boolean;
    mode?: "demo" | "live";
    workspaceTier?: string;
    trialEndsAt?: string | null;
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

function formatMoney(minor?: number | null) {
    return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
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

function formatUpdatedAt(value?: string | null) {
    if (!value) return "Just now";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Just now";

    return date.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function fallbackEmail(account: string) {
    const slug = account.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
    return slug ? `team@${slug}.com` : "team@company.com";
}

function cleanText(value?: string | null) {
    return String(value || "")
        .replaceAll("_", " ")
        .replace(/\s+/g, " ")
        .trim();
}

function trendLabel(current: number, pct: number, type: "money" | "number" | "rate") {
    const direction = pct >= 0 ? "↑" : "↓";
    const absolutePct = Math.abs(Number(pct || 0));

    let previousValue = "";

    if (type === "rate") {
        previousValue = `${Math.max(0, Math.round(current - pct))}%`;
    } else {
        const previous = current / (1 + pct / 100);
        previousValue =
            type === "money"
                ? formatMoney(previous)
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

function kindLabel(kind?: ProgressKind) {
    if (kind === "retry_payment") return "Retry payment";
    if (kind === "notification") return "Notification";
    return "Email";
}

function confidenceClass(confidence?: ConfidenceLevel) {
    if (confidence === "High") return styles.highConfidence;
    if (confidence === "Medium") return styles.mediumConfidence;
    return styles.lowConfidence;
}

function csvEscape(value: string | number | undefined | null) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: ProgressRow[]) {
    const headers = ["Account", "Email", "Reason", "Action", "Outcome", "MRR", "Risk", "Date"];

    const csvRows = rows.map((row) => [
        row.account,
        row.email || fallbackEmail(row.account),
        row.aiReason,
        row.action || kindLabel(row.kind),
        outcomeLabel(row.outcome),
        formatMoney(row.mrrSavedMinor),
        `${row.riskScore}%`,
        formatDate(row.date),
    ]);

    const csv = [
        headers.map(csvEscape).join(","),
        ...csvRows.map((row) => row.map(csvEscape).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
}

export default function ProgressPage() {
    const router = useRouter();

    const [status, setStatus] = useState<"checking" | "authed" | "guest">("checking");
    const [user, setUser] = useState<User | null>(null);
    const [data, setData] = useState<ApiResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [workspaceAi, setWorkspaceAi] = useState<AiWorkspaceRes | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiRefreshedAt, setAiRefreshedAt] = useState<string | null>(null);
    const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");
    const [page, setPage] = useState(1);

    const rowsPerPage = 5;

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
            setAiRefreshedAt(new Date().toISOString());
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

                const json = (await res.json()) as ApiResponse;

                if (!res.ok) throw new Error("Progress API failed");

                if (!cancelled) {
                    setData(json);
                    setLastUpdatedAt(new Date().toISOString());
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
        void loadWorkspaceAi(currentUser);

        return () => {
            cancelled = true;
        };
    }, [status, user]);

    const kpis = data?.kpis;

    const progressRows = useMemo(() => {
        const rows = Array.isArray(data?.progressBreakdown) ? data.progressBreakdown : [];

        if (outcomeFilter === "all") return rows;

        return rows.filter((row) => row.outcome === outcomeFilter);
    }, [data?.progressBreakdown, outcomeFilter]);

    const visibleRows = progressRows.slice((page - 1) * rowsPerPage, page * rowsPerPage);
    const totalPages = Math.max(1, Math.ceil(progressRows.length / rowsPerPage));

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
        "money"
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

    const aiHeadline =
        workspaceAi?.operationalSummary?.headline ||
        data?.aiInsight?.headline ||
        `${formatMoney(kpis?.mrrProtectedMinor)} protected this month`;

    const progressStats = (() => {
        const rows = Array.isArray(data?.progressBreakdown) ? data.progressBreakdown : [];

        const successCount = rows.filter((row) => row.outcome === "success").length;
        const pendingCount = rows.filter((row) => row.outcome === "pending").length;
        const failedCount = rows.filter((row) => row.outcome === "failed").length;

        const totalActions = Number(kpis?.actionsExecuted || rows.length || 0);
        const successRate = Number(kpis?.successRate || 0);
        const mrrProtected = formatMoney(kpis?.mrrProtectedMinor);

        const topRisk = priorityAccounts[0];

        return {
            successCount,
            pendingCount,
            failedCount,
            totalActions,
            successRate,
            mrrProtected,
            topRisk,
        };
    })();

    const aiSummary =
        progressStats.totalActions > 0
            ? `${progressStats.mrrProtected} was protected this month across ${progressStats.totalActions} retention actions. Success rate is ${progressStats.successRate}%, with ${progressStats.pendingCount} pending and ${progressStats.failedCount} failed action${progressStats.failedCount === 1 ? "" : "s"} still needing attention. ${progressStats.topRisk
                ? `Prioritise ${progressStats.topRisk.account} and similar high-risk accounts before starting new outreach.`
                : "Prioritise unresolved recovery actions before starting new outreach."
            }`
            : workspaceAi?.operationalSummary?.summary ||
            data?.aiInsight?.summary ||
            "Cobrai is tracking retention activity and prioritising the accounts that need attention.";

    const aiConfidence =
        workspaceAi?.operationalSummary?.confidence || data?.aiInsight?.confidence || "Medium";

    const aiPrimaryAction =
        workspaceAi?.operationalSummary?.primaryAction?.title ||
        data?.aiInsight?.nextBestAction ||
        "Review the highest-risk accounts first.";

    const aiPrimaryDescription =
        workspaceAi?.operationalSummary?.primaryAction?.description ||
        "Focus on accounts with billing issues, low health, or declining engagement.";

    return (
        <main className={styles.page}>
            <div className={styles.container}>
                <div className={styles.topHeaderRow}>
                    <section className={styles.hero}>
                        <h1>Retention activity</h1>
                        <p>Revenue saved, completed workflows, and the next accounts that need attention.</p>
                    </section>

                    <section className={styles.demoProgressBox}>
                        <div>
                            <span>{data?.mode === "live" ? "Live progress" : "Demo progress"}</span>
                            <strong>This month’s activity</strong>
                            <p>Last updated: {formatUpdatedAt(lastUpdatedAt)}</p>
                        </div>

                        <button
                            type="button"
                            className={styles.downloadBtn}
                            onClick={() => downloadCsv("progress-breakdown.csv", progressRows)}
                        >
                            Download CSV
                        </button>
                    </section>
                </div>

                <section className={styles.kpiGrid}>
                    <article className={styles.kpiCard}>
                        <div className={`${styles.kpiIcon} ${styles.greenIcon}`}>£</div>
                        <div>
                            <span>MRR protected</span>
                            <strong>{formatMoney(kpis?.mrrProtectedMinor)}</strong>
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

                <section className={styles.singleInsightCard}>
                    <div className={styles.insightTop}>
                        <span className={styles.insightLabel}>✧ AI Insight</span>

                        <span className={`${styles.confidencePill} ${confidenceClass(aiConfidence)}`}>
                            <i />
                            {aiConfidence} confidence
                        </span>
                    </div>

                    <h2 className={styles.insightHeadline}>{aiHeadline}</h2>

                    <p className={styles.insightSummary}>{aiSummary}</p>

                    <div className={styles.primaryAction}>
                        <strong>{aiPrimaryAction}</strong>
                        <p>{aiPrimaryDescription}</p>
                    </div>
                </section>

                <section className={styles.contentGrid}>
                    <article className={styles.panel}>
                        <div className={styles.panelHeader}>
                            <div>
                                <h2>Next priority accounts</h2>
                                <p>AI-prioritised accounts that need attention first.</p>
                            </div>

                            <button
                                type="button"
                                className={styles.downloadBtn}
                                onClick={() => user && void loadWorkspaceAi(user)}
                                disabled={aiLoading}
                            >
                                {aiLoading ? "Refreshing..." : "Refresh"}
                            </button>
                        </div>

                        <div className={styles.priorityList}>
                            {priorityAccounts.length ? (
                                priorityAccounts.map((item, index) => (
                                    <button
                                        type="button"
                                        key={`${item.id}-${index}`}
                                        className={styles.priorityItem}
                                        onClick={() => goToAccount(item.id)}
                                    >
                                        <span className={styles.avatar}>
                                            {item.account?.charAt(0) || "A"}
                                        </span>

                                        <span className={styles.priorityCopy}>
                                            <span className={styles.priorityTop}>
                                                <strong>{item.account}</strong>
                                                <b>{item.riskScore}% risk</b>
                                            </span>

                                            <small className={styles.aiReason}>
                                                {cleanText(item.aiReason)}
                                            </small>

                                            <small className={styles.aiAction}>
                                                <strong>AI action:</strong>{" "}
                                                {cleanText(
                                                    item.aiAction ||
                                                    "Send a personalised retention check-in with a usage recap."
                                                )}
                                            </small>

                                            <small className={styles.mrrHint}>
                                                <span>Revenue at risk</span>
                                                <b>{formatMoney(item.mrrMinor)}</b>
                                            </small>
                                        </span>
                                    </button>
                                ))
                            ) : (
                                <div className={styles.emptyState}>
                                    <strong>No priority accounts yet</strong>
                                    <p>Cobrai will show AI-led actions once enough risk signals exist.</p>
                                </div>
                            )}
                        </div>

                        <button
                            type="button"
                            className={styles.viewAllBtn}
                            onClick={() => router.push("/dashboard/accounts-at-risk?filter=critical")}
                        >
                            View all accounts <span>›</span>
                        </button>

                        {aiRefreshedAt ? (
                            <p style={{ marginTop: 10, fontSize: 12, color: "#777" }}>
                                Last refreshed {formatUpdatedAt(aiRefreshedAt)}
                            </p>
                        ) : null}
                    </article>

                    <article className={styles.panel}>
                        <div className={styles.panelHeader}>
                            <div>
                                <h2>Progress breakdown</h2>
                                <p>Every retention action tracked across your accounts.</p>
                            </div>

                            <div className={styles.pagination}>
                                {(["all", "success", "pending", "failed"] as OutcomeFilter[]).map((filter) => (
                                    <button
                                        key={filter}
                                        type="button"
                                        className={outcomeFilter === filter ? styles.currentPage : ""}
                                        onClick={() => setOutcomeFilter(filter)}
                                    >
                                        {outcomeLabel(filter)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {visibleRows.length ? (
                            <>
                                <div className={styles.progressTableWrap}>
                                    <table className={styles.progressTable}>
                                        <thead>
                                            <tr>
                                                <th>Account</th>
                                                <th>Reason</th>
                                                <th>Action</th>
                                                <th>Outcome</th>
                                                <th>MRR</th>
                                                <th>Risk</th>
                                                <th>Date</th>
                                            </tr>
                                        </thead>

                                        <tbody>
                                            {visibleRows.map((row, index) => (
                                                <tr
                                                    key={`${row.id}-${index}`}
                                                    onClick={() => goToAccount(row.customerId || row.accountId)}
                                                >
                                                    <td>
                                                        <strong>{row.account}</strong>
                                                        <span>{row.email || fallbackEmail(row.account)}</span>
                                                    </td>

                                                    <td>{cleanText(row.aiReason)}</td>
                                                    <td>{cleanText(row.action || kindLabel(row.kind))}</td>

                                                    <td>
                                                        <span
                                                            className={`${styles.outcomePill} ${row.outcome === "success"
                                                                ? styles.outcomeSuccess
                                                                : row.outcome === "failed"
                                                                    ? styles.outcomeFailed
                                                                    : styles.outcomePending
                                                                }`}
                                                        >
                                                            {outcomeLabel(row.outcome)}
                                                        </span>
                                                    </td>

                                                    <td>{formatMoney(row.mrrSavedMinor)}</td>
                                                    <td>{row.riskScore}%</td>
                                                    <td>{formatDate(row.date)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className={styles.tableFooter}>
                                    <span>
                                        Showing {(page - 1) * rowsPerPage + 1} to{" "}
                                        {Math.min(page * rowsPerPage, progressRows.length)} of{" "}
                                        {progressRows.length} results
                                    </span>

                                    <div className={styles.pagination}>
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
                                                    className={page === pageNumber ? styles.currentPage : ""}
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