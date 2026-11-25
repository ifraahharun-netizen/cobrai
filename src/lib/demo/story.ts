/**
 * The one demo story every page tells.
 *
 * Source of truth:
 *   - `buildDemoSeries()` (analytics.ts): MRR, churn and subscriber history.
 *   - `getDemoCustomers()` (customers.ts): the 12 named accounts.
 *   - `DEMO_ACCOUNT_SIGNALS` below: why each named account is (or isn't) at
 *     risk, which ones have a failed payment, and which were saved this month.
 *
 * Everything else (Dashboard KPIs, the summary API's demo branch, Metrics
 * fallbacks, Accounts, Progress, Inbox, Claude's demo snapshot) derives from
 * this file, so the same figures read the same on every page.
 *
 * Units: `Customer.mrr` / `getDemoCustomers().mrr` are MINOR units (pence).
 * Everything this file exports is MAJOR units (pounds) unless the name ends
 * in `Minor`.
 */
import { AT_RISK_THRESHOLD } from "@/lib/risk/thresholds";
import { buildDemoSeries } from "./analytics";
import { getDemoCustomers, type CobraiCustomerListItem } from "./customers";

/** Risk score at which an account needs immediate action. */
export const DEMO_CRITICAL_THRESHOLD = 80;

export type DemoAccountSignal = {
    /** Short reason shown on Accounts and the account page. */
    reasonLabel: string;
    /** Longer reason shown on the Dashboard. */
    reason: string;
    nextAction: string;
    tags: string[];
    /** Unpaid invoice amount (MINOR units), if the latest payment failed. */
    failedPaymentMinor?: number;
    /** Revenue recovered for this account in the last 30 days (MINOR units). */
    savedThisMonthMinor?: number;
    savedBy?: string;
};

/** Keyed by `getDemoCustomers()` id. */
export const DEMO_ACCOUNT_SIGNALS: Record<string, DemoAccountSignal> = {
    "demo-cedarworks": {
        reasonLabel: "Failed payment",
        reason: "Latest invoice failed and product usage dropped 42% in 14 days.",
        nextAction: "Confirm billing contact and resolve payment today.",
        tags: ["billing", "usage"],
        failedPaymentMinor: 21900,
    },
    "demo-kite-labs": {
        reasonLabel: "Failed payment, no activity in 25 days",
        reason: "Renewal payment failed and the main user hasn't logged in for 25 days.",
        nextAction: "Send a personal check-in and fix the card on file.",
        tags: ["billing", "usage"],
        failedPaymentMinor: 12900,
    },
    "demo-nova-pay": {
        reasonLabel: "Usage dropped",
        reason: "Weekly usage is down 35% since last month.",
        nextAction: "Send a value recap and suggest a success call.",
        tags: ["usage"],
        savedThisMonthMinor: 8400,
        savedBy: "Failed payment retried after card update",
    },
    "demo-brightdesk": {
        reasonLabel: "Reduced product activity",
        reason: "Only 3 of 10 seats were active in the last 30 days.",
        nextAction: "Highlight unused features and offer setup support.",
        tags: ["adoption"],
    },
    "demo-orbit-crm": {
        reasonLabel: "Support issue unresolved",
        reason: "Asked how to export all their data while a support ticket is still open.",
        nextAction: "Follow up on the open support request.",
        tags: ["support"],
    },
    "demo-flowbyte": {
        reasonLabel: "Card expires this month",
        reason: "The card on file expires before the next invoice.",
        nextAction: "Ask the customer to update payment details.",
        tags: ["billing"],
    },
    "demo-cloudora": {
        reasonLabel: "Slight decline in weekly usage",
        reason: "Weekly usage dipped slightly after a cancellation was withdrawn.",
        nextAction: "Send a short tips email.",
        tags: ["usage"],
        savedThisMonthMinor: 4700,
        savedBy: "Scheduled cancellation withdrawn after a check-in",
    },
    "demo-signalstack": {
        reasonLabel: "Healthy, light usage",
        reason: "Steady but light usage.",
        nextAction: "Share a short use-case guide.",
        tags: [],
    },
    "demo-paypilot": {
        reasonLabel: "Healthy",
        reason: "Steady usage.",
        nextAction: "Send monthly value summary.",
        tags: [],
    },
    "demo-retainly": {
        reasonLabel: "Healthy",
        reason: "Steady usage.",
        nextAction: "Send monthly value summary.",
        tags: [],
    },
    "demo-launchgrid": {
        reasonLabel: "Healthy, growing",
        reason: "Added two seats this month.",
        nextAction: "Suggest an annual plan.",
        tags: ["expansion"],
    },
    "demo-metriclane": {
        reasonLabel: "Healthy, growing",
        reason: "Usage up 40% this month and asking about more seats.",
        nextAction: "Send an annual-plan quote.",
        tags: ["expansion"],
    },
};

/** Expansion upside per healthy account (MAJOR units). */
const DEMO_EXPANSION_UPSIDE: Record<string, number> = {
    "demo-metriclane": 57,
    "demo-launchgrid": 21,
};

/*
 * Earlier months for series that only exist as demo history. The current
 * month is always computed from the accounts, so these only set the shape.
 */
const MRR_AT_RISK_HISTORY = [742, 705, 688, 731, 612]; // £, oldest first
const REVENUE_SAVED_HISTORY = [58, 92, 74, 113, 96]; // £, oldest first

export type DemoAccount = CobraiCustomerListItem & {
    signal: DemoAccountSignal;
    /** MAJOR units. */
    mrrMajor: number;
    risk: number;
};

function pct(current: number, previous: number) {
    if (!previous) return 0;
    return Number((((current - previous) / previous) * 100).toFixed(1));
}

function sumMajor(accounts: DemoAccount[], pick: (a: DemoAccount) => number | undefined) {
    return accounts.reduce((sum, account) => sum + Number(pick(account) || 0), 0) / 100;
}

export function getDemoAccounts(): DemoAccount[] {
    return getDemoCustomers().map((customer) => ({
        ...customer,
        signal: DEMO_ACCOUNT_SIGNALS[customer.id] ?? {
            reasonLabel: "Healthy",
            reason: "Steady usage.",
            nextAction: "Send monthly value summary.",
            tags: [],
        },
        mrrMajor: Number(customer.mrr || 0) / 100,
        risk: Number(customer.riskScore ?? customer.churnRisk ?? 0),
    }));
}

export function getDemoStory() {
    const series = buildDemoSeries();
    const accounts = getDemoAccounts();

    const last = <T,>(rows: T[], back = 1) => rows[rows.length - back];

    const mrrNow = Number(last(series.mrr).valueMinor) / 100;
    const mrrPrev = Number(last(series.mrr, 2).valueMinor) / 100;
    const churnNow = Number(last(series.churn).valuePct);
    const churnPrev = Number(last(series.churn, 2).valuePct);
    const activityNow = last(series.activityByMonth);
    const activityPrev = last(series.activityByMonth, 2);

    const atRisk = accounts
        .filter((a) => a.risk >= AT_RISK_THRESHOLD)
        .sort((a, b) => b.risk - a.risk);
    const critical = atRisk.filter((a) => a.risk >= DEMO_CRITICAL_THRESHOLD);

    const mrrAtRisk = sumMajor(atRisk, (a) => a.mrr ?? 0);
    const mrrAtRiskSeries = [...MRR_AT_RISK_HISTORY, mrrAtRisk];

    // Risk weighted by MRR across the at-risk accounts (Accounts "Churn exposure").
    const weightedRisk = mrrAtRisk
        ? Math.round(atRisk.reduce((s, a) => s + a.risk * a.mrrMajor, 0) / mrrAtRisk)
        : 0;

    const failedPayments = accounts.filter((a) => a.signal.failedPaymentMinor);
    const saved = accounts.filter((a) => a.signal.savedThisMonthMinor);
    const revenueSaved = sumMajor(saved, (a) => a.signal.savedThisMonthMinor);
    const revenueSavedSeries = [...REVENUE_SAVED_HISTORY, revenueSaved];

    const opportunities = accounts
        .filter((a) => DEMO_EXPANSION_UPSIDE[a.id])
        .map((a) => ({ account: a, upside: DEMO_EXPANSION_UPSIDE[a.id] }));

    return {
        series,
        accounts,
        /** Month keys (YYYY-MM) of the last six months, ending this month. */
        sixMonthKeys: series.mrr.slice(-6).map((p) => p.month),

        totalMrr: { current: mrrNow, previous: mrrPrev, deltaPct: pct(mrrNow, mrrPrev) },
        churnPct: { current: churnNow, previous: churnPrev },
        churnSixMonths: series.churn.slice(-6).map((p) => Number(p.valuePct)),
        subscribers: {
            current: activityNow.totalSubscribers,
            previous: activityPrev.totalSubscribers,
            newThisMonth: activityNow.newSubscribers,
            churnedThisMonth: activityNow.churned,
            trials: activityNow.trials,
            upgrades: activityNow.upgrades,
        },

        atRisk,
        critical,
        mrrAtRisk: {
            current: mrrAtRisk,
            previous: last(mrrAtRiskSeries, 2),
            deltaPct: pct(mrrAtRisk, last(mrrAtRiskSeries, 2)),
            sixMonths: mrrAtRiskSeries,
        },
        weightedRisk,

        failedPayments,
        failedPaymentsTotal: sumMajor(failedPayments, (a) => a.signal.failedPaymentMinor),

        saved,
        revenueSaved: {
            current: revenueSaved,
            previous: last(revenueSavedSeries, 2),
            sixMonths: revenueSavedSeries,
        },

        opportunities,
    };
}

export type DemoStory = ReturnType<typeof getDemoStory>;
