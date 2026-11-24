/**
 * Metrics from per-customer monthly MRR snapshots. Pure functions, MINOR
 * units, one currency (filter rows before calling).
 *
 * For each month M against the month before it (M-1), per customer:
 *   new          paying in M, not in M-1, never paying before
 *   reactivation paying in M, not in M-1, but paying in some earlier month
 *   expansion    paying in both, MRR went up
 *   contraction  paying in both, MRR went down
 *   churned      paying in M-1, not paying in M (lost MRR = M-1 MRR)
 *
 * so  MRR(M) = MRR(M-1) + new + reactivation + expansion - contraction - churned
 *
 * Logo churn % for M = churned customers / customers paying at end of M-1.
 * NRR for M = (start + expansion - contraction - churned) / start
 * GRR for M = (start - contraction - churned) / start
 */

export type SnapshotRow = {
    stripeCustomerId: string;
    month: string;
    mrrMinor: number;
    trialMrrMinor?: number | null;
};

export type CustomerMove = {
    stripeCustomerId: string;
    kind: "new" | "reactivation" | "expansion" | "contraction" | "churned";
    deltaMinor: number;
    fromMinor: number;
    toMinor: number;
};

export type MonthMetrics = {
    month: string;
    mrrMinor: number;
    trialMrrMinor: number;
    /** Paying customers at the end of the month. */
    payingCustomers: number;
    /** Customers in trial at the end of the month (not paying). */
    trialingCustomers: number;
    /** Null for the first month (no previous month to compare). */
    startMrrMinor: number | null;
    newMinor: number;
    reactivationMinor: number;
    expansionMinor: number;
    contractionMinor: number;
    churnedMinor: number;
    newCustomers: number;
    reactivatedCustomers: number;
    churnedCustomers: number;
    upgrades: number;
    downgrades: number;
    newTrials: number;
    churnPct: number | null;
    nrrPct: number | null;
    grrPct: number | null;
    moves: CustomerMove[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * `months` must be consecutive and oldest first. Rows for months before
 * `months[0]` are used to tell new from reactivated customers and to give the
 * first month a starting point; include at least the month before.
 */
export function computeMonthlyMetrics(rows: SnapshotRow[], months: string[]): MonthMetrics[] {
    const paying = new Map<string, Map<string, number>>(); // month -> customer -> mrr
    const trial = new Map<string, Map<string, number>>();
    const firstPaidMonth = new Map<string, string>();

    for (const row of rows) {
        const mrr = Number(row.mrrMinor || 0);
        const t = Number(row.trialMrrMinor || 0);
        if (mrr > 0) {
            const m = paying.get(row.month) ?? new Map<string, number>();
            m.set(row.stripeCustomerId, (m.get(row.stripeCustomerId) ?? 0) + mrr);
            paying.set(row.month, m);
            const first = firstPaidMonth.get(row.stripeCustomerId);
            if (!first || row.month < first) firstPaidMonth.set(row.stripeCustomerId, row.month);
        } else if (t > 0) {
            const m = trial.get(row.month) ?? new Map<string, number>();
            m.set(row.stripeCustomerId, (m.get(row.stripeCustomerId) ?? 0) + t);
            trial.set(row.month, m);
        }
    }

    const prevKey = (key: string) => {
        const [y, m] = key.split("-").map(Number);
        const d = new Date(Date.UTC(y, m - 2, 1));
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    };
    const allMonthsWithData = new Set(rows.map((r) => r.month));
    const sum = (m?: Map<string, number>) => Array.from(m?.values() ?? []).reduce((a, b) => a + b, 0);

    return months.map((month) => {
        const prev = prevKey(month);
        const cur = paying.get(month) ?? new Map<string, number>();
        const before = paying.get(prev) ?? new Map<string, number>();
        const curTrial = trial.get(month) ?? new Map<string, number>();
        const prevTrial = trial.get(prev) ?? new Map<string, number>();
        const hasPrev = allMonthsWithData.has(prev) || month !== months[0];

        const moves: CustomerMove[] = [];
        let newMinor = 0, reactivationMinor = 0, expansionMinor = 0, contractionMinor = 0, churnedMinor = 0;
        let newCustomers = 0, reactivatedCustomers = 0, churnedCustomers = 0, upgrades = 0, downgrades = 0;

        if (hasPrev) {
            for (const [id, to] of cur) {
                const from = before.get(id) ?? 0;
                if (from <= 0) {
                    const first = firstPaidMonth.get(id);
                    const isReactivation = !!first && first < month && first !== month;
                    if (isReactivation) {
                        reactivationMinor += to;
                        reactivatedCustomers += 1;
                        moves.push({ stripeCustomerId: id, kind: "reactivation", deltaMinor: to, fromMinor: 0, toMinor: to });
                    } else {
                        newMinor += to;
                        newCustomers += 1;
                        moves.push({ stripeCustomerId: id, kind: "new", deltaMinor: to, fromMinor: 0, toMinor: to });
                    }
                } else if (to > from) {
                    expansionMinor += to - from;
                    upgrades += 1;
                    moves.push({ stripeCustomerId: id, kind: "expansion", deltaMinor: to - from, fromMinor: from, toMinor: to });
                } else if (to < from) {
                    contractionMinor += from - to;
                    downgrades += 1;
                    moves.push({ stripeCustomerId: id, kind: "contraction", deltaMinor: to - from, fromMinor: from, toMinor: to });
                }
            }
            for (const [id, from] of before) {
                if (cur.has(id)) continue;
                churnedMinor += from;
                churnedCustomers += 1;
                moves.push({ stripeCustomerId: id, kind: "churned", deltaMinor: -from, fromMinor: from, toMinor: 0 });
            }
        }

        let newTrials = 0;
        for (const id of curTrial.keys()) {
            if (!prevTrial.has(id) && !before.has(id)) newTrials += 1;
        }

        const startMrrMinor = hasPrev ? sum(before) : null;
        const start = startMrrMinor ?? 0;

        return {
            month,
            mrrMinor: sum(cur),
            trialMrrMinor: sum(curTrial),
            payingCustomers: cur.size,
            trialingCustomers: curTrial.size,
            startMrrMinor,
            newMinor,
            reactivationMinor,
            expansionMinor,
            contractionMinor,
            churnedMinor,
            newCustomers,
            reactivatedCustomers,
            churnedCustomers,
            upgrades,
            downgrades,
            newTrials,
            churnPct: hasPrev && before.size > 0 ? round1((churnedCustomers / before.size) * 100) : null,
            nrrPct: hasPrev && start > 0 ? round1(((start + expansionMinor - contractionMinor - churnedMinor) / start) * 100) : null,
            grrPct: hasPrev && start > 0 ? round1(((start - contractionMinor - churnedMinor) / start) * 100) : null,
            moves: moves.sort((a, b) => Math.abs(b.deltaMinor) - Math.abs(a.deltaMinor)),
        };
    });
}
