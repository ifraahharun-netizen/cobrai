import { NextResponse } from "next/server";
import { ratelimit } from "@/lib/rateLimit";
import { loadSnapshot } from "@/lib/ai/metricsSnapshot";
import { ClaudeNotConfiguredError, ClaudeRefusedError } from "@/lib/ai/claudeCustomerBehaviour";
import {
    interpretMetrics,
    MetricsSnapshotSchema,
    type MetricsSnapshot,
} from "@/lib/ai/claudeMetricsRead";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Metrics only (no Claude call), for the page to render straight away. */
export async function GET(req: Request) {
    try {
        const { snapshot } = await loadSnapshot(req);
        if (!snapshot) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
        return NextResponse.json({ metrics: snapshot });
    } catch (error) {
        console.error("Metrics snapshot failed", error);
        return NextResponse.json({ error: "Could not load metrics." }, { status: 500 });
    }
}

/** Metrics plus Claude's interpretation. */
export async function POST(req: Request) {
    try {
        const { workspaceId, snapshot } = await loadSnapshot(req);
        if (!snapshot) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

        const { success, reset } = await ratelimit.limit(`ai-metrics:${workspaceId}`);

        if (!success) {
            return NextResponse.json(
                { error: "Too many requests. Please try again shortly." },
                {
                    status: 429,
                    headers: { "Retry-After": String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))) },
                }
            );
        }

        // A page may send the exact figures it shows, so Claude's read matches it.
        // Currency and demo/live always come from the server.
        const body = (await req.json().catch(() => null)) as { snapshot?: unknown } | null;
        const sent = body?.snapshot ? MetricsSnapshotSchema.safeParse(body.snapshot) : null;
        const figures: MetricsSnapshot = sent?.success
            ? { ...sent.data, currency: snapshot.currency, source: snapshot.source }
            : snapshot;

        const read = await interpretMetrics(figures);

        return NextResponse.json({
            metrics: figures,
            read,
            analysedAt: new Date().toISOString(),
        });
    } catch (error) {
        if (error instanceof ClaudeNotConfiguredError) {
            return NextResponse.json({ error: error.message }, { status: 503 });
        }

        if (error instanceof ClaudeRefusedError) {
            return NextResponse.json({ error: error.message }, { status: 422 });
        }

        console.error("Claude metrics read failed", error);

        return NextResponse.json(
            {
                error: "Claude could not analyse your metrics right now.",
                ...(process.env.NODE_ENV !== "production" && error instanceof Error
                    ? { detail: error.message }
                    : {}),
            },
            { status: 500 }
        );
    }
}
