import { prisma } from "@/lib/prisma";

const STARTER_EMAIL_LIMIT = 5;
const RESET_DAYS = 7;

function nextResetDate(from = new Date()) {
    const d = new Date(from);
    d.setDate(d.getDate() + RESET_DAYS);
    return d;
}

export async function getWorkspaceEmailUsageState(workspaceId: string) {
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
        throw new Error("Workspace not found");
    }

    const now = new Date();

    let emailActionsUsedThisWeek = workspace.emailActionsUsedThisWeek ?? 0;
    let emailResetAt = workspace.emailResetAt;

    const shouldReset =
        !emailResetAt || new Date(emailResetAt).getTime() <= now.getTime();

    if (shouldReset) {
        const updated = await prisma.workspace.update({
            where: { id: workspaceId },
            data: {
                emailActionsUsedThisWeek: 0,
                emailResetAt: nextResetDate(now),
            },
            select: {
                id: true,
                tier: true,
                emailActionsUsedThisWeek: true,
                emailResetAt: true,
            },
        });

        emailActionsUsedThisWeek = updated.emailActionsUsedThisWeek ?? 0;
        emailResetAt = updated.emailResetAt;
    }

    const tier = workspace.tier === "pro" ? "pro" : "starter";
    const remaining =
        tier === "pro"
            ? null
            : Math.max(0, STARTER_EMAIL_LIMIT - emailActionsUsedThisWeek);

    return {
        workspaceId: workspace.id,
        tier,
        used: emailActionsUsedThisWeek,
        limit: STARTER_EMAIL_LIMIT,
        remaining,
        resetAt: emailResetAt,
    };
}

export async function assertEmailActionAllowed(workspaceId: string) {
    const state = await getWorkspaceEmailUsageState(workspaceId);

    if (state.tier === "pro") {
        return state;
    }

    if (state.used >= state.limit) {
        const err = new Error("Starter email limit reached");
        (err as Error & { code?: string }).code = "STARTER_EMAIL_LIMIT_REACHED";
        throw err;
    }

    return state;
}

export async function incrementEmailActionUsage(workspaceId: string) {
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
        throw new Error("Workspace not found");
    }

    if (workspace.tier === "pro") {
        return {
            used: workspace.emailActionsUsedThisWeek ?? 0,
            limit: null,
            remaining: null,
        };
    }

    const now = new Date();
    const shouldReset =
        !workspace.emailResetAt ||
        new Date(workspace.emailResetAt).getTime() <= now.getTime();

    const baseUsed = shouldReset ? 0 : workspace.emailActionsUsedThisWeek ?? 0;
    const nextUsed = baseUsed + 1;

    const updated = await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
            emailActionsUsedThisWeek: nextUsed,
            emailResetAt: shouldReset ? nextResetDate(now) : workspace.emailResetAt,
        },
        select: {
            emailActionsUsedThisWeek: true,
        },
    });

    return {
        used: updated.emailActionsUsedThisWeek,
        limit: STARTER_EMAIL_LIMIT,
        remaining: Math.max(0, STARTER_EMAIL_LIMIT - updated.emailActionsUsedThisWeek),
    };
}