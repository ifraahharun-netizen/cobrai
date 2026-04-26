import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

type SyncResult = {
    customers: number;
    invoices: number;
};

function asStripeCustomerId(inv: Stripe.Invoice): string | null {
    const c = inv.customer;
    if (!c) return null;
    if (typeof c === "string") return c;
    return c.id ?? null;
}

export async function syncStripe(workspaceId: string): Promise<SyncResult> {
    const integ = await prisma.integration.findUnique({
        where: {
            workspaceId_provider: {
                workspaceId,
                provider: "stripe",
            },
        },
        select: {
            accessTokenEnc: true,
            status: true,
        },
    });

    let accessTokenEnc = integ?.accessTokenEnc ?? null;

    if (!accessTokenEnc) {
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { stripeAccessTokenEnc: true },
        });

        accessTokenEnc = workspace?.stripeAccessTokenEnc ?? null;
    }

    if (!accessTokenEnc || integ?.status === "disconnected") {
        throw new Error("Stripe not connected");
    }

    const accessToken = decrypt(accessTokenEnc);

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    const customers = await stripe.customers.list(
        { limit: 100 },
        { apiKey: accessToken }
    );

    for (const c of customers.data) {
        const email = c.email ?? null;
        const name =
            typeof c.name === "string" && c.name.trim() ? c.name.trim() : null;

        const existing = await prisma.customer.findFirst({
            where: {
                workspaceId,
                OR: [{ stripeCustomerId: c.id }, ...(email ? [{ email }] : [])],
            },
            select: { id: true },
        });

        if (existing) {
            await prisma.customer.update({
                where: { id: existing.id },
                data: {
                    stripeCustomerId: c.id,
                    ...(email ? { email } : {}),
                    ...(name ? { name } : {}),
                },
            });
        } else {
            await prisma.customer.create({
                data: {
                    workspaceId,
                    stripeCustomerId: c.id,
                    email,
                    name: name ?? (email ? email.split("@")[0] : "Customer"),
                },
            });
        }
    }

    const since = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);

    const invoices = await stripe.invoices.list(
        {
            limit: 100,
            created: { gte: since },
        },
        { apiKey: accessToken }
    );

    let written = 0;

    for (const inv of invoices.data) {
        const paidAtUnix =
            typeof inv.status_transitions?.paid_at === "number"
                ? inv.status_transitions.paid_at
                : null;

        const isPaid = inv.status === "paid";
        if (!isPaid || !paidAtUnix) continue;

        const stripeCustomerId = asStripeCustomerId(inv);
        if (!stripeCustomerId) continue;

        const customer = await prisma.customer.findFirst({
            where: { workspaceId, stripeCustomerId },
            select: { id: true },
        });

        if (!customer) continue;

        const dueAt = inv.due_date
            ? new Date(inv.due_date * 1000)
            : new Date(inv.created * 1000);

        const paidAt = new Date(paidAtUnix * 1000);
        const amount = typeof inv.amount_paid === "number" ? inv.amount_paid : 0;

        const existing = await prisma.invoice.findFirst({
            where: {
                workspaceId,
                customerId: customer.id,
                amount,
                dueAt,
                paidAt,
            },
            select: { id: true },
        });

        if (existing) {
            await prisma.invoice.update({
                where: { id: existing.id },
                data: {
                    status: String(inv.status ?? "paid"),
                    amount,
                    dueAt,
                    paidAt,
                },
            });
        } else {
            await prisma.invoice.create({
                data: {
                    workspaceId,
                    customerId: customer.id,
                    status: String(inv.status ?? "paid"),
                    amount,
                    dueAt,
                    paidAt,
                },
            });
        }

        written += 1;
    }

    await prisma.integration.update({
        where: {
            workspaceId_provider: {
                workspaceId,
                provider: "stripe",
            },
        },
        data: {
            status: "connected",
            lastSyncError: null,
            lastSyncedAt: new Date(),
        },
    });

    await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
            stripeLastSyncedAt: new Date(),
        },
    });

    return { customers: customers.data.length, invoices: written };
}