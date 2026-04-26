"use client";

import { useMemo, useState } from "react";

type Driver = {
    title: string;
    severity: "high" | "medium" | "low";
    why: string;
    action: string;
};

export default function ChurnDriversPage() {
    const [toast, setToast] = useState<string | null>(null);

    const drivers: Driver[] = useMemo(
        () => [
            {
                title: "Usage drop (7–14 days)",
                severity: "high",
                why: "Logins and key events are down vs previous period.",
                action: "Trigger re-activation email + book success call.",
            },
            {
                title: "Unresolved support tickets",
                severity: "medium",
                why: "Tickets remain open beyond SLA threshold.",
                action: "Escalate to support lead + send update to customer.",
            },
            {
                title: "Billing friction",
                severity: "high",
                why: "Recent failed payment / card expiring signal.",
                action: "Send payment update reminder + offer assistance.",
            },
            {
                title: "Low feature adoption",
                severity: "low",
                why: "Core features not used in first 14 days.",
                action: "Send quick-win tutorial + in-app checklist.",
            },
        ],
        []
    );

    const badge = (s: Driver["severity"]) => {
        if (s === "high") return <span className="badge danger">High</span>;
        if (s === "medium") return <span className="badge warn">Medium</span>;
        return <span className="badge ok">Low</span>;
    };

    return (
        <div style={{ padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Churn Drivers</h1>
                    <p className="muted" style={{ marginTop: 6 }}>
                        What’s driving churn risk across your workspace — with recommended actions.
                    </p>
                </div>
                <button className="btnPrimary" onClick={() => setToast("Refreshing drivers…")}>
                    Refresh
                </button>
            </div>

            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
                {drivers.map((d) => (
                    <div key={d.title} className="card" style={{ borderRadius: 16, padding: 14 }}>
                        <div className="cardTop" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <h4 style={{ margin: 0 }}>{d.title}</h4>
                            {badge(d.severity)}
                        </div>
                        <p className="muted" style={{ marginTop: 8 }}>{d.why}</p>
                        <div style={{ marginTop: 10 }}>
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>Recommended</div>
                            <div>{d.action}</div>
                        </div>
                        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                            <button className="btnPrimary" onClick={() => setToast(`Playbook generated: ${d.title}`)}>
                                Generate playbook
                            </button>
                            <button className="btnGhost" onClick={() => setToast("Opening details…")}>
                                View details
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {toast && <div className="toast">{toast}</div>}
        </div>
    );
}
