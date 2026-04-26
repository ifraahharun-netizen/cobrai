export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";

function bearer(req: Request) {
    const auth = req.headers.get("authorization") || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) throw new Error("Unauthorized");
    return m[1];
}

export async function POST(req: NextRequest) {
    try {
        const token = bearer(req);
        const decoded = await verifyFirebaseIdToken(token);

        const user = await prisma.user.findUnique({
            where: { firebaseUid: decoded.uid },
            select: { workspaceId: true },
        });

        if (!user?.workspaceId) {
            return NextResponse.json({ ok: false, error: "No workspace" }, { status: 401 });
        }

        // ✅ Parse body early (so we have actionId before we do anything else)
        const body = await req.json().catch(() => ({}));
        const actionId = body?.actionId as string | undefined;

        if (!actionId) {
            return NextResponse.json({ ok: false, error: "Missing actionId" }, { status: 400 });
        }

        // ✅ Fetch action first (needed for type checks + ownership)
        const action = await prisma.retentionAction.findUnique({
            where: { id: actionId },
            include: { plan: { select: { workspaceId: true } } },
        });

        if (!action || action.plan.workspaceId !== user.workspaceId) {
            return NextResponse.json({ ok: false, error: "Action not found" }, { status: 404 });
        }

        // ✅ Read workspace tier + counters
        const workspace = await prisma.workspace.findUnique({
            where: { id: user.workspaceId },
            select: {
                tier: true,
                emailActionsUsedThisWeek: true,
                emailResetAt: true,
            },
        });

        const tier = workspace?.tier ?? "starter";

        // ✅ Reset weekly counter safely
        const now = new Date();
        const usedThisWeek = Number(workspace?.emailActionsUsedThisWeek ?? 0);

        // If resetAt is missing OR in the past => reset and set next reset 7 days from now
        if (!workspace?.emailResetAt || workspace.emailResetAt < now) {
            await prisma.workspace.update({
                where: { id: user.workspaceId },
                data: {
                    emailActionsUsedThisWeek: 0,
                    emailResetAt: new Date(Date.now() + 7 * 86400000),
                },
            });
        }

        // ✅ Enforce starter limit (2 automated emails/week)
        if (action.type === "email") {
            // if we just reset above, treat used as 0 (safe)
            const effectiveUsed =
                !workspace?.emailResetAt || workspace.emailResetAt < now ? 0 : usedThisWeek;

            if (tier === "starter" && effectiveUsed >= 2) {
                return NextResponse.json(
                    {
                        ok: false,
                        error: "Starter limit: 2 automated emails per week",
                    },
                    { status: 403 }
                );
            }
        }

        // ✅ mark executing -> applied
        await prisma.retentionAction.update({
            where: { id: actionId },
            data: { status: "executing" },
        });

        // ✅ log execution (placeholder for now)
        await prisma.actionExecution.create({
            data: {
                actionId,
                status: "success",
                provider: "internal",
                request: (action as any).payload ?? undefined,
                response: { note: "Applied (MVP). Plug provider execution here." } as any,
            },
        });

        const updated = await prisma.retentionAction.update({
            where: { id: actionId },
            data: { status: "applied", appliedAt: new Date(), lastError: null },
        });

        // ✅ increment weekly email counter only after successful apply
        if (action.type === "email") {
            await prisma.workspace.update({
                where: { id: user.workspaceId },
                data: {
                    emailActionsUsedThisWeek: { increment: 1 },
                },
            });
        }

        return NextResponse.json({ ok: true, action: updated });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
    }
}
