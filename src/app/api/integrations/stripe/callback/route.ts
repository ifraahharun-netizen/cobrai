
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export const dynamic = "force-dynamic";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY");
}

const stripe = new Stripe(stripeSecretKey);

function getAccountDisplayName(account: Stripe.Account) {
    if (
        typeof account.business_profile?.name === "string" &&
        account.business_profile.name
    ) {
        return account.business_profile.name;
    }

    if (typeof account.email === "string" && account.email) {
        return account.email;
    }

    return "Stripe Account";
}

export async function GET(req: Request) {
    const { searchParams, origin } = new URL(req.url);

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/$/, "");
    const redirectBase = `${appUrl}/dashboard/settings?tab=integration`;

    // Keep this EXACTLY matched with:
    // 1) STRIPE_CONNECT_REDIRECT_URI in .env.local
    // 2) the redirect URI saved in Stripe OAuth settings
    // 3) the redirect URI used in your connect route
    const redirectUri =
        process.env.STRIPE_CONNECT_REDIRECT_URI ||
        "http://localhost:3000/api/integrations/stripe/callback";

    if (error) {
        return NextResponse.redirect(`${redirectBase}&stripe=error`);
    }

    if (!code || !state) {
        return NextResponse.redirect(`${redirectBase}&stripe=error`);
    }

    try {
        const stateRow = await prisma.stripeOAuthState.findUnique({
            where: { stateToken: state },
        });

        if (!stateRow) {
            return NextResponse.redirect(`${redirectBase}&stripe=error`);
        }

        if (stateRow.expiresAt.getTime() < Date.now()) {
            await prisma.stripeOAuthState.delete({
                where: { stateToken: state },
            });

            return NextResponse.redirect(`${redirectBase}&stripe=error`);
        }

        const uid = stateRow.uid;
        const workspaceId = stateRow.workspaceId;

        const tokenResponse = await stripe.oauth.token({
            grant_type: "authorization_code",
            code,
        });

        const stripeUserId = tokenResponse.stripe_user_id;
        const accessToken = tokenResponse.access_token;
        const refreshToken = tokenResponse.refresh_token ?? null;
        const scope = tokenResponse.scope ?? null;

        if (!stripeUserId || !accessToken) {
            await prisma.stripeOAuthState.delete({
                where: { stateToken: state },
            });

            return NextResponse.redirect(`${redirectBase}&stripe=error`);
        }

        const account = await stripe.accounts.retrieve(stripeUserId);

        const accountName = getAccountDisplayName(account);
        const accountEmail =
            typeof account.email === "string" ? account.email : null;

        const metadata: Prisma.JsonObject = {
            charges_enabled: account.charges_enabled ?? false,
            payouts_enabled: account.payouts_enabled ?? false,
            details_submitted: account.details_submitted ?? false,
            country: account.country ?? null,
            default_currency: account.default_currency ?? null,
            type: account.type ?? null,
        };

        await prisma.integration.upsert({
            where: {
                workspaceId_provider: {
                    workspaceId,
                    provider: "stripe",
                },
            },
            update: {
                status: "connected",
                externalAccountId: stripeUserId,
                externalAccountName: accountName,
                externalAccountEmail: accountEmail,
                accessTokenEnc: encrypt(accessToken),
                refreshTokenEnc: refreshToken ? encrypt(refreshToken) : null,
                scopes: scope,
                connectedAt: new Date(),
                disconnectedAt: null,
                lastSyncError: null,
                metadata,
            },
            create: {
                workspaceId,
                provider: "stripe",
                status: "connected",
                externalAccountId: stripeUserId,
                externalAccountName: accountName,
                externalAccountEmail: accountEmail,
                accessTokenEnc: encrypt(accessToken),
                refreshTokenEnc: refreshToken ? encrypt(refreshToken) : null,
                scopes: scope,
                connectedAt: new Date(),
                metadata,
            },
        });

        await prisma.workspace.update({
            where: { id: workspaceId },
            data: {
                stripeAccountId: stripeUserId,
                stripeAccessTokenEnc: encrypt(accessToken),
                stripeRefreshTokenEnc: refreshToken ? encrypt(refreshToken) : null,
                stripeScope: scope,
                stripeConnectedAt: new Date(),
                stripeLastSyncedAt: null,
            },
        });

        const adminDb = getAdminDb();

        await adminDb.doc(`users/${uid}/integrations/main`).set(
            {
                stripe: {
                    connected: true,
                    stripeAccountId: stripeUserId,
                    accountName,
                    accountEmail,
                    connectedAt: FieldValue.serverTimestamp(),
                },
                updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
        );

        try {
            await fetch(`${appUrl}/api/integrations/stripe/sync`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ uid }),
                cache: "no-store",
            });
        } catch (syncError) {
            console.error("[Stripe Connect] initial sync failed:", syncError);
        }

        await prisma.stripeOAuthState.delete({
            where: { stateToken: state },
        });

        return NextResponse.redirect(`${redirectBase}&stripe=connected`);
    } catch (error: any) {
        console.error(
            "[Stripe Connect] callback failed:",
            JSON.stringify(
                {
                    message: error?.message,
                    type: error?.type,
                    code: error?.code,
                    raw: error?.raw,
                    stack: error?.stack,
                },
                null,
                2
            )
        );

        return NextResponse.redirect(`${redirectBase}&stripe=error`);
    }
}