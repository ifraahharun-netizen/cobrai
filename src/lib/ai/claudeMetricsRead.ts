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

const MetricsReadSchema = z.object({
    headline: z.string(),
    health: z.enum(["strong", "steady", "watch", "concerning"]),
    summary: z.string(),
    findings: z.array(FindingSchema),
    watchNext: z.array(z.string()),
    chartNotes: z.array(ChartNoteSchema),
});

export type MetricsRead = z.infer<typeof MetricsReadSchema>;
export type MetricFinding = z.infer<typeof FindingSchema>;
export type ChartNote = z.infer<typeof ChartNoteSchema>;

const SYSTEM_PROMPT = `You are Cobrai's revenue analyst. You read a B2B SaaS company's retention metrics and explain, in plain English, what they mean and what to do.

Return:
- headline: one sentence, at most 14 words, naming the single most important thing happening.
- health: strong, steady, watch or concerning, judged from the whole picture.
- summary: two or three sentences, at most 60 words, connecting the metrics (for example how churn, revenue at risk and revenue protected relate).
- findings: one finding for each metric that has data, keyed by "metric". For each:
  - title: at most 8 words.
  - observation: what the numbers show, quoting the figures, at most 25 words.
  - whyItMatters: the business consequence, at most 25 words.
  - action: one concrete next step, at most 14 words, starting with a verb.
  - sentiment: good, bad or neutral for the business. Remember that lower churn and lower revenue at risk are good.
  - confidence: low when the series is short or values are missing.
- watchNext: two or three short things to keep an eye on, at most 12 words each.
- chartNotes: up to four notes pinned to specific points on the MRR chart (chart "mrr", from totalMrrSeries) and the churn chart (chart "churn", from churnSeries). Pick the points a team would ask about: the largest jumps or drops, a new high or low, a turning point. For each:
  - label: copy the point's label exactly from that series' labels.
  - title: at most 5 words, e.g. "Churn spike" or "Biggest MRR gain".
  - detail: what changed at that point versus the one before, quoting the figures, at most 22 words.
  - sentiment: good, bad or neutral for the business.
  Return an empty list when the series are empty or too short to call anything out.

Series labels tell you the period: daily labels mean daily values, month labels mean monthly values. activeUsersSeries is either daily active users or monthly total subscribers; describe it accordingly. Empty series mean no data.

Only use the numbers given. Do not invent causes, customers or events the data does not show; say "likely" when you infer. Treat null as unknown, not zero. Money is in the currency given. Percentages are percent values (2.6 means 2.6%).`;

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
