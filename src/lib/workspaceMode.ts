import { prisma } from "@/lib/prisma";

export async function getWorkspaceMode(workspaceId: string): Promise<"demo" | "live"> {
    const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
            demoMode: true,
            stripeConnectedAt: true,
            integrations: { select: { status: true } },
            mrrSnapshots: { select: { id: true }, take: 1 },
        },
    });

    if (!ws) return "demo";

    // If demoMode is explicitly true -> always demo
    if (ws.demoMode) return "demo";

    // If user hasn’t connected anything, stay demo (prevents zero charts)
    const hasConnectedIntegration =
        Boolean(ws.stripeConnectedAt) || ws.integrations.some((i) => i.status === "connected");

    if (!hasConnectedIntegration) return "demo";

    // If connected but no real data yet, still keep demo (until Stripe snapshots exist)
    const hasAnySnapshots = ws.mrrSnapshots.length > 0;
    if (!hasAnySnapshots) return "demo";

    return "live";
}