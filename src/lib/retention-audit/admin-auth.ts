import { createHash, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

const COOKIE_NAME = "cobrai-retention-admin";

function digest(value: string) {
    return createHash("sha256").update(value).digest();
}

function safeEqual(left: string, right: string) {
    const leftDigest = digest(left);
    const rightDigest = digest(right);

    return timingSafeEqual(leftDigest, rightDigest);
}

export function getAdminSecret() {
    const secret = process.env.ADMIN_AUDIT_SECRET?.trim();

    if (!secret) {
        throw new Error(
            "ADMIN_AUDIT_SECRET is not configured.",
        );
    }

    return secret;
}

export function isValidAdminSecret(value: string) {
    const secret = process.env.ADMIN_AUDIT_SECRET?.trim();

    if (!secret || !value) {
        return false;
    }

    return safeEqual(value, secret);
}

export async function isRetentionAuditAdmin() {
    const cookieStore = await cookies();
    const value = cookieStore.get(COOKIE_NAME)?.value ?? "";

    return isValidAdminSecret(value);
}

export async function setRetentionAuditAdminCookie() {
    const cookieStore = await cookies();

    cookieStore.set(COOKIE_NAME, getAdminSecret(), {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: "/admin/retention-audits",
        maxAge: 60 * 60 * 12,
    });
}

export async function clearRetentionAuditAdminCookie() {
    const cookieStore = await cookies();

    cookieStore.set(COOKIE_NAME, "", {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        path: "/admin/retention-audits",
        maxAge: 0,
    });
}
