/* ================= TYPES ================= */

export type PlanTier = "free" | "starter" | "pro";

export type FeatureKey =
    // Free / demo features
    | "demo-mode"

    // Starter features
    | "basic-dashboard"
    | "basic-risk-accounts"
    | "basic-churn-mrr"
    | "manual-email"

    // Pro features
    | "ai-insights"
    | "full-risk-list"
    | "forecasting"
    | "revenue-drivers"
    | "advanced-filtering"
    | "automations"
    | "retry-payment"
    | "send-notification"
    | "workflows";

/* ================= PLAN → FEATURES ================= */

const STARTER_FEATURES: FeatureKey[] = [
    "basic-dashboard",
    "basic-risk-accounts",
    "basic-churn-mrr",
    "manual-email",
    "ai-insights",
];

const PRO_FEATURES: FeatureKey[] = [
    ...STARTER_FEATURES,
    "ai-insights",
    "full-risk-list",
    "forecasting",
    "revenue-drivers",
    "advanced-filtering",
    "automations",
    "retry-payment",
    "send-notification",
    "workflows",
];

const PLAN_FEATURES: Record<PlanTier, FeatureKey[]> = {
    free: ["demo-mode"],
    starter: STARTER_FEATURES,
    pro: PRO_FEATURES,
};

/* ================= CORE CHECK ================= */

export function hasFeatureAccess(
    plan: PlanTier | null | undefined,
    feature: FeatureKey
): boolean {
    if (!plan) return false;

    const features = PLAN_FEATURES[plan];
    return features?.includes(feature) ?? false;
}

/* ================= TRIAL / DEMO-AWARE CHECK ================= */

export function getTrialDaysLeft(
    trialEndsAt: string | Date | null | undefined
): number | null {
    if (!trialEndsAt) return null;

    const end =
        trialEndsAt instanceof Date
            ? trialEndsAt.getTime()
            : new Date(trialEndsAt).getTime();

    if (!Number.isFinite(end)) return null;

    const diff = end - Date.now();

    if (diff <= 0) return 0;

    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function hasActiveTrial(
    trialEndsAt: string | Date | null | undefined
): boolean {
    const daysLeft = getTrialDaysLeft(trialEndsAt);

    return typeof daysLeft === "number" && daysLeft > 0;
}

export function canAccessFeature(params: {
    plan: PlanTier | null | undefined;
    feature: FeatureKey;
    trialEndsAt?: string | Date | null;
    isDemoMode?: boolean;
}): boolean {
    const { plan, feature, trialEndsAt, isDemoMode } = params;

    if (isDemoMode) return true;

    if (hasActiveTrial(trialEndsAt)) return true;

    return hasFeatureAccess(plan, feature);
}

/* ================= HELPERS ================= */

export function getPlanFeatures(plan: PlanTier): FeatureKey[] {
    return PLAN_FEATURES[plan] ?? [];
}

export function isFreeFeature(feature: FeatureKey): boolean {
    return PLAN_FEATURES.free.includes(feature);
}

export function isStarterFeature(feature: FeatureKey): boolean {
    return PLAN_FEATURES.starter.includes(feature);
}

export function isProFeature(feature: FeatureKey): boolean {
    return PRO_FEATURES.includes(feature) && !STARTER_FEATURES.includes(feature);
}

export function isPaidPlan(plan: PlanTier | null | undefined): boolean {
    return plan === "starter" || plan === "pro";
}

export function isDemoPlan(plan: PlanTier | null | undefined): boolean {
    return plan === "free";
}

/* ================= UPGRADE COPY ================= */

export function getUpgradeMessage(feature: FeatureKey): {
    title: string;
    description: string;
} {
    const messages: Record<
        FeatureKey,
        { title: string; description: string }
    > = {
        "demo-mode": {
            title: "Upgrade to use live workspace data",
            description:
                "You are currently in demo mode. Upgrade to Starter or Pro to use Cobrai with your real billing and customer data.",
        },

        "basic-dashboard": {
            title: "",
            description: "",
        },
        "basic-risk-accounts": {
            title: "",
            description: "",
        },
        "basic-churn-mrr": {
            title: "",
            description: "",
        },
        "manual-email": {
            title: "",
            description: "",
        },

        "ai-insights": {
            title: "Understand why customers churn",
            description:
                "See AI-powered insights explaining risk, behaviour, and revenue impact.",
        },
        "full-risk-list": {
            title: "See all at-risk accounts",
            description:
                "View every account at risk and prioritise by revenue and urgency.",
        },
        forecasting: {
            title: "Predict your future revenue",
            description:
                "Forecast MRR and churn before it happens and plan ahead with confidence.",
        },
        "revenue-drivers": {
            title: "Know what’s driving your MRR",
            description:
                "Identify exactly what’s increasing or decreasing your revenue.",
        },
        "advanced-filtering": {
            title: "Find the highest priority accounts faster",
            description:
                "Filter by risk, revenue, behaviour, and more to focus on what matters.",
        },
        automations: {
            title: "Automate retention actions",
            description:
                "Trigger emails and workflows automatically to prevent churn.",
        },
        "retry-payment": {
            title: "Recover failed payments automatically",
            description:
                "Retry failed payments and recover revenue without manual work.",
        },
        "send-notification": {
            title: "Send real-time customer notifications",
            description:
                "Reach customers instantly with important updates and reminders.",
        },
        workflows: {
            title: "Build retention workflows",
            description:
                "Create automated flows to engage, recover, and retain customers.",
        },
    };

    return messages[feature];
}