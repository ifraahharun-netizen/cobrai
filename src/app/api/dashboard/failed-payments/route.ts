import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getWorkspaceFromRequest } from "@/lib/auth/getWorkspaceFromRequest";
import { getDemoDashboardData } from "@/lib/demo/dashboard";
import { getDemoCustomers } from "@/lib/demo/customers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ITEMS = 6;

export type FailedPaymentItem = {
    id: string;
    /** Null when there is no account page to open (some demo accounts). */
    customerId: string | null;
    customer: string;
    amount: number;
    failedAt: string;
};

/** Invoice.amount is stored in minor units for large values (same rule as the insights engine). */
function toMajor(value: number) {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return value >= 10000 ? Math.round(value) / 100 : value;
}

function demoItems(): FailedPaymentItem[] {
    // Demo dashboard accounts and demo account pages use different ids, so match by name.
    const pages = new Map(
        getDemoCustomers().map((customer) => [customer.name.toLowerCase(), customer.id])
    );

    // In demo mode, the accounts tagged "billing" are the ones with a failed invoice.
    return getDemoDashboardData("en-GB")
        .riskAccounts.filter((account) => (account.tags ?? []).includes("billing"))
        .map((account) => ({
            id: `demo-invoice-${account.id}`,
            customerId: pages.get(account.company.toLowerCase()) ?? null,
            customer: account.company,
            amount: account.mrr,
            failedAt: account.updatedAt ?? new Date().toISOString(),
        }));
}

export async function GET(req: Request) {
    try {
        const { workspaceId } = await getWorkspaceFromRequest(req);

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { demoMode: true, currency: true },
        });

        if (!workspace) {
            return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
        }

        let items: FailedPaymentItem[] = [];
        let total = 0;
        let count = 0;
        let source: "live" | "demo" = "live";

        if (!workspace.demoMode) {
            const where = { workspaceId, status: "failed", paidAt: null };

            const [invoices, aggregate] = await Promise.all([
                prisma.invoice.findMany({
                    where,
                    orderBy: { dueAt: "desc" },
                    take: MAX_ITEMS,
                    select: {
                        id: true,
                        amount: true,
                        dueAt: true,
                        customer: { select: { id: true, name: true } },
                    },
                }),
                prisma.invoice.aggregate({
                    where,
                    _sum: { amount: true },
                    _count: { _all: true },
                }),
            ]);

            items = invoices.map((invoice) => ({
                id: invoice.id,
                customerId: invoice.customer.id,
                customer: invoice.customer.name,
                amount: toMajor(Number(invoice.amount || 0)),
                failedAt: invoice.dueAt.toISOString(),
            }));
            total = toMajor(Number(aggregate._sum.amount ?? 0));
            count = aggregate._count._all;
        }

        if (workspace.demoMode) {
            items = demoItems();
            total = items.reduce((sum, item) => sum + item.amount, 0);
            count = items.length;
            source = "demo";
        }

        return NextResponse.json({
            source,
            currency: workspace.currency || "GBP",
            total,
            count,
            items,
        });
    } catch (error) {
        console.error("Failed payments route failed", error);

        return NextResponse.json(
            { error: "Could not load failed payments." },
            { status: 500 }
        );
    }
}
