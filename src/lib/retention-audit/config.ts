function required(name: string) {
    const value = process.env[name]?.trim();

    if (!value) {
        throw new Error(`${name} is required.`);
    }

    return value;
}

function positiveInteger(name: string) {
    const raw = required(name);
    const value = Number.parseInt(raw, 10);

    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer.`);
    }

    return value;
}

export const retentionAuditConfig = {
    appUrl() {
        const value = required("APP_URL").replace(/\/+$/, "");
        const url = new URL(value);

        if (
            process.env.NODE_ENV === "production" &&
            url.protocol !== "https:"
        ) {
            throw new Error("APP_URL must use HTTPS in production.");
        }

        return url.origin;
    },

    tokenEncryptionKey() {
        const encoded = required(
            "RETENTION_AUDIT_TOKEN_ENCRYPTION_KEY",
        );
        const key = Buffer.from(encoded, "base64");

        if (key.length !== 32) {
            throw new Error(
                "RETENTION_AUDIT_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
            );
        }

        return key;
    },

    workerSecret() {
        return required("RETENTION_AUDIT_WORKER_SECRET");
    },

    reportTtlDays() {
        const raw = process.env.RETENTION_AUDIT_REPORT_TTL_DAYS?.trim();

        if (!raw) {
            return null;
        }

        const days = Number.parseInt(raw, 10);

        if (!Number.isFinite(days) || days <= 0) {
            throw new Error(
                "RETENTION_AUDIT_REPORT_TTL_DAYS must be a positive integer.",
            );
        }

        return days;
    },

    emailMaxAttempts() {
        return positiveInteger(
            "RETENTION_AUDIT_EMAIL_MAX_ATTEMPTS",
        );
    },

    workerBatchSize() {
        return positiveInteger(
            "RETENTION_AUDIT_WORKER_BATCH_SIZE",
        );
    },

    workerLockMinutes() {
        return positiveInteger(
            "RETENTION_AUDIT_WORKER_LOCK_MINUTES",
        );
    },

    approveRateLimit() {
        return {
            limit: positiveInteger(
                "RETENTION_AUDIT_APPROVE_RATE_LIMIT",
            ),
            windowSeconds: positiveInteger(
                "RETENTION_AUDIT_APPROVE_RATE_WINDOW_SECONDS",
            ),
        };
    },

    rejectRateLimit() {
        return {
            limit: positiveInteger(
                "RETENTION_AUDIT_REJECT_RATE_LIMIT",
            ),
            windowSeconds: positiveInteger(
                "RETENTION_AUDIT_REJECT_RATE_WINDOW_SECONDS",
            ),
        };
    },

    resendRateLimit() {
        return {
            limit: positiveInteger(
                "RETENTION_AUDIT_RESEND_RATE_LIMIT",
            ),
            windowSeconds: positiveInteger(
                "RETENTION_AUDIT_RESEND_RATE_WINDOW_SECONDS",
            ),
        };
    },
};

