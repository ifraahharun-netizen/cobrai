"use client";

import type { User } from "firebase/auth";

type ClientEvent =
    | "banner_viewed"
    | "banner_clicked"
    | "reminder_viewed"
    | "report_viewed"
    | "plan_clicked"
    | "connect_stripe_clicked"
    | "talk_to_us_clicked";

/** Fire-and-forget funnel event. Never throws, never blocks the UI. */
export function trackConversionEvent(
    user: Pick<User, "getIdToken"> | null | undefined,
    name: ClientEvent,
    data?: Record<string, string | number | boolean>
) {
    if (!user) return;
    void (async () => {
        try {
            const token = await user.getIdToken();
            if (!token) return;
            await fetch("/api/billing/track", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ name, data }),
                keepalive: true,
            });
        } catch {
            // Tracking is best-effort.
        }
    })();
}

/** True the first time `key` is seen in this browser tab (or today, with perDay). */
export function firstTimeThisSession(key: string, perDay = false): boolean {
    try {
        const store = perDay ? window.localStorage : window.sessionStorage;
        const stamp = perDay ? new Date().toISOString().slice(0, 10) : "1";
        if (store.getItem(key) === stamp) return false;
        store.setItem(key, stamp);
        return true;
    } catch {
        return true;
    }
}
