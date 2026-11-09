import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { AuthError, getWorkspaceFromRequest } from "@/lib/auth/getWorkspaceFromRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mark a thread read, star it, archive it or move it back to the inbox. */
export async function POST(req: Request) {
    try {
        const { workspaceId } = await getWorkspaceFromRequest(req);
        const body = (await req.json().catch(() => null)) as { threadKey?: unknown; action?: unknown } | null;

        const threadKey = typeof body?.threadKey === "string" ? body.threadKey.slice(0, 500) : "";
        const action = body?.action;

        if (!threadKey || !["read", "archive", "unarchive", "star", "unstar"].includes(String(action))) {
            return NextResponse.json({ error: "Invalid request." }, { status: 400 });
        }

        const where = { workspaceId, threadKey };
        const now = new Date();

        if (action === "star" || action === "unstar") {
            const starredAt = action === "star" ? now : null;
            await prisma.inboxThreadState.upsert({
                where: { workspaceId_threadKey: { workspaceId, threadKey } },
                create: { workspaceId, threadKey, starredAt },
                update: { starredAt },
            });
        } else if (action === "read") {
            await prisma.inboxMessage.updateMany({
                where: { ...where, direction: "inbound", readAt: null },
                data: { readAt: now },
            });
        } else {
            // Archive the conversation itself, so threads that include retention
            // emails (which have no inbox_messages row) stay archived too.
            const archivedAt = action === "archive" ? now : null;
            await prisma.$transaction([
                prisma.inboxThreadState.upsert({
                    where: { workspaceId_threadKey: { workspaceId, threadKey } },
                    create: { workspaceId, threadKey, archivedAt },
                    update: { archivedAt },
                }),
                prisma.inboxMessage.updateMany({ where, data: { archivedAt } }),
            ]);
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        // Signed out or no workspace: say so, rather than a server error.
        if (error instanceof AuthError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
            return NextResponse.json(
                { error: "Apply the inbox database migration to use this." },
                { status: 409 }
            );
        }
        console.error("Inbox thread update failed", error);
        return NextResponse.json({ error: "Could not update the conversation." }, { status: 500 });
    }
}
