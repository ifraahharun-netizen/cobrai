// lib/ai/claudeMetricsAsk.ts
//
// "Ask Claude" on the Metrics page: answers a question about the workspace's
// retention metrics, grounded only in the figures and accounts the page shows.
// Server-only: needs ANTHROPIC_API_KEY (or another Anthropic credential).

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import {
    CLAUDE_BEHAVIOUR_MODEL,
    ClaudeNotConfiguredError,
    ClaudeRefusedError,
} from "./claudeCustomerBehaviour";
import type { MetricsSnapshot } from "./claudeMetricsRead";

/** An account from the page's Revenue Impact Queue. */
export const AskAccountSchema = z.object({
    name: z.string().max(120),
    opportunity: z.string().max(60),
    valueAtStake: z.number().finite(),
    reason: z.string().max(400),
    suggestedAction: z.string().max(400),
    confidence: z.number().finite().min(0).max(100),
});

export type AskAccount = z.infer<typeof AskAccountSchema>;

export const AskTurnSchema = z.object({
    role: z.enum(["user", "assistant"]),
    text: z.string().max(4000),
});

export type AskTurn = z.infer<typeof AskTurnSchema>;

const AnswerSchema = z.object({
    answer: z.string(),
    followUps: z.array(z.string()),
});

export type MetricsAnswer = z.infer<typeof AnswerSchema>;

const SYSTEM_PROMPT = `You are Cobrai's retention analyst, answering questions from a B2B SaaS team on their Metrics page.

You are given their metrics (JSON) and the accounts in their Revenue Impact Queue. Answer the user's question using only that data.

How to answer:
- Lead with the direct answer in the first sentence. Quote the relevant figures.
- Keep it short: at most 120 words. Use short paragraphs, or "- " bullet lines when listing accounts or steps.
- When the question is about what to do, name specific accounts from the queue, the value at stake, and the next step.
- Say "likely" when you infer a cause. If the data can't answer the question, say what's missing and what would answer it.
- Never invent customers, events, causes or numbers that aren't in the data. Treat null as unknown, not zero.
- Plain text only: no markdown headings, bold or tables.

Also return followUps: three short follow-up questions (at most 9 words each) the user might ask next, specific to their data.

Money is in the currency given. Percentages are percent values (2.6 means 2.6%). Lower churn and lower revenue at risk are good.`;

export async function askAboutMetrics(input: {
    snapshot: MetricsSnapshot;
    accounts: AskAccount[];
    history: AskTurn[];
    question: string;
}): Promise<MetricsAnswer> {
    const client = new Anthropic();

    const data = `Metrics (JSON):\n${JSON.stringify(input.snapshot)}\n\nRevenue Impact Queue (JSON):\n${JSON.stringify(input.accounts)}`;

    let response;

    try {
        response = await client.beta.messages.parse({
            model: CLAUDE_BEHAVIOUR_MODEL,
            max_tokens: 8000,
            output_config: {
                effort: "medium",
                format: betaZodOutputFormat(AnswerSchema),
            },
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            // The instructions and the page's data stay the same for a whole
            // conversation, so cache them; only the questions change.
            system: [
                { type: "text", text: SYSTEM_PROMPT },
                { type: "text", text: data, cache_control: { type: "ephemeral" } },
            ],
            messages: [
                ...input.history.map((turn) => ({ role: turn.role, content: turn.text })),
                { role: "user" as const, content: input.question },
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
        throw new ClaudeRefusedError("Claude declined to answer that question.");
    }

    if (!response.parsed_output) {
        throw new Error("Claude returned a response that did not match the expected format.");
    }

    return {
        answer: response.parsed_output.answer.trim(),
        followUps: response.parsed_output.followUps.map((q) => q.trim()).filter(Boolean).slice(0, 3),
    };
}
