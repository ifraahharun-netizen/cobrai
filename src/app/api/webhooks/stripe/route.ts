import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function getWorkspaceId(): Promise<string> {
    const ws = await prisma.workspace.findFirst({ select: { id: true } });
    if (!ws) throw new Error("No workspace exists yet. Create one first.");
    return ws.id;
}

function calcMrrFromSubscription(sub: Stripe.Subscription): number {
    const item = sub.items.data[0];
    const price = item?.price;
    if (!price?.unit_amount) return 0;

    const qty = item.quantity ?? 1;
    const amount = price.unit_amount * qty;

    const interval = price.recurring?.interval;
    const count = price.recurring?.interval_count ?? 1;

    if (interval === "month") return Math.round(amount / count);
    if (interval === "year") return Math.round(amount / 12 / count);

    return Math.round(amount);
}

export async function POST(req: Request) {
    const sig = req.headers.get("stripe-signature");
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !secret) {
        return NextResponse.json(
            { error: "Missing STRIPE_WEBHOOK_SECRET or stripe-signature" },
            { status: 400 }
        );
    }

    const body = await req.text();
    const stripe = getStripeClient();

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(body, sig, secret);
    } catch (err: any) {
        return NextResponse.json(
            { error: `Invalid signature: ${err.message}` },
            { status: 400 }
        );
    }

    try {
        const workspaceId = await getWorkspaceId();

        if (
            event.type === "customer.subscription.created" ||
            event.type === "customer.subscription.updated"
        ) {
            const sub = event.data.object as Stripe.Subscription;

            const stripeCustomerId =
                typeof sub.customer === "string" ? sub.customer : sub.customer.id;

            const mrr = calcMrrFromSubscription(sub);

            const existing = await prisma.customer.findFirst({
                where: { workspaceId, stripeCustomerId },
                select: { id: true },
            });

            if (existing) {
                await prisma.customer.update({
                    where: { id: existing.id },
                    data: { mrr },
                });
            } else {
                await prisma.customer.create({
                    data: {
                        workspaceId,
                        stripeCustomerId,
                        name: "Stripe Customer",
                        mrr,
                    },
                });
            }
        }

        if (event.type === "invoice.payment_failed") {
            const inv = event.data.object as Stripe.Invoice;

            const stripeCustomerId =
                typeof inv.customer === "string" ? inv.customer : inv.customer?.id;

            if (stripeCustomerId) {
                const customer = await prisma.customer.findFirst({
                    where: { workspaceId, stripeCustomerId },
                    select: { id: true },
                });

                if (customer) {
                    await prisma.invoice.create({
                        data: {
                            workspaceId,
                            customerId: customer.id,
                            status: inv.status ?? "open",
                            amount: inv.amount_due ?? 0,
                            dueAt: new Date(
                                (inv.due_date ?? Math.floor(Date.now() / 1000)) * 1000
                            ),
                            paidAt: null,
                        },
                    });

                    await prisma.customer.update({
                        where: { id: customer.id },
                        data: { churnRisk: 0.8 },
                    });
                }
            }
        }

        if (event.type === "customer.subscription.deleted") {
            const sub = event.data.object as Stripe.Subscription;

            const stripeCustomerId =
                typeof sub.customer === "string" ? sub.customer : sub.customer.id;

            await prisma.customer.updateMany({
                where: { workspaceId, stripeCustomerId },
                data: { mrr: 0, churnRisk: 1 },
            });
        }

        return NextResponse.json({ received: true });
    } catch (err: any) {
        return NextResponse.json(
            { error: err.message || "Webhook error" },
            { status: 500 }
        );
    }
}