"use client";

import { useEffect, useState } from "react";
import { MessageCircleQuestion, RefreshCw, Sparkles } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase.client";
import type { ChartNote, MetricKey, MetricsRead, MetricsSnapshot } from "@/lib/ai/claudeMetricsRead";
import styles from "./metrics.module.css";

type ReadResponse = {
    metrics: MetricsSnapshot;
    read: MetricsRead;
    analysedAt: string;
    /** The period selected on the page when Claude read it. */
    period?: string;
    /** Who the read belongs to, so another account in this browser never sees it. */
    uid?: string;
};

const READ_CACHE_KEY = "cobrai:claude-metrics";

const METRIC_LABEL: Record<MetricKey, string> = {
    totalMrr: "Total MRR",
    mrrAtRisk: "Revenue at risk",
    churnRate: "Churn rate",
    mrrProtected: "MRR protected",
    activeUsers: "Active users",
};

const HEALTH_LABEL: Record<MetricsRead["health"], string> = {
    strong: "Strong",
    steady: "Steady",
    watch: "Watch",
    concerning: "Concerning",
};

/** Claude's interpretation of the workspace metrics, shown on the Metrics page. */
export default function ClaudeMetricsRead({
    snapshot,
    onAsk,
    onNotes,
    periodLabel,
}: {
    snapshot?: MetricsSnapshot;
    /** Receives Claude's notes for the MRR and churn charts. */
    onNotes?: (notes: ChartNote[]) => void;
    /** The page's selected period, e.g. "Last 12 months". */
    periodLabel?: string;
    /** Opens Ask Claude with a follow-up question. */
    onAsk?: (question: string) => void;
}) {
    const [uid, setUid] = useState<string | null>(() => getFirebaseAuth().currentUser?.uid ?? null);
    const [stored, setAnalysis] = useState<ReadResponse | null>(() => {
        if (typeof window === "undefined") return null;
        try {
            const cached = window.localStorage.getItem(READ_CACHE_KEY);
            return cached ? (JSON.parse(cached) as ReadResponse) : null;
        } catch {
            return null;
        }
    });
    const [analysing, setAnalysing] = useState(false);
    const [error, setError] = useState("");

    async function analyse() {
        const user = getFirebaseAuth().currentUser;
        if (!user || analysing) return;

        setAnalysing(true);
        setError("");

        try {
            const token = await user.getIdToken();
            const res = await fetch("/api/dashboard/ai/metrics-read", {
                method: "POST",
                cache: "no-store",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                // Send the figures this page shows, so Claude reads the same numbers.
                body: JSON.stringify(snapshot ? { snapshot } : {}),
            });
            const data = (await res.json().catch(() => null)) as (ReadResponse & { error?: string }) | null;
            if (!res.ok || !data?.read) throw new Error(data?.error || "Claude could not analyse your metrics right now.");
            const result: ReadResponse = { ...data, period: periodLabel, uid: user.uid };
            setAnalysis(result);
            try {
                window.localStorage.setItem(READ_CACHE_KEY, JSON.stringify(result));
            } catch {
                // Not critical.
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Claude could not analyse your metrics right now.");
        } finally {
            setAnalysing(false);
        }
    }

    // Track the signed-in account; a read saved by another account is ignored.
    useEffect(() => onAuthStateChanged(getFirebaseAuth(), (user) => setUid(user?.uid ?? null)), []);
    const analysis = stored && uid && stored.uid === uid ? stored : null;

    const read = analysis?.read ?? null;

    // Hand the chart notes to the page (older cached reads have none).
    useEffect(() => {
        onNotes?.(analysis?.read?.chartNotes ?? []);
    }, [analysis, onNotes]);

    const stale = Boolean(read && analysis?.period && periodLabel && analysis.period !== periodLabel);
    const topFindings = read ? read.findings.slice(0, 3) : [];

    return (
        <section className={`${styles.readCard} ${styles.readBar}`} aria-labelledby="claude-read-title">
            <div className={styles.readBarRow}>
                <span className={styles.claudeTag}>
                    <Sparkles size={11} strokeWidth={2} aria-hidden="true" />
                    Claude&apos;s summary
                </span>

                {analysing ? (
                    <p id="claude-read-title" className={styles.readBarText}>
                        Reading your metrics…
                    </p>
                ) : read ? (
                    <p id="claude-read-title" className={styles.readBarHeadlineText}>
                        {read.headline}
                    </p>
                ) : (
                    <p id="claude-read-title" className={styles.readBarText}>
                        Get a plain-English summary of what changed and what to do next.
                    </p>
                )}

                <div className={styles.readBarActions}>
                    {read && !analysing ? (
                        <span className={`${styles.health} ${styles[`health_${read.health}`]}`}>
                            {HEALTH_LABEL[read.health]}
                        </span>
                    ) : null}
                    {onAsk && read && !analysing ? (
                        <button
                            type="button"
                            className={styles.button}
                            onClick={() => onAsk(`${read.headline} Explain what's behind this and what we should do.`)}
                        >
                            <MessageCircleQuestion size={14} strokeWidth={1.8} aria-hidden="true" />
                            Ask
                        </button>
                    ) : null}
                    <button
                        type="button"
                        className={read ? styles.button : styles.buttonPrimary}
                        onClick={() => void analyse()}
                        disabled={analysing}
                        title={read ? "Run Claude's summary again on the latest numbers" : undefined}
                    >
                        {read ? (
                            <RefreshCw size={13} strokeWidth={1.8} aria-hidden="true" />
                        ) : (
                            <Sparkles size={14} strokeWidth={1.8} aria-hidden="true" />
                        )}
                        {analysing ? "Analysing…" : read ? "Refresh" : "Summarise"}
                    </button>
                </div>
            </div>

            {error ? <div className={styles.error} role="alert">{error}</div> : null}

            {read && !analysing && topFindings.length ? (
                <ul className={styles.readPoints}>
                    {topFindings.map((finding) => (
                        <li key={finding.metric}>
                            <span className={`${styles.readPointMetric} ${styles[`sentiment_${finding.sentiment}`]}`}>
                                {METRIC_LABEL[finding.metric]}
                            </span>
                            <span className={styles.readPointText}>
                                <strong>{finding.title}</strong>
                                <span>{finding.action}</span>
                            </span>
                            {onAsk ? (
                                <button
                                    type="button"
                                    className={styles.readPointAsk}
                                    onClick={() =>
                                        onAsk(
                                            `Tell me more about "${finding.title}" (${METRIC_LABEL[finding.metric]}). ${finding.observation} What's behind it, which accounts are involved, and how do I "${finding.action}"?`
                                        )
                                    }
                                    aria-label={`Ask Claude about ${finding.title}`}
                                >
                                    Ask
                                </button>
                            ) : null}
                        </li>
                    ))}
                </ul>
            ) : null}

            {read && !analysing ? (
                <p className={styles.readFoot}>
                    {analysis
                        ? `Analysed ${new Date(analysis.analysedAt).toLocaleString("en-GB", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                          })} · `
                        : ""}
                    {stale && analysis?.period ? `Based on ${analysis.period.toLowerCase()}. Refresh for ${periodLabel?.toLowerCase()}. · ` : ""}
                    Claude can make mistakes. Check before acting.
                </p>
            ) : null}
        </section>
    );
}
