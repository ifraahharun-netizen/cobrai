import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

export async function POST(req: Request) {
    const body = await req.json().catch(() => ({}));
    const customerId = body?.customerId ?? null;

    // For now: return a fake workflow id so the button is functional.
    // Later: create a Prisma Workflow table + save it.
    const workflowId = randomUUID();

    return NextResponse.json({ workflowId, customerId });
}
