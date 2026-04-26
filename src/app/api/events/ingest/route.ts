import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    const workspaceId = "ws_demo"; // later from auth + per-tenant API keys
    const body = await req.json().catch(() => ({}));

    // expected:
    // { customerId, type, occurredAt?, value? }
    const customerId = String(body?.customerId ?? "");
    const type = String(body?.type ?? "");
    if (!customerId || !type) {
        return NextResponse.json({ error: "Missing customerId or type" }, { status: 400 });
    }

    // ensure customer exists
    const customer = await prisma.customer.findFirst({ where: { id: customerId, workspaceId } });
    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

    const occurredAt = body?.occurredAt ? new Date(body.occurredAt) : new Date();
    const value = body?.value === undefined ? null : Number(body.value);

    await prisma.event.create({
        data: { workspaceId, customerId, type, occurredAt, value },
    });

    // update last active for “activity” types
    if (type === "login" || type === "key_action" || type === "feature_used") {
        await prisma.customer.update({
            where: { id: customerId },
            data: { lastActiveAt: occurredAt },
        });
    }

    return NextResponse.json({ ok: true });
}
