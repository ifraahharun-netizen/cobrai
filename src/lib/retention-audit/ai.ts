import OpenAI from "openai";
import { z } from "zod";

import type { AuditNarrative, DeterministicAudit } from "./types";

const narrativeSchema = z.object({
    headline: z.string().min(1).max(140),
    executiveSummary: z.string().min(1).max(1_200),
    keyFindings: z
        .array(
            z.object({
                title: z.string().min(1).max(100),
                explanation: z.string().min(1).max(500),
            }),
        )
        .min(3)
        .max(5),
    immediateActions: z
        .array(
            z.object({
                title: z.string().min(1).max(100),
                explanation: z.string().min(1).max(500),
                accountNames: z.array(z.string().max(160)).max(10),
            }),
        )
        .min(3)
        .max(5),
    caveats: z.array(z.string().max(300)).max(5),
    conversionMessage: z.string().min(1).max(500),
});

const responseJsonSchema = {
    type: "object",
    additionalProperties: false,
    required: [
        "headline",
        "executiveSummary",
        "keyFindings",
        "immediateActions",
        "caveats",
        "conversionMessage",
    ],
    properties: {
        headline: { type: "string" },
        executiveSummary: { type: "string" },
        keyFindings: {
            type: "array",
            minItems: 3,
            maxItems: 5,
            items: {
                type: "object",
                additionalProperties: false,
                required: ["title", "explanation"],
                properties: {
                    title: { type: "string" },
                    explanation: { type: "string" },
                },
            },
        },
        immediateActions: {
            type: "array",
            minItems: 3,
            maxItems: 5,
            items: {
                type: "object",
                additionalProperties: false,
                required: ["title", "explanation", "accountNames"],
                properties: {
                    title: { type: "string" },
                    explanation: { type: "string" },
                    accountNames: {
                        type: "array",
                        maxItems: 10,
                        items: { type: "string" },
                    },
                },
            },
        },
        caveats: {
            type: "array",
            maxItems: 5,
            items: { type: "string" },
        },
        conversionMessage: { type: "string" },
    },
} as const;

function safeSummary(audit: DeterministicAudit) {
    return {
        totals: audit.totals,
        topSignals: audit.topSignals,
        priorityAccounts: audit.priorityAccounts.slice(0, 12).map((account) => ({
            customerName: account.customerName,
            mrrMinor: account.mrrMinor,
            riskScore: account.riskScore,
            riskBand: account.riskBand,
            reasons: account.reasons.slice(0, 4),
            recommendedAction: account.recommendedAction,
        })),
        dataQuality: audit.dataQuality,
    };
}

export async function generateAuditNarrative(
    audit: DeterministicAudit,
): Promise<AuditNarrative> {
    if (!process.env.OPENAI_API_KEY) {
        return fallbackNarrative(audit);
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await client.responses.create({
        model: process.env.OPENAI_RETENTION_AUDIT_MODEL ?? "gpt-5-mini",
        store: false,
        instructions: [
            "You are Cobrai, a precise B2B SaaS retention analyst.",
            "Only use the supplied calculated facts.",
            "Never invent causation, benchmarks, probabilities, savings or customer behaviour.",
            "Do not claim an account will churn.",
            "Use calm, commercially useful UK English.",
            "Prioritise actions by risk and MRR exposure.",
            "Mention data limitations clearly.",
        ].join(" "),
        input: JSON.stringify(safeSummary(audit)),
        text: {
            format: {
                type: "json_schema",
                name: "retention_audit_narrative",
                strict: true,
                schema: responseJsonSchema,
            },
        },
    });

    const parsed = JSON.parse(response.output_text);
    return narrativeSchema.parse(parsed);
}

function fallbackNarrative(audit: DeterministicAudit): AuditNarrative {
    const money = new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
        maximumFractionDigits: 0,
    });

    const priorityNames = audit.priorityAccounts
        .slice(0, 5)
        .map((account) => account.customerName);

    return {
        headline: `${money.format(
            audit.totals.revenueAtRiskMinor / 100,
        )} in monthly revenue needs attention`,
        executiveSummary: `Cobrai analysed ${audit.totals.totalCustomers} customer accounts. ${audit.totals.criticalCustomers} are currently classified as critical and ${audit.totals.atRiskCustomers} as at risk. The score reflects the signals present in the uploaded dataset and should be reviewed alongside customer context.`,
        keyFindings: audit.topSignals.slice(0, 3).map((signal) => ({
            title: signal.label,
            explanation: `${signal.affectedCustomers} account${signal.affectedCustomers === 1 ? "" : "s"
                } representing ${money.format(
                    signal.affectedMrrMinor / 100,
                )} MRR show this signal.`,
        })),
        immediateActions: [
            {
                title: "Review the highest-risk accounts",
                explanation:
                    "Contact the highest-risk, highest-MRR accounts first and validate the reasons shown in the report.",
                accountNames: priorityNames,
            },
            {
                title: "Resolve billing exposure",
                explanation:
                    "Retry recoverable payments and confirm billing contacts for past-due accounts.",
                accountNames: audit.priorityAccounts
                    .filter((account) =>
                        account.reasons.some((reason) =>
                            ["FAILED_PAYMENT", "PAST_DUE"].includes(reason.code),
                        ),
                    )
                    .slice(0, 5)
                    .map((account) => account.customerName),
            },
            {
                title: "Create an ongoing monitoring cadence",
                explanation:
                    "Track activity, usage, billing and renewal signals continuously so changes are detected before the next audit.",
                accountNames: [],
            },
        ],
        caveats: [
            "This report identifies risk signals; it does not predict churn with certainty.",
            "Missing or stale fields can reduce the completeness of the analysis.",
        ],
        conversionMessage:
            "Cobrai can monitor these accounts continuously, surface changes automatically and recommend the next retention action.",
    };
}
