export type ProvidedRiskLevel =
    | "LOW"
    | "MEDIUM"
    | "HIGH"
    | "CRITICAL";

export type RiskBand =
    | "HEALTHY"
    | "AT_RISK"
    | "CRITICAL";

export type NormalisedCustomer = {
    customerName: string;
    email: string | null;
    mrrMinor: number;
    lastActiveAt: string | null;
    signupAt: string | null;
    renewalAt: string | null;
    failedPayments30d: number;
    productUsageScore: number | null;
    usageChange30d: number | null;
    supportTickets30d: number;
    npsScore: number | null;
    subscriptionStatus: string | null;
    planType: string | null;

    /*
     * Optional values supplied by an already-scored customer list.
     * When providedRiskScore is present, scoring.ts preserves the supplied
     * score, reason and action instead of recalculating the account.
     */
    providedRiskScore: number | null;
    providedRiskLevel: ProvidedRiskLevel | null;
    providedReason: string | null;
    providedNextAction: string | null;
};

export type RiskReason = {
    code: string;
    label: string;
    points: number;
    evidence: string;
};

export type AnalysedCustomer = NormalisedCustomer & {
    riskScore: number;
    riskBand: RiskBand;
    reasons: readonly RiskReason[];
    recommendedAction: string;
};



export type DeterministicAudit = {
    generatedAt: string;

  

    totals: {
        totalCustomers: number;
        totalMrrMinor: number;
        healthyCustomers: number;
        atRiskCustomers: number;
        criticalCustomers: number;
        revenueAtRiskMinor: number;
        failedPaymentMinor: number;
        healthScore: number;
    };

    topSignals: readonly {
        code: string;
        label: string;
        affectedCustomers: number;
        affectedMrrMinor: number;
    }[];

    priorityAccounts: readonly AnalysedCustomer[];
    allAccounts: readonly AnalysedCustomer[];

    dataQuality: {
        rowsReceived: number;
        rowsAnalysed: number;
        rowsExcluded: number;
        warnings: readonly string[];
    };
};

export type AuditNarrative = {
    headline: string;
    executiveSummary: string;

    keyFindings: readonly {
        title: string;
        explanation: string;
    }[];

    immediateActions: readonly {
        title: string;
        explanation: string;
        accountNames: readonly string[];
    }[];

    caveats: readonly string[];
    conversionMessage: string;
};