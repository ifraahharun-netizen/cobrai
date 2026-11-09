// lib/ai/claudeCustomerBehaviour.ts
//
// Asks Claude to interpret each customer's numbers (MRR, churn risk, health,
// activity, billing failures) and describe the behaviour behind them.
// Server-only: needs ANTHROPIC_API_KEY (or another Anthropic credential).

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

export const CLAUDE_BEHAVIOUR_MODEL = "claude-opus-5-5";

/** What we send Claude for each customer. Numbers only, no free text from customers. */
export type BehaviourCustomerInput = {
    id: string;
    name: string;
    plan: string | null;
    seats: number | null;
    mrr: number;
    churnRisk: number | null;
    healthScore: number | null;
    daysInactive: number | null;
    failedPayments: number;
    failedPaymentAmount: number;
    status: string | null;
    /** Short system-generated flags, e.g. "usage dropped", "renewal soon". */
    signals: string[];
};

const BehaviourRowSchema = z.object({
    customerId: z.string(),
    customer: z.string(),
    behaviour: z.string(),
    interpretation: z.string(),
    evidence: z.array(z.string()),
    risk: z.enum(["low", "medium", "high", "critical"]),
    trend: z.enum(["improving", "stable", "declining"]),
    nextAction: z.string(),
    confidence: z.enum(["low", "medium", "high"]),
});

const BehaviourReportSchema = z.object({
    summary: z.string(),
    rows: z.array(BehaviourRowSchema),
});

export type BehaviourRow = z.infer<typeof BehaviourRowSchema>;
export type BehaviourReport = z.infer<typeof BehaviourReportSchema>;

const SYSTEM_PROMPT = `You are Cobrai's customer retention analyst. You read account data for a B2B SaaS company and explain, in plain English, what each customer's behaviour means for retention.

For every customer you are given, return one row:
- behaviour: a short pattern name of 2 to 5 words a customer success manager would recognise (for example "Quietly disengaging", "Billing friction", "Expanding usage", "Stable and healthy").
- interpretation: one sentence, at most 25 words, saying what is most likely happening and why it matters. Ground it in the numbers; do not invent events, people or conversations that the data does not show.
- evidence: 2 or 3 short data points from the input that support your read (for example "No activity for 18 days", "Health score 41/100", "2 failed payments (£1,070)").
- risk: low, medium, high or critical churn risk, using the whole picture rather than the churn score alone.
- trend: improving, stable or declining.
- nextAction: one concrete next step, at most 10 words, starting with a verb.
- confidence: how sure you are, given how much data there is. Use low when key fields are missing.

Copy customerId and customer exactly from the input. Order rows from most to least urgent. The summary is one sentence, at most 30 words, describing the overall pattern across these customers.

Money is in the workspace currency shown in the input. If a field is null, treat it as unknown, not zero.`;

export class ClaudeNotConfiguredError extends Error {}
export class ClaudeRefusedError extends Error {}

export async function interpretCustomerBehaviour(args: {
    customers: BehaviourCustomerInput[];
    currency: string;
}): Promise<BehaviourReport> {
    if (args.customers.length === 0) {
        return { summary: "No customers to analyse yet.", rows: [] };
    }

    const client = new Anthropic();

    let response;

    try {
        response = await client.beta.messages.parse({
            model: CLAUDE_BEHAVIOUR_MODEL,
            max_tokens: 16000,
            // Claude Opus 5.5 defaults to medium effort; set it explicitly.
            output_config: {
                effort: "medium",
                format: betaZodOutputFormat(BehaviourReportSchema),
            },
            // If Opus declines on a safety classifier, the API re-runs on a fallback model.
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            system: [
                {
                    type: "text",
                    text: SYSTEM_PROMPT,
                    cache_control: { type: "ephemeral" },
                },
            ],
            messages: [
                {
                    role: "user",
                    content: `Workspace currency: ${args.currency}\n\nCustomers (JSON):\n${JSON.stringify(
                        args.customers,
                        null,
                        2
                    )}`,
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
        throw new ClaudeRefusedError("Claude declined to analyse this data.");
    }

    const parsed = response.parsed_output;

    if (!parsed) {
        throw new Error("Claude returned a response that did not match the expected format.");
    }

    // Keep only rows that refer to customers we actually sent.
    const knownIds = new Set(args.customers.map((customer) => customer.id));

    return {
        summary: parsed.summary,
        rows: parsed.rows.filter((row) => knownIds.has(row.customerId)),
    };
}
