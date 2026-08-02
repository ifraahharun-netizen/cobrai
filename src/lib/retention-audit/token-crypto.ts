import {
    createCipheriv,
    createDecipheriv,
    randomBytes,
} from "node:crypto";

import { retentionAuditConfig } from "@/lib/retention-audit/config";

type EncryptedToken = {
    ciphertext: string;
    iv: string;
    authTag: string;
};

export function encryptReportToken(
    token: string,
): EncryptedToken {
    const key = retentionAuditConfig.tokenEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);

    const ciphertext = Buffer.concat([
        cipher.update(token, "utf8"),
        cipher.final(),
    ]);

    return {
        ciphertext: ciphertext.toString("base64"),
        iv: iv.toString("base64"),
        authTag: cipher.getAuthTag().toString("base64"),
    };
}

export function decryptReportToken(
    encrypted: EncryptedToken,
) {
    const key = retentionAuditConfig.tokenEncryptionKey();
    const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(encrypted.iv, "base64"),
    );

    decipher.setAuthTag(
        Buffer.from(encrypted.authTag, "base64"),
    );

    return Buffer.concat([
        decipher.update(
            Buffer.from(encrypted.ciphertext, "base64"),
        ),
        decipher.final(),
    ]).toString("utf8");
}
