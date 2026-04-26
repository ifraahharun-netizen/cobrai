"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase.client";
import styles from "./plan.module.css";

type Period = "week" | "month" | "recent";
type Priority = "High" | "Medium" | "Low";

type RetentionAction = {
    id: string;
    customerName: string | null;
    title: string;
    reason: string;
    priority: Priority;
    type: string;
    status: string; // pending|executing|applied|failed
    appliedAt?: string | null;
};

type PlanRun = {
    id: string;
    status: string;
    mrrProtectedMinor: number;
    accountsRecovered: number;
    riskReducedPct: number;
    actionsCompleted: number;
    actionsTotal: number;
    protectedAccounts?: any | null; // Json? optional
};

type RetentionPlan = {
    id: string;
    createdAt: string;
    name: string;
    goal: string;
    steps: any; // Json array
    reasoning: string | null;
    suggested: any | null; // Json array
    status: string;
    actions: RetentionAction[];
    runs: PlanRun[];
};

function formatGBP(value: number) {
    const n = Number(value || 0);
    try {
        return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
    } catch {
        return `£${n.toFixed(0)}`;
    }
}

function formatGBPFromMinor(minor: number) {
    const pounds = Number(minor || 0) / 100;
    return formatGBP(pounds);
}

function niceDate(iso: string) {
    try {
        const d = new Date(iso);
        return d.toLocaleString(undefined, { month: "short", day: "2-digit", year: "numeric" });
    } catch {
        return iso;
    }
}

function pickPriorityClass(p: Priority) {
    if (p === "High") return `${styles.priority} ${styles.pHigh}`;
    if (p === "Medium") return `${styles.priority} ${styles.pMed}`;
    return `${styles.priority} ${styles.pLow}`;
}

function periodLabel(p: Period) {
    if (p === "week") return "this week";
    if (p === "month") return "this month";
    return "most recent";
}

function apiPeriod(p: Period) {
    // ✅ avoid changing your API files: map "recent" -> existing "90d"
    return p === "recent" ? "90d" : p;
}

export default function RetentionPlansPage() {
    const router = useRouter();
    const auth = getFirebaseAuth();

    const [toast, setToast] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [authed, setAuthed] = useState(false);

    const [period, setPeriod] = useState<Period>("month");

    const [health, setHealth] = useState<any | null>(null);
    const [plans, setPlans] = useState<RetentionPlan[]>([]);
    const [impact, setImpact] = useState<any | null>(null);

    const [showHistory, setShowHistory] = useState(false);
    const [showReasoning, setShowReasoning] = useState(false);

    async function withToken() {
        const user = auth.currentUser;
        if (!user) throw new Error("Not signed in");
        return user.getIdToken(true);
    }

    async function loadHealth(token: string) {
        const res = await fetch("/api/retention/health", {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data?.ok) setHealth(data.health);
    }

    async function loadPlans(token: string) {
        const res = await fetch("/api/retention/plans", {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data?.ok) setPlans(Array.isArray(data.plans) ? data.plans : []);
    }

    async function loadImpact(token: string, p: Period) {
        const res = await fetch(`/api/retention/impact?period=${apiPeriod(p)}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data?.ok) setImpact(data.impact);
    }

    async function loadAll(p: Period = period) {
        setLoading(true);
        try {
            const token = await withToken();
            await Promise.all([loadHealth(token), loadPlans(token), loadImpact(token, p)]);
        } catch (e: any) {
            setToast(e?.message || "Failed to load retention data");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (user) => {
            setAuthed(!!user);
            if (user) loadAll(period);
            else setLoading(false);
        });
        return () => unsub();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const activePlan = useMemo(() => plans[0] || null, [plans]);

    const activeActions = useMemo(() => {
        const list = activePlan?.actions || [];
        const order = { High: 0, Medium: 1, Low: 2 } as any;
        return [...list].sort((a, b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9)).slice(0, 8);
    }, [activePlan]);

    const lastRun = useMemo(() => {
        if (!activePlan?.runs?.length) return null;
        return activePlan.runs[0];
    }, [activePlan]);

    const savedBanner = useMemo(() => {
        const minor = Number(impact?.mrrProtectedMinor ?? 0);
        if (!Number.isFinite(minor) || minor <= 0) return null;

        const accounts: any[] = Array.isArray(impact?.accounts) ? impact.accounts : [];
        const topNames = accounts
            .filter((a) => a && (a.name || a.customerName))
            .slice(0, 3)
            .map((a) => String(a.name ?? a.customerName ?? ""))
            .filter(Boolean);

        return {
            amount: formatGBPFromMinor(minor),
            who: topNames.length ? topNames.join(", ") : null,
        };
    }, [impact]);

    const impactSummary = useMemo(() => {
        const mrrMinor = Number(impact?.mrrProtectedMinor ?? (lastRun?.mrrProtectedMinor ?? 0));
        const accounts = Array.isArray(impact?.accounts) ? impact.accounts : [];

        return {
            mrrProtected: mrrMinor > 0 ? formatGBPFromMinor(mrrMinor) : "—",
            runs: Number(impact?.runs ?? 0) || "—",
            protectedAccounts: accounts,
            note:
                mrrMinor > 0
                    ? `Estimated impact ${periodLabel(period)} based on completed runs.`
                    : "Run a plan and apply actions to start tracking saved MRR.",
            actionsCompleted:
                lastRun && Number.isFinite(lastRun.actionsCompleted) && Number.isFinite(lastRun.actionsTotal)
                    ? `${lastRun.actionsCompleted || 0}/${lastRun.actionsTotal || 0}`
                    : "—",
            accountsRecovered: lastRun ? lastRun.accountsRecovered ?? "—" : "—",
            riskReducedPct: lastRun
                ? `${(lastRun.riskReducedPct ?? 0) <= 0 ? "−" : "+"}${Math.abs(lastRun.riskReducedPct ?? 0)}%`
                : "—",
        };
    }, [impact, lastRun, period]);

    async function setPeriodAndReload(p: Period) {
        try {
            setPeriod(p);
            const token = await withToken();
            await loadImpact(token, p);
        } catch (e: any) {
            setToast(e?.message || "Failed to load impact");
        }
    }

    async function generateNewPlan() {
        try {
            const token = await withToken();
            setToast("Generating AI plan…");

            const res = await fetch("/api/retention/generate", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ tier: "starter" }),
            });

            const data = await res.json();
            if (!data?.ok) throw new Error(data?.error || "Generation failed");

            setToast("AI plan generated");
            setShowReasoning(false);
            await loadAll(period);
            router.refresh();
        } catch (e: any) {
            setToast(e?.message || "Generation failed");
        }
    }

    async function applyAction(actionId: string) {
        try {
            const token = await withToken();

            const res = await fetch("/api/retention/actions/apply", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ actionId }),
            });

            const data = await res.json();
            if (!data?.ok) throw new Error(data?.error || "Apply failed");

            setToast("Automation applied");
            await loadAll(period);
        } catch (e: any) {
            setToast(e?.message || "Apply failed");
        }
    }

    // ✅ NEW: Impact rows (real accounts if present, otherwise placeholders)
    const impactRows = useMemo(() => {
        const accounts: any[] = Array.isArray(impactSummary.protectedAccounts)
            ? impactSummary.protectedAccounts
            : [];

        // helper: count applied actions per customer (optional)
        const appliedByCustomer = new Map<string, number>();
        (activePlan?.actions || []).forEach((a) => {
            const name = String(a.customerName || "Customer");
            if (a.status === "applied") appliedByCustomer.set(name, (appliedByCustomer.get(name) || 0) + 1);
        });

        if (!accounts.length) return [];

        return accounts.slice(0, 10).map((a: any, i: number) => {
            const name = String(a?.name ?? a?.customerName ?? `Customer ${i + 1}`);
            const mrrMinor = Number(a?.mrrMinor ?? a?.mrr ?? 0);
            const tasksExecuted = Number(a?.tasksExecuted ?? appliedByCustomer.get(name) ?? 0);
            const riskReducedPct = Number(a?.riskReducedPct ?? 0);

            return {
                id: `${name}-${i}`,
                name,
                mrrSaved: mrrMinor > 0 ? formatGBPFromMinor(mrrMinor) : "—",
                tasksExecuted: tasksExecuted > 0 ? String(tasksExecuted) : "—",
                riskReduced: Number.isFinite(riskReducedPct) && riskReducedPct !== 0
                    ? `${riskReducedPct <= 0 ? "−" : "+"}${Math.abs(riskReducedPct)}%`
                    : "—",
            };
        });
    }, [impactSummary.protectedAccounts, activePlan]);


    // ✅ NEW: recommended automations based on health (works even with no plan yet)
    const recommendedAutomations = useMemo(() => {
        const atRisk = Number(health?.atRiskAccounts ?? 0) || 0;
        const signals = Number(health?.recentSignals ?? 0) || 0;
        const mrr = Number(health?.mrrAtRisk ?? 0) || 0;

        const items: Array<{ title: string; reason: string; priority: Priority; customer: string }> = [];

        if (signals >= 3) {
            items.push({
                title: "Trigger usage-drop outreach",
                reason: "Multiple risk signals detected — nudge customers before churn accelerates.",
                priority: "High",
                customer: "Top at-risk accounts",
            });
        } else if (signals >= 1) {
            items.push({
                title: "Investigate recent risk signals",
                reason: "New risk signals appeared — confirm the drivers (usage, billing, support).",
                priority: "Medium",
                customer: "Accounts with signals",
            });
        } else {
            items.push({
                title: "Run weekly retention check-in",
                reason: "No active signals — keep momentum with a lightweight health touchpoint.",
                priority: "Low",
                customer: "All active customers",
            });
        }

        if (atRisk > 0) {
            items.push({
                title: "Schedule success call for at-risk accounts",
                reason: `${atRisk} account(s) flagged — book a short call to unblock value.`,
                priority: "High",
                customer: "At-risk accounts",
            });
        }

        if (mrr > 0) {
            items.push({
                title: "Send renewal / value recap email",
                reason: "MRR is at risk — recap outcomes and reinforce ROI before renewal.",
                priority: "High",
                customer: "Renewing soon",
            });
        }

        // keep it tight
        return items.slice(0, 4);
    }, [health]);

    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.headerRow}>
                <div>
                    <h1 className={styles.title}>Retention</h1>
                    <p className={styles.subtitle}>Transparent plans, automations, and measurable revenue impact.</p>
                </div>

                <button className={styles.btnPrimary} type="button" onClick={generateNewPlan} disabled={!authed || loading}>
                    Generate AI plan
                </button>
            </div>

            {/* ROI Banner (unchanged) */}
            {savedBanner ? (
                <div
                    className={styles.aiCard}
                    style={{
                        marginTop: 12,
                        padding: 14,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                    }}
                >
                    <div>
                        <div className={styles.aiTitle}>MRR saved</div>
                        <div className={styles.aiSub}>
                            Cobrai saved you <b>{savedBanner.amount}</b> {periodLabel(period)}
                            {activePlan ? (
                                <>
                                    {" "}
                                    because of <b>{activePlan.name}</b>
                                </>
                            ) : null}
                            {savedBanner.who ? <> — mainly from {savedBanner.who}.</> : "."}
                        </div>
                    </div>

                    {/* (kept as-is in the banner) */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                            className={period === "week" ? styles.btnPrimary : styles.btnGhost}
                            type="button"
                            onClick={() => setPeriodAndReload("week")}
                        >
                            This week
                        </button>
                        <button
                            className={period === "month" ? styles.btnPrimary : styles.btnGhost}
                            type="button"
                            onClick={() => setPeriodAndReload("month")}
                        >
                            This month
                        </button>
                        <button
                            className={period === "recent" ? styles.btnPrimary : styles.btnGhost}
                            type="button"
                            onClick={() => setPeriodAndReload("recent")}
                        >
                            Most recent
                        </button>
                    </div>
                </div>
            ) : null}

            {/* Retention Health */}
            <div className={styles.aiCard} style={{ marginTop: 14 }}>
                <div className={styles.aiTop}>
                    <div>
                        <div className={styles.aiTitle}>Retention Health</div>
                        <div className={styles.aiSub}>What needs attention right now.</div>
                    </div>
                    <span className={styles.badgeAI}>AI</span>
                </div>

                <div className={styles.perfGrid}>
                    <div className={styles.perfItem}>
                        <div className={styles.perfLabel}>Accounts at risk</div>
                        <div className={styles.perfValue}>{health?.atRiskAccounts ?? "—"}</div>
                    </div>

                    <div className={styles.perfItem}>
                        <div className={styles.perfLabel}>MRR at risk</div>
                        <div className={styles.perfValue}>{health ? formatGBP(Number(health.mrrAtRisk || 0)) : "—"}</div>
                    </div>

                    <div className={styles.perfItem}>
                        <div className={styles.perfLabel}>Recent risk signals</div>
                        <div className={styles.perfValue}>{health?.recentSignals ?? "—"}</div>
                    </div>

                    <div className={styles.perfItem}>
                        <div className={styles.perfLabel}>Total customers</div>
                        <div className={styles.perfValue}>{health?.totalCustomers ?? "—"}</div>
                    </div>
                </div>
            </div>

            {/* Active AI Plan */}
            <div className={styles.aiCard} style={{ marginTop: 14 }}>
                <div className={styles.aiTop}>
                    <div>
                        <div className={styles.aiTitle}>Active AI Plan</div>
                        <div className={styles.aiSub}>
                            {activePlan ? `${activePlan.name} • ${niceDate(activePlan.createdAt)}` : "No plan yet. Generate one to get started."}
                        </div>
                    </div>
                    <span className={styles.badgeAI}>AI</span>
                </div>

                {!activePlan ? (
                    <div className={styles.perfNote}>Click “Generate AI plan” to create your first plan.</div>
                ) : (
                    <>
                        <div className={styles.perfNote} style={{ marginBottom: 10 }}>
                            <b>Goal:</b> {activePlan.goal}
                        </div>

                        <div className={styles.steps}>
                            {(Array.isArray(activePlan.steps) ? activePlan.steps : []).map((s: any, idx: number) => (
                                <div key={idx} className={styles.stepRow}>
                                    <span className={styles.stepBadge}>{idx + 1}</span>
                                    <div className={styles.stepText}>{String(s)}</div>
                                </div>
                            ))}
                        </div>

                        <div className={styles.aiActions} style={{ marginTop: 12 }}>
                            <button className={styles.btnGhost} type="button" onClick={() => setShowReasoning((v) => !v)}>
                                {showReasoning ? "Hide AI reasoning" : "AI reasoning"}
                            </button>

                            <button className={styles.btnGhost} type="button" onClick={() => setToast("Run Plan will create PlanRun next (we’ll wire it).")}>
                                Run plan
                            </button>
                        </div>

                        {showReasoning ? (
                            <div className={styles.perfNote} style={{ marginTop: 10 }}>
                                {activePlan.reasoning || "—"}
                                {Array.isArray(activePlan.suggested) && activePlan.suggested.length ? (
                                    <div style={{ marginTop: 10 }}>
                                        <b>Suggested plans:</b>
                                        <div style={{ marginTop: 6 }}>
                                            {activePlan.suggested.map((sp: any, i: number) => (
                                                <div key={i} style={{ marginBottom: 6 }}>
                                                    <b>{String(sp?.name ?? "Plan")}</b> — {String(sp?.why ?? "")}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </>
                )}
            </div>

            {/* AI Actions (Automations) — tighter + recommendations based on health */}
            <div className={styles.aiCard} style={{ marginTop: 14, paddingBottom: 12 }}>
                <div className={styles.aiTop}>
                    <div>
                        <div className={styles.aiTitle}>AI Automations</div>
                        <div className={styles.aiSub}>
                            {health
                                ? `Recommended based on ${health?.recentSignals ?? 0} risk signal(s) and what needs attention.`
                                : "Recommended tasks and emails. Apply to execute and log activity."}
                        </div>
                    </div>
                    <span className={styles.badgeAI}>AI</span>
                </div>

                {/* If you have a plan, show plan actions (existing behavior). If not, show recommendations from health. */}
                {activePlan && activeActions.length > 0 ? (
                    <div className={styles.aiList}>
                        {activeActions.map((a) => {
                            const applied = a.status === "applied";
                            return (
                                <div key={a.id} className={styles.aiItem}>
                                    <div className={styles.aiLeft}>
                                        <div className={styles.aiMetaRow}>
                                            <span className={pickPriorityClass(a.priority)}>{a.priority}</span>
                                            <span className={styles.customerPill}>{a.customerName || "Customer"}</span>
                                        </div>

                                        <div className={styles.aiItemTitle}>{a.title}</div>
                                        <div className={styles.aiItemReason}>{a.reason}</div>
                                    </div>

                                    <div className={styles.aiRight}>
                                        <button
                                            className={applied ? styles.btnDone : styles.btnPrimary}
                                            type="button"
                                            onClick={() => applyAction(a.id)}
                                            disabled={applied}
                                            title={applied ? "Already applied" : "Apply automation"}
                                        >
                                            {applied ? "Applied" : "Apply"}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className={styles.aiList}>
                        {recommendedAutomations.map((r, i) => (
                            <div key={i} className={styles.aiItem}>
                                <div className={styles.aiLeft}>
                                    <div className={styles.aiMetaRow}>
                                        <span className={pickPriorityClass(r.priority)}>{r.priority}</span>
                                        <span className={styles.customerPill}>{r.customer}</span>
                                    </div>

                                    <div className={styles.aiItemTitle}>{r.title}</div>
                                    <div className={styles.aiItemReason}>{r.reason}</div>
                                </div>

                                <div className={styles.aiRight}>
                                    <button
                                        className={styles.btnPrimary}
                                        type="button"
                                        onClick={() => setToast("Connect integrations + generate a plan to apply automations.")}
                                    >
                                        Apply
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className={styles.aiActions} style={{ marginTop: 10 }}>
                    <button className={styles.btnGhost} type="button" onClick={() => loadAll(period)} disabled={loading}>
                        Refresh
                    </button>

                    <button className={styles.btnGhost} type="button" onClick={() => setShowHistory((v) => !v)}>
                        {showHistory ? "Hide history" : "View history"}
                    </button>
                </div>
            </div>

            {/* Impact — now a customer list + filter inside this card */}
            <div className={styles.aiCard} style={{ marginTop: 14 }}>
                <div className={styles.aiTop}>
                    <div>
                        <div className={styles.aiTitle}>Impact</div>
                        <div className={styles.aiSub}>Transparent tracking for {periodLabel(period)}.</div>
                    </div>
                    <span className={styles.badgeAI}>AI</span>
                </div>

                {/* NEW: filter lives here */}
                <div className={styles.aiActions} style={{ marginTop: 10 }}>
                    <button
                        className={period === "week" ? styles.btnPrimary : styles.btnGhost}
                        type="button"
                        onClick={() => setPeriodAndReload("week")}
                    >
                        This week
                    </button>
                    <button
                        className={period === "month" ? styles.btnPrimary : styles.btnGhost}
                        type="button"
                        onClick={() => setPeriodAndReload("month")}
                    >
                        This month
                    </button>
                    <button
                        className={period === "recent" ? styles.btnPrimary : styles.btnGhost}
                        type="button"
                        onClick={() => setPeriodAndReload("recent")}
                    >
                        Most recent
                    </button>
                </div>

                {/* NEW: list format */}
                <div style={{ marginTop: 10 }}>
                    <div
                        className={styles.aiItem}
                        style={{
                            paddingTop: 10,
                            paddingBottom: 10,
                            opacity: 0.85,
                        }}
                    >
                        <div className={styles.aiLeft} style={{ width: "100%" }}>
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "1.6fr 0.9fr 0.9fr 0.9fr",
                                    gap: 10,
                                    fontSize: 12,
                                }}
                            >
                                <div style={{ fontWeight: 600 }}>Customer</div>
                                <div style={{ fontWeight: 600 }}>MRR saved</div>
                                <div style={{ fontWeight: 600 }}>Tasks executed</div>
                                <div style={{ fontWeight: 600 }}>Risk reduced</div>
                            </div>
                        </div>
                    </div>

                    <div className={styles.aiList} style={{ marginTop: 8 }}>
                        {impactRows.map((r) => (
                            <div key={r.id} className={styles.aiItem} style={{ paddingTop: 10, paddingBottom: 10 }}>
                                <div className={styles.aiLeft} style={{ width: "100%" }}>
                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: "1.6fr 0.9fr 0.9fr 0.9fr",
                                            gap: 10,
                                            alignItems: "center",
                                        }}
                                    >
                                        <div className={styles.aiItemTitle} style={{ margin: 0 }}>
                                            {r.name}
                                        </div>
                                        <div className={styles.aiItemReason} style={{ margin: 0 }}>
                                            {r.mrrSaved}
                                        </div>
                                        <div className={styles.aiItemReason} style={{ margin: 0 }}>
                                            {r.tasksExecuted}
                                        </div>
                                        <div className={styles.aiItemReason} style={{ margin: 0 }}>
                                            {r.riskReduced}
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.aiRight}>
                                    <span className={styles.badgeAI}>AI</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className={styles.perfNote} style={{ marginTop: 10 }}>
                    {impactSummary.note}
                </div>
            </div>

            {/* History (collapsible) */}
            {showHistory ? (
                <div className={styles.aiCard} style={{ marginTop: 14 }}>
                    <div className={styles.aiTop}>
                        <div>
                            <div className={styles.aiTitle}>Plan History</div>
                            <div className={styles.aiSub}>Previous plans (most recent first).</div>
                        </div>
                        <span className={styles.badgeAI}>AI</span>
                    </div>

                    {plans.length === 0 ? (
                        <div className={styles.perfNote}>No history yet.</div>
                    ) : (
                        <div className={styles.aiList}>
                            {plans.slice(0, 10).map((p) => (
                                <div key={p.id} className={styles.aiItem}>
                                    <div className={styles.aiLeft}>
                                        <div className={styles.aiItemTitle}>{p.name}</div>
                                        <div className={styles.aiItemReason}>
                                            {niceDate(p.createdAt)} • {p.actions?.length || 0} actions
                                        </div>
                                    </div>

                                    <div className={styles.aiRight}>
                                        <button
                                            className={styles.btnGhost}
                                            type="button"
                                            onClick={() => {
                                                setToast("Active plan is always the most recent plan.");
                                                setShowHistory(false);
                                            }}
                                        >
                                            OK
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : null}

            {toast ? (
                <div className={styles.toast} role="status" aria-live="polite">
                    {toast}
                    <button className={styles.toastClose} type="button" onClick={() => setToast(null)}>
                        ✕
                    </button>
                </div>
            ) : null}
        </div>
    );
}

