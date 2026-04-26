"use client";

import { useState } from "react";
import styles from "@/Components/dashboard/dashboardshell.module.css";

type Props = {
    topCustomerId?: string; // optional: start workflow for top row
};

export default function DashboardActions({ topCustomerId }: Props) {
    const [loading, setLoading] = useState<null | "stripe" | "hubspot" | "workflow">(null);

    async function connect(provider: "stripe" | "hubspot") {
        try {
            setLoading(provider);
            const res = await fetch(`/api/integrations/${provider}/connect`, { method: "POST" });
            const data = await res.json();

            if (!res.ok) throw new Error(data?.error || "Failed to connect");

            // API returns a redirect URL (OAuth)
            window.location.href = data.url;
        } catch (e: any) {
            alert(e.message || "Something went wrong");
        } finally {
            setLoading(null);
        }
    }

    async function startWorkflow() {
        try {
            setLoading("workflow");
            const res = await fetch("/api/workflows/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ customerId: topCustomerId ?? null }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || "Failed to start workflow");

            // send user to the workflow page (create this route later)
            window.location.href = `/dashboard/workflows/${data.workflowId}`;
        } catch (e: any) {
            alert(e.message || "Something went wrong");
        } finally {
            setLoading(null);
        }
    }

    return (
        <div className={styles.actionsRow}>
            <button
                className={styles.pillBtn}
                onClick={() => connect("stripe")}
                disabled={loading !== null}
            >
                {loading === "stripe" ? "Connecting…" : "Connect Stripe"}
            </button>

            <button
                className={styles.pillBtn}
                onClick={() => connect("hubspot")}
                disabled={loading !== null}
            >
                {loading === "hubspot" ? "Connecting…" : "Connect HubSpot"}
            </button>

            <div style={{ flex: 1 }} />

            <button
                className={styles.primaryBtn}
                onClick={startWorkflow}
                disabled={loading !== null}
                title={topCustomerId ? "Start workflow for top at-risk customer" : "Start workflow"}
            >
                {loading === "workflow" ? "Starting…" : "Start retention workflow"}
            </button>
        </div>
    );
}
