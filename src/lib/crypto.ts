import crypto from "crypto";

const KEY = process.env.TOKEN_ENC_KEY || "";

function getKey() {
    return crypto.createHash("sha256").update(KEY).digest(); // 32 bytes
}

export function encrypt(text: string) {
    if (!KEY) throw new Error("TOKEN_ENC_KEY missing");
    const iv = crypto.randomBytes(12);
    const key = getKey();
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(payload: string) {
    if (!KEY) throw new Error("TOKEN_ENC_KEY missing");
    const raw = Buffer.from(payload, "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const key = getKey();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
