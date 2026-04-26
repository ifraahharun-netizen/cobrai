export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import { requireOwnedWorkspace } from "@/lib/apiAuth";

type CheckoutTier = "starter" | "pro";

function parseTier(value: unknown): CheckoutTier | null {
    if (value === "starter" || value === "pro") return value;
    return null;
}

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const requestedWorkspaceId =
            typeof body?.workspaceId === "string" ? body.workspaceId : null;
        const tier = parseTier(body?.tier);

        if (!tier) {
            return NextResponse.json(
                { error: "Missing or invalid tier" },
                { status: 400 }
            );
        }

        const authResult = await requireOwnedWorkspace(req, requestedWorkspaceId);

        if (!authResult.ok) {
            return authResult.response;
        }

        const { user, workspaceId } = authResult;

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                id: true,
                ownerEmail: true,
                stripeCustomers: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: {
                        id: true,
                        stripeId: true,
                        email: true,
                        name: true,
                    },
                },
            },
        });

        if (!workspace) {
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 }
            );
        }

        const email =
            user.email?.trim() ||
            workspace.ownerEmail?.trim() ||
            null;

        if (!email) {
            return NextResponse.json(
                { error: "Missing user email for checkout" },
                { status: 400 }
            );
        }

        const priceId =
            tier === "pro"
                ? process.env.STRIPE_PRICE_PRO
                : process.env.STRIPE_PRICE_STARTER;

        if (!priceId) {
            return NextResponse.json(
                { error: "Missing Stripe price ID in environment" },
                { status: 500 }
            );
        }

        const appUrl = process.env.NEXT_PUBLIC_APP_URL;
        if (!appUrl) {
            return NextResponse.json(
                { error: "Missing NEXT_PUBLIC_APP_URL" },
                { status: 500 }
            );
        }

        const stripe = getStripeClient();

        const existingStripeCustomer = workspace.stripeCustomers.find((c) =>
            c.stripeId.startsWith("cus_")
        ) ?? null;

        const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            ...(existingStripeCustomer?.stripeId
                ? { customer: existingStripeCustomer.stripeId }
                : { customer_email: email }),
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            metadata: {
                workspaceId,
                tier,
                email,
            },
            subscription_data: {
                metadata: {
                    workspaceId,
                    tier,
                    email,
                },
            },
            success_url: `${appUrl}/dashboard/settings?tab=manage-plan&checkout=success`,
            cancel_url: `${appUrl}/dashboard/settings?tab=manage-plan&checkout=cancelled`,
        });

        return NextResponse.json({ url: session.url });
    } catch (error: any) {
        console.error("Stripe checkout error:", {
            message: error?.message,
            type: error?.type,
            code: error?.code,
            param: error?.param,
            statusCode: error?.statusCode,
            raw: error?.raw,
        });

        return NextResponse.json(
            {
                error: error?.message || "Unable to create checkout session",
            },
            { status: 500 }
        );
    }
}