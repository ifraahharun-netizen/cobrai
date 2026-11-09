// Pure helpers for the Metrics page: period selection, MRR movement,
// net / gross revenue retention and subscriber cohorts.

export type PeriodKey = "3m" | "6m" | "12m";

export const PERIODS: Array<{ key: PeriodKey; label: string; months: number; long: string }> = [
    { key: "3m", label: "3M", months: 3, long: "Last 3 months" },
    { key: "6m", label: "6M", months: 6, long: "Last 6 months" },
    { key: "12m", label: "12M", months: 12, long: "Last 12 months" },
];

export function periodMonths(period: PeriodKey) {
    return PERIODS.find((p) => p.key === period)?.months ?? 12;
}

export function periodLong(period: PeriodKey) {
    return PERIODS.find((p) => p.key === period)?.long ?? "Last 12 months";
}

type Point = { x: string; y: number | null };

export type ActivityRow = {
    month: string;
    newSubscribers?: number | null;
    totalSubscribers?: number | null;
    churned?: number | null;
    upgrades?: number | null;
};

export function monthName(monthKey: string, withYear = true) {
    const parsed = new Date(`${monthKey.slice(0, 7)}-01T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return monthKey;
    return new Intl.DateTimeFormat("en-GB", withYear ? { month: "short", year: "numeric" } : { month: "short" }).format(parsed);
}

/**
 * The value to compare the latest point against: the point `months` before it,
 * or the earliest point when the history is shorter than that.
 */
export function periodBaseline(series: Point[], months: number) {
    const clean = series.filter((p): p is { x: string; y: number } => typeof p.y === "number" && Number.isFinite(p.y));
    if (clean.length < 2) return null;
    const index = Math.max(0, clean.length - 1 - months);
    return { value: clean[index].y, month: clean[index].x, partial: clean.length - 1 < months };
}

/** The `months` points before the visible window, for a "previous period" overlay. */
export function previousPeriodValues(series: Point[], months: number): number[] | null {
    if (series.length < months * 2) return null;
    return series.slice(-months * 2, -months).map((p) => Number(p.y ?? 0));
}

export type MovementMonth = {
    month: string;
    startMrr: number;
    endMrr: number;
    newMrr: number;
    expansion: number;
    contraction: number;
    churned: number;
};

/**
 * Splits each month's MRR change into new, expansion, contraction and churned
 * revenue. Churned = opening MRR × churn rate; new = new subscribers × average
 * revenue per subscriber; whatever is left is the net change from existing
 * customers (expansion when positive, contraction when negative).
 * It's an estimate from the monthly totals, not from individual subscriptions.
 */
export function buildMrrMovement(mrr: Point[], churn: Point[], activity: ActivityRow[]): MovementMonth[] {
    const churnBy = new Map(churn.map((p) => [p.x.slice(0, 7), Number(p.y ?? 0)]));
    const activityBy = new Map(activity.map((row) => [String(row.month).slice(0, 7), row]));
    const months: MovementMonth[] = [];

    for (let i = 1; i < mrr.length; i += 1) {
        const start = Number(mrr[i - 1].y ?? 0);
        const end = Number(mrr[i].y ?? 0);
        if (!start || !end) continue;
        const key = mrr[i].x.slice(0, 7);
        const churnPct = churnBy.get(key) ?? 0;
        const row = activityBy.get(key);

        const churned = (start * churnPct) / 100;
        const subscribers = Number(row?.totalSubscribers || 0);
        const arpa = subscribers > 0 ? end / subscribers : 0;
        const newMrr = Math.max(0, Number(row?.newSubscribers || 0) * arpa);
        const existingNet = end - start - newMrr + churned;

        months.push({
            month: key,
            startMrr: start,
            endMrr: end,
            newMrr,
            expansion: Math.max(0, existingNet),
            contraction: Math.max(0, -existingNet),
            churned,
        });
    }

    return months;
}

/** Net and gross revenue retention over the given months of movement. */
export function computeRetention(movement: MovementMonth[]) {
    if (!movement.length) return null;
    const start = movement[0].startMrr;
    if (!start) return null;
    const sum = (key: keyof Omit<MovementMonth, "month" | "startMrr" | "endMrr">) =>
        movement.reduce((total, m) => total + m[key], 0);

    const expansion = sum("expansion");
    const contraction = sum("contraction");
    const churned = sum("churned");
    const newMrr = sum("newMrr");

    return {
        nrr: ((start + expansion - contraction - churned) / start) * 100,
        grr: (Math.max(0, start - contraction - churned) / start) * 100,
        newMrr,
        expansion,
        contraction,
        churned,
        net: newMrr + expansion - contraction - churned,
        startMrr: start,
        months: movement.length,
    };
}

export type Cohort = {
    month: string;
    size: number;
    /** Retention % by months since joining; index 0 is the joining month (100%). */
    retention: number[];
};

/**
 * Subscriber cohorts for the demo workspace, built from its monthly churn
 * and new-subscriber figures. New customers churn faster in their first
 * months, so early months carry a higher churn rate.
 */
export function buildDemoCohorts(churn: Point[], activity: ActivityRow[], count = 8): Cohort[] {
    const churnRates = churn.map((p) => Number(p.y ?? 0) / 100);
    const early = [0, 2.1, 1.6, 1.3, 1.15];
    const cohorts: Cohort[] = [];
    const start = Math.max(0, activity.length - count);

    for (let c = start; c < activity.length; c += 1) {
        const retention = [100];
        let kept = 1;
        for (let k = 1; c + k < churnRates.length; k += 1) {
            const factor = early[k] ?? 1;
            kept *= 1 - Math.min(0.5, churnRates[c + k] * factor);
            retention.push(Math.round(kept * 1000) / 10);
        }
        cohorts.push({
            month: String(activity[c].month).slice(0, 7),
            size: Number(activity[c].newSubscribers || 0),
            retention,
        });
    }

    return cohorts;
}

/** Tiny SVG path for a KPI sparkline. */
export function sparklinePath(values: number[], width = 96, height = 28) {
    const clean = values.filter((v) => Number.isFinite(v));
    if (clean.length < 2) return null;
    const min = Math.min(...clean);
    const max = Math.max(...clean);
    const span = max - min || 1;
    const step = width / (clean.length - 1);
    const points = clean.map((v, i) => [i * step, height - 2 - ((v - min) / span) * (height - 4)]);
    const line = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const area = `${line} L${width},${height} L0,${height} Z`;
    return { line, area };
}

export function timeAgo(iso: string | null | undefined, now = Date.now()) {
    if (!iso) return null;
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return null;
    const minutes = Math.round((now - then) / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    return `${Math.round(hours / 24)} d ago`;
}
