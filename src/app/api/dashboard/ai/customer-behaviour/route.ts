import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getWorkspaceFromRequest } from "@/lib/auth/getWorkspaceFromRequest";
import { ratelimit } from "@/lib/rateLimit";
import { getDemoDashboardData } from "@/lib/demo/dashboard";
import { getDemoCustomers } from "@/lib/demo/customers";
import {
    CLAUDE_BEHAVIOUR_MODEL,
    ClaudeNotConfiguredError,
    ClaudeRefusedError,
    interpretCustomerBehaviour,
    type BehaviourCustomerInput,
} from "@/lib/ai/claudeCustomerBehaviour";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Claude can take a little while to read a dozen accounts.
export const maxDuration = 120;

const MAX_CUSTOMERS = 10;

function daysSince(date: Date | string | null | undefined) {
    if (!date) return null;
    const time = new Date(date).getTime();
    if (Number.isNaN(time)) return null;
    return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
}

/** Customer.mrr is stored in minor units for large values (same rule as the insights engine). */
function toMajor(value: number) {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return value >= 10000 ? Math.round(value) / 100 : value;
}

function demoCustomers(): BehaviourCustomerInput[] {
    const dashboard = getDemoDashboardData("en-GB");
    const detail = new Map(getDemoCustomers().map((customer) => [customer.id, customer]));

    const atRisk = dashboard.riskAccounts.map((account) => {
        const extra = detail.get(account.id);
        const billing = (account.tags ?? []).includes("billing");

        return {
            id: account.id,
            name: account.company,
            plan: extra?.plan ?? null,
            seats: extra?.seats ?? null,
            mrr: account.mrr,
            churnRisk: account.risk,
            healthScore: extra?.healthScore ?? null,
            daysInactive: null,
            failedPayments: billing ? 1 : 0,
            failedPaymentAmount: billing ? account.mrr : 0,
            status: extra?.status ?? null,
            signals: [account.reason, ...(account.tags ?? [])],
        };
    });

    const growing = (dashboard.opportunities ?? []).map((account) => ({
        id: account.id,
        name: account.company,
        plan: null,
        seats: null,
        mrr: account.upside,
        churnRisk: 15,
        healthScore: 85,
        daysInactive: 0,
        failedPayments: 0,
        failedPaymentAmount: 0,
        status: "active",
        signals: [account.signal],
    }));

    return [...atRisk, ...growing].slice(0, MAX_CUSTOMERS);
}

async function liveCustomers(workspaceId: string): Promise<BehaviourCustomerInput[]> {
    const [customers, failedInvoices] = await Promise.all([
        prisma.customer.findMany({
            where: { workspaceId },
            orderBy: { churnRisk: "desc" },
            take: MAX_CUSTOMERS,
            select: {
                id: true,
                name: true,
                plan: true,
                seats: true,
                mrr: true,
                churnRisk: true,
                healthScore: true,
                lastActiveAt: true,
                status: true,
            },
        }),
        prisma.invoice.findMany({
            where: { workspaceId, status: "failed" },
            orderBy: { dueAt: "desc" },
            take: 50,
            select: { amount: true, customer: { select: { id: true } } },
        }),
    ]);

    const failed = new Map<string, { count: number; amount: number }>();

    for (const invoice of failedInvoices) {
        const id = invoice.customer?.id;
        if (!id) continue;
        const current = failed.get(id) ?? { count: 0, amount: 0 };
        current.count += 1;
        current.amount += toMajor(Number(invoice.amount || 0));
        failed.set(id, current);
    }

    return customers.map((customer) => {
        const risk = Number(customer.churnRisk || 0);

        return {
            id: customer.id,
            name: customer.name,
            plan: customer.plan ?? null,
            seats: customer.seats ?? null,
            mrr: toMajor(Number(customer.mrr || 0)),
            // Stored as 0-1 or 0-100; send 0-100.
            churnRisk: Math.round(risk <= 1 ? risk * 100 : risk),
            healthScore: customer.healthScore ?? null,
            daysInactive: daysSince(customer.lastActiveAt),
            failedPayments: failed.get(customer.id)?.count ?? 0,
            failedPaymentAmount: failed.get(customer.id)?.amount ?? 0,
            status: customer.status ?? null,
            signals: [],
        };
    });
}

export async function POST(req: Request) {
    try {
        const { workspaceId } = await getWorkspaceFromRequest(req);

        // If the rate-limit store is unreachable, don't block the analysis.
        const { success, reset } = await ratelimit.limit(`ai-behaviour:${workspaceId}`);

        if (!success) {
            return NextResponse.json(
                { error: "Too many requests. Please try again shortly." },
                {
                    status: 429,
                    headers: {
                        "Retry-After": String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))),
                    },
                }
            );
        }

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { currency: true, demoMode: true },
        });

        if (!workspace) {
            return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
        }

        let customers = workspace.demoMode ? [] : await liveCustomers(workspaceId);
        let source: "live" | "demo" = "live";

        // No connected data yet: let Claude read the demo accounts shown on the dashboard.
        if (customers.length === 0) {
            customers = demoCustomers();
            source = "demo";
        }

        const report = await interpretCustomerBehaviour({
            customers,
            currency: workspace.currency || "GBP",
        });

        // Attach the MRR we sent so the table can show it without trusting the model's numbers.
        const mrrById = new Map(customers.map((customer) => [customer.id, customer.mrr]));

        return NextResponse.json({
            source,
            model: CLAUDE_BEHAVIOUR_MODEL,
            analysedAt: new Date().toISOString(),
            currency: workspace.currency || "GBP",
            summary: report.summary,
            rows: report.rows.map((row) => ({
                ...row,
                mrr: mrrById.get(row.customerId) ?? 0,
            })),
        });
    } catch (error) {
        if (error instanceof ClaudeNotConfiguredError) {
            return NextResponse.json({ error: error.message }, { status: 503 });
        }

        if (error instanceof ClaudeRefusedError) {
            return NextResponse.json({ error: error.message }, { status: 422 });
        }

        console.error("Claude customer behaviour route failed", error);

        return NextResponse.json(
            {
                error: "Claude could not analyse your customers right now.",
                // Local development only: surface the underlying cause.
                ...(process.env.NODE_ENV !== "production" && error instanceof Error
                    ? { detail: error.message }
                    : {}),
            },
            { status: 500 }
        );
    }
}
