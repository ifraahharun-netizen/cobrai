import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWorkspaceDataMode } from "@/lib/workspace/getWorkspaceDataMode";
import { runWorkspaceAutomations } from "@/lib/automation/runWorkspaceAutomations";
import { AuthError, getWorkspaceFromRequest } from "@/lib/auth/getWorkspaceFromRequest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTOMATION_COOLDOWN_MS = 60 * 1000;

function badRequest(message: string, status = 400) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

function isTrialActive(trialEndsAt: Date | null) {
    return !!trialEndsAt && trialEndsAt.getTime() > Date.now();
}

export async function POST(req: Request) {
    try {
        const { workspaceId } = await getWorkspaceFromRequest(req);

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                id: true,
                tier: true,
                trialEndsAt: true,
                demoMode: true,
            },
        });

        if (!workspace) {
            return badRequest("Workspace not found", 404);
        }

        const hasAutomationAccess =
            workspace.tier === "pro" ||
            workspace.demoMode === true ||
            isTrialActive(workspace.trialEndsAt);

        if (!hasAutomationAccess) {
            return badRequest(
                "Automation is a Pro feature. Upgrade to access.",
                403
            );
        }

        const recentRun = await prisma.actionExecution.findFirst({
            where: {
                workspaceId,
                createdAt: {
                    gte: new Date(Date.now() - AUTOMATION_COOLDOWN_MS),
                },
            },
            select: { id: true },
        });

        if (recentRun) {
            return badRequest(
                "Automation was run recently. Please wait before running again.",
                429
            );
        }

        const modeInfo = await getWorkspaceDataMode(workspaceId);

        const result = await runWorkspaceAutomations(
            workspaceId,
            modeInfo.connectedIntegrations
        );

        return NextResponse.json(result);
    } catch (error: any) {
        if (error instanceof AuthError) {
            return badRequest(error.message, error.status);
        }

        console.error("POST /api/automation/run-workspace failed", error);

        return NextResponse.json(
            { ok: false, error: "Failed to run workspace automations" },
            { status: 500 }
        );
    }
}