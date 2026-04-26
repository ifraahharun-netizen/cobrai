import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getWorkspaceIdForUid(uid: string) {
    const user = await prisma.user.findUnique({
        where: { firebaseUid: uid },
        select: { workspaceId: true },
    });

    return user?.workspaceId ?? null;
}

export async function GET(req: Request) {
    try {
        const { searchParams, origin } = new URL(req.url);
        const uid = searchParams.get("uid");

        if (!uid) {
            return NextResponse.json({ error: "Missing uid" }, { status: 400 });
        }

        const workspaceId = await getWorkspaceIdForUid(uid);

        if (!workspaceId) {
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 }
            );
        }

        const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
        const appUrl = (process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, "");

        if (!clientId) {
            return NextResponse.json(
                { error: "Missing STRIPE_CONNECT_CLIENT_ID" },
                { status: 500 }
            );
        }

        const redirectUri =
            process.env.STRIPE_CONNECT_REDIRECT_URI ||
            `${appUrl}/api/integrations/stripe/oauth/callback`;

        const stateToken = randomUUID();

        await prisma.stripeOAuthState.create({
            data: {
                stateToken,
                uid,
                workspaceId,
                expiresAt: new Date(Date.now() + 1000 * 60 * 15),
            },
        });

        const stripeAuthUrl = new URL("https://connect.stripe.com/oauth/authorize");
        stripeAuthUrl.searchParams.set("response_type", "code");
        stripeAuthUrl.searchParams.set("client_id", clientId);
        stripeAuthUrl.searchParams.set("scope", "read_write");
        stripeAuthUrl.searchParams.set("redirect_uri", redirectUri);
        stripeAuthUrl.searchParams.set("state", stateToken);

        const response = NextResponse.redirect(stripeAuthUrl.toString());

        response.cookies.set("stripe_uid", uid, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 15,
        });

        return response;
    } catch (error) {
        console.error("[Stripe Connect] start failed:", error);

        const appUrl =
            (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, "");

        return NextResponse.redirect(
            `${appUrl}/dashboard/settings?tab=integration&stripe=error`
        );
    }
}