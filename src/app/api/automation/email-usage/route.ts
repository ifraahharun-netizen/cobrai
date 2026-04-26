import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AuthError, getWorkspaceFromRequest } from "@/lib/auth/getWorkspaceFromRequest";

export const runtime = "nodejs";

const STARTER_WEEKLY_EMAIL_CAP = 5;

function jsonError(message: string, status = 400) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

function startOfNextWeek(from = new Date()) {
    const d = new Date(from);
    const day = d.getDay();
    const daysUntilNextMonday = ((8 - day) % 7) || 7;
    d.setDate(d.getDate() + daysUntilNextMonday);
    d.setHours(0, 0, 0, 0);
    return d;
}

export async function GET(req: Request) {
    try {
        const { workspaceId } = await getWorkspaceFromRequest(req);

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                id: true,
                tier: true,
                emailActionsUsedThisWeek: true,
                emailResetAt: true,
            },
        });

        if (!workspace) {
            return jsonError("Workspace not found", 404);
        }

        const tier = workspace.tier === "pro" ? "pro" : "starter";
        const now = new Date();
        const resetAt = workspace.emailResetAt;
        const shouldResetWindow = !resetAt || resetAt.getTime() <= now.getTime();

        if (tier === "pro") {
            return NextResponse.json({
                ok: true,
                tier: "pro",
                emailUsage: {
                    used: null,
                    limit: null,
                    remaining: null,
                    resetAt: null,
                },
            });
        }

        let used = workspace.emailActionsUsedThisWeek ?? 0;
        let nextResetAt = resetAt;

        if (shouldResetWindow) {
            const updated = await prisma.workspace.update({
                where: { id: workspaceId },
                data: {
                    emailActionsUsedThisWeek: 0,
                    emailResetAt: startOfNextWeek(now),
                },
                select: {
                    emailActionsUsedThisWeek: true,
                    emailResetAt: true,
                },
            });

            used = updated.emailActionsUsedThisWeek ?? 0;
            nextResetAt = updated.emailResetAt;
        }

        return NextResponse.json({
            ok: true,
            tier: "starter",
            emailUsage: {
                used,
                limit: STARTER_WEEKLY_EMAIL_CAP,
                remaining: Math.max(0, STARTER_WEEKLY_EMAIL_CAP - used),
                resetAt: nextResetAt ? nextResetAt.toISOString() : null,
            },
        });
    } catch (e: any) {
        if (e instanceof AuthError) {
            return jsonError(e.message, e.status);
        }

        console.error("EMAIL USAGE ERROR:", e);

        return NextResponse.json(
            { ok: false, error: "Failed to load email usage" },
            { status: 500 }
        );
    }
}