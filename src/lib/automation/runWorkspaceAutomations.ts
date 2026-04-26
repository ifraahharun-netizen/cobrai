import { prisma } from "@/lib/prisma";
import { buildCustomerFacts } from "@/lib/ai/buildCustomerFacts";
import { generateWorkspaceInsights } from "@/lib/ai/generateWorkspaceInsights";
import { recommendActions } from "@/lib/ai/recommendActions";

type RunWorkspaceAutomationsResult = {
    ok: boolean;
    mode: "demo" | "live";
    actionsCreated: number;
    actionsExecuted: number;
};

type ActionStatus = "saved" | "in_progress" | "at_risk";

function mapRiskToStatus(riskScore: number): ActionStatus {
    if (riskScore >= 85) return "at_risk";
    if (riskScore >= 60) return "in_progress";
    return "saved";
}

export async function runWorkspaceAutomations(
    workspaceId: string,
    connectedIntegrations: string[]
): Promise<RunWorkspaceAutomationsResult> {
    const source = connectedIntegrations.length > 0 ? "live" : "demo";

    const insightResult = await generateWorkspaceInsights({
        workspaceId,
        timeframe: "week",
        source,
    });

    const topCustomers = await prisma.customer.findMany({
        where: { workspaceId },
        orderBy: { churnRisk: "desc" },
        take: 8,
        select: {
            id: true,
            name: true,
            churnRisk: true,
            mrr: true,
            lastActiveAt: true,
            healthScore: true,
        },
    });

    const failedInvoices = await prisma.invoice.findMany({
        where: {
            workspaceId,
            status: "failed",
        },
        orderBy: { dueAt: "desc" },
        take: 10,
        select: {
            customer: { select: { id: true, name: true } },
            amount: true,
            dueAt: true,
        },
    });

    const customerFacts = buildCustomerFacts({
        customers: topCustomers,
        failedInvoices,
        source,
    });

    const recommendations = recommendActions(insightResult.insights, customerFacts);

    let actionsCreated = 0;
    let actionsExecuted = 0;

    for (const rec of recommendations) {
        await prisma.actionImpact.create({
            data: {
                workspaceId,
                customerId: rec.customerId,
                customerName: rec.customerName,
                actionType: rec.actionType,
                aiReason: rec.aiReason,
                status: mapRiskToStatus(rec.riskScore),
                riskScore: rec.riskScore,
                mrrSavedMinor: rec.mrrSavedMinor,
            },
        });

        actionsCreated += 1;
        actionsExecuted += 1;
    }

    return {
        ok: true,
        mode: source,
        actionsCreated,
        actionsExecuted,
    };
}