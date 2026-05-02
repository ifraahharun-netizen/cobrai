import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWorkspaceIdFromRequest } from "@/lib/workspace.server";
import { writeDailyAccountRiskSnapshotsForWorkspace } from "@/lib/account-risk-snapshots";

type HistoryRow = {
  id: string;
  customerId: string | null;
  type: string;
  label: string;
  company: string | null;
  occurredAt: string;
  valueMinor?: number | null;
  email?: string | null;
};

type InsightKind = "adoption" | "billing" | "onboarding" | "support" | "usage";

type DashboardInsight = {
  title: string;
  text: string;
  kind: InsightKind;
  accountIds: string[];
};

type DashboardSummary = {
  ok: boolean;
  error?: string;
  tier?: "free" | "starter" | "pro" | "scale";
  demoMode?: boolean;
  trialEndsAt?: string | null;
  connectedIntegrations?: string[];

  kpis?: {
    totalMrr?: number;
    mrrAtRisk?: number;
    atRiskAccounts?: number;
    retentionPct?: number | null;
    churnPct?: number | null;
  };

  totalMrrTrend?: {
    current: number;
    previous: number;
  };

  mrrProtected?: {
    current: number;
    previous: number;
  };

  mrrAtRiskTrend?: {
    current: number;
    previous: number;
  };

  churnProxyTrend?: {
    current: number;
    previous: number;
  };

  accountsFlaggedTrend?: {
    current: number;
    previous: number;
  };

  mrrProtectedChart?: {
    months: string[];
    values: number[];
  };

  churnTrend?: {
    months: string[];
    values: number[];
    unavailable?: boolean;
  };

  insights?: DashboardInsight[];

  riskAccounts?: Array<{
    id: string;
    company: string;
    reason: string;
    risk: number;
    mrr?: number | null;
    tags?: string[];
    updatedAt?: string;
    email?: string | null;
  }>;

  opportunities?: Array<{
    id: string;
    company: string;
    email?: string | null;
    signal: string;
    upside: number;
    updatedAt?: string;
  }>;

  customerMix?: {
    active: number;
    trial: number;
    upgraded: number;
    newSubscribers: number;
  };

  activitySummary?: {
    windowLabel: string;
    newSubscriptions: number;
    newTrials: number;
    reactivations: number;
    failedSubscriptions: number;
  };

  history?: HistoryRow[];
};

type EventForInsight = {
  id: string;
  type: string;
  occurredAt: Date;
  value: number | null;
  customer?: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
};

export const dynamic = "force-dynamic";

function monthKey(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabel(month: string) {
  const [, mm] = month.split("-");
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return labels[Math.max(0, Math.min(11, Number(mm) - 1))];
}

function humanizeType(type: string) {
  return type
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function previousMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
}

function addMonths(date: Date, delta: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
}

function dedupeLatestSnapshotPerCompany<T extends { companyName: string; snapshotDate: Date }>(rows: T[]) {
  const map = new Map<string, T>();

  for (const row of rows) {
    const existing = map.get(row.companyName);
    if (!existing || row.snapshotDate > existing.snapshotDate) {
      map.set(row.companyName, row);
    }
  }

  return Array.from(map.values());
}

function reasonKeyToKind(reasonKey: string): InsightKind {
  const key = (reasonKey || "").toLowerCase();

  if (key.includes("billing") || key.includes("payment") || key.includes("invoice")) return "billing";
  if (key.includes("onboard") || key.includes("activation")) return "onboarding";
  if (key.includes("support") || key.includes("ticket") || key.includes("sentiment")) return "support";
  if (key.includes("usage") || key.includes("login") || key.includes("engagement") || key.includes("inactive")) return "usage";
  return "adoption";
}

function formatCurrencyWhole(value: number) {
  return `£${Math.round(value).toLocaleString()}`;
}

function pluralize(count: number, singular: string, plural?: string) {
  if (count === 1) return singular;
  return plural ?? `${singular}s`;
}

function isUpgradeEvent(type: string) {
  const t = type.toLowerCase();
  return t.includes("upgrade") || t.includes("plan_upgraded") || t.includes("subscription_upgraded");
}

function isReactivationEvent(type: string) {
  const t = type.toLowerCase();
  return t.includes("reactivat");
}

function isProtectedRevenueEvent(type: string) {
  const t = type.toLowerCase();
  return (
    t.includes("recovered") ||
    t.includes("recovery") ||
    t.includes("saved") ||
    t.includes("retained") ||
    t.includes("retention_saved") ||
    t.includes("payment_recovered") ||
    t.includes("billing_recovered")
  );
}

function isEmailSentEvent(type: string) {
  const t = type.toLowerCase();
  return t.includes("email_sent") || t.includes("sent_email") || t.includes("message_sent");
}

function isEmailOpenedEvent(type: string) {
  const t = type.toLowerCase();
  return t.includes("email_opened") || t.includes("message_opened") || t.includes("opened_email");
}

function isEmailClickedEvent(type: string) {
  const t = type.toLowerCase();
  return t.includes("email_clicked") || t.includes("message_clicked") || t.includes("clicked_email");
}

function buildRiskInsights(
  risks: Array<{
    id: string;
    companyName: string;
    reasonKey: string;
    reasonLabel: string;
    riskScore: number;
    mrr: number | null;
  }>
): DashboardInsight[] {
  const groups: Record<InsightKind, typeof risks> = {
    adoption: [],
    billing: [],
    onboarding: [],
    support: [],
    usage: [],
  };

  for (const risk of risks) {
    groups[reasonKeyToKind(risk.reasonKey)].push(risk);
  }

  const sortedRisks = [...risks].sort((a, b) => {
    const aValue = Number(a.mrr || 0) * a.riskScore;
    const bValue = Number(b.mrr || 0) * b.riskScore;
    if (bValue !== aValue) return bValue - aValue;
    return b.riskScore - a.riskScore;
  });

  const insights: DashboardInsight[] = [];
  const usedIds = new Set<string>();

  const addInsight = (insight: DashboardInsight | null) => {
    if (!insight || !insight.accountIds.length) return;
    const dedupeKey = `${insight.title}-${insight.kind}`;
    if (insights.some((x) => `${x.title}-${x.kind}` === dedupeKey)) return;
    insight.accountIds.forEach((id) => usedIds.add(id));
    insights.push(insight);
  };

  const highestUrgency = sortedRisks[0];
  if (highestUrgency) {
    const accountCountAbove80 = risks.filter((r) => r.riskScore >= 80).length;
    const topMrr = Number(highestUrgency.mrr || 0);

    addInsight({
      title: "Highest urgency account",
      text:
        accountCountAbove80 > 1
          ? `${highestUrgency.companyName} is the most urgent churn risk, with ${accountCountAbove80} high-risk accounts now needing attention.`
          : `${highestUrgency.companyName} is the highest-priority churn risk right now${topMrr > 0 ? `, with ${formatCurrencyWhole(topMrr)} at risk` : ""}.`,
      kind: reasonKeyToKind(highestUrgency.reasonKey),
      accountIds: [highestUrgency.id],
    });
  }

  const driverRankings = (Object.entries(groups) as [InsightKind, typeof risks][])
    .map(([kind, rows]) => ({
      kind,
      rows,
      count: rows.length,
      totalMrr: rows.reduce((sum, r) => sum + Number(r.mrr || 0), 0),
      weightedRisk: rows.reduce((sum, r) => sum + r.riskScore * Math.max(1, Number(r.mrr || 0)), 0),
    }))
    .filter((x) => x.count > 0)
    .sort((a, b) => {
      if (b.totalMrr !== a.totalMrr) return b.totalMrr - a.totalMrr;
      if (b.count !== a.count) return b.count - a.count;
      return b.weightedRisk - a.weightedRisk;
    });

  const topDriver = driverRankings[0];
  if (topDriver) {
    const driverTextByKind: Record<InsightKind, string> = {
      adoption: "Low feature adoption is the biggest retention pressure right now.",
      billing: "Billing friction is the biggest retention pressure right now.",
      onboarding: "Incomplete onboarding is the biggest retention pressure right now.",
      support: "Support friction is the biggest retention pressure right now.",
      usage: "Usage decline is the biggest retention pressure right now.",
    };

    addInsight({
      title: "Top churn driver",
      text:
        topDriver.totalMrr > 0
          ? `${driverTextByKind[topDriver.kind]} ${pluralize(topDriver.count, "account")} in this group represent about ${formatCurrencyWhole(topDriver.totalMrr)} at risk.`
          : driverTextByKind[topDriver.kind],
      kind: topDriver.kind,
      accountIds: topDriver.rows.slice(0, 3).map((r) => r.id),
    });
  }

  const billingRows = groups.billing.slice().sort((a, b) => Number(b.mrr || 0) - Number(a.mrr || 0));
  if (billingRows.length > 0) {
    const billingMrr = billingRows.reduce((sum, row) => sum + Number(row.mrr || 0), 0);
    const worstBilling = billingRows[0];

    addInsight({
      title: "Billing risk needs attention",
      text:
        billingRows.length === 1
          ? `${worstBilling.companyName} has a billing-related retention risk${billingMrr > 0 ? ` worth about ${formatCurrencyWhole(billingMrr)}` : ""}.`
          : `${billingRows.length} accounts show billing-related churn risk${billingMrr > 0 ? `, with about ${formatCurrencyWhole(billingMrr)} exposed` : ""}.`,
      kind: "billing",
      accountIds: billingRows.slice(0, 3).map((r) => r.id),
    });
  }

  const onboardingRows = groups.onboarding.slice().sort((a, b) => Number(b.mrr || 0) - Number(a.mrr || 0));
  if (onboardingRows.length > 0) {
    const onboardingMrr = onboardingRows.reduce((sum, row) => sum + Number(row.mrr || 0), 0);

    addInsight({
      title: "Fastest recovery lever",
      text:
        onboardingRows.length === 1
          ? `Guided onboarding is the clearest next action for ${onboardingRows[0].companyName}${onboardingMrr > 0 ? ` and could protect about ${formatCurrencyWhole(onboardingMrr)}` : ""}.`
          : `Guided onboarding is the fastest recovery lever across ${onboardingRows.length} accounts${onboardingMrr > 0 ? `, representing about ${formatCurrencyWhole(onboardingMrr)} at risk` : ""}.`,
      kind: "onboarding",
      accountIds: onboardingRows.slice(0, 3).map((r) => r.id),
    });
  }

  const usageRows = groups.usage.slice().sort((a, b) => Number(b.mrr || 0) - Number(a.mrr || 0));
  if (insights.length < 3 && usageRows.length > 0) {
    const usageMrr = usageRows.reduce((sum, row) => sum + Number(row.mrr || 0), 0);

    addInsight({
      title: "Usage drop detected",
      text:
        usageRows.length === 1
          ? `${usageRows[0].companyName} is showing a usage decline${usageMrr > 0 ? ` with about ${formatCurrencyWhole(usageMrr)} at risk` : ""}.`
          : `${usageRows.length} accounts show a meaningful usage decline${usageMrr > 0 ? `, representing about ${formatCurrencyWhole(usageMrr)} at risk` : ""}.`,
      kind: "usage",
      accountIds: usageRows.slice(0, 3).map((r) => r.id),
    });
  }

  const supportRows = groups.support.slice().sort((a, b) => Number(b.mrr || 0) - Number(a.mrr || 0));
  if (insights.length < 3 && supportRows.length > 0) {
    const supportMrr = supportRows.reduce((sum, row) => sum + Number(row.mrr || 0), 0);

    addInsight({
      title: "Support friction rising",
      text:
        supportRows.length === 1
          ? `${supportRows[0].companyName} is showing support-related churn risk${supportMrr > 0 ? ` worth about ${formatCurrencyWhole(supportMrr)}` : ""}.`
          : `${supportRows.length} accounts show support friction${supportMrr > 0 ? `, with about ${formatCurrencyWhole(supportMrr)} exposed` : ""}.`,
      kind: "support",
      accountIds: supportRows.slice(0, 3).map((r) => r.id),
    });
  }

  const uncoveredHighRisk = sortedRisks.filter((r) => !usedIds.has(r.id) && r.riskScore >= 75);
  if (insights.length < 3 && uncoveredHighRisk.length > 0) {
    const totalUncoveredMrr = uncoveredHighRisk.reduce((sum, row) => sum + Number(row.mrr || 0), 0);

    addInsight({
      title: "Additional high-risk cluster",
      text:
        uncoveredHighRisk.length === 1
          ? `${uncoveredHighRisk[0].companyName} remains a high-risk account${totalUncoveredMrr > 0 ? ` with about ${formatCurrencyWhole(totalUncoveredMrr)} exposed` : ""}.`
          : `${uncoveredHighRisk.length} more high-risk accounts still need follow-up${totalUncoveredMrr > 0 ? `, representing about ${formatCurrencyWhole(totalUncoveredMrr)} at risk` : ""}.`,
      kind: reasonKeyToKind(uncoveredHighRisk[0].reasonKey),
      accountIds: uncoveredHighRisk.slice(0, 3).map((r) => r.id),
    });
  }

  return insights.slice(0, 3);
}

function buildProgressAndEmailInsights(events: EventForInsight[]): DashboardInsight[] {
  const insights: DashboardInsight[] = [];

  const protectedEvents = events.filter((e) => isProtectedRevenueEvent(e.type));
  if (protectedEvents.length > 0) {
    const protectedValue = protectedEvents.reduce((sum, e) => sum + Number(e.value || 0), 0);
    const uniqueCustomers = new Set(
      protectedEvents.map((e) => e.customer?.id).filter((id): id is string => Boolean(id))
    );
    const accountIds = Array.from(uniqueCustomers).slice(0, 3);

    insights.push({
      title: "Recent retention progress",
      text:
        uniqueCustomers.size > 0
          ? `${uniqueCustomers.size} ${pluralize(uniqueCustomers.size, "account")} recovered recently${protectedValue > 0 ? `, protecting about ${formatCurrencyWhole(protectedValue)}` : ""}.`
          : `${protectedEvents.length} positive retention event${protectedEvents.length === 1 ? "" : "s"} landed recently${protectedValue > 0 ? `, protecting about ${formatCurrencyWhole(protectedValue)}` : ""}.`,
      kind: "usage",
      accountIds,
    });
  }

  const sentEvents = events.filter((e) => isEmailSentEvent(e.type));
  const openedEvents = events.filter((e) => isEmailOpenedEvent(e.type));
  const clickedEvents = events.filter((e) => isEmailClickedEvent(e.type));

  if (sentEvents.length > 0 && (openedEvents.length > 0 || clickedEvents.length > 0)) {
    const sentCustomerIds = new Set(
      sentEvents.map((e) => e.customer?.id).filter((id): id is string => Boolean(id))
    );
    const openedCustomerIds = new Set(
      openedEvents.map((e) => e.customer?.id).filter((id): id is string => Boolean(id))
    );
    const clickedCustomerIds = new Set(
      clickedEvents.map((e) => e.customer?.id).filter((id): id is string => Boolean(id))
    );

    const openRate =
      sentCustomerIds.size > 0 ? Math.round((openedCustomerIds.size / sentCustomerIds.size) * 100) : 0;
    const clickRate =
      sentCustomerIds.size > 0 ? Math.round((clickedCustomerIds.size / sentCustomerIds.size) * 100) : 0;

    const surfacedIds = Array.from(
      clickedCustomerIds.size > 0 ? clickedCustomerIds : openedCustomerIds
    ).slice(0, 3);

    insights.push({
      title: "Email engagement update",
      text:
        clickedCustomerIds.size > 0
          ? `Retention emails are landing: about ${openRate}% opened and ${clickRate}% clicked recently.`
          : `Retention emails are getting traction: about ${openRate}% of recent recipients opened them.`,
      kind: "adoption",
      accountIds: surfacedIds,
    });
  } else if (sentEvents.length > 0 && openedEvents.length === 0 && clickedEvents.length === 0) {
    const sentCustomerIds = Array.from(
      new Set(sentEvents.map((e) => e.customer?.id).filter((id): id is string => Boolean(id)))
    ).slice(0, 3);

    insights.push({
      title: "Email follow-up pending",
      text: "Retention emails were sent recently, but there is no open or click activity recorded yet.",
      kind: "support",
      accountIds: sentCustomerIds,
    });
  }

  return insights.slice(0, 2);
}

function mergeInsights(priority: DashboardInsight[], fallback: DashboardInsight[], max = 3) {
  const merged: DashboardInsight[] = [];
  const seen = new Set<string>();

  for (const item of [...priority, ...fallback]) {
    const key = `${item.title}-${item.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= max) break;
  }

  return merged;
}

function buildMonthSeries(now = new Date(), count = 6) {
  const months: string[] = [];

  for (let i = count - 1; i >= 0; i--) {
    months.push(monthKey(addMonths(startOfUtcMonth(now), -i)));
  }

  return months;
}

export async function GET(req: Request) {
  try {
    const workspaceId = await getWorkspaceIdFromRequest(req);

    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        tier: true,
        demoMode: true,
        trialEndsAt: true,
      },
    });

    const now = new Date();
    const currentMonthDate = startOfUtcMonth(now);
    const previousMonthDateValue = previousMonth(now);

    const thisMonth = monthKey(currentMonthDate);
    const prevMonth = monthKey(previousMonthDateValue);

    const currentMonthStart = startOfUtcMonth(now);
    const currentMonthEnd = endOfUtcMonth(now);
    const previousMonthStart = startOfUtcMonth(previousMonthDateValue);
    const previousMonthEnd = endOfUtcMonth(previousMonthDateValue);

    const last30DaysStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [mrrSnapshotCount, accountRiskCount, connectedIntegrations] = await Promise.all([
      prisma.mrrSnapshot.count({ where: { workspaceId } }),
      prisma.accountRisk.count({ where: { workspaceId } }),
      prisma.integration.findMany({
        where: { workspaceId, status: "connected" },
        select: { provider: true },
      }),
    ]);

    const hasEnoughLiveData =
      connectedIntegrations.length > 0 &&
      (mrrSnapshotCount > 0 || accountRiskCount > 0);

    const effectiveDemoMode = ws?.demoMode === true;
    const isDemo = effectiveDemoMode;

    if (!isDemo && hasEnoughLiveData) {
      await writeDailyAccountRiskSnapshotsForWorkspace(workspaceId);
    }

    const months = buildMonthSeries(now, 6);

    const [
      currentMrrAgg,
      previousMrrAgg,
      risks,
      currentMonthSnapshots,
      previousMonthSnapshots,
      chartRows,
      subscriptionsCurrentMonth,
      subscriptionsLast30Days,
      invoicesLast30Days,
      eventsLast30Days,
      eventsCurrentMonth,
      eventsPreviousMonth,
      customersRecent,
    ] = await Promise.all([
      prisma.mrrSnapshot.aggregate({
        where: {
          workspaceId,
          month: thisMonth,
          active: true,
        },
        _sum: { mrrMinor: true },
      }),
      prisma.mrrSnapshot.aggregate({
        where: {
          workspaceId,
          month: prevMonth,
          active: true,
        },
        _sum: { mrrMinor: true },
      }),
      prisma.accountRisk.findMany({
        where: { workspaceId },
        select: {
          id: true,
          companyName: true,
          reasonKey: true,
          reasonLabel: true,
          riskScore: true,
          mrr: true,
          updatedAt: true,
        },
        orderBy: [{ riskScore: "desc" }, { updatedAt: "desc" }],
        take: 10,
      }),
      prisma.accountRiskSnapshot.findMany({
        where: {
          workspaceId,
          snapshotDate: {
            gte: currentMonthStart,
            lte: currentMonthEnd,
          },
        },
        select: {
          companyName: true,
          riskScore: true,
          mrrMinor: true,
          snapshotDate: true,
        },
        orderBy: { snapshotDate: "desc" },
      }),
      prisma.accountRiskSnapshot.findMany({
        where: {
          workspaceId,
          snapshotDate: {
            gte: previousMonthStart,
            lte: previousMonthEnd,
          },
        },
        select: {
          companyName: true,
          riskScore: true,
          mrrMinor: true,
          snapshotDate: true,
        },
        orderBy: { snapshotDate: "desc" },
      }),
      prisma.mrrSnapshot.findMany({
        where: {
          workspaceId,
          month: { in: months },
        },
        select: {
          month: true,
          mrrMinor: true,
          active: true,
          stripeCustomerId: true,
        },
      }),
      prisma.stripeSubscription.findMany({
        where: {
          workspaceId,
          createdAt: {
            gte: currentMonthStart,
            lte: currentMonthEnd,
          },
        },
        select: {
          id: true,
          stripeCustomerId: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.stripeSubscription.findMany({
        where: {
          workspaceId,
          createdAt: { gte: last30DaysStart },
        },
        select: {
          id: true,
          stripeCustomerId: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.invoice.findMany({
        where: {
          workspaceId,
          paidAt: null,
          dueAt: { gte: last30DaysStart },
        },
        select: {
          id: true,
          customerId: true,
          status: true,
          amount: true,
          dueAt: true,
        },
        orderBy: { dueAt: "desc" },
        take: 100,
      }),
      prisma.event.findMany({
        where: {
          workspaceId,
          occurredAt: { gte: last30DaysStart },
        },
        select: {
          id: true,
          type: true,
          occurredAt: true,
          value: true,
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { occurredAt: "desc" },
        take: 100,
      }),
      prisma.event.findMany({
        where: {
          workspaceId,
          occurredAt: {
            gte: currentMonthStart,
            lte: currentMonthEnd,
          },
        },
        select: {
          id: true,
          type: true,
          occurredAt: true,
          value: true,
        },
      }),
      prisma.event.findMany({
        where: {
          workspaceId,
          occurredAt: {
            gte: previousMonthStart,
            lte: previousMonthEnd,
          },
        },
        select: {
          id: true,
          type: true,
          occurredAt: true,
          value: true,
        },
      }),
      prisma.customer.findMany({
        where: { workspaceId },
        select: {
          id: true,
          name: true,
          email: true,
          stripeCustomerId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
        take: 1000,
      }),
    ]);

    const totalMrr = Math.round(Number(currentMrrAgg._sum.mrrMinor || 0) / 100);
    const previousTotalMrr = Math.round(Number(previousMrrAgg._sum.mrrMinor || 0) / 100);

    const atRiskAccounts = risks.length;
    const mrrAtRisk = risks.reduce<number>((sum, r) => sum + Number(r.mrr || 0), 0);

    const customerByStripeId = new Map(
      customersRecent
        .filter((c) => c.stripeCustomerId)
        .map((c) => [
          c.stripeCustomerId as string,
          { id: c.id, name: c.name, email: c.email ?? null },
        ])
    );

    const liveRiskAccounts = risks.map((r) => {
      const customer =
        customersRecent.find((c) => c.name?.toLowerCase() === r.companyName.toLowerCase()) ?? null;

      return {
        id: r.id,
        company: r.companyName,
        reason: r.reasonLabel,
        risk: r.riskScore,
        mrr: typeof r.mrr === "number" ? r.mrr : null,
        tags: [reasonKeyToKind(r.reasonKey)],
        updatedAt: r.updatedAt.toISOString(),
        email: customer?.email ?? null,
      };
    });

    const riskInsights = buildRiskInsights(risks);
    const progressAndEmailInsights = buildProgressAndEmailInsights(eventsLast30Days as EventForInsight[]);
    const liveInsights = mergeInsights(progressAndEmailInsights, riskInsights, 3);

    const currentMonthLatestPerCompany = dedupeLatestSnapshotPerCompany(currentMonthSnapshots);
    const previousMonthLatestPerCompany = dedupeLatestSnapshotPerCompany(previousMonthSnapshots);

    const currentFlaggedAccounts = currentMonthLatestPerCompany.filter((r) => r.riskScore >= 40);
    const previousFlaggedAccounts = previousMonthLatestPerCompany.filter((r) => r.riskScore >= 40);

    const currentMrrAtRiskFromSnapshots = Math.round(
      currentFlaggedAccounts.reduce((sum, row) => sum + Number(row.mrrMinor || 0), 0) / 100
    );

    const previousMrrAtRiskFromSnapshots = Math.round(
      previousFlaggedAccounts.reduce((sum, row) => sum + Number(row.mrrMinor || 0), 0) / 100
    );

    const mrrByMonth = new Map<string, number>();
    for (const month of months) {
      mrrByMonth.set(month, 0);
    }

    for (const row of chartRows) {
      if (!row.active) continue;
      mrrByMonth.set(row.month, (mrrByMonth.get(row.month) || 0) + Number(row.mrrMinor || 0));
    }

    const liveMrrProtectedChart = {
      months: months.map(monthLabel),
      values: months.map((m) => Math.round((mrrByMonth.get(m) || 0) / 100)),
    };

    const activeCustomersByMonth = new Map<string, Set<string>>();
    for (const month of months) {
      activeCustomersByMonth.set(month, new Set());
    }

    for (const row of chartRows) {
      if (!row.active || !row.stripeCustomerId) continue;
      activeCustomersByMonth.get(row.month)?.add(row.stripeCustomerId);
    }

    const liveChurnValues: number[] = months.map((month, index) => {
      if (index === 0) return 0;

      const prevMonthKey = months[index - 1];
      const prevSet = activeCustomersByMonth.get(prevMonthKey) || new Set<string>();
      const currentSet = activeCustomersByMonth.get(month) || new Set<string>();

      if (prevSet.size === 0) return 0;

      let churned = 0;
      for (const customerId of prevSet) {
        if (!currentSet.has(customerId)) churned += 1;
      }

      return Number(((churned / prevSet.size) * 100).toFixed(1));
    });

    const latestChurnPct = liveChurnValues.length
      ? liveChurnValues[liveChurnValues.length - 1]
      : null;

    const previousChurnPct =
      liveChurnValues.length > 1
        ? liveChurnValues[liveChurnValues.length - 2]
        : latestChurnPct ?? 0;

    const stripeCustomerIds = Array.from(
      new Set(subscriptionsLast30Days.map((s) => s.stripeCustomerId).filter(Boolean))
    ) as string[];

    const invoiceCustomerIds = Array.from(
      new Set(invoicesLast30Days.map((i) => i.customerId).filter(Boolean))
    ) as string[];

    const [customerRowsByStripe, invoiceCustomers] = await Promise.all([
      prisma.customer.findMany({
        where: {
          workspaceId,
          stripeCustomerId: { in: stripeCustomerIds },
        },
        select: {
          id: true,
          stripeCustomerId: true,
          name: true,
          email: true,
        },
      }),
      prisma.customer.findMany({
        where: {
          workspaceId,
          id: { in: invoiceCustomerIds },
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
      }),
    ]);

    const stripeCustomerMap = new Map<string, { id: string; name: string; email: string | null }>();
    for (const c of customerRowsByStripe) {
      if (c.stripeCustomerId) {
        stripeCustomerMap.set(c.stripeCustomerId, {
          id: c.id,
          name: c.name,
          email: c.email ?? null,
        });
      }
    }

    const customerIdMap = new Map<string, { id: string; name: string; email: string | null }>();
    for (const c of invoiceCustomers) {
      customerIdMap.set(c.id, {
        id: c.id,
        name: c.name,
        email: c.email ?? null,
      });
    }

    const currentMonthProtectedMrr = Math.round(
      eventsCurrentMonth
        .filter((e) => isProtectedRevenueEvent(e.type))
        .reduce((sum, e) => sum + Number(e.value || 0), 0)
    );

    const previousMonthProtectedMrr = Math.round(
      eventsPreviousMonth
        .filter((e) => isProtectedRevenueEvent(e.type))
        .reduce((sum, e) => sum + Number(e.value || 0), 0)
    );

    const liveNewTrials = subscriptionsLast30Days.filter((s) => s.status === "trialing").length;
    const liveNewSubscriptions = subscriptionsLast30Days.filter((s) => s.status !== "trialing").length;
    const liveReactivations = eventsLast30Days.filter((e) => isReactivationEvent(e.type)).length;
    const liveFailedSubscriptions = invoicesLast30Days.length;

    const currentMonthNewSubscribers = subscriptionsCurrentMonth.filter((s) => s.status !== "trialing").length;
    const currentMonthUpgrades = eventsCurrentMonth.filter((e) => isUpgradeEvent(e.type)).length;

    const newTrials = isDemo && liveNewTrials === 0 ? 12 : liveNewTrials;
    const newSubscriptions = isDemo && liveNewSubscriptions === 0 ? 18 : liveNewSubscriptions;
    const reactivations = isDemo && liveReactivations === 0 ? 5 : liveReactivations;
    const failedSubscriptions = isDemo && liveFailedSubscriptions === 0 ? 3 : liveFailedSubscriptions;

    const eventHistory: HistoryRow[] = (eventsLast30Days as EventForInsight[])
      .map((e): HistoryRow | null => {
        if (!e.customer?.id) return null;

        return {
          id: `event_${e.id}`,
          customerId: e.customer.id,
          type: e.type,
          label: humanizeType(e.type),
          company: e.customer.name ?? null,
          occurredAt: e.occurredAt.toISOString(),
          valueMinor: typeof e.value === "number" ? Math.round(e.value * 100) : null,
          email: e.customer.email ?? null,
        };
      })
      .filter((item): item is HistoryRow => item !== null);

    const subscriptionHistory: HistoryRow[] = subscriptionsLast30Days
      .map((s): HistoryRow | null => {
        const customer = s.stripeCustomerId ? stripeCustomerMap.get(s.stripeCustomerId) : null;
        if (!customer) return null;

        return {
          id: `sub_${s.id}`,
          customerId: customer.id,
          type: s.status === "trialing" ? "trial_started" : "subscription_created",
          label: s.status === "trialing" ? "New trial" : "New subscription",
          company: customer.name,
          occurredAt: s.createdAt.toISOString(),
          valueMinor: null,
          email: customer.email ?? null,
        };
      })
      .filter((item): item is HistoryRow => item !== null);

    const invoiceHistory: HistoryRow[] = invoicesLast30Days
      .map((i): HistoryRow | null => {
        const customer = i.customerId ? customerIdMap.get(i.customerId) : null;
        if (!customer) return null;

        return {
          id: `invoice_${i.id}`,
          customerId: customer.id,
          type: "invoice_payment_failed",
          label: "Failed subscription",
          company: customer.name,
          occurredAt: i.dueAt.toISOString(),
          valueMinor: i.amount ?? null,
          email: customer.email ?? null,
        };
      })
      .filter((item): item is HistoryRow => item !== null);

    const liveHistory: HistoryRow[] = [...eventHistory, ...subscriptionHistory, ...invoiceHistory]
      .sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt))
      .slice(0, 8);

    const demoHistory: HistoryRow[] = [
      {
        id: "demo_1",
        customerId: "demo_brightdesk",
        type: "subscription_created",
        label: "New subscription",
        company: "BrightDesk",
        occurredAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        valueMinor: 12900,
        email: "hello@brightdesk.io",
      },
      {
        id: "demo_2",
        customerId: "demo_northstar",
        type: "trial_started",
        label: "New trial",
        company: "Northstar AI",
        occurredAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        valueMinor: null,
        email: "team@northstarai.com",
      },
      {
        id: "demo_3",
        customerId: "demo_orbitflow",
        type: "reactivated",
        label: "Reactivation",
        company: "OrbitFlow",
        occurredAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
        valueMinor: 8900,
        email: "ops@orbitflow.io",
      },
      {
        id: "demo_4",
        customerId: "demo_canvashub",
        type: "invoice_payment_failed",
        label: "Failed subscription",
        company: "Canvas Hub",
        occurredAt: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
        valueMinor: 4900,
        email: "billing@canvashub.co",
      },
      {
        id: "demo_5",
        customerId: "demo_signalforge",
        type: "subscription_created",
        label: "New subscription",
        company: "Signal Forge",
        occurredAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        valueMinor: 15900,
        email: "hello@signalforge.io",
      },
    ];

    const customerStatuses = customersRecent.map((c) => (c.status || "").toLowerCase());

    const customerMixLive = {
      active: customerStatuses.filter((s) => s === "active").length,
      trial: customerStatuses.filter((s) => s === "trialing" || s === "trial").length,
      upgraded: currentMonthUpgrades,
      newSubscribers: currentMonthNewSubscribers,
    };

    const customerMixDemo = {
      active: 128,
      trial: 22,
      upgraded: 14,
      newSubscribers: 16,
    };

    const liveOpportunities = subscriptionsLast30Days.slice(0, 3).map((s, index) => {
      const customer = s.stripeCustomerId ? customerByStripeId.get(s.stripeCustomerId) : null;

      return {
        id: customer?.id ?? `opp_${index}`,
        company: customer?.name ?? "Growth account",
        email: customer?.email ?? null,
        signal: s.status === "trialing" ? "New trial started" : "New subscription started",
        upside: 99,
        updatedAt: s.createdAt.toISOString(),
      };
    });

    const demoOpportunities = [
      {
        id: "11",
        company: "BrightOps",
        email: "ops@brightops.com",
        signal: "Annual plan upgrade",
        upside: 133,
        updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
      },
      {
        id: "12",
        company: "KiteCRM",
        email: "finance@kitecrm.com",
        signal: "New subscription started",
        upside: 98,
        updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
      },
      {
        id: "13",
        company: "CedarWorks",
        email: "hello@cedarworks.io",
        signal: "Recovered failed payment",
        upside: 64,
        updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6).toISOString(),
      },
    ];

    const response: DashboardSummary = {
      ok: true,
      tier: (ws?.tier as "free" | "starter" | "pro" | "scale") || "free",
      demoMode: effectiveDemoMode,
      trialEndsAt: ws?.trialEndsAt?.toISOString() ?? null,
      connectedIntegrations: connectedIntegrations.map((i) => i.provider),
      kpis: {
        totalMrr,
        mrrAtRisk,
        atRiskAccounts,
        retentionPct: latestChurnPct === null ? null : Number((100 - latestChurnPct).toFixed(1)),
        churnPct: latestChurnPct,
      },

      totalMrrTrend: isDemo
        ? {
          current: 69700,
          previous: 64200,
        }
        : {
          current: totalMrr,
          previous: previousTotalMrr,
        },

      mrrProtected: isDemo
        ? {
          current: 1420,
          previous: 1200,
        }
        : {
          current: currentMonthProtectedMrr,
          previous: previousMonthProtectedMrr,
        },

      mrrAtRiskTrend: isDemo
        ? {
          current: 12300,
          previous: 14100,
        }
        : {
          current:
            currentMrrAtRiskFromSnapshots > 0 ? currentMrrAtRiskFromSnapshots : mrrAtRisk,
          previous:
            previousMrrAtRiskFromSnapshots > 0
              ? previousMrrAtRiskFromSnapshots
              : currentMrrAtRiskFromSnapshots > 0
                ? currentMrrAtRiskFromSnapshots
                : mrrAtRisk,
        },

      churnProxyTrend: isDemo
        ? {
          current: 3.4,
          previous: 3.9,
        }
        : {
          current: latestChurnPct ?? 0,
          previous: previousChurnPct ?? 0,
        },

      accountsFlaggedTrend: {
        current: currentFlaggedAccounts.length > 0 ? currentFlaggedAccounts.length : atRiskAccounts,
        previous:
          previousFlaggedAccounts.length > 0
            ? previousFlaggedAccounts.length
            : currentFlaggedAccounts.length > 0
              ? currentFlaggedAccounts.length
              : atRiskAccounts,
      },

      mrrProtectedChart: isDemo
        ? {
          months: ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"],
          values: [420, 510, 480, 620, 590, 710],
        }
        : liveMrrProtectedChart,

      churnTrend: isDemo
        ? {
          months: ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"],
          values: [5.8, 5.1, 4.7, 4.3, 3.9, 3.4],
          unavailable: false,
        }
        : {
          months: months.map(monthLabel),
          values: liveChurnValues,
          unavailable: false,
        },

      insights: isDemo
        ? [
          {
            title: "Highest risk driver",
            text: "Low feature adoption is driving churn risk.",
            kind: "adoption",
            accountIds: ["demo_1", "demo_2"],
          },
          {
            title: "Billing alert",
            text: "Failed payments are creating immediate retention risk.",
            kind: "billing",
            accountIds: ["demo_3"],
          },
          {
            title: "Quick win",
            text: "Guided onboarding is the fastest retention lever today.",
            kind: "onboarding",
            accountIds: ["demo_4"],
          },
        ]
        : liveInsights,

      riskAccounts: isDemo
        ? [
          {
            id: "demo_1",
            company: "CedarWorks",
            reason: "Usage dropped sharply in the last 14 days",
            risk: 88,
            mrr: 219,
            tags: ["usage"],
            updatedAt: new Date().toISOString(),
            email: "team@cedarworks.io",
          },
          {
            id: "demo_2",
            company: "Kite Labs",
            reason: "Renewal window approaching + downgrade signals",
            risk: 82,
            mrr: 129,
            tags: ["adoption"],
            updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
            email: "hello@kitelabs.io",
          },
          {
            id: "demo_3",
            company: "Northstar AI",
            reason: "Failed payment + low engagement",
            risk: 61,
            mrr: 349,
            tags: ["billing"],
            updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
            email: "billing@northstarai.com",
          },
        ]
        : liveRiskAccounts,

      opportunities: isDemo ? demoOpportunities : liveOpportunities,

      customerMix: isDemo ? customerMixDemo : customerMixLive,

      activitySummary: {
        windowLabel: "Last 30 days",
        newSubscriptions,
        newTrials,
        reactivations,
        failedSubscriptions,
      },

      history: isDemo ? demoHistory : liveHistory,
    };

    return NextResponse.json(response);
  } catch (e: any) {
    console.error("GET /api/dashboard/summary failed:", e);

    return NextResponse.json(
      { ok: false, error: "Failed to load dashboard summary"} satisfies DashboardSummary,
      { status: 500 }
    );
  }
}