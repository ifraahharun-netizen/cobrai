import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserFromAuthHeader } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

async function getWorkspaceIdForUid(uid: string) {
    const user = await prisma.user.findUnique({
        where: { firebaseUid: uid },
        select: { workspaceId: true },
    });

    return user?.workspaceId ?? null;
}

/**
 * Starts Stripe Connect for the signed-in user. Call with fetch and an
 * Authorization: Bearer <Firebase ID token> header; returns { url } to send
 * the browser to. The user comes from the verified token, never the request.
 */
export async function GET(req: Request) {
    let uid: string;
    try {
        uid = (await requireUserFromAuthHeader(req)).uid;
    } catch {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { origin } = new URL(req.url);

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

        const response = NextResponse.json({ url: stripeAuthUrl.toString() });

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

        return NextResponse.json({ error: "Failed to start Stripe connect." }, { status: 500 });
    }
}