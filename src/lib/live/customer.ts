import { prisma } from "@/lib/prisma";
import type { CobraiCustomerListItem } from "../demo/customers";

function buildStatus(args: { riskScore: number | null; lastActiveAt: string | null }) {
    const risk = Number(args.riskScore ?? 0);
    const lastActive = args.lastActiveAt ? new Date(args.lastActiveAt).getTime() : null;
    const daysInactive =
        lastActive ? Math.floor((Date.now() - lastActive) / (1000 * 60 * 60 * 24)) : null;

    if (daysInactive !== null && daysInactive >= 30) return "Inactive";
    if (risk >= 75) return "At risk";
    if (risk >= 45) return "Watch";
    return "Active";
}

export async function getLiveCustomers(workspaceId: string): Promise<CobraiCustomerListItem[]> {
    const customers = await prisma.customer.findMany({
        where: { workspaceId },
        orderBy: [{ riskScore: "desc" }, { mrr: "desc" }],
        select: {
            id: true,
            name: true,
            email: true,
            plan: true,
            seats: true,
            mrr: true,
            churnRisk: true,
            riskScore: true,
            healthScore: true,
            lastActiveAt: true,
            createdAt: true,
            stripeCustomerId: true,
            hubspotCompanyId: true,
        },
    });

    return customers.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        plan: c.plan,
        seats: c.seats,
        mrr: c.mrr,
        churnRisk: c.churnRisk,
        riskScore: c.riskScore,
        healthScore: c.healthScore,
        lastActiveAt: c.lastActiveAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        status: buildStatus({
            riskScore: c.riskScore,
            lastActiveAt: c.lastActiveAt?.toISOString() ?? null,
        }),
        stripeCustomerId: c.stripeCustomerId,
        hubspotCompanyId: c.hubspotCompanyId,
    }));
}