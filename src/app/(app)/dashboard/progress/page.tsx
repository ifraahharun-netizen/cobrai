"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { mrrProtectedOption } from "@/components/charts/options";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase.client";
import { Download, PoundSterling, Search, Sparkles, TrendingUp, UserCheck, Zap } from "lucide-react";
import styles from "./actionImpact.module.css";
import { getUpgradeMessage } from "@/lib/permissions";

const EChart = dynamic(() => import("@/components/charts/EChart"), {
    ssr: false,
    loading: () => null,
});

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
function formatActivityWindow() {
    const end = new Date();
    const start = new Date();

    start.setMonth(start.getMonth() - 1);

    const formatter = new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });

    return `${formatter.format(start)} – ${formatter.format(end)}`;
}

function escapeCsvValue(value: string | number | null | undefined) {
    const safeValue = String(value ?? "");
    return `"${safeValue.replaceAll('"', '""')}"`;
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
    const [searchQuery, setSearchQuery] = useState("");

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

        const filteredByOutcome =
            outcomeFilter === "all"
                ? rows
                : rows.filter((row) => row.outcome === outcomeFilter);

        const query = searchQuery.trim().toLowerCase();

        if (!query) return filteredByOutcome;

        return filteredByOutcome.filter((row) =>
            [
                row.account,
                row.email,
                row.action,
                row.aiReason,
                row.aiRecommendation,
            ]
                .join(" ")
                .toLowerCase()
                .includes(query)
        );
    }, [data?.progressBreakdown, outcomeFilter, searchQuery]);

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

    // Impact story, all derived from the actions the API already returns.
    const impact = useMemo(() => {
        const rows = Array.isArray(data?.progressBreakdown) ? data.progressBreakdown : [];
        const kindOf = (row: ProgressRow): ProgressKind =>
            row.kind ?? (/payment|retry|invoice|billing/i.test(row.action) ? "retry_payment" : "email");

        const counts = { success: 0, pending: 0, failed: 0 };
        for (const row of rows) counts[row.outcome] += 1;

        const byKind = (["email", "retry_payment"] as ProgressKind[]).map((kind) => {
            const ofKind = rows.filter((row) => kindOf(row) === kind);
            const done = ofKind.filter((row) => row.outcome !== "pending");
            const won = ofKind.filter((row) => row.outcome === "success");
            return {
                kind,
                label: kind === "email" ? "Retention emails" : "Payment retries",
                total: ofKind.length,
                successRate: done.length ? Math.round((won.length / done.length) * 100) : 0,
                savedMinor: won.reduce((sum, row) => sum + Number(row.mrrSavedMinor || 0), 0),
            };
        });

        const wins = rows
            .filter((row) => row.outcome === "success")
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        let running = 0;
        const cumulative = wins.map((row) => {
            running += Number(row.mrrSavedMinor || 0);
            return { label: formatDate(row.date), value: running / 100 };
        });

        const topSaves = [...wins]
            .sort((a, b) => Number(b.mrrSavedMinor || 0) - Number(a.mrrSavedMinor || 0))
            .slice(0, 4);

        return { total: rows.length, counts, byKind, cumulative, topSaves, savedMinor: running };
    }, [data?.progressBreakdown]);

    const pct = (value: number) => (impact.total ? Math.round((value / impact.total) * 100) : 0);

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
    const activityWindow = formatActivityWindow();

    function downloadCsv() {
        const csvRows = progressRows.map((row) => ({
            Account: row.account,
            Email: row.email || fallbackEmail(),
            Reason: cleanText(row.aiReason),
            Action: row.action,
            Outcome: outcomeLabel(row.outcome),
            "Revenue protected": formatMoney(row.mrrSavedMinor, currency),
            "Risk score": row.riskScore,
            Date: formatDate(row.date),
        }));

        const headers = Object.keys(csvRows[0] || {
            Account: "",
            Email: "",
            Reason: "",
            Action: "",
            Outcome: "",
            "Revenue protected": "",
            "Risk score": "",
            Date: "",
        });

        const csvContent = [
            headers.map(escapeCsvValue).join(","),
            ...csvRows.map((row) =>
                headers.map((header) => escapeCsvValue(row[header as keyof typeof row])).join(",")
            ),
        ].join("\n");

        const blob = new Blob([csvContent], {
            type: "text/csv;charset=utf-8;",
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = `cobrai-retention-activity-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();

        URL.revokeObjectURL(url);
    }

    return (
        <main className={styles.page}>
            <div className={styles.content}>
                <header className={styles.header}>
                    <div>
                        <h1 className={styles.title}>Retention impact</h1>
                        <p className={styles.subtitle}>
                            Revenue saved, completed workflows and the accounts that still need attention.
                        </p>
                    </div>

                    <div className={styles.headerActions}>
                        <span className={styles.windowLabel}>{activityWindow}</span>
                        <button
                            type="button"
                            className={styles.consoleButton}
                            onClick={downloadCsv}
                            disabled={progressRows.length === 0}
                        >
                            <Download size={14} strokeWidth={1.8} aria-hidden="true" />
                            Download CSV
                        </button>
                    </div>
                </header>

                <section className={styles.kpiStrip} aria-label="Retention metrics">
                    {[
                        {
                            label: "MRR protected",
                            value: formatMoney(kpis?.mrrProtectedMinor, currency),
                            trend: mrrTrend,
                            Icon: PoundSterling,
                        },
                        {
                            label: "Accounts saved",
                            value: String(Number(kpis?.accountsSaved || 0)),
                            trend: accountsTrend,
                            Icon: UserCheck,
                        },
                        {
                            label: "Actions executed",
                            value: String(Number(kpis?.actionsExecuted || 0)),
                            trend: actionsTrend,
                            Icon: Zap,
                        },
                        {
                            label: "Success rate",
                            value: `${Number(kpis?.successRate || 0)}%`,
                            trend: successTrend,
                            Icon: TrendingUp,
                        },
                    ].map(({ label, value, trend, Icon }) => (
                        <div key={label} className={styles.kpiCell}>
                            <div className={styles.kpiTop}>
                                <span className={styles.kpiLabel}>{label}</span>
                                <span className={styles.kpiIcon}>
                                    <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
                                </span>
                            </div>
                            <div className={styles.kpiValue}>{value}</div>
                            <div className={`${styles.kpiSubline} ${trend.isPositive ? styles.trendUp : styles.trendDown}`}>
                                {trend.text}
                            </div>
                        </div>
                    ))}
                </section>

                {data?.aiInsight?.headline ? (
                    <section className={styles.insightBanner} aria-label="Impact summary">
                        <span className={styles.insightIcon}>
                            <Sparkles size={15} strokeWidth={1.8} aria-hidden="true" />
                        </span>
                        <div className={styles.insightBody}>
                            <strong>{data.aiInsight.headline}</strong>
                            {data.aiInsight.summary ? <p>{data.aiInsight.summary}</p> : null}
                        </div>
                        {data.aiInsight.nextBestAction ? (
                            <div className={styles.insightNext}>
                                <span>Next best action</span>
                                <p>{data.aiInsight.nextBestAction}</p>
                            </div>
                        ) : null}
                    </section>
                ) : null}

                <div className={styles.impactGrid}>
                    <section className={styles.card} aria-labelledby="saved-title">
                        <header className={styles.cardHead}>
                            <div>
                                <h2 id="saved-title" className={styles.cardTitle}>Revenue protected over time</h2>
                                <p className={styles.cardText}>
                                    Running total from the successful actions in the breakdown below.
                                </p>
                            </div>
                            <div className={styles.cardFigure}>
                                <strong>{formatMoney(impact.savedMinor, currency)}</strong>
                                <span>
                                    {impact.counts.success} tracked action{impact.counts.success === 1 ? "" : "s"}
                                </span>
                            </div>
                        </header>

                        <div className={styles.chartBox}>
                            {impact.cumulative.length > 1 ? (
                                <EChart
                                    key={impact.cumulative.map((point) => point.value).join("-")}
                                    option={mrrProtectedOption(
                                        impact.cumulative.map((point) => point.label),
                                        impact.cumulative.map((point) => point.value)
                                    )}
                                />
                            ) : (
                                <p className={styles.cardEmpty}>
                                    The chart fills in once a few actions succeed.
                                </p>
                            )}
                        </div>
                    </section>

                    <section className={styles.card} aria-labelledby="outcomes-title">
                        <header className={styles.cardHead}>
                            <div>
                                <h2 id="outcomes-title" className={styles.cardTitle}>Outcomes</h2>
                                <p className={styles.cardText}>
                                    {impact.total} tracked action{impact.total === 1 ? "" : "s"}.
                                </p>
                            </div>
                        </header>

                        <div className={styles.outcomeStats}>
                            {(["success", "pending", "failed"] as const).map((key) => (
                                <div key={key} className={styles.outcomeStat}>
                                    <span className={`${styles.dot} ${styles[`outcome_${key}`]}`}>{outcomeLabel(key)}</span>
                                    <strong>{impact.counts[key]}</strong>
                                    <small>{pct(impact.counts[key])}%</small>
                                </div>
                            ))}
                        </div>

                        <table className={styles.kindTable}>
                            <thead>
                                <tr>
                                    <th>By action</th>
                                    <th className={styles.num}>Runs</th>
                                    <th className={styles.num}>Success</th>
                                    <th className={styles.num}>Saved</th>
                                </tr>
                            </thead>
                            <tbody>
                                {impact.byKind.map((item) => (
                                    <tr key={item.kind}>
                                        <td>{item.label}</td>
                                        <td className={styles.num}>{item.total}</td>
                                        <td className={styles.num}>{item.total ? `${item.successRate}%` : "—"}</td>
                                        <td className={styles.num}>{formatMoney(item.savedMinor, currency)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>
                </div>

                <div className={styles.listGrid}>
                    <section className={styles.card} aria-labelledby="saves-title">
                        <header className={styles.cardHead}>
                            <div>
                                <h2 id="saves-title" className={styles.cardTitle}>Biggest saves</h2>
                                <p className={styles.cardText}>Accounts where an action protected the most revenue.</p>
                            </div>
                        </header>

                        {impact.topSaves.length ? (
                            <ul className={styles.list}>
                                {impact.topSaves.map((row) => (
                                    <li key={row.id}>
                                        <button
                                            type="button"
                                            className={styles.listRow}
                                            onClick={() => goToAccount(row.customerId || row.accountId)}
                                        >
                                            <span className={styles.avatar}>{row.account?.charAt(0)}</span>
                                            <span className={styles.listMain}>
                                                <strong>{row.account}</strong>
                                                <span>
                                                    {row.action} · {formatDate(row.date)}
                                                </span>
                                            </span>
                                            <span className={styles.saved}>+{formatMoney(row.mrrSavedMinor, currency)}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className={styles.cardEmpty}>No successful actions yet.</p>
                        )}
                    </section>

                    <section className={styles.card} aria-labelledby="next-title">
                        <header className={styles.cardHead}>
                            <div>
                                <h2 id="next-title" className={styles.cardTitle}>Needs attention next</h2>
                                <p className={styles.cardText}>Highest-risk accounts recommended for action.</p>
                            </div>
                        </header>

                        {priorityAccounts.length ? (
                            <ul className={styles.list}>
                                {priorityAccounts.map((item) => {
                                    const level =
                                        item.riskScore >= 80
                                            ? "critical"
                                            : item.riskScore >= 65
                                                ? "high"
                                                : item.riskScore >= 40
                                                    ? "medium"
                                                    : "low";

                                    return (
                                        <li key={item.id || item.account}>
                                            <button
                                                type="button"
                                                className={styles.listRow}
                                                onClick={() => goToAccount(item.id)}
                                            >
                                                <span className={styles.avatar}>{item.account?.charAt(0)}</span>
                                                <span className={styles.listMain}>
                                                    <strong>{item.account}</strong>
                                                    <span>{cleanText(item.aiAction || item.aiReason)}</span>
                                                </span>
                                                <span className={styles.listSide}>
                                                    <span className={`${styles.dot} ${styles[`risk_${level}`]}`}>
                                                        {Math.round(item.riskScore)}
                                                    </span>
                                                    <span className={styles.listMoney}>
                                                        {formatMoney(item.mrrMinor, currency)}
                                                    </span>
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <p className={styles.cardEmpty}>Nothing urgent right now.</p>
                        )}
                    </section>
                </div>

                <section className={styles.tableSection} aria-labelledby="breakdown-title">
                    <div className={styles.sectionHead}>
                        <h2 id="breakdown-title" className={styles.sectionTitle}>
                            Progress breakdown
                        </h2>
                        <p className={styles.sectionText}>Every retention action tracked across your accounts.</p>
                    </div>

                    <div className={styles.toolbar}>
                        <div className={styles.tabs} role="tablist" aria-label="Filter by outcome">
                            {(["all", "success", "pending", "failed"] as OutcomeFilter[]).map((filter) => (
                                <button
                                    key={filter}
                                    type="button"
                                    role="tab"
                                    aria-selected={outcomeFilter === filter}
                                    className={outcomeFilter === filter ? styles.tabActive : undefined}
                                    onClick={() => setOutcomeFilter(filter)}
                                >
                                    {outcomeLabel(filter)}
                                </button>
                            ))}
                        </div>

                        <label className={styles.search}>
                            <Search size={14} strokeWidth={1.8} aria-hidden="true" />
                            <input
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder="Search account"
                                aria-label="Search account"
                                type="search"
                            />
                        </label>
                    </div>

                    <div className={styles.tableWrap}>
                        {progressRows.length > 0 ? (
                            <>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Account</th>
                                            <th>Action</th>
                                            <th>Outcome</th>
                                            <th className={styles.num}>Revenue protected</th>
                                            <th>Risk</th>
                                            <th>Date</th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {visibleRows.map((row, index) => {
                                            const riskScore = Math.max(0, Math.min(100, Number(row.riskScore || 0)));
                                            const riskLevel =
                                                riskScore >= 80
                                                    ? "critical"
                                                    : riskScore >= 65
                                                        ? "high"
                                                        : riskScore >= 40
                                                            ? "medium"
                                                            : "low";

                                            return (
                                                <tr
                                                    key={`${row.id}-${index}`}
                                                    className={styles.clickRow}
                                                    onClick={() => goToAccount(row.customerId || row.accountId)}
                                                >
                                                    <td>
                                                        <div className={styles.account}>
                                                            <span className={styles.avatar}>{row.account?.charAt(0)}</span>
                                                            <div>
                                                                <div className={styles.companyName}>{row.account}</div>
                                                                <div className={styles.muted}>{row.email || fallbackEmail()}</div>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    <td>
                                                        <div className={styles.actionName}>{row.action}</div>
                                                        <div className={styles.actionReason}>
                                                            {cleanText(row.aiReason)}
                                                        </div>
                                                        {row.aiSignals?.length ? (
                                                            <div className={styles.signals}>
                                                                {row.aiSignals.map((signal) => signal.label).join(" · ")}
                                                            </div>
                                                        ) : null}
                                                    </td>

                                                    <td>
                                                        <span className={`${styles.dot} ${styles[`outcome_${row.outcome}`]}`}>
                                                            {outcomeLabel(row.outcome)}
                                                        </span>
                                                    </td>

                                                    <td className={styles.num}>{formatMoney(row.mrrSavedMinor, currency)}</td>

                                                    <td>
                                                        <span className={`${styles.dot} ${styles[`risk_${riskLevel}`]}`}>
                                                            {riskScore}
                                                        </span>
                                                    </td>

                                                    <td className={styles.mutedCell}>{formatDate(row.date)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>

                                <div className={styles.footer}>
                                    <span>
                                        Showing {(safePage - 1) * rowsPerPage + 1}–
                                        {Math.min(safePage * rowsPerPage, progressRows.length)} of {progressRows.length}
                                    </span>

                                    <div className={styles.pager}>
                                        <button
                                            type="button"
                                            className={styles.consoleButton}
                                            disabled={page === 1}
                                            onClick={() => setPage((current) => Math.max(1, current - 1))}
                                        >
                                            Previous
                                        </button>
                                        <span>
                                            Page {page} of {totalPages}
                                        </span>
                                        <button
                                            type="button"
                                            className={styles.consoleButton}
                                            disabled={page === totalPages}
                                            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                                        >
                                            Next
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className={styles.emptyState}>
                                <strong>
                                    {searchQuery.trim() ? "No matching accounts found" : "No retention actions yet"}
                                </strong>
                                <p>
                                    {searchQuery.trim()
                                        ? "Try another account name, email, reason or action."
                                        : "Actions you run from Cobrai will appear here with their outcome."}
                                </p>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </main>
    );
}