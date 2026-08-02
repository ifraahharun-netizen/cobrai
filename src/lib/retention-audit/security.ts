import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createSecureToken() {
    return randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
}

export function tokenMatches(token: string, expectedHash: string) {
    const supplied = Buffer.from(hashToken(token), "hex");
    const expected = Buffer.from(expectedHash, "hex");

    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function normaliseEmail(value: string) {
    return value.trim().toLowerCase();
}
