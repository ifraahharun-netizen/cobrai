// lib/inbox.ts
//
// Shared types and helpers for the two-way inbox. Threads combine:
//  - retention emails Cobrai sent (ActionExecution),
//  - replies customers sent back (InboxMessage, inbound),
//  - replies sent from the inbox (InboxMessage, outbound).

export type InboxDirection = "inbound" | "outbound";

/** The tool a message came through. Cobrai sends everything through Resend. */
export type InboxChannel = "cobrai" | "gmail" | "outlook" | "intercom" | "zendesk" | "hubspot";

export const INBOX_CHANNELS: Array<{ key: InboxChannel; label: string; hint: string }> = [
    { key: "cobrai", label: "Cobrai", hint: "Emails Cobrai sent through Resend, and replies to them" },
    { key: "gmail", label: "Gmail", hint: "Messages from your connected Gmail inbox" },
    { key: "outlook", label: "Outlook", hint: "Messages from your connected Outlook inbox" },
    { key: "intercom", label: "Intercom", hint: "Intercom conversations" },
    { key: "zendesk", label: "Zendesk", hint: "Zendesk tickets" },
    { key: "hubspot", label: "HubSpot", hint: "Emails logged in HubSpot" },
];

/** Map a provider/source name to a known channel, or null if unknown. */
export function normaliseChannel(value: unknown): InboxChannel | null {
    const v = String(value ?? "").trim().toLowerCase();
    if (!v) return null;
    if (v === "resend" || v === "cobrai") return "cobrai";
    if (v === "google" || v.includes("gmail")) return "gmail";
    if (v.includes("outlook") || v.includes("microsoft") || v === "office365") return "outlook";
    if (v.includes("intercom")) return "intercom";
    if (v.includes("zendesk")) return "zendesk";
    if (v.includes("hubspot")) return "hubspot";
    return null;
}

export type InboxMessageView = {
    id: string;
    direction: InboxDirection;
    fromEmail: string;
    fromName: string | null;
    toEmail: string;
    subject: string;
    bodyText: string;
    createdAt: string;
    status: string;
    read: boolean;
    /** Engagement on emails Cobrai sent. */
    openedAt?: string | null;
    clickedAt?: string | null;
    source: "retention" | "inbox";
    /** Sanitised HTML for formatted replies; bodyText is the plain-text version. */
    bodyHtml?: string | null;
    /** Tool the message came through. */
    channel?: InboxChannel | null;
};

/** Account details shown beside a conversation. MRR is in whole pounds, like the Accounts page. */
export type InboxAccount = {
    id: string;
    name: string;
    email: string | null;
    plan: string | null;
    seats: number;
    mrr: number;
    status: string;
    healthScore: number;
    riskScore: number;
    lastActiveAt: string | null;
    customerSince: string;
    website: string | null;
    /** Main reasons the account is at risk, most important first. */
    riskReasons: string[];
    /** Risk score at the previous check, to show the trend. */
    previousRiskScore: number | null;
    /** Days with activity in the last 30, from the latest health snapshot. */
    activeDays30d: number | null;
    /** Failed or unpaid invoices, in whole pounds. */
    unpaid: { count: number; amount: number };
    /** Latest retention actions sent to this account. */
    recentActions: Array<{ title: string; at: string; status: string; opened: boolean; replied: boolean }>;
};

export type InboxThread = {
    key: string;
    account?: InboxAccount | null;
    channel: InboxChannel;
    starred: boolean;
    customerId: string | null;
    customerName: string;
    counterpartEmail: string;
    subject: string;
    lastAt: string;
    preview: string;
    unread: number;
    hasReply: boolean;
    needsReply: boolean;
    archived: boolean;
    opened: boolean;
    failed: boolean;
    messages: InboxMessageView[];
};

export type InboxFolder = "all" | "starred" | "needsReply" | "replied" | "opened" | "sent" | "failed" | "archived";

/** "Re: Fwd: Renewal check-in" -> "renewal check-in" */
export function normaliseSubject(subject: string) {
    let s = (subject || "").trim();
    for (;;) {
        const next = s.replace(/^(re|fw|fwd)\s*:\s*/i, "");
        if (next === s) break;
        s = next;
    }
    return s.toLowerCase();
}

export function threadKeyFor(counterpartEmail: string, subject: string) {
    return `${(counterpartEmail || "").trim().toLowerCase()}|${normaliseSubject(subject)}`;
}

export function replySubject(subject: string) {
    return /^re\s*:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`;
}

export function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Builds threads from a flat list of messages, newest thread first. */
export function buildThreads(
    messages: Array<InboxMessageView & { threadKey: string; customerId: string | null; customerName: string | null; archived?: boolean }>
): InboxThread[] {
    const byKey = new Map<string, typeof messages>();

    for (const message of messages) {
        const list = byKey.get(message.threadKey) ?? [];
        list.push(message);
        byKey.set(message.threadKey, list);
    }

    const threads: InboxThread[] = [];

    for (const [key, list] of byKey) {
        list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        const last = list[list.length - 1];
        const counterpart =
            last.direction === "inbound" ? last.fromEmail : last.toEmail;
        const first = list[0];
        const named = list.find((message) => message.customerName);

        // Where the customer is talking to you: their latest message's tool, else where it started.
        const lastInbound = [...list].reverse().find((message) => message.direction === "inbound");

        threads.push({
            key,
            channel: lastInbound?.channel ?? first.channel ?? "cobrai",
            customerId: list.find((message) => message.customerId)?.customerId ?? null,
            customerName:
                named?.customerName ||
                list.find((message) => message.direction === "inbound")?.fromName ||
                counterpart,
            counterpartEmail: counterpart,
            subject: first.subject.replace(/^(re|fw|fwd)\s*:\s*/i, "") || "(no subject)",
            lastAt: last.createdAt,
            preview: last.bodyText.replace(/\s+/g, " ").slice(0, 140),
            unread: list.filter((message) => message.direction === "inbound" && !message.read).length,
            starred: false,
            hasReply: list.some((message) => message.direction === "inbound"),
            needsReply: last.direction === "inbound",
            archived: list.every((message) => message.archived),
            opened: list.some((message) => Boolean(message.openedAt)),
            failed: list.some((message) => message.status === "failed"),
            messages: list.map((message) => {
                // Strip the grouping-only fields from the view.
                const { threadKey: _k, customerId: _c, customerName: _n, archived: _a, ...view } = message;
                void _k;
                void _c;
                void _n;
                void _a;
                return view;
            }),
        });
    }

    return threads.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
}

export function threadInFolder(thread: InboxThread, folder: InboxFolder) {
    if (folder === "starred") return thread.starred;
    if (folder === "archived") return thread.archived;
    if (thread.archived) return false;
    if (folder === "needsReply") return thread.needsReply;
    if (folder === "replied") return thread.hasReply;
    if (folder === "opened") return thread.opened;
    if (folder === "sent") return !thread.hasReply;
    if (folder === "failed") return thread.failed;
    return true;
}

/* -------------------------------------------------------------------------- */
/* Demo threads, used when the workspace is in demo mode.                     */
/* -------------------------------------------------------------------------- */

function ago(hours: number) {
    return new Date(Date.now() - hours * 3_600_000).toISOString();
}

export function demoThreads(): InboxThread[] {
    const from = "success@yourcompany.com";

    const raw: Array<InboxMessageView & { threadKey: string; customerId: string | null; customerName: string | null }> = [
        {
            id: "demo-1a", threadKey: threadKeyFor("finance@kitelabs.io", "Your renewal next month"), customerId: "demo-kite-labs", customerName: "Kite Labs",
            direction: "outbound", source: "retention", fromEmail: from, fromName: "Customer Success", toEmail: "finance@kitelabs.io",
            subject: "Your renewal next month", createdAt: ago(30), status: "sent", read: true, openedAt: ago(28), clickedAt: ago(27),
            bodyText: "Hi Sam,\n\nYour plan renews on 1 December. Before then, I'd love to set up a 20-minute review so we can make sure your team is getting value from the reporting features you asked about.\n\nWould Tuesday or Wednesday work?\n\nBest,\nCustomer Success",
        },
        {
            id: "demo-1b", channel: "gmail", threadKey: threadKeyFor("finance@kitelabs.io", "Your renewal next month"), customerId: "demo-kite-labs", customerName: "Kite Labs",
            direction: "inbound", source: "inbox", fromEmail: "finance@kitelabs.io", fromName: "Sam Patel", toEmail: from,
            subject: "Re: Your renewal next month", createdAt: ago(2), status: "received", read: false,
            bodyText: "Hi,\n\nThanks for reaching out. Honestly we've been using it less since our analyst left. Wednesday works. Can you show us the automated reports? If we can't get value without a dedicated analyst we may downgrade.\n\nSam",
        },
        {
            id: "demo-2a", threadKey: threadKeyFor("ops@novapay.io", "Payment issue on your account"), customerId: "demo-novapay", customerName: "NovaPay",
            direction: "outbound", source: "retention", fromEmail: from, fromName: "Billing", toEmail: "ops@novapay.io",
            subject: "Payment issue on your account", createdAt: ago(52), status: "sent", read: true, openedAt: ago(50),
            bodyText: "Hi there,\n\nYour last payment of £1,320 didn't go through. Could you update your card details using the link below so there's no interruption to your service?\n\nThanks,\nBilling",
        },
        {
            id: "demo-2b", channel: "outlook", threadKey: threadKeyFor("ops@novapay.io", "Payment issue on your account"), customerId: "demo-novapay", customerName: "NovaPay",
            direction: "inbound", source: "inbox", fromEmail: "ops@novapay.io", fromName: "Priya Shah", toEmail: from,
            subject: "Re: Payment issue on your account", createdAt: ago(20), status: "received", read: true,
            bodyText: "Card was replaced after a fraud alert. I've updated it now, can you retry the payment?\n\nPriya",
        },
        {
            id: "demo-2c", threadKey: threadKeyFor("ops@novapay.io", "Payment issue on your account"), customerId: "demo-novapay", customerName: "NovaPay",
            direction: "outbound", source: "inbox", fromEmail: from, fromName: "Billing", toEmail: "ops@novapay.io",
            subject: "Re: Payment issue on your account", createdAt: ago(18), status: "sent", read: true,
            bodyText: "Thanks Priya, the retry went through. You're all set.\n\nBilling",
        },
        {
            id: "demo-3a", threadKey: threadKeyFor("success@cedarworks.io", "A quick recap of what's new"), customerId: "demo-cedarworks", customerName: "CedarWorks",
            direction: "outbound", source: "retention", fromEmail: from, fromName: "Customer Success", toEmail: "success@cedarworks.io",
            subject: "A quick recap of what's new", createdAt: ago(70), status: "sent", read: true, openedAt: ago(66),
            bodyText: "Hi team,\n\nWe noticed fewer logins over the last two weeks. Here's a two-minute recap of three features that save the most time for teams your size...\n\nCustomer Success",
        },
        {
            id: "demo-4a", threadKey: threadKeyFor("team@brightops.io", "Annual plan for BrightOps"), customerId: "demo-brightops", customerName: "BrightOps",
            direction: "outbound", source: "retention", fromEmail: from, fromName: "Customer Success", toEmail: "team@brightops.io",
            subject: "Annual plan for BrightOps", createdAt: ago(96), status: "sent", read: true, openedAt: ago(90), clickedAt: ago(89),
            bodyText: "Hi BrightOps team,\n\nUsage is up 40% this month. Moving to an annual plan would save you two months' cost. Happy to send a quote.\n\nCustomer Success",
        },
        {
            id: "demo-4b", channel: "hubspot", threadKey: threadKeyFor("team@brightops.io", "Annual plan for BrightOps"), customerId: "demo-brightops", customerName: "BrightOps",
            direction: "inbound", source: "inbox", fromEmail: "team@brightops.io", fromName: "Leo Martin", toEmail: from,
            subject: "Re: Annual plan for BrightOps", createdAt: ago(6), status: "received", read: false,
            bodyText: "Yes please, send over a quote for 25 seats. Does annual include priority support?\n\nLeo",
        },
        {
            id: "demo-5a", threadKey: threadKeyFor("billing@peakops.io", "We couldn't process your payment"), customerId: null, customerName: "Peak Ops",
            direction: "outbound", source: "retention", fromEmail: from, fromName: "Billing", toEmail: "billing@peakops.io",
            subject: "We couldn't process your payment", createdAt: ago(120), status: "failed", read: true,
            bodyText: "Hi,\n\nWe tried to charge £1,070 but the payment failed. Please update your payment method.\n\nBilling",
        },
        {
            id: "demo-6a", channel: "intercom", threadKey: threadKeyFor("it@lumahealth.com", "SSO for our team?"), customerId: "demo-luma-health", customerName: "Luma Health",
            direction: "inbound", source: "inbox", fromEmail: "it@lumahealth.com", fromName: "Dana Okafor", toEmail: from,
            subject: "SSO for our team?", createdAt: ago(9), status: "received", read: false,
            bodyText: "Hello,\n\nWe're adding 15 more people next quarter and our security team needs SSO (Okta) before we can roll it out. Is that on your Pro plan or do we need to upgrade?\n\nThanks,\nDana",
        },
        {
            id: "demo-7a", channel: "zendesk", threadKey: threadKeyFor("hello@orbitstack.dev", "Exporting our data"), customerId: null, customerName: "Orbit Stack",
            direction: "inbound", source: "inbox", fromEmail: "hello@orbitstack.dev", fromName: "Marcus Lee", toEmail: from,
            subject: "Exporting our data", createdAt: ago(40), status: "received", read: true,
            bodyText: "Hi, how do we export all our reports as CSV? We're reviewing our tools this month.\n\nMarcus",
        },
    ];

    const accounts: Record<string, InboxAccount> = {
        "demo-luma-health": {
            id: "demo-luma-health", name: "Luma Health", email: "it@lumahealth.com", plan: "Pro", seats: 40, mrr: 6600,
            status: "Expansion", healthScore: 79, riskScore: 18, lastActiveAt: ago(2), customerSince: ago(24 * 290), website: "lumahealth.com",
            riskReasons: [], previousRiskScore: 22, activeDays30d: 27, unpaid: { count: 0, amount: 0 },
            recentActions: [{ title: "Expansion check-in", at: ago(24 * 12), status: "sent", opened: true, replied: false }],
        },
        "demo-kite-labs": {
            id: "demo-kite-labs", name: "Kite Labs", email: "finance@kitelabs.io", plan: "Growth", seats: 18, mrr: 12900,
            status: "High risk", healthScore: 38, riskScore: 74, lastActiveAt: ago(26), customerSince: ago(24 * 410), website: "kitelabs.io",
            riskReasons: ["Usage down 48% in 30 days", "Analyst (main user) left the team", "Renewal in 23 days"], previousRiskScore: 61, activeDays30d: 9, unpaid: { count: 0, amount: 0 },
            recentActions: [
                { title: "Renewal check-in", at: ago(30), status: "sent", opened: true, replied: true },
                { title: "Reporting feature tips", at: ago(24 * 16), status: "sent", opened: false, replied: false },
            ],
        },
        "demo-novapay": {
            id: "demo-novapay", name: "NovaPay", email: "ops@novapay.io", plan: "Pro", seats: 32, mrr: 13200,
            status: "Recovered", healthScore: 71, riskScore: 28, lastActiveAt: ago(3), customerSince: ago(24 * 620), website: "novapay.io",
            riskReasons: ["Card declined after fraud alert"], previousRiskScore: 64, activeDays30d: 24, unpaid: { count: 0, amount: 0 },
            recentActions: [{ title: "Payment recovery email", at: ago(52), status: "sent", opened: true, replied: true }],
        },
        "demo-cedarworks": {
            id: "demo-cedarworks", name: "CedarWorks", email: "success@cedarworks.io", plan: "Pro", seats: 24, mrr: 21900,
            status: "Critical risk", healthScore: 22, riskScore: 91, lastActiveAt: ago(24 * 9), customerSince: ago(24 * 365), website: "cedarworks.io",
            riskReasons: ["No logins for 9 days", "Seats used fell from 24 to 7", "Support tickets up 3×"], previousRiskScore: 83, activeDays30d: 4, unpaid: { count: 1, amount: 2190 },
            recentActions: [
                { title: "What's new recap", at: ago(70), status: "sent", opened: true, replied: false },
                { title: "Win-back offer", at: ago(24 * 21), status: "sent", opened: false, replied: false },
            ],
        },
        "demo-brightops": {
            id: "demo-brightops", name: "BrightOps", email: "team@brightops.io", plan: "Growth", seats: 25, mrr: 8400,
            status: "Healthy", healthScore: 86, riskScore: 12, lastActiveAt: ago(1), customerSince: ago(24 * 180), website: "brightops.io",
            riskReasons: [], previousRiskScore: 15, activeDays30d: 29, unpaid: { count: 0, amount: 0 },
            recentActions: [{ title: "Annual plan offer", at: ago(96), status: "sent", opened: true, replied: true }],
        },
    };

    return buildThreads(raw).map((thread) => ({
        ...thread,
        account: thread.customerId ? accounts[thread.customerId] ?? null : null,
        starred: thread.customerId === "demo-kite-labs" || thread.customerId === "demo-brightops",
    }));
}
