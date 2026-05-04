"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type DemoView = "overview" | "customers" | "account" | "retention" | "analytics";
type Outcome = "Success" | "Pending" | "Failed";

const customers = [
    {
        id: "cedarworks",
        name: "CedarWorks",
        email: "support@cedarworks.io",
        risk: 91,
        mrr: 21900,
        lastActive: "12 Apr 2026",
        reason: "Billing issue + reduced activity",
        action: "Confirm billing contact and resolve payment today.",
        plan: "Pro",
        status: "Invoice open",
        createdAt: "08 Nov 2025",
        nextBilling: "15 May 2026",
        health: 33,
    },
    {
        id: "kitelabs",
        name: "Kite Labs",
        email: "finance@kitelabs.io",
        risk: 87,
        mrr: 12900,
        lastActive: "04 Apr 2026",
        reason: "No activity in 25 days",
        action: "Send a personal check-in and offer a quick walkthrough.",
        plan: "Pro",
        status: "Payment failed",
        createdAt: "18 Jan 2026",
        nextBilling: "10 May 2026",
        health: 38,
    },
    {
        id: "novapay",
        name: "NovaPay",
        email: "ops@novapay.io",
        risk: 76,
        mrr: 8400,
        lastActive: "18 Apr 2026",
        reason: "Usage dropped",
        action: "Send a value recap and suggest a success call.",
        plan: "Starter",
        status: "Active",
        createdAt: "22 Oct 2025",
        nextBilling: "20 May 2026",
        health: 52,
    },
    {
        id: "brightdesk",
        name: "BrightDesk",
        email: "hello@brightdesk.co",
        risk: 69,
        mrr: 7200,
        lastActive: "20 Apr 2026",
        reason: "Reduced product activity",
        action: "Highlight unused features and offer setup support.",
        plan: "Starter",
        status: "Active",
        createdAt: "04 Feb 2026",
        nextBilling: "25 May 2026",
        health: 58,
    },
    {
        id: "orbitcrm",
        name: "Orbit CRM",
        email: "team@orbitcrm.com",
        risk: 63,
        mrr: 6600,
        lastActive: "21 Apr 2026",
        reason: "Support issue unresolved",
        action: "Follow up on the open support request.",
        plan: "Starter",
        status: "Support open",
        createdAt: "12 Dec 2025",
        nextBilling: "16 May 2026",
        health: 61,
    },
];

const progressRows = [
    {
        account: "Acme Groups",
        reason: "Payment failed",
        action: "Billing recovery email",
        outcome: "Success" as Outcome,
        mrr: 200,
    },
    {
        account: "Northstar AI",
        reason: "Low engagement",
        action: "Re-engagement email",
        outcome: "Pending" as Outcome,
        mrr: 120,
    },
    {
        account: "Peak Ops",
        reason: "Card payment failed",
        action: "Retry payment scheduled",
        outcome: "Pending" as Outcome,
        mrr: 160,
    },
    {
        account: "CedarWorks",
        reason: "Billing contact missing",
        action: "Manual outreach",
        outcome: "Failed" as Outcome,
        mrr: 219,
    },
];

const drivers = [
    {
        label: "Upgrade",
        account: "BrightOps",
        note: "Annual plan upgrade",
        value: "+£133",
        tone: "good",
    },
    {
        label: "New subscriber",
        account: "KiteCRM",
        note: "New subscription started",
        value: "+£124",
        tone: "good",
    },
    {
        label: "Churn risk",
        account: "CedarWorks",
        note: "Usage dropped sharply in 14 days",
        value: "£219 at risk",
        tone: "bad",
    },
];

function money(value: number) {
    return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: 0,
    }).format(value);
}

export default function DemoPage() {
    const [view, setView] = useState<DemoView>("overview");
    const [selectedCustomerId, setSelectedCustomerId] = useState("cedarworks");

    const selectedCustomer = useMemo(
        () =>
            customers.find((customer) => customer.id === selectedCustomerId) ||
            customers[0],
        [selectedCustomerId]
    );

    const revenueAtRisk = customers.reduce(
        (sum, customer) => sum + customer.mrr,
        0
    );

    const criticalCount = customers.filter((customer) => customer.risk >= 85).length;

    function openCustomer(id: string) {
        setSelectedCustomerId(id);
        setView("account");
    }

    return (
        <main style={styles.page}>
            <aside style={styles.sidebar}>
                <div>
                    <div style={styles.brand}>
                        <span style={styles.wordmark}>COBRAI</span>
                    </div>

                    <p style={styles.demoPill}>Public product demo</p>

                    <nav style={styles.nav}>
                        <button
                            style={navStyle(view === "overview")}
                            onClick={() => setView("overview")}
                        >
                            Overview
                        </button>

                        <button
                            style={navStyle(view === "customers")}
                            onClick={() => setView("customers")}
                        >
                            Customers
                        </button>

                        <button
                            style={navStyle(view === "retention")}
                            onClick={() => setView("retention")}
                        >
                            Retention Impact
                        </button>

                        <button
                            style={navStyle(view === "analytics")}
                            onClick={() => setView("analytics")}
                        >
                            Analytics
                        </button>
                    </nav>
                </div>

                <div style={styles.sidebarCta}>
                    <p style={styles.sidebarTitle}>Ready to use real data?</p>
                    <p style={styles.sidebarText}>
                        Connect Stripe or HubSpot after signup and Cobrai will replace
                        this demo with your live workspace.
                    </p>

                    <Link href="/signup" style={styles.sidebarButton}>
                        Start free trial
                    </Link>
                </div>
            </aside>

            <section style={styles.content}>
                <header style={styles.topbar}>
                    <div>
                        <p style={styles.eyebrow}>Demo workspace</p>

                        <h1 style={styles.title}>
                            {view === "overview" && "Retention overview"}
                            {view === "customers" && "Customers"}
                            {view === "account" && selectedCustomer.name}
                            {view === "retention" && "Retention activity"}
                            {view === "analytics" && "Analytics"}
                        </h1>

                        <p style={styles.subtitle}>
                            {view === "overview" &&
                                "A realistic preview of how Cobrai finds revenue risk and recommends action."}
                            {view === "customers" &&
                                "All accounts, ranked by churn risk and revenue impact."}
                            {view === "account" &&
                                `${selectedCustomer.email} · Account profile and next action.`}
                            {view === "retention" &&
                                "Revenue saved, completed workflows, and accounts needing attention."}
                            {view === "analytics" &&
                                "MRR, churn risk trends, and AI insight drivers."}
                        </p>
                    </div>

                    <div style={styles.topActions}>
                        <Link href="/" style={styles.secondaryBtn}>
                            Back home
                        </Link>

                        <Link href="/signup" style={styles.primaryBtn}>
                            Start free trial
                        </Link>
                    </div>
                </header>

                {view === "overview" && (
                    <>
                        <div style={styles.kpiGrid}>
                            <Kpi
                                title="Revenue at risk"
                                value={money(revenueAtRisk)}
                                detail="+12% vs previous month"
                            />
                            <Kpi
                                title="Critical accounts"
                                value={String(criticalCount)}
                                detail="Need action this week"
                            />
                            <Kpi
                                title="MRR protected"
                                value="£3,180"
                                detail="From successful workflows"
                            />
                            <Kpi
                                title="AI actions"
                                value="24"
                                detail="Recommended this period"
                            />
                        </div>

                        <div style={styles.insightHero}>
                            <div>
                                <p style={styles.cardLabel}>AI insight</p>
                                <h2 style={styles.bigInsight}>
                                    £34,800 revenue is currently exposed.
                                </h2>
                                <p style={styles.bodyText}>
                                    Cobrai found 5 accounts with high churn risk. The biggest
                                    risk is failed payments, low engagement, and unresolved
                                    support issues across high-MRR accounts.
                                </p>
                            </div>

                            <button
                                style={styles.darkButton}
                                onClick={() => setView("customers")}
                            >
                                Review risky customers
                            </button>
                        </div>

                        <div style={styles.twoCol}>
                            <Card
                                title="Next priority accounts"
                                label="AI-ranked by risk and revenue"
                            >
                                <div style={styles.list}>
                                    {customers.slice(0, 3).map((customer) => (
                                        <button
                                            key={customer.id}
                                            style={styles.customerRow}
                                            onClick={() => openCustomer(customer.id)}
                                        >
                                            <div>
                                                <strong>{customer.name}</strong>
                                                <p style={styles.mutedText}>{customer.reason}</p>
                                            </div>

                                            <div style={styles.rowMeta}>
                                                <span style={riskStyle(customer.risk)}>
                                                    {customer.risk}
                                                </span>
                                                <span>{money(customer.mrr)}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </Card>

                            <Card title="Recommended action" label="What Cobrai would do next">
                                <h3 style={styles.recommendTitle}>
                                    Recover failed payments first
                                </h3>
                                <p style={styles.bodyText}>
                                    Retry failed payments for CedarWorks and Kite Labs, then
                                    send reactivation emails to accounts inactive for more than
                                    20 days.
                                </p>

                                <button
                                    style={styles.lightButton}
                                    onClick={() => setView("retention")}
                                >
                                    View retention progress
                                </button>
                            </Card>
                        </div>
                    </>
                )}

                {view === "customers" && (
                    <>
                        <div style={styles.kpiGrid}>
                            <Kpi
                                title="Revenue at risk"
                                value={money(revenueAtRisk)}
                                detail="Across active risk accounts"
                            />
                            <Kpi title="Churn exposure" value="78%" detail="Weighted by MRR" />
                            <Kpi title="Total customers" value="12" detail="Demo workspace" />
                            <Kpi
                                title="Customer health index"
                                value="22"
                                detail="Needs attention"
                            />
                        </div>

                        <div style={styles.card}>
                            <div style={styles.cardHeader}>
                                <div>
                                    <p style={styles.cardLabel}>Customers</p>
                                    <h2 style={styles.cardTitle}>Accounts ranked by risk</h2>
                                </div>

                                <span style={styles.badge}>Critical: {criticalCount}</span>
                            </div>

                            <div style={styles.table}>
                                <div style={styles.tableHead}>
                                    <span>Account</span>
                                    <span>Risk</span>
                                    <span>Reason</span>
                                    <span>MRR</span>
                                    <span>Last active</span>
                                    <span>Action</span>
                                </div>

                                {customers.map((customer) => (
                                    <div key={customer.id} style={styles.tableRow}>
                                        <div>
                                            <strong>{customer.name}</strong>
                                            <p style={styles.mutedText}>{customer.email}</p>
                                        </div>

                                        <span style={riskStyle(customer.risk)}>
                                            {customer.risk}
                                        </span>

                                        <span>{customer.action}</span>
                                        <strong>{money(customer.mrr)}</strong>
                                        <span>{customer.lastActive}</span>

                                        <button
                                            style={styles.smallButton}
                                            onClick={() => openCustomer(customer.id)}
                                        >
                                            View
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                {view === "account" && (
                    <>
                        <button style={styles.backButton} onClick={() => setView("customers")}>
                            ← Back
                        </button>

                        <div style={styles.accountHero}>
                            <div>
                                <p style={styles.cardLabel}>Account overview</p>
                                <h2 style={styles.accountName}>{selectedCustomer.name}</h2>
                                <p style={styles.bodyText}>{selectedCustomer.email}</p>
                            </div>

                            <span style={riskLargeStyle(selectedCustomer.risk)}>
                                High risk · {selectedCustomer.risk}/100
                            </span>
                        </div>

                        <div style={styles.accountGrid}>
                            <Kpi
                                title="Plan"
                                value={selectedCustomer.plan}
                                detail="Current subscription"
                            />
                            <Kpi
                                title="MRR"
                                value={money(selectedCustomer.mrr)}
                                detail="Monthly recurring revenue"
                            />
                            <Kpi
                                title="Created at"
                                value={selectedCustomer.createdAt}
                                detail="Customer start date"
                            />
                            <Kpi
                                title="Next billing"
                                value={selectedCustomer.nextBilling}
                                detail={selectedCustomer.status}
                            />
                        </div>

                        <div style={styles.twoCol}>
                            <Card title="Activity timeline" label="Payments, emails, and risk events">
                                <div style={styles.timelineItem}>
                                    <strong>Billing issue detected</strong>
                                    <p style={styles.mutedText}>
                                        Invoice opened with high-MRR exposure · 02 May 2026
                                    </p>
                                </div>

                                <div style={styles.timelineItem}>
                                    <strong>Customer health reviewed by Cobrai</strong>
                                    <p style={styles.mutedText}>
                                        Health score dropped to {selectedCustomer.health}/100 ·
                                        02 May 2026
                                    </p>
                                </div>

                                <div style={styles.timelineItem}>
                                    <strong>Reactivation email recommended</strong>
                                    <p style={styles.mutedText}>
                                        Suggested because activity dropped and churn risk
                                        increased.
                                    </p>
                                </div>
                            </Card>

                            <div style={styles.stack}>
                                <Card title="AI insight" label="Recommended action">
                                    <h3 style={styles.recommendTitle}>
                                        {selectedCustomer.action}
                                    </h3>

                                    <p style={styles.bodyText}>
                                        {selectedCustomer.name} has a churn risk of{" "}
                                        {selectedCustomer.risk}/100, a health score of{" "}
                                        {selectedCustomer.health}, and{" "}
                                        {money(selectedCustomer.mrr)} MRR at risk.
                                    </p>

                                    <button style={styles.darkButton}>
                                        Send suggested outreach
                                    </button>
                                </Card>

                                <Card title="Private notes" label="Team context">
                                    <textarea
                                        placeholder="Write a note for this account..."
                                        style={styles.textarea}
                                    />

                                    <button style={styles.smallDarkButton}>Add note</button>
                                </Card>
                            </div>
                        </div>
                    </>
                )}

                {view === "retention" && (
                    <>
                        <div style={styles.kpiGrid}>
                            <Kpi
                                title="MRR protected"
                                value="£1,250"
                                detail="12% ↑ vs £1,116 previous month"
                            />
                            <Kpi
                                title="Accounts saved"
                                value="8"
                                detail="10% ↑ vs 7 previous month"
                            />
                            <Kpi
                                title="Actions executed"
                                value="14"
                                detail="8% ↑ vs 13 previous month"
                            />
                            <Kpi
                                title="Success rate"
                                value="57%"
                                detail="5% ↑ vs 52% previous month"
                            />
                        </div>

                        <div style={styles.insightHero}>
                            <div>
                                <p style={styles.cardLabel}>AI insight</p>
                                <h2 style={styles.bigInsight}>
                                    £1,250 protected this month.
                                </h2>
                                <p style={styles.bodyText}>
                                    Success rate is 57%, with 5 pending and 2 failed actions
                                    still needing attention. Prioritise CedarWorks and Kite Labs
                                    before starting new outreach.
                                </p>
                            </div>

                            <span style={styles.successBadge}>High confidence</span>
                        </div>

                        <div style={styles.twoColWide}>
                            <Card
                                title="Next priority accounts"
                                label="AI-prioritised accounts that need attention first"
                            >
                                <div style={styles.list}>
                                    {customers.slice(0, 3).map((customer) => (
                                        <button
                                            key={customer.id}
                                            style={styles.customerRow}
                                            onClick={() => openCustomer(customer.id)}
                                        >
                                            <div>
                                                <strong>{customer.name}</strong>
                                                <p style={styles.mutedText}>
                                                    AI action: {customer.action}
                                                </p>
                                            </div>

                                            <div style={styles.rowMeta}>
                                                <span>{customer.risk}% risk</span>
                                                <strong>{money(customer.mrr)}</strong>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </Card>

                            <Card
                                title="Progress breakdown"
                                label="Every retention action tracked across accounts"
                            >
                                <div style={styles.miniTable}>
                                    {progressRows.map((row) => (
                                        <div
                                            key={`${row.account}-${row.action}`}
                                            style={styles.progressRow}
                                        >
                                            <div>
                                                <strong>{row.account}</strong>
                                                <p style={styles.mutedText}>{row.reason}</p>
                                            </div>

                                            <span>{row.action}</span>
                                            <span style={outcomeStyle(row.outcome)}>
                                                {row.outcome}
                                            </span>
                                            <strong>£{row.mrr}</strong>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </div>
                    </>
                )}

                {view === "analytics" && (
                    <>
                        <div style={styles.kpiGrid}>
                            <Kpi
                                title="Total MRR"
                                value="£64,616"
                                detail="From connected billing data"
                            />
                            <Kpi
                                title="MRR protected"
                                value="£438"
                                detail="↑ 11.1% vs last month"
                            />
                            <Kpi
                                title="MRR at risk"
                                value="£6,970"
                                detail="↑ 6.4% vs last month"
                            />
                            <Kpi
                                title="Churn proxy"
                                value="4.6%"
                                detail="Projected from risk signals"
                            />
                        </div>

                        <div style={styles.analyticsGrid}>
                            <Card title="MRR trend" label="Last 12 months · Revenue over time">
                                <BarChart
                                    variant="mrr"
                                    values={[63, 63, 62, 62, 61, 63, 63, 64, 25, 24, 23, 3]}
                                />
                            </Card>

                            <Card
                                title="Churn trend"
                                label="Last 12 months · Customer churn over time"
                            >
                                <BarChart
                                    variant="churn"
                                    values={[12, 18, 24, 32, 36, 42]}
                                />
                            </Card>

                            <Card title="MRR insights" label="What changed revenue this month">
                                {drivers.map((driver) => (
                                    <div key={driver.account} style={styles.driverRow}>
                                        <div>
                                            <span
                                                style={
                                                    driver.tone === "good"
                                                        ? styles.goodTag
                                                        : styles.badTag
                                                }
                                            >
                                                {driver.label}
                                            </span>

                                            <strong>{driver.account}</strong>
                                            <p style={styles.mutedText}>{driver.note}</p>
                                        </div>

                                        <strong>{driver.value}</strong>
                                    </div>
                                ))}
                            </Card>

                            <Card title="AI forecast" label="Where to act next">
                                <h3 style={styles.recommendTitle}>
                                    MRR could improve by £6,970.
                                </h3>

                                <p style={styles.bodyText}>
                                    Cobrai found two high-risk accounts worth £34.8K annually.
                                    Retaining them would materially improve next month’s MRR
                                    forecast.
                                </p>

                                <button
                                    style={styles.lightButton}
                                    onClick={() => setView("customers")}
                                >
                                    View high-risk accounts
                                </button>
                            </Card>
                        </div>
                    </>
                )}
            </section>
        </main>
    );
}

function Kpi({
    title,
    value,
    detail,
}: {
    title: string;
    value: string;
    detail: string;
}) {
    return (
        <div style={styles.kpiCard}>
            <p style={styles.kpiTitle}>{title}</p>
            <h3 style={styles.kpiValue}>{value}</h3>
            <p style={styles.kpiDetail}>{detail}</p>
        </div>
    );
}

function Card({
    title,
    label,
    children,
}: {
    title: string;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div style={styles.card}>
            <p style={styles.cardLabel}>{label}</p>
            <h2 style={styles.cardTitle}>{title}</h2>
            <div style={{ marginTop: 14 }}>{children}</div>
        </div>
    );
}

function BarChart({
    values,
    variant = "mrr",
}: {
    values: number[];
    variant?: "mrr" | "churn";
}) {
    return (
        <div style={styles.chart}>
            {values.map((value, index) => (
                <div key={index} style={styles.barWrap}>
                    <div
                        style={{
                            ...styles.bar,
                            height: `${Math.max(value, 8)}%`,
                            background:
                                variant === "mrr"
                                    ? "linear-gradient(180deg, #2563eb, #93c5fd)"
                                    : "linear-gradient(180deg, #ef4444, #fecaca)",
                        }}
                    />
                </div>
            ))}
        </div>
    );
}

function navStyle(active: boolean): React.CSSProperties {
    return {
        border: 0,
        width: "100%",
        textAlign: "left",
        padding: "11px 12px",
        borderRadius: 12,
        background: active ? "#111" : "transparent",
        color: active ? "#fff" : "#555",
        cursor: "pointer",
        fontSize: 14,
        fontWeight: active ? 650 : 500,
    };
}

function riskStyle(risk: number): React.CSSProperties {
    return {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 34,
        height: 28,
        borderRadius: 999,
        background: risk >= 85 ? "#111" : risk >= 70 ? "#f1efe8" : "#f3f3f3",
        color: risk >= 85 ? "#fff" : "#111",
        fontSize: 12,
        fontWeight: 700,
    };
}

function riskLargeStyle(risk: number): React.CSSProperties {
    return {
        padding: "10px 14px",
        borderRadius: 999,
        background: risk >= 85 ? "#111" : "#f3f3f3",
        color: risk >= 85 ? "#fff" : "#111",
        fontSize: 13,
        fontWeight: 700,
    };
}

function outcomeStyle(outcome: Outcome): React.CSSProperties {
    return {
        padding: "7px 10px",
        borderRadius: 999,
        fontSize: 12,
        background:
            outcome === "Success"
                ? "#edf7ee"
                : outcome === "Pending"
                    ? "#fff6d9"
                    : "#fdecec",
        color:
            outcome === "Success"
                ? "#166534"
                : outcome === "Pending"
                    ? "#854d0e"
                    : "#991b1b",
        fontWeight: 650,
    };
}

const styles: Record<string, React.CSSProperties> = {
    page: {
        minHeight: "100vh",
        background: "#ffffffff",
        color: "#111",
        display: "grid",
        gridTemplateColumns: "260px minmax(0, 1fr)",
        fontFamily:
            'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },

    sidebar: {
        minHeight: "100vh",
        background: "#fff",
        borderRight: "1px solid #e8e8e8",
        padding: 22,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
    },

    brand: {
        display: "flex",
        alignItems: "center",
        marginBottom: 18,
    },

    wordmark: {
        fontSize: 22,
        letterSpacing: "0.42em",
        fontWeight: 500,
        color: "#111",
    },

    demoPill: {
        fontSize: 12,
        color: "#555",
        background: "#f6f6f6",
        border: "1px solid #eee",
        padding: "8px 10px",
        borderRadius: 999,
        marginBottom: 24,
    },

    nav: {
        display: "grid",
        gap: 6,
    },

    sidebarCta: {
        border: "1px solid #eee",
        background: "#fafafa",
        borderRadius: 18,
        padding: 16,
    },

    sidebarTitle: {
        margin: "0 0 6px",
        fontSize: 14,
        fontWeight: 750,
    },

    sidebarText: {
        margin: "0 0 14px",
        fontSize: 13,
        lineHeight: 1.5,
        color: "#666",
    },

    sidebarButton: {
        display: "inline-flex",
        background: "#111",
        color: "#fff",
        textDecoration: "none",
        padding: "10px 13px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
    },

    content: {
        padding: "32px",
        maxWidth: 1280,
        width: "100%",
        margin: "0 auto",
    },

    topbar: {
        display: "flex",
        justifyContent: "space-between",
        gap: 20,
        alignItems: "flex-start",
        marginBottom: 24,
    },

    eyebrow: {
        margin: "0 0 8px",
        fontSize: 12,
        color: "#777",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
    },

    title: {
        margin: 0,
        fontSize: 34,
        letterSpacing: "-0.05em",
        lineHeight: 1,
        fontWeight: 760,
    },

    subtitle: {
        margin: "8px 0 0",
        color: "#666",
        fontSize: 15,
    },

    topActions: {
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
    },

    primaryBtn: {
        background: "#111",
        color: "#fff",
        textDecoration: "none",
        padding: "11px 15px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
    },

    secondaryBtn: {
        background: "#fff",
        color: "#111",
        textDecoration: "none",
        padding: "11px 15px",
        borderRadius: 999,
        border: "1px solid #ddd",
        fontSize: 13,
        fontWeight: 650,
    },

    kpiGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: 14,
        marginBottom: 16,
    },

    kpiCard: {
        background: "#fff",
        border: "1px solid #e7e7e7",
        borderRadius: 20,
        padding: 18,
        boxShadow: "0 12px 30px rgba(0,0,0,0.025)",
    },

    kpiTitle: {
        margin: "0 0 10px",
        fontSize: 13,
        color: "#666",
    },

    kpiValue: {
        margin: "0 0 6px",
        fontSize: 28,
        letterSpacing: "-0.05em",
    },

    kpiDetail: {
        margin: 0,
        fontSize: 12,
        color: "#777",
    },

    insightHero: {
        background: "#fff",
        border: "1px solid #e7e7e7",
        borderRadius: 24,
        padding: 22,
        marginBottom: 16,
        display: "flex",
        justifyContent: "space-between",
        gap: 18,
        alignItems: "center",
    },

    card: {
        background: "#fff",
        border: "1px solid #e7e7e7",
        borderRadius: 24,
        padding: 20,
        boxShadow: "0 12px 30px rgba(0,0,0,0.025)",
    },

    cardHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        marginBottom: 16,
    },

    cardLabel: {
        margin: 0,
        fontSize: 12,
        color: "#777",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
    },

    cardTitle: {
        margin: "5px 0 0",
        fontSize: 19,
        letterSpacing: "-0.03em",
    },

    bigInsight: {
        margin: "5px 0 8px",
        fontSize: 28,
        letterSpacing: "-0.04em",
    },

    bodyText: {
        margin: 0,
        color: "#666",
        fontSize: 14,
        lineHeight: 1.6,
    },

    mutedText: {
        margin: "4px 0 0",
        color: "#777",
        fontSize: 12,
        lineHeight: 1.4,
    },

    darkButton: {
        border: 0,
        background: "#111",
        color: "#fff",
        borderRadius: 999,
        padding: "11px 14px",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        whiteSpace: "nowrap",
    },

    lightButton: {
        marginTop: 16,
        border: "1px solid #ddd",
        background: "#fff",
        color: "#111",
        borderRadius: 999,
        padding: "10px 13px",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
    },

    smallButton: {
        border: "1px solid #ddd",
        background: "#fff",
        borderRadius: 999,
        padding: "8px 11px",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
    },

    smallDarkButton: {
        marginTop: 10,
        border: 0,
        background: "#111",
        color: "#fff",
        borderRadius: 999,
        padding: "9px 12px",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
    },

    twoCol: {
        display: "grid",
        gridTemplateColumns: "1.15fr 0.85fr",
        gap: 16,
    },

    twoColWide: {
        display: "grid",
        gridTemplateColumns: "0.8fr 1.2fr",
        gap: 16,
    },

    stack: {
        display: "grid",
        gap: 16,
    },

    list: {
        display: "grid",
        gap: 10,
    },

    customerRow: {
        width: "100%",
        border: "1px solid #eee",
        background: "#fafafa",
        borderRadius: 16,
        padding: 14,
        display: "flex",
        justifyContent: "space-between",
        gap: 14,
        alignItems: "center",
        textAlign: "left",
        cursor: "pointer",
    },

    rowMeta: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 13,
        whiteSpace: "nowrap",
    },

    badge: {
        padding: "8px 11px",
        borderRadius: 999,
        border: "1px solid #ddd",
        fontSize: 12,
        color: "#555",
    },

    successBadge: {
        padding: "8px 11px",
        borderRadius: 999,
        background: "#edf7ee",
        color: "#166534",
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap",
    },

    table: {
        display: "grid",
        gap: 0,
    },

    tableHead: {
        display: "grid",
        gridTemplateColumns: "1.1fr 0.35fr 1.45fr 0.55fr 0.7fr 0.45fr",
        gap: 12,
        padding: "12px 0",
        borderBottom: "1px solid #eee",
        color: "#777",
        fontSize: 12,
        fontWeight: 700,
        textTransform: "uppercase",
    },

    tableRow: {
        display: "grid",
        gridTemplateColumns: "1.1fr 0.35fr 1.45fr 0.55fr 0.7fr 0.45fr",
        gap: 12,
        alignItems: "center",
        padding: "15px 0",
        borderBottom: "1px solid #f1f1f1",
        fontSize: 13,
    },

    accountHero: {
        background: "#fff",
        border: "1px solid #e7e7e7",
        borderRadius: 24,
        padding: 22,
        display: "flex",
        justifyContent: "space-between",
        gap: 18,
        alignItems: "center",
        marginBottom: 16,
    },

    accountName: {
        margin: "4px 0 2px",
        fontSize: 30,
        letterSpacing: "-0.05em",
    },

    accountGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: 14,
        marginBottom: 16,
    },

    backButton: {
        marginBottom: 14,
        border: "1px solid #ddd",
        background: "#fff",
        borderRadius: 999,
        padding: "9px 12px",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
    },

    timelineItem: {
        border: "1px solid #eee",
        borderRadius: 16,
        padding: 14,
        marginBottom: 10,
        background: "#fafafa",
    },

    textarea: {
        width: "100%",
        minHeight: 96,
        resize: "vertical",
        border: "1px solid #ddd",
        borderRadius: 16,
        padding: 12,
        fontFamily: "inherit",
        fontSize: 13,
        outline: "none",
    },

    recommendTitle: {
        margin: "0 0 8px",
        fontSize: 18,
        letterSpacing: "-0.03em",
    },

    miniTable: {
        display: "grid",
        gap: 10,
    },

    progressRow: {
        display: "grid",
        gridTemplateColumns: "1fr 0.9fr 0.45fr 0.25fr",
        gap: 12,
        alignItems: "center",
        borderTop: "1px solid #eee",
        padding: "12px 0",
        fontSize: 13,
    },

    analyticsGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 16,
    },

    chart: {
        height: 220,
        borderRadius: 18,
        border: "1px solid #eee",
        background: "#fafafa",
        display: "flex",
        alignItems: "end",
        gap: 10,
        padding: 18,
    },

    barWrap: {
        flex: 1,
        height: "100%",
        display: "flex",
        alignItems: "end",
    },

    bar: {
        width: "100%",
        borderRadius: "12px 12px 4px 4px",
        opacity: 0.95,
    },

    driverRow: {
        display: "flex",
        justifyContent: "space-between",
        gap: 14,
        padding: "13px 0",
        borderTop: "1px solid #eee",
        fontSize: 13,
    },

    goodTag: {
        display: "inline-flex",
        marginRight: 8,
        padding: "4px 7px",
        borderRadius: 999,
        background: "#edf7ee",
        color: "#166534",
        fontSize: 11,
        fontWeight: 700,
    },

    badTag: {
        display: "inline-flex",
        marginRight: 8,
        padding: "4px 7px",
        borderRadius: 999,
        background: "#fdecec",
        color: "#991b1b",
        fontSize: 11,
        fontWeight: 700,
    },
};