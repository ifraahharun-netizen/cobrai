import { prisma } from "@/lib/prisma";

export type WorkspaceDataMode = {
    workspaceId: string;
    mode: "demo" | "live";
    workspaceTier: "starter" | "pro" | "scale";
    connectedIntegrations: string[];
    hasLiveCustomers: boolean;
};

export async function getWorkspaceDataMode(
    workspaceId: string
): Promise<WorkspaceDataMode> {
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: {
            id: true,
            tier: true,
            integrations: {
                select: {
                    provider: true,
                    status: true,
                },
            },
            customers: {
                select: { id: true },
                take: 1,
            },
        },
    });

    if (!workspace) {
        return {
            workspaceId,
            mode: "demo",
            workspaceTier: "starter",
            connectedIntegrations: [],
            hasLiveCustomers: false,
        };
    }

    const connectedIntegrations = workspace.integrations
        .filter((integration) => integration.status === "connected")
        .map((integration) => integration.provider);

    const hasLiveCustomers = workspace.customers.length > 0;

    return {
        workspaceId: workspace.id,
        mode: connectedIntegrations.length > 0 && hasLiveCustomers ? "live" : "demo",
        workspaceTier: (workspace.tier as "starter" | "pro" | "scale") || "starter",
        connectedIntegrations,
        hasLiveCustomers,
    };
}