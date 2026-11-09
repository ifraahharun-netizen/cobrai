"use client";

import { useEffect, useState } from "react";
import { ChevronDown, MessageCircleQuestion, Sparkles } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase.client";
import type { ChartNote, MetricKey, MetricsRead, MetricsSnapshot } from "@/lib/ai/claudeMetricsRead";
import styles from "./metrics.module.css";

type ReadResponse = {
    metrics: MetricsSnapshot;
    read: MetricsRead;
    analysedAt: string;
    /** The period selected on the page when Claude read it. */
    period?: string;
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
    const [analysis, setAnalysis] = useState<ReadResponse | null>(() => {
        if (typeof window === "undefined") return null;
        try {
            const cached = window.localStorage.getItem(READ_CACHE_KEY);
            return cached ? (JSON.parse(cached) as ReadResponse) : null;
        } catch {
            return null;
        }
    });
    const [analysing, setAnalysing] = useState(false);
    const [expanded, setExpanded] = useState(false);
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
            const result: ReadResponse = { ...data, period: periodLabel };
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

    const read = analysis?.read ?? null;

    // Hand the chart notes to the page (older cached reads have none).
    useEffect(() => {
        onNotes?.(analysis?.read?.chartNotes ?? []);
    }, [analysis, onNotes]);

    return (
        <section
            className={`${styles.readCard} ${styles.readBar} ${expanded && read ? styles.readBarOpen : ""}`}
            aria-labelledby="claude-read-title"
        >
            {/* One-line summary; expands to the full read. */}
            <div className={styles.readBarRow}>
                <span className={styles.claudeTag}>
                    <Sparkles size={11} strokeWidth={2} aria-hidden="true" />
                    Claude&apos;s read
                </span>

                {analysing ? (
                    <p id="claude-read-title" className={styles.readBarText}>
                        Claude is reading your metrics…
                    </p>
                ) : read ? (
                    <button
                        type="button"
                        id="claude-read-title"
                        className={styles.readBarHeadline}
                        onClick={() => setExpanded((open) => !open)}
                        aria-expanded={expanded}
                    >
                        {read.headline}
                    </button>
                ) : (
                    <p id="claude-read-title" className={styles.readBarText}>
                        Let Claude explain what&apos;s changing in your MRR, churn and revenue at risk, and what to do next.
                    </p>
                )}

                <div className={styles.readBarActions}>
                    {read && !analysing && analysis?.period ? (
                        <span
                            className={`${styles.readPeriod} ${periodLabel && analysis.period !== periodLabel ? styles.readPeriodStale : ""}`}
                            title={
                                periodLabel && analysis.period !== periodLabel
                                    ? `Claude read ${analysis.period.toLowerCase()}. Re-analyse for ${periodLabel.toLowerCase()}.`
                                    : undefined
                            }
                        >
                            {analysis.period}
                        </span>
                    ) : null}
                    {read && !analysing ? (
                        <span className={`${styles.health} ${styles[`health_${read.health}`]}`}>
                            {HEALTH_LABEL[read.health]}
                        </span>
                    ) : null}
                    {read && !analysing ? (
                        <button
                            type="button"
                            className={styles.button}
                            onClick={() => setExpanded((open) => !open)}
                            aria-expanded={expanded}
                        >
                            {expanded ? "Collapse" : "Expand"}
                            <ChevronDown
                                size={13}
                                strokeWidth={1.8}
                                aria-hidden="true"
                                style={{ transform: expanded ? "rotate(180deg)" : undefined }}
                            />
                        </button>
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
                    >
                        <Sparkles size={14} strokeWidth={1.8} aria-hidden="true" />
                        {analysing ? "Analysing…" : read ? "Re-analyse" : "Analyse with Claude"}
                    </button>
                </div>
            </div>

            {error ? <div className={styles.error} role="alert">{error}</div> : null}

            {expanded && read && !analysing ? (
                <div className={styles.readBarBody}>
                    <p className={styles.readSummary}>{read.summary}</p>

                    <div className={styles.findings}>
                        {read.findings.map((finding) => (
                            <article key={finding.metric} className={styles.finding}>
                                <span className={`${styles.findingMetric} ${styles[`sentiment_${finding.sentiment}`]}`}>
                                    {METRIC_LABEL[finding.metric]}
                                </span>
                                <h3>{finding.title}</h3>
                                <p>{finding.observation}</p>
                                <p className={styles.findingWhy}>{finding.whyItMatters}</p>
                                <p className={styles.findingAction}>→ {finding.action}</p>
                                {onAsk ? (
                                    <button
                                        type="button"
                                        className={styles.askLink}
                                        onClick={() =>
                                            onAsk(
                                                `Tell me more about "${finding.title}" (${METRIC_LABEL[finding.metric]}). What's behind it, which accounts are involved, and how do I "${finding.action}"?`
                                            )
                                        }
                                    >
                                        <MessageCircleQuestion size={13} strokeWidth={1.8} aria-hidden="true" />
                                        Ask Claude about this
                                    </button>
                                ) : null}
                            </article>
                        ))}
                    </div>

                    {read.watchNext.length ? (
                        <div className={styles.watch}>
                            <span>Watch next</span>
                            <ul>
                                {read.watchNext.map((item) =>
                                    onAsk ? (
                                        <li key={item}>
                                            <button
                                                type="button"
                                                className={styles.watchButton}
                                                onClick={() => onAsk(`How should I keep an eye on this: ${item}?`)}
                                                title="Ask Claude about this"
                                            >
                                                {item}
                                            </button>
                                        </li>
                                    ) : (
                                        <li key={item}>{item}</li>
                                    )
                                )}
                            </ul>
                        </div>
                    ) : null}

                    <p className={styles.disclaimer}>
                        {analysis
                            ? `Analysed ${new Date(analysis.analysedAt).toLocaleString("en-GB", {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                              })}${analysis.metrics.source === "demo" ? " · demo data" : ""} · `
                            : ""}
                        Claude can make mistakes. Check before acting.
                    </p>
                </div>
            ) : null}
        </section>
    );
}
