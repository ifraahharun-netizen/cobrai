"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase/client";

import styles from "./PlanWizard.module.css";
import type { GeneratedPlan, RiskAccount, Tier } from "@/types";
import { generateRetentionPlan } from "@/lib/retention/generateRetentionPlan";

type Step = 1 | 2 | 3 | 4 | 5;
type PlanScopeKey = "highRisk" | "mediumRisk" | "newCustomers" | "billingOnly";

type ExecutionOptions = {
    createTasks: boolean;
    syncCrm: boolean; // Pro+
    sendOutreach: boolean; // Pro+
};

const SCOPES: Array<{ key: PlanScopeKey; label: string; hint: string }> = [
    { key: "highRisk", label: "High-risk customers only", hint: "Focus on accounts most likely to churn soon" },
    { key: "mediumRisk", label: "Medium risk customers", hint: "Prevent risk from escalating" },
    { key: "newCustomers", label: "New customers (first 30 days)", hint: "Reduce early churn and onboarding drop-off" },
    { key: "billingOnly", label: "Billing issues only", hint: "Payment failures, dunning, expiring cards" },
];

const DEFAULT_EXECUTION: ExecutionOptions = {
    createTasks: true,
    syncCrm: false,
    sendOutreach: false,
};

function fmtGBP(n: number) {
    return `£${n.toLocaleString()}`;
}

export default function PlanWizard({ tier, accounts }: { tier: Tier; accounts: RiskAccount[] }) {
    const router = useRouter();
    const isStarter = tier === "starter";

    const [step, setStep] = useState<Step>(1);

    const [selectedScopes, setSelectedScopes] = useState<Record<PlanScopeKey, boolean>>({
        highRisk: true,
        mediumRisk: false,
        newCustomers: false,
        billingOnly: false,
    });

    const scopeCount = useMemo(() => Object.values(selectedScopes).filter(Boolean).length, [selectedScopes]);

    const [analysisProgress, setAnalysisProgress] = useState(0);
    const [plan, setPlan] = useState<GeneratedPlan | null>(null);

    const [execution, setExecution] = useState<ExecutionOptions>(DEFAULT_EXECUTION);

    // Starter enforcement
    useEffect(() => {
        if (!isStarter) return;
        setExecution((p) => ({ ...p, syncCrm: false, sendOutreach: false }));
    }, [isStarter]);

    const titleByStep: Record<Step, string> = {
        1: "Generate Retention Plan",
        2: "Analysing Signals",
        3: "Retention Plan Preview",
        4: "Apply Plan",
        5: "Done",
    };

    const percentByStep: Record<Step, number> = { 1: 20, 2: 40, 3: 60, 4: 80, 5: 100 };

    useEffect(() => {
        if (step !== 2) return;

        setAnalysisProgress(0);
        setPlan(null);

        const start = Date.now();
        const durationMs = 900;

        const timer = setInterval(() => {
            const t = Date.now() - start;
            const p = Math.min(100, Math.round((t / durationMs) * 100));
            setAnalysisProgress(p);

            if (p >= 100) {
                clearInterval(timer);
                const generated = generateRetentionPlan(accounts, selectedScopes);
                setPlan(generated);
                setTimeout(() => setStep(3), 150);
            }
        }, 40);

        return () => clearInterval(timer);
    }, [step, accounts, selectedScopes]);

    function next() {
        setStep((s) => (s < 5 ? ((s + 1) as Step) : s));
    }
    function back() {
        setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
    }

    async function applyPlan() {
        const user = auth.currentUser;

        if (!user) {
            alert("You must be logged in");
            return;
        }

        const token = await user.getIdToken();

        await fetch("/api/retention-plan", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ tier }),
        });

        setStep(5);
    }

    return (
        <div className={styles.wrapper}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>{titleByStep[step]}</h1>
                    <p className={styles.subtitle}>Based on usage, billing & behaviour signals.</p>
                </div>
                <Link className={styles.back} href="/dashboard">
                    ← Back to Dashboard
                </Link>
            </div>

            <div className={styles.card + " " + styles.progressWrap}>
                <div className={styles.stepTop}>
                    <span>Step {step} of 5</span>
                    <span>{step === 2 ? `${analysisProgress}%` : `${percentByStep[step]}%`}</span>
                </div>
                <div className={styles.barTrack}>
                    <div
                        className={styles.barFill}
                        style={{ width: step === 2 ? `${analysisProgress}%` : `${percentByStep[step]}%` }}
                    />
                </div>
            </div>

            {step === 1 && (
                <div className={styles.card}>
                    <h2 className={styles.h2}>Choose scope</h2>
                    <p className={styles.desc}>Keep it simple — Cobrai will estimate impact automatically.</p>

                    <div className={styles.grid}>
                        {SCOPES.map((s) => (
                            <label key={s.key} className={styles.row}>
                                <input
                                    className={styles.chk}
                                    type="checkbox"
                                    checked={!!selectedScopes[s.key]}
                                    onChange={(e) => setSelectedScopes((p) => ({ ...p, [s.key]: e.target.checked }))}
                                />
                                <div>
                                    <p className={styles.rowTitle}>{s.label}</p>
                                    <p className={styles.rowHint}>{s.hint}</p>
                                </div>
                            </label>
                        ))}
                    </div>

                    <div className={styles.footer}>
                        <div className={styles.small}>
                            Selected: <strong>{scopeCount}</strong>
                        </div>
                        <button className={styles.btnPrimary} disabled={scopeCount === 0} onClick={() => setStep(2)} type="button">
                            Continue →
                        </button>
                    </div>
                </div>
            )}

            {step === 2 && (
                <div className={styles.card}>
                    <h2 className={styles.h2}>Analysing churn signals…</h2>
                    <p className={styles.desc}>Reading risk reasons + MRR from your Accounts at Risk list.</p>

                    <div className={styles.footer}>
                        <button className={styles.btnGhost} onClick={() => setStep(1)} type="button">
                            Back
                        </button>
                    </div>
                </div>
            )}

            {step === 3 && plan && (
                <div className={styles.card}>
                    <h2 className={styles.h2}>Summary</h2>
                    <p className={styles.desc}>
                        High risk: <strong>{plan.summary.highRiskCount}</strong> • MRR at risk:{" "}
                        <strong>{fmtGBP(plan.summary.mrrAtRisk)}</strong>
                    </p>

                    <div className={styles.hr} />

                    {plan.actions.map((a) => (
                        <div key={a.key} className={styles.card} style={{ marginTop: 10 }}>
                            <h2 className={styles.h2}>
                                {a.title} <span className={styles.pill}>Priority {a.priority}</span>
                            </h2>
                            <p className={styles.desc}>{a.why}</p>
                            <ul style={{ margin: 0, paddingLeft: 18 }}>
                                {a.recommended.map((r, i) => (
                                    <li key={i} style={{ fontSize: 13, color: "rgba(15,23,42,.85)", marginBottom: 6 }}>
                                        {r}
                                    </li>
                                ))}
                            </ul>

                            <div className={styles.footer}>
                                <button
                                    className={styles.btnGhost}
                                    type="button"
                                    onClick={() => router.push(`/dashboard/accounts-at-risk?driver=${a.key}`)}
                                >
                                    View customers
                                </button>
                                <button className={styles.btnPrimary} type="button" onClick={() => setStep(4)}>
                                    Apply plan →
                                </button>
                            </div>
                        </div>
                    ))}

                    <div className={styles.footer}>
                        <button className={styles.btnGhost} onClick={back} type="button">
                            Back
                        </button>
                        <button className={styles.btnPrimary} onClick={next} type="button">
                            Continue →
                        </button>
                    </div>
                </div>
            )}

            {step === 4 && (
                <div className={styles.card}>
                    <h2 className={styles.h2}>Execution</h2>
                    <p className={styles.desc}>Choose how Cobrai should apply this plan.</p>

                    <div className={styles.optionRow}>
                        <div>
                            <div className={styles.optionText}>Create tasks in Cobrai</div>
                            <div className={styles.optionDesc}>Turn actions into a checklist for your team.</div>
                        </div>
                        <input
                            className={styles.chk}
                            type="checkbox"
                            checked={execution.createTasks}
                            onChange={(e) => setExecution((p) => ({ ...p, createTasks: e.target.checked }))}
                        />
                    </div>

                    <div className={styles.optionRow + " " + (isStarter ? styles.locked : "")} style={{ marginTop: 10 }}>
                        <div>
                            <div className={styles.optionText}>Sync to CRM {isStarter ? "(Pro)" : ""}</div>
                            <div className={styles.optionDesc}>Push tasks/flags to HubSpot/Salesforce.</div>
                        </div>
                        <input
                            className={styles.chk}
                            type="checkbox"
                            checked={execution.syncCrm}
                            disabled={isStarter}
                            onChange={(e) => setExecution((p) => ({ ...p, syncCrm: e.target.checked }))}
                        />
                    </div>

                    <div className={styles.optionRow + " " + (isStarter ? styles.locked : "")} style={{ marginTop: 10 }}>
                        <div>
                            <div className={styles.optionText}>Send outreach emails {isStarter ? "(Pro)" : ""}</div>
                            <div className={styles.optionDesc}>Generate outreach drafts and queue campaigns.</div>
                        </div>
                        <input
                            className={styles.chk}
                            type="checkbox"
                            checked={execution.sendOutreach}
                            disabled={isStarter}
                            onChange={(e) => setExecution((p) => ({ ...p, sendOutreach: e.target.checked }))}
                        />
                    </div>

                    {isStarter && (
                        <div className={styles.notice} style={{ marginTop: 12 }}>
                            Pro features are locked on Starter. Upgrade to enable CRM sync and outreach.
                        </div>
                    )}

                    <div className={styles.footer}>
                        <button className={styles.btnGhost} onClick={back} type="button">
                            Back
                        </button>
                        <button className={styles.btnPrimary} onClick={applyPlan} type="button">
                            Apply plan
                        </button>
                    </div>
                </div>
            )}

            {step === 5 && (
                <div className={styles.card} style={{ textAlign: "center", padding: 26 }}>
                    <h2 className={styles.h2} style={{ fontSize: 18 }}>
                        Retention plan activated
                    </h2>
                    <p className={styles.desc}>Cobrai will monitor results and update risk scores automatically.</p>

                    <div className={styles.footer} style={{ justifyContent: "center" }}>
                        <Link className={styles.btnGhost as any} href="/dashboard">
                            Back to Dashboard
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}