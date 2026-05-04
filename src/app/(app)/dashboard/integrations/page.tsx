"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase.client";

type ToolStatus = "connected" | "not_connected" | "coming_soon";
type ProviderKey = "stripe" | "hubspot" | "ga4" | "salesforce";

type Tool = {
    key: ProviderKey;
    name: string;
    desc: string;
    status: ToolStatus;
    signals: string[];
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
    const [toast, setToast] = useState<string | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [syncingHubSpot, setSyncingHubSpot] = useState(false);
    const [loadingStatus, setLoadingStatus] = useState(true);
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [integrationRows, setIntegrationRows] = useState<IntegrationRow[]>([]);

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
                desc: "Billing, MRR, failed payments, renewals",
                status: stripe?.status === "connected" ? "connected" : "not_connected",
                signals: ["Revenue", "Payment failures", "Plan changes"],
                lastSyncedAt: stripe?.lastSyncedAt || null,
                lastSyncError: stripe?.lastSyncError || null,
                externalAccountId: stripe?.externalAccountId || null,
            },
            {
                key: "hubspot",
                name: "HubSpot",
                desc: "Lifecycle stage, CRM activity, company signals",
                status: hubspot?.status === "connected" ? "connected" : "not_connected",
                signals: ["Companies", "Lifecycle", "Engagement"],
                lastSyncedAt: hubspot?.lastSyncedAt || null,
                lastSyncError: hubspot?.lastSyncError || null,
                externalAccountId: hubspot?.externalAccountId || null,
            },
            {
                key: "ga4",
                name: "Google Analytics 4",
                desc: "Website + product usage signals",
                status: "coming_soon",
                signals: ["Sessions", "Funnels", "Events"],
            },
            {
                key: "salesforce",
                name: "Salesforce",
                desc: "Enterprise CRM signals",
                status: "coming_soon",
                signals: ["Opportunities", "Accounts", "Renewals"],
            },
        ];
    }, [integrationRows]);

    function badge(status: ToolStatus) {
        if (status === "connected") return <span className="badge ok">Connected</span>;
        if (status === "not_connected") return <span className="badge warn">Not connected</span>;
        return <span className="badge ai">Coming soon</span>;
    }

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
            window.location.href = `/api/oauth/connect?uid=${encodeURIComponent(user.uid)}`;
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

    return (
        <div style={{ padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Integrations</h1>
                    <p className="muted" style={{ marginTop: 6 }}>
                        Connect tools to unlock live churn signals and recommended actions.
                    </p>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button className="btnPrimary" onClick={runHubSpotSync} disabled={syncingHubSpot || loadingStatus}>
                        {syncingHubSpot ? "Syncing HubSpot…" : "Run HubSpot sync"}
                    </button>

                    <button className="btnPrimary" onClick={loadStatus} disabled={loadingStatus}>
                        {loadingStatus ? "Checking…" : "Run connection check"}
                    </button>
                </div>
            </div>

            <div style={{ marginTop: 16 }} className="strip">
                <div className="stripLeft">
                    <div className="stripItem">
                        <div className="stripLabel">Data freshness</div>
                        <div className="stripValue">
                            <span className="badge ok">{loadingStatus ? "Checking…" : "Live"}</span>
                            <span className="muted">Statuses now come from your database</span>
                        </div>
                    </div>

                    <div className="stripItem">
                        <div className="stripLabel">Coverage</div>
                        <div className="stripValue">
                            <span className="badge warn">{connectedCount >= 2 ? "Strong" : "Partial"}</span>
                            <span className="muted">Stripe + HubSpot gives the strongest forecasting</span>
                        </div>
                    </div>
                </div>
            </div>

            <div
                style={{
                    marginTop: 16,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                    gap: 14,
                }}
            >
                {tools.map((t) => (
                    <div key={t.key} className="card" style={{ borderRadius: 16, padding: 14 }}>
                        <div
                            className="cardTop"
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                            }}
                        >
                            <h4 style={{ margin: 0 }}>{t.name}</h4>
                            {badge(t.status)}
                        </div>

                        <p className="muted" style={{ marginTop: 8 }}>
                            {t.desc}
                        </p>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                            {t.signals.map((s) => (
                                <span key={s} className="badge ai">
                                    {s}
                                </span>
                            ))}
                        </div>

                        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75, minHeight: 50 }}>
                            {t.status === "connected" ? (
                                <>
                                    <div>Last synced: {formatWhen(t.lastSyncedAt)}</div>
                                    {t.externalAccountId ? <div>Account: {t.externalAccountId}</div> : null}
                                    {t.lastSyncError ? (
                                        <div style={{ color: "#dc2626" }}>Last error: {t.lastSyncError}</div>
                                    ) : null}
                                </>
                            ) : t.status === "not_connected" ? (
                                <div>Not connected yet.</div>
                            ) : (
                                <div>Not available yet.</div>
                            )}
                        </div>

                        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                            {t.status === "connected" ? (
                                <button
                                    className="btnGhost"
                                    onClick={() => onDisconnect(t)}
                                    disabled={busyKey === t.key}
                                >
                                    {busyKey === t.key ? "Disconnecting…" : "Disconnect"}
                                </button>
                            ) : (
                                <button
                                    className="btnPrimary"
                                    onClick={() => onConnect(t)}
                                    disabled={busyKey === t.key}
                                >
                                    {t.status === "coming_soon" ? "Notify me" : "Connect"}
                                </button>
                            )}

                            <button className="btnGhost" onClick={() => setToast(`Opening ${t.name} docs…`)}>
                                Docs
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {toast && <div className="toast">{toast}</div>}
        </div>
    );
}