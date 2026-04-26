import { prisma } from "@/lib/prisma";

export async function clearDemoData(workspaceId: string) {
    await prisma.$transaction(async (tx) => {
        // Retention: delete deepest children first
        await tx.actionExecution.deleteMany({
            where: { isDemo: true, action: { plan: { workspaceId } } },
        });
        await tx.planEvent.deleteMany({
            where: { isDemo: true, run: { plan: { workspaceId } } },
        });
        await tx.planRun.deleteMany({
            where: { isDemo: true, plan: { workspaceId } },
        });
        await tx.retentionAction.deleteMany({
            where: { isDemo: true, plan: { workspaceId } },
        });
        await tx.retentionPlan.deleteMany({
            where: { workspaceId, isDemo: true },
        });

        // Core
        await tx.insightRun.deleteMany({ where: { workspaceId, isDemo: true } });
        await tx.accountRisk.deleteMany({ where: { workspaceId, isDemo: true } });
        await tx.action.deleteMany({ where: { workspaceId, isDemo: true } });
        await tx.invoice.deleteMany({ where: { workspaceId, isDemo: true } });
        await tx.event.deleteMany({ where: { workspaceId, isDemo: true } });

        // Customers last (FK from invoices/events/actions)
        await tx.customer.deleteMany({ where: { workspaceId, isDemo: true } });

        await tx.workspace.update({
            where: { id: workspaceId },
            data: {
                demoMode: false,
                demoClearedAt: new Date(),
            },
        });
    });

    return { ok: true };
}
