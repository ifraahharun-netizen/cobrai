
import { NextRequest, NextResponse } from "next/server";

type HubSpotTokenResponse = {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
};

function getAppBaseUrl() {
    return (
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.APP_URL ||
        "http://localhost:3000"
    ).replace(/\/$/, "");
}

function getHubSpotRedirectUri() {
    // Keep this EXACTLY the same as the Redirect URL configured in HubSpot.
    return `${getAppBaseUrl()}/api/integrations/hubspot/callback`;
}

export async function GET(req: NextRequest) {
    const url = new URL(req.url);

    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");
    const state = url.searchParams.get("state"); // usually uid/workspaceId from your connect route

    const clientId = process.env.HUBSPOT_CLIENT_ID;
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
    const redirectUri = getHubSpotRedirectUri();

    const appBaseUrl = getAppBaseUrl();

    // 1) Handle HubSpot sending back an error
    if (error) {
        const failUrl = new URL("/dashboard/settings", appBaseUrl);
        failUrl.searchParams.set("hubspot", "error");
        failUrl.searchParams.set("reason", error);
        if (errorDescription) {
            failUrl.searchParams.set("message", errorDescription);
        }
        return NextResponse.redirect(failUrl);
    }

    // 2) Validate required config
    if (!clientId || !clientSecret) {
        console.error("[HubSpot Callback] Missing HUBSPOT_CLIENT_ID or HUBSPOT_CLIENT_SECRET");

        const failUrl = new URL("/dashboard/settings", appBaseUrl);
        failUrl.searchParams.set("hubspot", "error");
        failUrl.searchParams.set("reason", "missing_env");
        return NextResponse.redirect(failUrl);
    }

    // 3) Validate code
    if (!code) {
        console.error("[HubSpot Callback] Missing code in callback URL");

        const failUrl = new URL("/dashboard/settings", appBaseUrl);
        failUrl.searchParams.set("hubspot", "error");
        failUrl.searchParams.set("reason", "missing_code");
        return NextResponse.redirect(failUrl);
    }

    try {
        const body = new URLSearchParams();
        body.set("grant_type", "authorization_code");
        body.set("client_id", clientId);
        body.set("client_secret", clientSecret);
        body.set("redirect_uri", redirectUri);
        body.set("code", code);

        const tokenRes = await fetch("https://api.hubapi.com/oauth/v3/token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: body.toString(),
            cache: "no-store",
        });

        const raw = await tokenRes.text();

        if (!tokenRes.ok) {
            console.error("[HubSpot Callback] Token exchange failed:", tokenRes.status, raw);

            const failUrl = new URL("/dashboard/settings", appBaseUrl);
            failUrl.searchParams.set("hubspot", "error");
            failUrl.searchParams.set("reason", "token_exchange_failed");
            return NextResponse.redirect(failUrl);
        }

        const tokenData = JSON.parse(raw) as HubSpotTokenResponse;

        if (!tokenData.access_token || !tokenData.refresh_token) {
            console.error("[HubSpot Callback] Missing tokens in response:", tokenData);

            const failUrl = new URL("/dashboard/settings", appBaseUrl);
            failUrl.searchParams.set("hubspot", "error");
            failUrl.searchParams.set("reason", "invalid_token_response");
            return NextResponse.redirect(failUrl);
        }

        /**
         * 4) SAVE TOKENS
         *
         * Replace this block with your actual DB save logic.
         *
         * Common pattern:
         * - state contains the Firebase uid or workspaceId you passed from /connect
         * - save:
         *   - access_token
         *   - refresh_token
         *   - expires_at
         *   - connected_at
         *
         * Example pseudocode:
         *
         * await prisma.workspace.update({
         *   where: { ownerUid: state! }, // or { id: state! }
         *   data: {
         *     hubspotAccessTokenEnc: encrypt(tokenData.access_token),
         *     hubspotRefreshTokenEnc: encrypt(tokenData.refresh_token),
         *     hubspotConnectedAt: new Date(),
         *     hubspotTokenExpiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
         *   },
         * });
         */

        console.log("[HubSpot Callback] OAuth success", {
            state,
            expiresIn: tokenData.expires_in,
            tokenType: tokenData.token_type,
        });

        // 5) Redirect user back into your app
        const successUrl = new URL("/dashboard/settings", appBaseUrl);
        successUrl.searchParams.set("hubspot", "connected");

        return NextResponse.redirect(successUrl);
    } catch (err) {
        console.error("[HubSpot Callback] Unexpected error:", err);

        const failUrl = new URL("/dashboard/settings", appBaseUrl);
        failUrl.searchParams.set("hubspot", "error");
        failUrl.searchParams.set("reason", "unexpected_callback_error");
        return NextResponse.redirect(failUrl);
    }
}