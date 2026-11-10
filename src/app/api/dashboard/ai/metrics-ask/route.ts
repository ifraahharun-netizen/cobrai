import { NextResponse } from "next/server";
import { z } from "zod";
import { ratelimit } from "@/lib/rateLimit";
import { loadSnapshot } from "@/lib/ai/metricsSnapshot";
import { ClaudeNotConfiguredError, ClaudeRefusedError } from "@/lib/ai/claudeCustomerBehaviour";
import { MetricsSnapshotSchema, type MetricsSnapshot } from "@/lib/ai/claudeMetricsRead";
import { askAboutMetrics, AskAccountSchema, AskTurnSchema } from "@/lib/ai/claudeMetricsAsk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BodySchema = z.object({
    question: z.string().trim().min(1).max(500),
    history: z.array(AskTurnSchema).max(10).default([]),
    snapshot: z.unknown().optional(),
    accounts: z.array(AskAccountSchema).max(20).default([]),
});

/** Answer a question about the Metrics page, grounded in its figures. */
export async function POST(req: Request) {
    try {
        const { workspaceId, snapshot } = await loadSnapshot(req);
        if (!snapshot) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

        const { success, reset } = await ratelimit.limit(`ai-metrics-ask:${workspaceId}`);

        if (!success) {
            return NextResponse.json(
                { error: "Too many questions. Please try again shortly." },
                {
                    status: 429,
                    headers: { "Retry-After": String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))) },
                }
            );
        }

        const parsed = BodySchema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: "Ask a question (up to 500 characters)." }, { status: 400 });
        }

        // Use the exact figures the page shows when it sends them, so answers
        // match the screen. Currency and demo/live always come from the server.
        const sent = parsed.data.snapshot ? MetricsSnapshotSchema.safeParse(parsed.data.snapshot) : null;
        const figures: MetricsSnapshot = sent?.success
            ? { ...sent.data, currency: snapshot.currency, source: snapshot.source }
            : snapshot;

        const result = await askAboutMetrics({
            snapshot: figures,
            accounts: parsed.data.accounts,
            history: parsed.data.history,
            question: parsed.data.question,
        });

        return NextResponse.json(result);
    } catch (error) {
        if (error instanceof ClaudeNotConfiguredError) {
            return NextResponse.json({ error: error.message }, { status: 503 });
        }

        if (error instanceof ClaudeRefusedError) {
            return NextResponse.json({ error: error.message }, { status: 422 });
        }

        console.error("Claude metrics question failed", error);

        return NextResponse.json(
            {
                error: "Claude could not answer right now. Please try again.",
                ...(process.env.NODE_ENV !== "production" && error instanceof Error
                    ? { detail: error.message }
                    : {}),
            },
            { status: 500 }
        );
    }
}
