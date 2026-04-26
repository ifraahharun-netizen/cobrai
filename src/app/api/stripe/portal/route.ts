export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import { requireOwnedWorkspace } from "@/lib/apiAuth";

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const requestedWorkspaceId =
            typeof body?.workspaceId === "string" ? body.workspaceId : null;

        const authResult = await requireOwnedWorkspace(req, requestedWorkspaceId);

        if (!authResult.ok) {
            return authResult.response;
        }

        const { workspaceId } = authResult;

        const stripeCustomer = await prisma.stripeCustomer.findFirst({
            where: {
                workspaceId,
                stripeId: {
                    startsWith: "cus_",
                },
            },
            orderBy: { createdAt: "desc" },
        });

        if (!stripeCustomer?.stripeId) {
            return NextResponse.json(
                { error: "No valid Stripe customer found. Please complete checkout first." },
                { status: 400 }
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

        const session = await stripe.billingPortal.sessions.create({
            customer: stripeCustomer.stripeId,
            return_url: `${appUrl}/dashboard/settings?tab=manage-plan&portal=returned`,
        });

        return NextResponse.json({ url: session.url });
    } catch (error: any) {
        console.error("Stripe portal error:", {
            message: error?.message,
            type: error?.type,
            code: error?.code,
            param: error?.param,
            statusCode: error?.statusCode,
            raw: error?.raw,
        });

        return NextResponse.json(
            {
                error: error?.message || "Unable to create billing portal session",
            },
            { status: 500 }
        );
    }
}