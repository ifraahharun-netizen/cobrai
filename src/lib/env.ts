function required(name: string) {
    const value = process.env[name];
    if (!value || !value.trim()) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

export const env = {
    DATABASE_URL: required("DATABASE_URL"),
    FIREBASE_PROJECT_ID: required("FIREBASE_PROJECT_ID"),
    FIREBASE_CLIENT_EMAIL: required("FIREBASE_CLIENT_EMAIL"),
    FIREBASE_PRIVATE_KEY:
        process.env.FIREBASE_PRIVATE_KEY_B64 || process.env.FIREBASE_PRIVATE_KEY
            ? "configured"
            : (() => {
                throw new Error(
                    "Missing required environment variable: FIREBASE_PRIVATE_KEY or FIREBASE_PRIVATE_KEY_B64"
                );
            })(),
    EMAIL_DELIVERY_ENABLED: process.env.EMAIL_DELIVERY_ENABLED || "false",
    EMAIL_WEEKLY_CAP: process.env.EMAIL_WEEKLY_CAP || "100",
    RESEND_API_KEY: process.env.RESEND_API_KEY || "",
};