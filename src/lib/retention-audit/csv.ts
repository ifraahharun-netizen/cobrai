import Papa from "papaparse";
import { z } from "zod";

import type {
    NormalisedCustomer,
    ProvidedRiskLevel,
} from "./types";

const MAX_ROWS = 5_000;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const aliases: Record<string, keyof NormalisedCustomer> = {
    customer: "customerName",
    customer_name: "customerName",
    company: "customerName",
    company_name: "customerName",
    account: "customerName",
    account_name: "customerName",

    email: "email",
    customer_email: "email",

    mrr: "mrrMinor",
    monthly_recurring_revenue: "mrrMinor",

    last_active: "lastActiveAt",
    last_active_at: "lastActiveAt",
    last_seen: "lastActiveAt",
    last_seen_at: "lastActiveAt",

    signup_date: "signupAt",
    signup_at: "signupAt",
    created_at: "signupAt",

    renewal_date: "renewalAt",
    renewal_at: "renewalAt",

    failed_payments: "failedPayments30d",
    failed_payments_30d: "failedPayments30d",

    usage_score: "productUsageScore",
    product_usage_score: "productUsageScore",

    usage_change: "usageChange30d",
    usage_change_30d: "usageChange30d",

    support_tickets: "supportTickets30d",
    support_tickets_30d: "supportTickets30d",

    nps: "npsScore",
    nps_score: "npsScore",

    status: "subscriptionStatus",
    subscription_status: "subscriptionStatus",

    plan: "planType",
    plan_type: "planType",

    /*
     * Support customer lists that have already been scored.
     * These fields are preserved by scoring.ts when risk_score is valid.
     */
    risk: "providedRiskScore",
    risk_score: "providedRiskScore",
    churn_risk_score: "providedRiskScore",

    risk_level: "providedRiskLevel",
    risk_band: "providedRiskLevel",

    reason: "providedReason",
    risk_reason: "providedReason",
    evidence: "providedReason",

    next_action: "providedNextAction",
    recommended_action: "providedNextAction",
    action: "providedNextAction",
};

function canonicalHeader(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function parseNumber(value: unknown, fallback = 0) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value !== "string") {
        return fallback;
    }

    const cleaned = value
        .replace(/[£$€,]/g, "")
        .replace(/%/g, "")
        .trim();

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function parseNullableNumber(value: unknown) {
    if (
        value === null ||
        value === undefined ||
        (typeof value === "string" && value.trim() === "")
    ) {
        return null;
    }

    const parsed = parseNumber(value, Number.NaN);
    return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: unknown) {
    if (typeof value !== "string" || !value.trim()) {
        return null;
    }

    const trimmed = value.trim();
    const parsed = new Date(trimmed);

    return Number.isNaN(parsed.getTime())
        ? null
        : parsed.toISOString();
}

function parseCurrencyMinor(value: unknown) {
    const pounds = parseNumber(value, Number.NaN);

    if (!Number.isFinite(pounds) || pounds < 0) {
        return null;
    }

    return Math.round(pounds * 100);
}

function parseNullableText(value: unknown, maxLength: number) {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, maxLength) : null;
}

function parseProvidedRiskLevel(
    value: unknown,
): ProvidedRiskLevel | null {
    if (typeof value !== "string" || !value.trim()) {
        return null;
    }

    const canonical = canonicalHeader(value);

    if (["critical", "very_high", "severe"].includes(canonical)) {
        return "CRITICAL";
    }

    if (["high", "at_risk", "atrisk"].includes(canonical)) {
        return "HIGH";
    }

    if (["medium", "moderate"].includes(canonical)) {
        return "MEDIUM";
    }

    if (["low", "healthy"].includes(canonical)) {
        return "LOW";
    }

    return null;
}

const customerSchema = z.object({
    customerName: z.string().trim().min(1).max(160),
    email: z.string().email().nullable(),
    mrrMinor: z.number().int().nonnegative(),
    lastActiveAt: z.string().datetime().nullable(),
    signupAt: z.string().datetime().nullable(),
    renewalAt: z.string().datetime().nullable(),
    failedPayments30d: z.number().int().min(0).max(100),
    productUsageScore: z.number().min(0).max(100).nullable(),
    usageChange30d: z.number().min(-100).max(1000).nullable(),
    supportTickets30d: z.number().int().min(0).max(10_000),
    npsScore: z.number().min(-100).max(100).nullable(),
    subscriptionStatus: z.string().max(80).nullable(),
    planType: z.string().max(80).nullable(),
    providedRiskScore: z.number().min(0).max(100).nullable(),
    providedRiskLevel: z
        .enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
        .nullable(),
    providedReason: z.string().max(500).nullable(),
    providedNextAction: z.string().max(500).nullable(),
});

export function parseRetentionCsv(csvText: string) {
    const parsed = Papa.parse<Record<string, string>>(csvText, {
        header: true,
        skipEmptyLines: "greedy",
        transformHeader: canonicalHeader,
    });

    if (parsed.errors.length > 0) {
        const message = parsed.errors
            .slice(0, 3)
            .map((error) => error.message)
            .join("; ");

        throw new Error(`CSV could not be parsed: ${message}`);
    }

    if (parsed.data.length === 0) {
        throw new Error("The CSV does not contain any customer rows.");
    }

    if (parsed.data.length > MAX_ROWS) {
        throw new Error(
            `The CSV exceeds the ${MAX_ROWS.toLocaleString()} row limit.`,
        );
    }

    const headers = parsed.meta.fields ?? [];
    const mappedHeaders = new Map<
        string,
        keyof NormalisedCustomer
    >();

    for (const header of headers) {
        const mapped = aliases[canonicalHeader(header)];

        if (mapped) {
            mappedHeaders.set(header, mapped);
        }
    }

    const mappedValues = [...mappedHeaders.values()];
    const hasCustomerName = mappedValues.includes("customerName");
    const hasMrr = mappedValues.includes("mrrMinor");

    if (!hasCustomerName || !hasMrr) {
        throw new Error(
            "CSV must contain customer_name (or company) and mrr columns.",
        );
    }

    const rows: NormalisedCustomer[] = [];
    const warnings: string[] = [];

    parsed.data.forEach((raw, index) => {
        const mapped: Partial<
            Record<keyof NormalisedCustomer, unknown>
        > = {};

        for (const [header, value] of Object.entries(raw)) {
            const target = mappedHeaders.get(header);

            if (target) {
                mapped[target] = value;
            }
        }

        const mrrMinor = parseCurrencyMinor(mapped.mrrMinor);
        const emailValue =
            typeof mapped.email === "string" && mapped.email.trim()
                ? mapped.email.trim().toLowerCase()
                : null;

        const suppliedRisk = parseNullableNumber(
            mapped.providedRiskScore,
        );

        const providedRiskScore =
            suppliedRisk === null
                ? null
                : Math.round(suppliedRisk);

        const candidate: NormalisedCustomer = {
            customerName:
                typeof mapped.customerName === "string"
                    ? mapped.customerName.trim()
                    : "",
            email: emailValue,
            mrrMinor: mrrMinor ?? -1,
            lastActiveAt: parseDate(mapped.lastActiveAt),
            signupAt: parseDate(mapped.signupAt),
            renewalAt: parseDate(mapped.renewalAt),
            failedPayments30d: Math.round(
                Math.max(
                    0,
                    parseNumber(mapped.failedPayments30d),
                ),
            ),
            productUsageScore: parseNullableNumber(
                mapped.productUsageScore,
            ),
            usageChange30d: parseNullableNumber(
                mapped.usageChange30d,
            ),
            supportTickets30d: Math.round(
                Math.max(
                    0,
                    parseNumber(mapped.supportTickets30d),
                ),
            ),
            npsScore: parseNullableNumber(mapped.npsScore),
            subscriptionStatus: parseNullableText(
                mapped.subscriptionStatus,
                80,
            ),
            planType: parseNullableText(mapped.planType, 80),
            providedRiskScore,
            providedRiskLevel: parseProvidedRiskLevel(
                mapped.providedRiskLevel,
            ),
            providedReason: parseNullableText(
                mapped.providedReason,
                500,
            ),
            providedNextAction: parseNullableText(
                mapped.providedNextAction,
                500,
            ),
        };

        const validated = customerSchema.safeParse(candidate);

        if (!validated.success) {
            warnings.push(
                `Row ${index + 2} was excluded because required values were missing or invalid.`,
            );
            return;
        }

        if (
            validated.data.providedRiskScore === null &&
            (
                validated.data.providedRiskLevel !== null ||
                validated.data.providedReason !== null ||
                validated.data.providedNextAction !== null
            )
        ) {
            warnings.push(
                `Row ${index + 2} included risk output fields without a valid risk score, so Cobrai recalculated that account.`,
            );
        }

        rows.push(validated.data);
    });

    if (rows.length === 0) {
        throw new Error(
            "No valid customer rows remained after validation.",
        );
    }

    const rowsWithProvidedScores = rows.filter(
        (row) => row.providedRiskScore !== null,
    ).length;

    if (
        rowsWithProvidedScores > 0 &&
        rowsWithProvidedScores < rows.length
    ) {
        warnings.push(
            "The file contains a mixture of supplied and calculated risk scores. Cobrai preserved valid supplied scores and calculated the remaining accounts.",
        );
    }

    return {
        columns: headers,
        rows,
        warnings,
        rowsReceived: parsed.data.length,
    };
}
