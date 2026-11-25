import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";

// Same versioned endpoint the OAuth callback uses for the first exchange.
const HUBSPOT_TOKEN_URL = "https://api.hubapi.com/oauth/2026-03/token";
// Refresh a little early so a token never expires mid-sync.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export class HubSpotReconnectError extends Error {
    constructor(message = "HubSpot needs reconnecting. Disconnect and connect it again in Integrations.") {
        super(message);
        this.name = "HubSpotReconnectError";
    }
}

type Metadata = Record<string, unknown> & { expiresAt?: string };

function readMetadata(value: unknown): Metadata {
    return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Metadata) } : {};
}

/** Expiry timestamp to store next to a token, from HubSpot's expires_in (seconds). */
export function hubSpotExpiresAt(expiresInSeconds: unknown, now = Date.now()): string | null {
    const seconds = Number(expiresInSeconds);
    return Number.isFinite(seconds) && seconds > 0 ? new Date(now + seconds * 1000).toISOString() : null;
}

/**
 * A usable HubSpot access token for this workspace: the stored one, decrypted,
 * or a fresh one from the refresh token when it has expired (or its expiry is
 * unknown). New tokens are saved encrypted. Throws HubSpotReconnectError when
 * the refresh token no longer works.
 */
export async function getHubSpotAccessToken(workspaceId: string): Promise<string> {
    const integration = await prisma.integration.findUnique({
        where: { workspaceId_provider: { workspaceId, provider: "hubspot" } },
        select: { status: true, accessTokenEnc: true, refreshTokenEnc: true, metadata: true },
    });

    if (!integration || integration.status !== "connected" || !integration.refreshTokenEnc) {
        throw new HubSpotReconnectError("HubSpot is not connected");
    }

    const metadata = readMetadata(integration.metadata);
    const expiresAt = metadata.expiresAt ? new Date(metadata.expiresAt).getTime() : NaN;
    if (integration.accessTokenEnc && Number.isFinite(expiresAt) && expiresAt - REFRESH_MARGIN_MS > Date.now()) {
        return decrypt(integration.accessTokenEnc);
    }

    const clientId = process.env.HUBSPOT_CLIENT_ID;
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error("HubSpot client credentials are not configured");

    const res = await fetch(HUBSPOT_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
        body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: decrypt(integration.refreshTokenEnc),
        }).toString(),
        cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as
        | { access_token?: string; refresh_token?: string; expires_in?: number }
        | null;

    if (!res.ok || !data?.access_token) {
        console.error("[hubspot] token refresh failed:", res.status);
        await prisma.integration.update({
            where: { workspaceId_provider: { workspaceId, provider: "hubspot" } },
            data: { lastSyncError: "HubSpot token refresh failed; reconnect HubSpot." },
        });
        throw new HubSpotReconnectError();
    }

    await prisma.integration.update({
        where: { workspaceId_provider: { workspaceId, provider: "hubspot" } },
        data: {
            accessTokenEnc: encrypt(data.access_token),
            ...(data.refresh_token ? { refreshTokenEnc: encrypt(data.refresh_token) } : {}),
            metadata: { ...metadata, expiresAt: hubSpotExpiresAt(data.expires_in) ?? undefined },
        },
    });

    return data.access_token;
}
