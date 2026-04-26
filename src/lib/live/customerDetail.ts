import { prisma } from "@/lib/prisma";
import type {
    CobraiCustomerDetail,
    ActivityItem,
    EmailSuggestion,
} from "../demo/customerDetail";

/* ================= HELPERS ================= */

function normalizeChurnRiskToPct(value: number | null | undefined) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    if (n <= 1) return Math.round(n * 100);
    return Math.round(n);
}

function buildEmailSuggestions(customer: {
    name: string;
}): EmailSuggestion[] {
    return [
        {
            key: "billing-recovery",
            title: "Billing recovery email",
            subject: `Quick billing check-in — ${customer.name}`,
            preview: "We noticed a billing-related risk signal and wanted to help resolve it quickly.",
        },
        {
            key: "re-engagement",
            title: "Re-engagement email",
            subject: `Can we help you get value this week? — ${customer.name}`,
            preview: "We noticed product usage has dropped and wanted to share a quick path back to value.",
        },
        {
            key: "check-in",
            title: "Check-in email",
            subject: `Quick check-in — ${customer.name}`,
            preview: "Just reaching out to make sure your team is getting what it needs from Cobrai.",
        },
    ];
}

function buildStatus(args: {
    riskScore: number | null;
    churnRiskPct: number | null;
    lastActiveAt: Date | null;
}) {
    const fallbackRisk = Number(args.churnRiskPct ?? 0);
    const risk = Number.isFinite(Number(args.riskScore)) ? Number(args.riskScore) : fallbackRisk;

    const daysInactive = args.lastActiveAt
        ? Math.floor(
            (Date.now() - new Date(args.lastActiveAt).getTime()) / (1000 * 60 * 60 * 24)
        )
        : null;

    if (daysInactive !== null && daysInactive >= 30) return "Inactive";
    if (risk >= 75) return "At risk";
    if (risk >= 45) return "Watch";
    return "Active";
}

function buildActivity(args: {
    customer: {
        lastActiveAt: Date | null;
    };
    latestInvoice: {
        status: string;
        dueAt: Date | null;
        paidAt: Date | null;
    } | null;
    latestRisk: {
        riskScore: number;
        previousRiskScore: number | null;
        reasonLabel: string | null;
        updatedAt: Date;
    } | null;
}): ActivityItem[] {
    const items: ActivityItem[] = [];

    if (args.latestInvoice) {
        const invoiceStatus = (args.latestInvoice.status || "").toLowerCase();

        if (
            invoiceStatus === "failed" ||
            invoiceStatus === "past_due" ||
            invoiceStatus === "unpaid"
        ) {
            items.push({
                type: "billing",
                label: "Payment failed for latest invoice",
                at:
                    args.latestInvoice.dueAt?.toISOString() ??
                    new Date().toISOString(),
                severity: "risk",
            });
        } else if (invoiceStatus === "paid" && args.latestInvoice.paidAt) {
            items.push({
                type: "billing",
                label: "Latest invoice paid successfully",
                at: args.latestInvoice.paidAt.toISOString(),
                severity: "info",
            });
        }
    }

    if (args.customer.lastActiveAt) {
        const days = Math.floor(
            (Date.now() - new Date(args.customer.lastActiveAt).getTime()) /
            (1000 * 60 * 60 * 24)
        );

        if (days >= 14) {
            items.push({
                type: "usage",
                label: `No recent activity in last ${days} days`,
                at: args.customer.lastActiveAt.toISOString(),
                severity: "warn",
            });
        }
    }

    if (args.latestRisk) {
        const prev =
            typeof args.latestRisk.previousRiskScore === "number"
                ? args.latestRisk.previousRiskScore
                : args.latestRisk.riskScore;

        if (args.latestRisk.riskScore > prev) {
            items.push({
                type: "usage",
                label: `Risk increased — ${args.latestRisk.reasonLabel || "Retention risk updated"}`,
                at: args.latestRisk.updatedAt.toISOString(),
                severity: "risk",
            });
        } else if (args.latestRisk.riskScore < prev) {
            items.push({
                type: "usage",
                label: "Risk improved from previous snapshot",
                at: args.latestRisk.updatedAt.toISOString(),
                severity: "info",
            });
        }
    }

    return items
        .sort((a, b) => +new Date(b.at) - +new Date(a.at))
        .slice(0, 6);
}

/* ================= MAIN FUNCTION ================= */

export async function getLiveCustomerDetail(
    workspaceId: string,
    id: string,
    workspaceTier: string
): Promise<CobraiCustomerDetail | null> {
    let customer = await prisma.customer.findFirst({
        where: { workspaceId, id },
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

    if (!customer) {
        const riskLink = await prisma.accountRisk.findFirst({
            where: {
                workspaceId,
                OR: [{ id }, { customerId: id }],
            },
            select: {
                customerId: true,
            },
        });

        if (riskLink?.customerId) {
            customer = await prisma.customer.findFirst({
                where: { workspaceId, id: riskLink.customerId },
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
        }
    }

    if (!customer) return null;

    const [latestInvoice, latestRisk] = await Promise.all([
        prisma.invoice.findFirst({
            where: {
                workspaceId,
                customerId: customer.id,
            },
            select: {
                status: true,
                dueAt: true,
                paidAt: true,
            },
            orderBy: [{ dueAt: "desc" }],
        }),
        prisma.accountRisk.findFirst({
            where: {
                workspaceId,
                customerId: customer.id,
            },
            select: {
                id: true,
                riskScore: true,
                previousRiskScore: true,
                reasonKey: true,
                reasonLabel: true,
                updatedAt: true,
            },
            orderBy: { updatedAt: "desc" },
        }),
    ]);

    const churnRiskPct = normalizeChurnRiskToPct(customer.churnRisk);

    const resolvedRiskScore =
        typeof latestRisk?.riskScore === "number"
            ? latestRisk.riskScore
            : typeof customer.riskScore === "number"
                ? customer.riskScore
                : churnRiskPct;

    return {
        id: customer.id,
        name: customer.name || "Unknown customer",
        email: customer.email ?? "",
        plan: customer.plan || "Starter",
        seats: Number(customer.seats || 0),
        mrr: Number(customer.mrr || 0),

        churnRisk: churnRiskPct,
        riskScore: resolvedRiskScore,
        healthScore:
            typeof customer.healthScore === "number"
                ? customer.healthScore
                : null,

        lastActiveAt: customer.lastActiveAt?.toISOString() ?? null,
        createdAt: customer.createdAt.toISOString(),

        status: buildStatus({
            riskScore: resolvedRiskScore,
            churnRiskPct,
            lastActiveAt: customer.lastActiveAt,
        }),

        stripeCustomerId: customer.stripeCustomerId,
        hubspotCompanyId: customer.hubspotCompanyId,

        activity: buildActivity({
            customer,
            latestInvoice,
            latestRisk,
        }),

        emailSuggestions: buildEmailSuggestions({
            name: customer.name || "Customer",
        }),

        mode: "live",
        workspaceTier,
    };
}