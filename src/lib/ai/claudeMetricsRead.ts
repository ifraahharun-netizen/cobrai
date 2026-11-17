// lib/ai/claudeMetricsRead.ts
//
// Asks Claude to interpret the workspace's headline metrics (MRR, revenue at
// risk, churn, MRR protected, active users) and explain what they mean.
// Server-only: needs ANTHROPIC_API_KEY (or another Anthropic credential).

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import {
    CLAUDE_BEHAVIOUR_MODEL,
    ClaudeNotConfiguredError,
    ClaudeRefusedError,
} from "./claudeCustomerBehaviour";

export const METRIC_KEYS = [
    "totalMrr",
    "mrrAtRisk",
    "churnRate",
    "mrrProtected",
    "activeUsers",
    "subscribers",
    "recovery",
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

const SeriesSchema = z.object({
    labels: z.array(z.string().max(40)).max(60),
    values: z.array(z.number().finite()).max(60),
});

const PairSchema = z.object({
    current: z.number().finite(),
    previous: z.number().finite().nullable(),
});

/** Numbers only; this is everything Claude sees. Also validates figures a page sends. */
export const MetricsSnapshotSchema = z.object({
    currency: z.string().max(3),
    source: z.enum(["live", "demo"]),
    totalMrr: PairSchema,
    mrrAtRisk: PairSchema,
    churnRate: z.object({
        current: z.number().finite().nullable(),
        previous: z.number().finite().nullable(),
    }),
    mrrProtected: PairSchema,
    atRiskAccounts: z.number().finite().nullable(),
    /** Monthly total MRR, when the page has it. */
    totalMrrSeries: SeriesSchema.optional(),
    churnSeries: SeriesSchema,
    mrrProtectedSeries: SeriesSchema,
    /** Daily active users, or monthly total subscribers (see the labels). */
    activeUsersSeries: SeriesSchema,
    /** Monthly subscriber movement: who stayed, who joined, who left. */
    subscriberMovement: z
        .object({
            labels: z.array(z.string().max(40)).max(60),
            returning: z.array(z.number().finite()).max(60),
            new: z.array(z.number().finite()).max(60),
            churned: z.array(z.number().finite()).max(60),
        })
        .optional(),
    /** Revenue that can still be won back, by the action it needs, with the accounts behind it. */
    recovery: z
        .object({
            total: z.number().finite(),
            groups: z
                .array(
                    z.object({
                        action: z.string().max(60),
                        accounts: z.number().finite(),
                        value: z.number().finite(),
                    })
                )
                .max(10),
            accounts: z
                .array(
                    z.object({
                        name: z.string().max(120),
                        action: z.string().max(60),
                        value: z.number().finite(),
                        reason: z.string().max(300),
                        suggestedAction: z.string().max(300),
                    })
                )
                .max(12),
        })
        .optional(),
    /** Next month's projections, as shown on the page. */
    forecast: z
        .object({
            nextMonthMrr: z.number().finite().nullable(),
            nextMonthChurnRate: z.number().finite().nullable(),
            expectedCancellations: z.number().finite().nullable(),
        })
        .optional(),
});

export type MetricsSnapshot = z.infer<typeof MetricsSnapshotSchema>;

const FindingSchema = z.object({
    metric: z.enum(METRIC_KEYS),
    title: z.string(),
    observation: z.string(),
    whyItMatters: z.string(),
    action: z.string(),
    sentiment: z.enum(["good", "bad", "neutral"]),
    confidence: z.enum(["low", "medium", "high"]),
});

const ChartNoteSchema = z.object({
    chart: z.enum(["mrr", "churn"]),
    /** Must be one of the chart series' labels. */
    label: z.string(),
    title: z.string(),
    detail: z.string(),
    sentiment: z.enum(["good", "bad", "neutral"]),
});

const TopActionSchema = z.object({
    /** At most 10 words, starting with a verb. */
    title: z.string(),
    /** Why this first and how, at most 30 words. */
    detail: z.string(),
    /** Account names copied from recovery.accounts; empty when the action is not about specific accounts. */
    accounts: z.array(z.string()),
    /** Money this action addresses, in the snapshot currency; null when not about money. */
    value: z.number().nullable(),
});

const MetricsReadSchema = z.object({
    headline: z.string(),
    topAction: TopActionSchema,
    health: z.enum(["strong", "steady", "watch", "concerning"]),
    summary: z.string(),
    findings: z.array(FindingSchema),
    watchNext: z.array(z.string()),
    chartNotes: z.array(ChartNoteSchema),
});

export type MetricsRead = z.infer<typeof MetricsReadSchema>;
export type MetricFinding = z.infer<typeof FindingSchema>;
export type ChartNote = z.infer<typeof ChartNoteSchema>;
export type TopAction = z.infer<typeof TopActionSchema>;

const SYSTEM_PROMPT = `You are Cobrai's revenue analyst. You read a B2B SaaS company's retention metrics and tell the team what they would not spot from the dashboard on their own, and what to do about it.

The page already shows the headline numbers in big cards: total MRR, revenue at risk, churn rate and active subscribers, each with its change. Do not simply restate them. Your value is in:
- what changed or looks unusual (a turning point, a slowdown, a streak, a gap between two metrics);
- connections between metrics, e.g. MRR growing while new sign-ups fall means growth is coming from existing customers;
- the specific accounts and money behind the risk, from recovery.accounts;
- what is likely to happen next, from forecast.

Return:
- headline: one sentence, at most 16 words, naming the single most important insight. Prefer a change or a tension over a total. Example: "MRR is up, but new sign-ups fell 23%: growth now relies on existing customers."
- health: strong, steady, watch or concerning, judged from the whole picture.
- topAction: the one thing to do first this week.
  - title: at most 10 words, starting with a verb, e.g. "Fix 2 failed payments worth £348".
  - detail: why this first and how, at most 30 words.
  - accounts: account names copied exactly from recovery.accounts that this action is about (at most 4); empty if it is not about specific accounts.
  - value: the money this action addresses, or null.
  Pick by money at stake and how fixable it is: failed payments are usually the fastest win.
- summary: two or three sentences, at most 60 words, connecting the metrics.
- findings: up to four findings, ordered by importance, each keyed by "metric" (totalMrr, mrrAtRisk, churnRate, mrrProtected, activeUsers, subscribers, recovery). Skip a metric if all you could say is its current value. For each:
  - title: at most 8 words, naming the insight, not the number.
  - observation: what the numbers show, quoting the figures, at most 25 words.
  - whyItMatters: the business consequence, at most 25 words.
  - action: one concrete next step, at most 14 words, starting with a verb. Name accounts or amounts when you have them; avoid generic advice like "monitor" or "review".
  - sentiment: good, bad or neutral for the business. Remember that lower churn and lower revenue at risk are good.
  - confidence: low when the series is short or values are missing.
- watchNext: two or three short things to keep an eye on next month, at most 12 words each, with a number or threshold where possible.
- chartNotes: up to four notes pinned to specific points on the MRR chart (chart "mrr", from totalMrrSeries) and the churn chart (chart "churn", from churnSeries). Pick the points a team would ask about: the largest jumps or drops, a new high or low, a turning point. For each:
  - label: copy the point's label exactly from that series' labels.
  - title: at most 5 words, e.g. "Churn spike" or "Biggest MRR gain".
  - detail: what changed at that point versus the one before, quoting the figures, at most 22 words.
  - sentiment: good, bad or neutral for the business.
  Return an empty list when the series are empty or too short to call anything out.

Series labels tell you the period: daily labels mean daily values, month labels mean monthly values. activeUsersSeries is either daily active users or monthly total subscribers; describe it accordingly. subscriberMovement gives, for each month, returning, new and churned subscribers.

Only use the numbers and names given. Never invent account names, causes, customers or events the data does not show; say "likely" when you infer. Treat null as unknown, not zero. Missing sections mean no data. Money is in the currency given, in major units (348 means 348.00). Percentages are percent values (2.6 means 2.6%).`;

export async function interpretMetrics(snapshot: MetricsSnapshot): Promise<MetricsRead> {
    const client = new Anthropic();

    let response;

    try {
        response = await client.beta.messages.parse({
            model: CLAUDE_BEHAVIOUR_MODEL,
            max_tokens: 16000,
            output_config: {
                effort: "medium",
                format: betaZodOutputFormat(MetricsReadSchema),
            },
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
            messages: [
                {
                    role: "user",
                    content: `Metrics (JSON):\n${JSON.stringify(snapshot, null, 2)}`,
                },
            ],
        });
    } catch (error) {
        if (
            error instanceof Anthropic.AuthenticationError ||
            (error instanceof Error && /api key|apiKey|authentication/i.test(error.message))
        ) {
            throw new ClaudeNotConfiguredError(
                "Claude is not configured. Add ANTHROPIC_API_KEY to your environment."
            );
        }

        throw error;
    }

    if (response.stop_reason === "refusal") {
        throw new ClaudeRefusedError("Claude declined to analyse these metrics.");
    }

    if (!response.parsed_output) {
        throw new Error("Claude returned a response that did not match the expected format.");
    }

    return response.parsed_output;
}
