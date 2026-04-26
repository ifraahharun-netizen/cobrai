"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase.client";
import styles from "../analytics/analytics.module.css";

type DashboardSummary = {
    ok: boolean;
    error?: string;
    demoMode?: boolean;
    history?: Array<{
        id: string;
        type: string;
        label: string;
        company: string | null;
        occurredAt: string;
        valueMinor?: number | null;
    }>;
};

type FilterRange = "today" | "month" | "threeMonths";
type AuthStatus = "checking" | "authed" | "guest";

async function authedGet(url: string, user: User) {
    const token = await user.getIdToken(true);

    const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText} ${text}`);
    }

    return res.json();
}

function formatGBPFromMinor(maybeMinor: number | null | undefined) {
    const minor = Number(maybeMinor || 0);
    const pounds = minor / 100;

    try {
        return new Intl.NumberFormat("en-GB", {
            style: "currency",
            currency: "GBP",
        }).format(pounds);
    } catch {
        return `£${pounds.toFixed(2)}`;
    }
}

function niceWhen(iso?: string | null) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";

    return d.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function isSameDay(a: Date, b: Date) {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function isWithinLastMonths(date: Date, months: number) {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setMonth(now.getMonth() - months);
    return date >= cutoff;
}

function getEventMeta(type: string) {
    const t = (type || "").toLowerCase();

    if (t.includes("failed")) {
        return { showAttentionIcon: true };
    }

    return { showAttentionIcon: false };
}

function getEventActions(type: string) {
    const t = (type || "").toLowerCase();

    if (t.includes("failed")) {
        return ["Retry payment", "Send recovery email"];
    }

    if (t.includes("trial")) {
        return ["Convert to paid", "Send onboarding email"];
    }

    if (t.includes("react")) {
        return ["View account", "Send welcome back email"];
    }

    if (t.includes("subscription")) {
        return ["View customer", "Send welcome email"];
    }

    return ["View details"];
}

export default function HistoryPage() {
    const router = useRouter();

    const [status, setStatus] = useState<AuthStatus>("checking");
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [filterRange, setFilterRange] = useState<FilterRange>("today");

    useEffect(() => {
        const auth = getFirebaseAuth();

        const unsub = onAuthStateChanged(auth, (u) => {
            if (u) {
                setUser(u);
                setStatus("authed");
            } else {
                setUser(null);
                setStatus("guest");
            }
        });

        return () => unsub();
    }, []);

    useEffect(() => {
        if (status === "guest") {
            router.replace("/");
        }
    }, [status, router]);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            if (!user) return;

            try {
                setLoading(true);
                setError(null);

                const res = (await authedGet("/api/dashboard/summary", user)) as DashboardSummary;

                if (!res.ok) {
                    throw new Error(res.error || "Failed to load history");
                }

                if (!cancelled) {
                    setSummary(res);
                }
            } catch (e: any) {
                if (!cancelled) {
                    setError(e?.message || "Failed to load history");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        if (status === "authed" && user) {
            load();
        }

        return () => {
            cancelled = true;
        };
    }, [status, user]);

    const filteredHistory = useMemo(() => {
        const items = summary?.history ?? [];
        const now = new Date();

        return items.filter((item) => {
            const d = new Date(item.occurredAt);
            if (Number.isNaN(d.getTime())) return false;

            if (filterRange === "today") return isSameDay(d, now);
            if (filterRange === "month") return isWithinLastMonths(d, 1);
            if (filterRange === "threeMonths") return isWithinLastMonths(d, 3);

            return true;
        });
    }, [summary, filterRange]);

    if (status === "checking" || loading) {
        return (
            <div className={styles.page}>
                <div className={styles.centerState}>
                    <div className={styles.loader} />
                    <div>Loading history…</div>
                </div>
            </div>
        );
    }

    if (status === "guest") return null;

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>History</h1>
                    <p className={styles.subtitle}>All recent subscription and customer events.</p>
                </div>

                <div className={styles.chartActions}>
                    <button
                        type="button"
                        className={styles.linkBtn}
                        onClick={() => router.push("/dashboard/analytics")}
                    >
                        Back to Analytics
                    </button>
                </div>
            </div>

            {error ? (
                <div className={styles.errorBox}>{error}</div>
            ) : (
                <div className={styles.chartCardXL}>
                    <div className={styles.chartHeader}>
                        <div>
                            <div className={styles.chartTitle}>Full history</div>
                            <div className={styles.chartMeta}>
                                {summary?.demoMode ? "Demo preview • " : ""}
                                Filter and prioritise customer activity
                            </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {[
                                { key: "today", label: "Today" },
                                { key: "month", label: "Last month" },
                                { key: "threeMonths", label: "Last three months" },
                            ].map((option) => {
                                const active = filterRange === option.key;

                                return (
                                    <button
                                        key={option.key}
                                        type="button"
                                        onClick={() => setFilterRange(option.key as FilterRange)}
                                        style={{
                                            border: active ? "1px solid #c7d2fe" : "1px solid #e2e8f0",
                                            background: active ? "#eef2ff" : "#ffffff",
                                            color: active ? "#3730a3" : "#475569",
                                            borderRadius: 999,
                                            padding: "10px 14px",
                                            fontSize: 14,
                                            fontWeight: 600,
                                            cursor: "pointer",
                                        }}
                                    >
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className={styles.cardBodyXL}>
                        <div style={{ display: "grid", gap: 12 }}>
                            {filteredHistory.map((item) => {
                                const meta = getEventMeta(item.type);
                                const actions = getEventActions(item.type);

                                return (
                                    <div
                                        key={item.id}
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 14,
                                            padding: "18px",
                                            borderRadius: 18,
                                            border: "1px solid #eef2f7",
                                            background: "#ffffff",
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "flex-start",
                                                gap: 16,
                                                flexWrap: "wrap",
                                            }}
                                        >
                                            <div style={{ display: "flex", gap: 12, flex: 1 }}>
                                                <div style={{ minWidth: 0 }}>
                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: 10,
                                                            flexWrap: "wrap",
                                                        }}
                                                    >
                                                        {meta.showAttentionIcon && (
                                                            <span style={{ color: "#dc2626", fontSize: 14 }}>
                                                                ⚠
                                                            </span>
                                                        )}

                                                        <div style={{ fontWeight: 700, fontSize: 16 }}>
                                                            {item.label}
                                                        </div>
                                                    </div>

                                                    <div style={{ color: "#64748b", fontSize: 14, marginTop: 3 }}>
                                                        {item.company || "Unknown customer"} •{" "}
                                                        {niceWhen(item.occurredAt)}
                                                    </div>
                                                </div>
                                            </div>

                                            <div style={{ fontWeight: 700 }}>
                                                {typeof item.valueMinor === "number" && item.valueMinor > 0
                                                    ? formatGBPFromMinor(item.valueMinor)
                                                    : ""}
                                            </div>
                                        </div>

                                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                            {actions.map((action) => (
                                                <button
                                                    key={action}
                                                    type="button"
                                                    style={{
                                                        border: "1px solid #e2e8f0",
                                                        background: "#f8fafc",
                                                        borderRadius: 12,
                                                        padding: "10px 14px",
                                                        fontWeight: 600,
                                                        cursor: "pointer",
                                                    }}
                                                >
                                                    {action}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}

                            {!filteredHistory.length && (
                                <div className={styles.emptyPanel}>
                                    <div className={styles.emptyTitle}>No history for this filter</div>
                                    <div className={styles.emptyText}>
                                        Try switching the date range to view more events.
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}