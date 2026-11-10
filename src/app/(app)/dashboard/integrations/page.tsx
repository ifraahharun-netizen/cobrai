"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { RefreshCw, RotateCcw } from "lucide-react";
import type { IconType } from "react-icons";
import {
    SiGmail,
    SiGoogleanalytics,
    SiHubspot,
    SiIntercom,
    SiMixpanel,
    SiPaddle,
    SiPosthog,
    SiQuickbooks,
    SiResend,
    SiSalesforce,
    SiSlack,
    SiStripe,
    SiZapier,
    SiZendesk,
} from "react-icons/si";
import { getFirebaseAuth } from "@/lib/firebase.client";
import styles from "./integrations.module.css";

type ToolStatus = "connected" | "not_connected" | "coming_soon";
type ToolStatusOrSetup = ToolStatus | "setup";
type ProviderKey =
    | "stripe"
    | "paddle"
    | "quickbooks"
    | "hubspot"
    | "salesforce"
    | "posthog"
    | "mixpanel"
    | "ga4"
    | "intercom"
    | "zendesk"
    | "resend"
    | "gmail"
    | "slack"
    | "zapier";

type ToolCategory = "Billing & revenue" | "CRM" | "Product usage" | "Support" | "Email & alerts" | "Automation";

const CATEGORY_ORDER: Array<{ name: ToolCategory; text: string }> = [
    { name: "Billing & revenue", text: "MRR, renewals and failed payments." },
    { name: "CRM", text: "Account owners, lifecycle stage and deal activity." },
    { name: "Product usage", text: "Logins, feature use and engagement drops, the earliest churn signals." },
    { name: "Support", text: "Ticket volume and sentiment, which often spike before churn." },
    { name: "Email & alerts", text: "Send retention emails and get notified about at-risk accounts." },
    { name: "Automation", text: "Trigger workflows in your other tools." },
];

/** Tools Cobrai can't connect to yet; shown as "Coming soon". */
const UPCOMING: Array<Omit<Tool, "status">> = [
    { key: "paddle", name: "Paddle", category: "Billing & revenue", Icon: SiPaddle, colour: "#c79400", desc: "Subscriptions and payments for software businesses", signals: ["MRR", "Renewals", "Dunning"] },
    { key: "quickbooks", name: "QuickBooks", category: "Billing & revenue", Icon: SiQuickbooks, colour: "#2ca01c", desc: "Invoices and accounts receivable", signals: ["Invoices", "Overdue payments"] },
    { key: "salesforce", name: "Salesforce", category: "CRM", Icon: SiSalesforce, colour: "#00a1e0", desc: "Enterprise CRM signals", signals: ["Opportunities", "Accounts", "Renewals"] },
    { key: "posthog", name: "PostHog", category: "Product usage", Icon: SiPosthog, colour: "#f54e00", desc: "Product analytics and feature usage", signals: ["Active users", "Feature use", "Drop-offs"] },
    { key: "mixpanel", name: "Mixpanel", category: "Product usage", Icon: SiMixpanel, colour: "#7856ff", desc: "Event-based product analytics", signals: ["Events", "Retention cohorts", "Funnels"] },
    { key: "ga4", name: "Google Analytics 4", category: "Product usage", Icon: SiGoogleanalytics, colour: "#e37400", desc: "Website and product usage signals", signals: ["Sessions", "Funnels", "Events"] },
    { key: "intercom", name: "Intercom", category: "Support", Icon: SiIntercom, colour: "#286efa", desc: "Conversations and support tickets", signals: ["Ticket volume", "Response times", "CSAT"] },
    { key: "zendesk", name: "Zendesk", category: "Support", Icon: SiZendesk, colour: "#03363d", desc: "Support tickets and satisfaction", signals: ["Tickets", "Escalations", "CSAT"] },
    { key: "gmail", name: "Gmail", category: "Email & alerts", Icon: SiGmail, colour: "#ea4335", desc: "Send retention emails from your team inbox", signals: ["Sent emails", "Replies"] },
    { key: "slack", name: "Slack", category: "Email & alerts", Icon: SiSlack, colour: "#4a154b", desc: "At-risk account alerts in your channels", signals: ["Risk alerts", "Daily digest"] },
    { key: "zapier", name: "Zapier", category: "Automation", Icon: SiZapier, colour: "#ff4f00", desc: "Connect Cobrai to thousands of apps", signals: ["Triggers", "Actions"] },
];

type Tool = {
    key: ProviderKey;
    name: string;
    desc: string;
    status: ToolStatusOrSetup;
    signals: string[];
    category: ToolCategory;
    Icon: IconType;
    colour: string;
    lastSyncedAt?: string | null;
    lastSyncError?: string | null;
    externalAccountId?: string | null;
};

type IntegrationRow = {
    provider: string;
    status: string;
    lastSyncedAt?: string | null;
    lastSyncError?: string | null;
    externalAccountId?: string | null;
    metadata?: unknown;
};

type IntegrationStatusRes = {
    ok: boolean;
    integrations?: IntegrationRow[];
    error?: string;
};

export default function IntegrationsPage() {
    const router = useRouter();
    const [toast, setToast] = useState<string | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [syncingHubSpot, setSyncingHubSpot] = useState(false);
    const [loadingStatus, setLoadingStatus] = useState(true);
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [integrationRows, setIntegrationRows] = useState<IntegrationRow[]>([]);
    const [view, setView] = useState<"all" | "connected" | "disconnected">("all");
    const [openDetails, setOpenDetails] = useState<string | null>(null);

    useEffect(() => {
        const auth = getFirebaseAuth();
        const unsub = onAuthStateChanged(auth, (u) => setUser(u));
        return () => unsub();
    }, []);

    const loadStatus = useCallback(async () => {
        try {
            if (!user) {
                setIntegrationRows([]);
                setLoadingStatus(false);
                return;
            }

            setLoadingStatus(true);

            const token = await user.getIdToken(true);

            const res = await fetch("/api/integrations/status", {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                cache: "no-store",
            });

            const data = (await res.json()) as IntegrationStatusRes;

            if (!res.ok || !data?.ok) {
                throw new Error(data?.error || "Failed to load integration status");
            }

            setIntegrationRows(Array.isArray(data.integrations) ? data.integrations : []);
        } catch (e: any) {
            setIntegrationRows([]);
            setToast(e?.message || "Failed to load integration status");
        } finally {
            setLoadingStatus(false);
        }
    }, [user]);

    useEffect(() => {
        loadStatus();
    }, [loadStatus]);

    const tools: Tool[] = useMemo(() => {
        const byProvider = new Map(
            integrationRows.map((row) => [row.provider.toLowerCase(), row])
        );

        const stripe = byProvider.get("stripe");
        const hubspot = byProvider.get("hubspot");

        return [
            {
                key: "stripe",
                name: "Stripe",
                category: "Billing & revenue",
                Icon: SiStripe,
                colour: "#635bff",
                desc: "Billing, MRR, failed payments and renewals",
                status: stripe?.status === "connected" ? "connected" : "not_connected",
                signals: ["Revenue", "Payment failures", "Plan changes"],
                lastSyncedAt: stripe?.lastSyncedAt || null,
                lastSyncError: stripe?.lastSyncError || null,
                externalAccountId: stripe?.externalAccountId || null,
            },
            {
                key: "hubspot",
                name: "HubSpot",
                category: "CRM",
                Icon: SiHubspot,
                colour: "#ff7a59",
                desc: "Lifecycle stage, CRM activity and company signals",
                status: hubspot?.status === "connected" ? "connected" : "not_connected",
                signals: ["Companies", "Lifecycle", "Engagement"],
                lastSyncedAt: hubspot?.lastSyncedAt || null,
                lastSyncError: hubspot?.lastSyncError || null,
                externalAccountId: hubspot?.externalAccountId || null,
            },
            {
                key: "resend",
                name: "Resend",
                category: "Email & alerts",
                Icon: SiResend,
                colour: "#000000",
                desc: "Send retention emails from your own domain",
                status: "setup",
                signals: ["Sending domain", "Delivery", "Opens"],
            },
            ...UPCOMING.map((tool) => ({ ...tool, status: "coming_soon" as const })),
        ];
    }, [integrationRows]);

    function formatWhen(iso?: string | null) {
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

    async function onConnect(tool: Tool) {
        if (!user) {
            setToast("Please sign in first.");
            return;
        }

        if (tool.status === "coming_soon") {
            setToast(`${tool.name} is coming soon.`);
            return;
        }

        if (tool.status === "connected") {
            setToast(`${tool.name} is already connected.`);
            return;
        }


        if (tool.key === "hubspot") {
            window.location.href = `/api/integrations/hubspot/connect?uid=${encodeURIComponent(user.uid)}`;
            return;
        }

        if (tool.key === "resend") {
            router.push("/dashboard/settings?tab=Integration&section=resend");
            return;
        }

        if (tool.key === "stripe") {
            const token = await user.getIdToken(true);

            const res = await fetch("/api/integrations/stripe/connect", {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                cache: "no-store",
            });

            if (res.redirected) {
                window.location.href = res.url;
                return;
            }

            const data = await res.json().catch(() => null);

            if (data?.url) {
                window.location.href = data.url;
                return;
            }

            setToast(data?.error || "Failed to start Stripe connect.");
            return;
        }
    }

    async function onDisconnect(tool: Tool) {
        try {
            if (!user) {
                setToast("Please sign in first.");
                return;
            }

            if (tool.status !== "connected") {
                setToast(`${tool.name} is not connected.`);
                return;
            }

            if (
                !window.confirm(
                    `Disconnect ${tool.name}? You may need to reconfigure its settings if you reconnect later.`
                )
            ) {
                return;
            }

            setBusyKey(tool.key);

            const token = await user.getIdToken(true);

            const res = await fetch(`/api/integrations/${tool.key}/disconnect`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            const data = await res.json().catch(() => null);

            if (!res.ok || !data?.ok) {
                throw new Error(data?.error || `Failed to disconnect ${tool.name}`);
            }

            setToast(`${tool.name} disconnected.`);
            await loadStatus();
        } catch (e: any) {
            setToast(e?.message || `Failed to disconnect ${tool.name}`);
        } finally {
            setBusyKey(null);
        }
    }

    async function runHubSpotSync() {
        try {
            if (!user) {
                setToast("Please sign in first.");
                return;
            }

            setSyncingHubSpot(true);

            const token = await user.getIdToken(true);

            const res = await fetch("/api/integrations/hubspot/sync", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            const data = await res.json();

            if (!res.ok || !data?.ok) {
                throw new Error(data?.error || "HubSpot sync failed");
            }

            setToast(`HubSpot sync complete • ${data.synced ?? 0} companies processed`);
            await loadStatus();
        } catch (e: any) {
            setToast(e?.message || "HubSpot sync failed");
        } finally {
            setSyncingHubSpot(false);
        }
    }

    const connectedCount = tools.filter((t) => t.status === "connected").length;

    // Toasts disappear after a few seconds.
    useEffect(() => {
        if (!toast) return;
        const timer = window.setTimeout(() => setToast(null), 4000);
        return () => window.clearTimeout(timer);
    }, [toast]);

    const visibleTools = tools.filter((tool) =>
        view === "connected"
            ? tool.status === "connected"
            : view === "disconnected"
                ? tool.status !== "connected"
                : true
    );

    const views: Array<{ key: typeof view; label: string; count: number }> = [
        { key: "all", label: "All applications", count: tools.length },
        { key: "connected", label: "Connected", count: connectedCount },
        { key: "disconnected", label: "Disconnected", count: tools.length - connectedCount },
    ];

    return (
        <main className={styles.page}>
            <div className={styles.content}>
                <header className={styles.header}>
                    <div>
                        <h1 className={styles.title}>Integrations</h1>
                        <p className={styles.subtitle}>
                            Connect your tools so Cobrai can see live revenue, churn and engagement signals.
                        </p>
                    </div>

                    <div className={styles.headerActions}>
                        <button
                            type="button"
                            className={styles.button}
                            onClick={runHubSpotSync}
                            disabled={syncingHubSpot || loadingStatus}
                        >
                            <RotateCcw size={14} strokeWidth={1.8} aria-hidden="true" />
                            {syncingHubSpot ? "Syncing HubSpot…" : "Sync HubSpot"}
                        </button>
                        <button type="button" className={styles.button} onClick={loadStatus} disabled={loadingStatus}>
                            <RefreshCw size={14} strokeWidth={1.8} aria-hidden="true" />
                            {loadingStatus ? "Checking…" : "Check connections"}
                        </button>
                    </div>
                </header>

                <div className={styles.viewTabs} role="tablist" aria-label="Filter integrations">
                    {views.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            role="tab"
                            aria-selected={view === item.key}
                            className={view === item.key ? styles.viewTabActive : undefined}
                            onClick={() => setView(item.key)}
                        >
                            {item.label}
                            <span>{loadingStatus && item.key !== "all" ? "–" : item.count}</span>
                        </button>
                    ))}
                </div>

                {CATEGORY_ORDER.map((group) => {
                    const groupTools = visibleTools.filter((tool) => tool.category === group.name);
                    if (!groupTools.length) return null;

                    return (
                        <section key={group.name} className={styles.section} aria-label={group.name}>
                            <div className={styles.sectionHead}>
                                <h2>{group.name}</h2>
                                <p>{group.text}</p>
                            </div>

                            <div className={styles.grid}>
                                {groupTools.map((t) => {
                                    const connected = t.status === "connected";
                                    const canToggle = t.status === "connected" || t.status === "not_connected";
                                    const detailsOpen = openDetails === t.key;

                                    return (
                                        <article key={t.key} className={styles.card}>
                                            <div className={styles.cardBody}>
                                                <span className={styles.logo} style={{ color: t.colour }} aria-hidden="true">
                                                    <t.Icon size={22} />
                                                </span>
                                                <div className={styles.cardText}>
                                                    <h3>
                                                        {t.name}
                                                        {t.status === "coming_soon" ? (
                                                            <span className={styles.soon}>Coming soon</span>
                                                        ) : null}
                                                    </h3>
                                                    <p>{t.desc}</p>
                                                </div>
                                            </div>

                                            {detailsOpen ? (
                                                <div className={styles.details}>
                                                    <div>
                                                        <span>Signals</span>
                                                        {t.signals.join(" · ")}
                                                    </div>
                                                    {connected ? (
                                                        <div>
                                                            <span>Last synced</span>
                                                            {formatWhen(t.lastSyncedAt)}
                                                            {t.externalAccountId ? ` · ${t.externalAccountId}` : ""}
                                                        </div>
                                                    ) : null}
                                                    {t.lastSyncError ? (
                                                        <div className={styles.detailsError}>
                                                            <span>Last error</span>
                                                            {t.lastSyncError}
                                                        </div>
                                                    ) : null}
                                                    {t.status === "setup" ? (
                                                        <div>
                                                            <span>Setup</span>
                                                            Verify your sending domain in Settings.
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ) : null}

                                            <div className={styles.cardFooter}>
                                                <div className={styles.footerButtons}>
                                                    <button
                                                        type="button"
                                                        className={styles.smallButton}
                                                        aria-expanded={detailsOpen}
                                                        onClick={() => setOpenDetails(detailsOpen ? null : t.key)}
                                                    >
                                                        Details
                                                    </button>

                                                    {connected ? (
                                                        <button
                                                            type="button"
                                                            className={`${styles.smallButton} ${styles.removeButton}`}
                                                            onClick={() => onDisconnect(t)}
                                                            disabled={busyKey === t.key}
                                                        >
                                                            {busyKey === t.key ? "Removing…" : "Remove"}
                                                        </button>
                                                    ) : t.status === "setup" ? (
                                                        <button
                                                            type="button"
                                                            className={styles.smallButton}
                                                            onClick={() => onConnect(t)}
                                                        >
                                                            Set up
                                                        </button>
                                                    ) : t.status === "coming_soon" ? (
                                                        <button
                                                            type="button"
                                                            className={styles.smallButton}
                                                            onClick={() => onConnect(t)}
                                                        >
                                                            Notify me
                                                        </button>
                                                    ) : null}
                                                </div>

                                                <button
                                                    type="button"
                                                    role="switch"
                                                    aria-checked={connected}
                                                    aria-label={`${connected ? "Disconnect" : "Connect"} ${t.name}`}
                                                    title={
                                                        canToggle
                                                            ? connected
                                                                ? `Disconnect ${t.name}`
                                                                : `Connect ${t.name}`
                                                            : t.status === "setup"
                                                                ? "Set up in Settings"
                                                                : "Coming soon"
                                                    }
                                                    className={`${styles.toggle} ${connected ? styles.toggleOn : ""}`}
                                                    disabled={!canToggle || busyKey === t.key || loadingStatus}
                                                    onClick={() => (connected ? onDisconnect(t) : onConnect(t))}
                                                >
                                                    <span />
                                                </button>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </section>
                    );
                })}

                {visibleTools.length === 0 ? (
                    <p className={styles.empty}>
                        {view === "connected" ? "No tools connected yet." : "Every tool is connected."}
                    </p>
                ) : null}
            </div>

            {toast ? (
                <div className={styles.toast} role="status">
                    {toast}
                </div>
            ) : null}
        </main>
    );
}