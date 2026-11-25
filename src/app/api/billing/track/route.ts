export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOwnedWorkspace } from "@/lib/apiAuth";
import { ratelimit } from "@/lib/rateLimit";
import {
    CLIENT_CONVERSION_EVENTS,
    trackConversion,
    type ConversionEventName,
} from "@/lib/billing/conversion";

// Records a trial-to-paid funnel event from the browser. Works for locked
// workspaces too (that's when most of these happen).
export async function POST(req: Request) {
    const auth = await requireOwnedWorkspace(req, null);
    if (!auth.ok) return auth.response;

    const limited = await ratelimit.limit(`conversion:${auth.workspaceId}`);
    if (!limited.success) {
        return NextResponse.json({ ok: false }, { status: 429 });
    }

    const body = (await req.json().catch(() => null)) as { name?: unknown; data?: unknown } | null;
    const name = typeof body?.name === "string" ? (body.name as ConversionEventName) : null;
    if (!name || !CLIENT_CONVERSION_EVENTS.has(name)) {
        return NextResponse.json({ ok: false, error: "Unknown event" }, { status: 400 });
    }

    // Keep only short scalar fields (e.g. { tier: "pro", from: "banner" }).
    const data: Record<string, string | number | boolean> = {};
    if (body?.data && typeof body.data === "object") {
        for (const [key, value] of Object.entries(body.data as Record<string, unknown>).slice(0, 5)) {
            if (["string", "number", "boolean"].includes(typeof value) && key.length <= 32) {
                data[key] = typeof value === "string" ? value.slice(0, 64) : (value as number | boolean);
            }
        }
    }

    await trackConversion(auth.workspaceId, name, data);
    return NextResponse.json({ ok: true });
}
