import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function getAppBaseUrl(req: NextRequest) {
    const envUrl =
        process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";

    if (envUrl) {
        return envUrl.replace(/\/$/, "");
    }

    return req.nextUrl.origin.replace(/\/$/, "");
}

async function getWorkspaceForUid(uid: string) {
    return prisma.user.findUnique({
        where: { firebaseUid: uid },
        select: { workspaceId: true },
    });
}

export async function GET(req: NextRequest) {
    const appBaseUrl = getAppBaseUrl(req);

    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const error = req.nextUrl.searchParams.get("error");
    const errorDescription = req.nextUrl.searchParams.get("error_description");

    const cookieUid = req.cookies.get("stripe_uid")?.value || "";
    const uid = cookieUid || state || "";

    if (error) {
        return NextResponse.redirect(
            new URL(
                `/dashboard/settings?error=stripe_oauth_error&message=${encodeURIComponent(
                    errorDescription || error
                )}`,
                appBaseUrl
            )
        );
    }

    if (!code) {
        return NextResponse.redirect(
            new URL("/dashboard/settings?error=no_code", appBaseUrl)
        );
    }

    if (!uid) {
        return NextResponse.redirect(
            new URL("/dashboard/settings?error=missing_uid", appBaseUrl)
        );
    }

    const clientSecret = process.env.STRIPE_SECRET_KEY;
    const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
    const redirectUri =
        process.env.STRIPE_CONNECT_REDIRECT_URI ||
        `${appBaseUrl}/api/integrations/stripe/oauth/callback`;

    if (!clientSecret || !clientId) {
        return NextResponse.redirect(
            new URL("/dashboard/settings?error=missing_stripe_env", appBaseUrl)
        );
    }

    try {
        const tokenRes = await fetch("https://connect.stripe.com/oauth/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                client_secret: clientSecret,
                code,
            }).toString(),
            cache: "no-store",
        });

        const tokenData = await tokenRes.json();

        if (!tokenRes.ok) {
            console.error("[Stripe Callback] token exchange failed:", tokenData);

            return NextResponse.redirect(
                new URL("/dashboard/settings?error=stripe_oauth_failed", appBaseUrl)
            );
        }

        const stripeAccountId =
            typeof tokenData?.stripe_user_id === "string"
                ? tokenData.stripe_user_id
                : null;

        if (!stripeAccountId) {
            console.error("[Stripe Callback] missing stripe_user_id:", tokenData);

            return NextResponse.redirect(
                new URL("/dashboard/settings?error=missing_stripe_account", appBaseUrl)
            );
        }

        const user = await getWorkspaceForUid(uid);

        if (!user?.workspaceId) {
            return NextResponse.redirect(
                new URL("/dashboard/settings?error=no_workspace", appBaseUrl)
            );
        }

        await prisma.workspace.update({
            where: { id: user.workspaceId },
            data: {
                stripeAccountId,
                stripeConnectedAt: new Date(),
                stripeAccessTokenEnc:
                    typeof tokenData?.access_token === "string"
                        ? tokenData.access_token
                        : null,
                stripeRefreshTokenEnc:
                    typeof tokenData?.refresh_token === "string"
                        ? tokenData.refresh_token
                        : null,
                stripeScope:
                    typeof tokenData?.scope === "string" ? tokenData.scope : null,
                stripeLastSyncedAt: null,
            },
        });

        await prisma.integration.upsert({
            where: {
                workspaceId_provider: {
                    workspaceId: user.workspaceId,
                    provider: "stripe",
                },
            },
            create: {
                workspaceId: user.workspaceId,
                provider: "stripe",
                status: "connected",
                accessTokenEnc:
                    typeof tokenData?.access_token === "string"
                        ? tokenData.access_token
                        : null,
                refreshTokenEnc:
                    typeof tokenData?.refresh_token === "string"
                        ? tokenData.refresh_token
                        : null,
                externalAccountId: stripeAccountId,
                scopes:
                    typeof tokenData?.scope === "string" ? tokenData.scope : null,
                connectedAt: new Date(),
                disconnectedAt: null,
                lastSyncError: null,
                metadata: {
                    livemode:
                        typeof tokenData?.livemode === "boolean"
                            ? tokenData.livemode
                            : null,
                    stripePublishableKey:
                        typeof tokenData?.stripe_publishable_key === "string"
                            ? tokenData.stripe_publishable_key
                            : null,
                    tokenType:
                        typeof tokenData?.token_type === "string"
                            ? tokenData.token_type
                            : null,
                },
            },
            update: {
                status: "connected",
                accessTokenEnc:
                    typeof tokenData?.access_token === "string"
                        ? tokenData.access_token
                        : null,
                refreshTokenEnc:
                    typeof tokenData?.refresh_token === "string"
                        ? tokenData.refresh_token
                        : null,
                externalAccountId: stripeAccountId,
                scopes:
                    typeof tokenData?.scope === "string" ? tokenData.scope : null,
                connectedAt: new Date(),
                disconnectedAt: null,
                lastSyncError: null,
                metadata: {
                    livemode:
                        typeof tokenData?.livemode === "boolean"
                            ? tokenData.livemode
                            : null,
                    stripePublishableKey:
                        typeof tokenData?.stripe_publishable_key === "string"
                            ? tokenData.stripe_publishable_key
                            : null,
                    tokenType:
                        typeof tokenData?.token_type === "string"
                            ? tokenData.token_type
                            : null,
                },
            },
        });

        const response = NextResponse.redirect(
            new URL("/dashboard/settings?stripe=connected", appBaseUrl)
        );

        response.cookies.set("stripe_uid", "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 0,
        });

        return response;
    } catch (error) {
        console.error("[Stripe Callback] error:", error);

        return NextResponse.redirect(
            new URL("/dashboard/settings?error=server_error", appBaseUrl)
        );
    }
}