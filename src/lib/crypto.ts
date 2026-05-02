import crypto from "crypto";

function getEnvKey(): string {
    const key = process.env.TOKEN_ENC_KEY;

    if (!key || key.length < 32) {
        throw new Error("TOKEN_ENC_KEY must be set and at least 32 characters long");
    }

    return key;
}

function getKey() {
    return crypto.createHash("sha256").update(getEnvKey(), "utf8").digest();
}

export function encrypt(text: string) {
    const iv = crypto.randomBytes(12);
    const key = getKey();

    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return "v1:" + Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(payload: string) {
    const clean = payload.startsWith("v1:") ? payload.slice(3) : payload;

    const raw = Buffer.from(clean, "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);

    const key = getKey();

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}