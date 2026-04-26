import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// TEMP: use a default workspace id for local dev.
// Replace with real workspace from auth later.
const DEFAULT_WORKSPACE_ID = "dev-workspace";

export async function GET() {
    try {
        const actions = await prisma.action.findMany({
            orderBy: { createdAt: "desc" },
            take: 100,
        });
        return NextResponse.json({ actions });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message ?? "Failed to load actions" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));

        const title = String(body?.title ?? "").trim();
        if (!title) {
            return NextResponse.json({ error: "Title is required" }, { status: 400 });
        }

        // If your schema requires workspaceId, this stops the red underline.
        const workspaceId = String(body?.workspaceId ?? DEFAULT_WORKSPACE_ID);

        const created = await prisma.action.create({
            data: {
                title,
                done: false,
                workspaceId,
                // keep these only if they exist in your schema; remove if they go red:
                priority: body?.priority ?? "medium",
                customerId: body?.customerId ?? null,
                dueAt: body?.dueAt ? new Date(body.dueAt) : null,
            } as any, // (keeps TS happy if some optional fields vary across your schema)
        });

        return NextResponse.json({ action: created }, { status: 201 });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message ?? "Failed to create action" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const id = String(body?.id ?? "");
        const done = Boolean(body?.done);

        if (!id) {
            return NextResponse.json({ error: "id is required" }, { status: 400 });
        }

        const updated = await prisma.action.update({
            where: { id },
            data: { done },
        });

        return NextResponse.json({ action: updated });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message ?? "Failed to update action" }, { status: 500 });
    }
}

