"use client";

import type { User } from "firebase/auth";

/**
 * Starts the Stripe or HubSpot connect flow for the signed-in user.
 * Sends the Firebase ID token (the server never trusts a uid from the URL),
 * then sends the browser to the provider's sign-in page.
 * Throws with a readable message when the flow can't start.
 */
export async function startIntegrationConnect(user: User, provider: "stripe" | "hubspot") {
    const token = await user.getIdToken();
    const res = await fetch(`/api/integrations/${provider}/connect`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;

    if (!res.ok || !data?.url) {
        throw new Error(data?.error || `Failed to start ${provider === "stripe" ? "Stripe" : "HubSpot"} connect.`);
    }

    window.location.href = data.url;
}
