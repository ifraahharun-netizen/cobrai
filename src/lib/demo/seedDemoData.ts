// src/lib/demo/seedDemoData.ts
import { prisma } from "@/lib/prisma";

function daysAgo(n: number) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
}

function daysFromNow(n: number) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
}

function monthKey(d: Date) {
    return d.toISOString().slice(0, 7); // YYYY-MM
}

export async function seedDemoData(workspaceId: string) {
    const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { demoMode: true, demoSeededAt: true },
    });

    if (!ws) throw new Error("Workspace not found");
    if (!ws.demoMode) return { ok: true, skipped: true, reason: "not-demo" };
    if (ws.demoSeededAt) return { ok: true, skipped: true, reason: "already-seeded" };

    await prisma.$transaction(async (tx) => {
        // ----------------------------
        // 1) Demo Customers
        // ----------------------------
        const kite = await tx.customer.create({
            data: {
                workspaceId,
                name: "Kite Labs",
                email: "finance@kitelabs.io",
                mrr: 12900,
                churnRisk: 0.72,
                healthScore: 41,
                lastActiveAt: daysAgo(12),
                plan: "Pro",
                seats: 12,
                riskScore: 82,
                status: "active",
                isDemo: true,
                createdAt: daysAgo(120),
            },
        });

        const bloom = await tx.customer.create({
            data: {
                workspaceId,
                name: "BloomPay",
                email: "ops@bloompay.com",
                mrr: 34900,
                churnRisk: 0.55,
                healthScore: 58,
                lastActiveAt: daysAgo(4),
                plan: "Starter",
                seats: 5,
                riskScore: 61,
                status: "active",
                isDemo: true,
                createdAt: daysAgo(90),
            },
        });

        const studio = await tx.customer.create({
            data: {
                workspaceId,
                name: "StudioNorth",
                email: "team@studionorth.co",
                mrr: 8900,
                churnRisk: 0.19,
                healthScore: 78,
                lastActiveAt: daysAgo(2),
                plan: "Starter",
                seats: 3,
                riskScore: 28,
                status: "active",
                isDemo: true,
                createdAt: daysAgo(60),
            },
        });

        const cedar = await tx.customer.create({
            data: {
                workspaceId,
                name: "CedarWorks",
                email: "support@cedarworks.io",
                mrr: 21900,
                churnRisk: 0.81,
                healthScore: 33,
                lastActiveAt: daysAgo(21),
                plan: "Pro",
                seats: 8,
                riskScore: 88,
                status: "active",
                isDemo: true,
                createdAt: daysAgo(45),
            },
        });

        // ----------------------------
        // 2) StripeCustomer + MrrSnapshot (for charts)
        // ----------------------------
        const scKite = await tx.stripeCustomer.create({
            data: {
                workspaceId,
                stripeId: `demo_stripe_kite_${workspaceId}`,
                email: kite.email,
                name: kite.name,
            },
        });

        const scBloom = await tx.stripeCustomer.create({
            data: {
                workspaceId,
                stripeId: `demo_stripe_bloom_${workspaceId}`,
                email: bloom.email,
                name: bloom.name,
            },
        });

        const scCedar = await tx.stripeCustomer.create({
            data: {
                workspaceId,
                stripeId: `demo_stripe_cedar_${workspaceId}`,
                email: cedar.email,
                name: cedar.name,
            },
        });

        function hashToSeed(input: string) {
            let h = 2166136261;
            for (let i = 0; i < input.length; i++) {
                h ^= input.charCodeAt(i);
                h = Math.imul(h, 16777619);
            }
            return (h >>> 0) || 1;
        }

        function mulberry32(seed: number) {
            return function () {
                let t = (seed += 0x6d2b79f5);
                t = Math.imul(t ^ (t >>> 15), t | 1);
                t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        }

        function clamp(n: number, a: number, b: number) {
            return Math.max(a, Math.min(b, n));
        }

        const months: string[] = [];
        const now = new Date();
        const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        for (let i = 11; i >= 0; i--) {
            const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - i, 1));
            months.push(monthKey(d));
        }

        const rnd = mulberry32(hashToSeed(`demo_mrr_${workspaceId}`));

        // base MRRs (minor units) derived from your customer.mrr (which you store in minor)
        let kiteMrr = kite.mrr;   // minor
        let bloomMrr = bloom.mrr; // minor
        let cedarMrr = cedar.mrr; // minor

        // choose a churn dip month (index 5..9) where Cedar goes inactive (churn spike)
        const dipIdx = 5 + Math.floor(rnd() * 5);

        const snapRows: {
            workspaceId: string;
            stripeCustomerId: string;
            month: string;
            mrrMinor: number;
            active: boolean;
            firstSeenMonth?: string | null;
        }[] = [];

        for (let idx = 0; idx < months.length; idx++) {
            const month = months[idx];

            // gentle growth + noise (makes the line believable)
            const growth = 1 + (0.006 + rnd() * 0.01); // ~0.6%–1.6% monthly
            const noise = 1 + (rnd() - 0.5) * 0.01;   // +/-0.5%

            kiteMrr = Math.round(kiteMrr * growth * noise);
            bloomMrr = Math.round(bloomMrr * (growth * 0.9) * noise);
            cedarMrr = Math.round(cedarMrr * (growth * 1.05) * noise);

            kiteMrr = clamp(kiteMrr, 4000, 200000);
            bloomMrr = clamp(bloomMrr, 3000, 200000);
            cedarMrr = clamp(cedarMrr, 3000, 200000);

            const cedarActive = idx < dipIdx ? true : false;

            snapRows.push(
                {
                    workspaceId,
                    stripeCustomerId: scKite.stripeId,
                    month,
                    mrrMinor: kiteMrr,
                    active: true,
                    firstSeenMonth: months[0],
                },
                {
                    workspaceId,
                    stripeCustomerId: scBloom.stripeId,
                    month,
                    mrrMinor: bloomMrr,
                    active: true,
                    firstSeenMonth: months[0],
                },
                {
                    workspaceId,
                    stripeCustomerId: scCedar.stripeId,
                    month,
                    mrrMinor: cedarMrr,
                    active: cedarActive,
                    firstSeenMonth: months[0],
                }
            );
        }

        await tx.mrrSnapshot.createMany({
            data: snapRows,
            skipDuplicates: true,
        });

        // ----------------------------
        // 3) AccountRisk rows
        // ----------------------------
        await tx.accountRisk.createMany({
            data: [
                {
                    workspaceId,
                    companyName: cedar.name,
                    riskScore: 88,
                    reasonKey: "usage_drop",
                    reasonLabel: "Usage dropped sharply in the last 14 days",
                    mrr: cedar.mrr / 100, // pounds
                    createdAt: daysAgo(2),
                    isDemo: true,
                },
                {
                    workspaceId,
                    companyName: kite.name,
                    riskScore: 82,
                    reasonKey: "renewal_window",
                    reasonLabel: "Renewal window approaching + downgrade signals",
                    mrr: kite.mrr / 100,
                    createdAt: daysAgo(3),
                    isDemo: true,
                },
                {
                    workspaceId,
                    companyName: bloom.name,
                    riskScore: 61,
                    reasonKey: "low_adoption",
                    reasonLabel: "Low adoption of core feature (not enabled)",
                    mrr: bloom.mrr / 100,
                    createdAt: daysAgo(5),
                    isDemo: true,
                },
            ],
            // you can add skipDuplicates if you later add a unique constraint; not needed now
        });

        // ----------------------------
        // 4) Invoices
        // ----------------------------
        await tx.invoice.createMany({
            data: [
                {
                    workspaceId,
                    customerId: kite.id,
                    status: "paid",
                    amount: kite.mrr,
                    dueAt: daysAgo(35),
                    paidAt: daysAgo(35),
                    isDemo: true,
                },
                {
                    workspaceId,
                    customerId: bloom.id,
                    status: "paid",
                    amount: bloom.mrr,
                    dueAt: daysAgo(20),
                    paidAt: daysAgo(20),
                    isDemo: true,
                },
                {
                    workspaceId,
                    customerId: cedar.id,
                    status: "open",
                    amount: cedar.mrr,
                    dueAt: daysFromNow(6),
                    paidAt: null,
                    isDemo: true,
                },
            ],
        });

        // ----------------------------
        // 5) Actions (simple To-Do list)
        // ----------------------------
        await tx.action.createMany({
            data: [
                {
                    workspaceId,
                    customerId: cedar.id,
                    title: "Send personal check-in email",
                    priority: "High",
                    done: false,
                    dueAt: daysFromNow(2),
                    isDemo: true,
                },
                {
                    workspaceId,
                    customerId: kite.id,
                    title: "Offer annual switch incentive",
                    priority: "Medium",
                    done: false,
                    dueAt: daysFromNow(3),
                    isDemo: true,
                },
            ],
        });

        // ----------------------------
        // 6) Retention plan + run + events
        // ----------------------------
        const plan = await tx.retentionPlan.create({
            data: {
                workspaceId,
                name: "Demo Retention Plan",
                goal: "Reduce churn risk and protect MRR this week",
                steps: [
                    "Identify top at-risk accounts by risk score and MRR.",
                    "Generate outreach actions with clear reasons.",
                    "Track actions applied and estimate MRR protected.",
                ],
                reasoning:
                    "Signals show usage decline + renewal pressure. Prioritise outreach and recovery workflows to protect near-term revenue.",
                suggested: [
                    { name: cedar.name, why: "Usage dropped 38% in 14 days" },
                    { name: kite.name, why: "Renewal window + downgrade signals" },
                    { name: bloom.name, why: "Core feature not enabled" },
                ],
                status: "ready",
                isDemo: true,
                createdAt: daysAgo(7),
            },
        });

        const run = await tx.planRun.create({
            data: {
                planId: plan.id,
                status: "completed",
                startedAt: daysAgo(7),
                endedAt: daysAgo(7),
                mrrProtectedMinor: 26800,
                accountsRecovered: 1,
                riskReducedPct: 18,
                actionsCompleted: 2,
                actionsTotal: 3,
                primaryDriver: "email",
                protectedAccounts: [
                    { customerId: kite.id, name: kite.name, mrr: kite.mrr },
                    { customerId: studio.id, name: studio.name, mrr: studio.mrr },
                ],
                isDemo: true,
                createdAt: daysAgo(7),
            },
        });

        await tx.planEvent.createMany({
            data: [
                {
                    runId: run.id,
                    type: "info",
                    message: "Ranked accounts by risk + MRR and generated outreach actions.",
                    data: { top: [cedar.name, kite.name, bloom.name] },
                    isDemo: true,
                    createdAt: daysAgo(7),
                },
                {
                    runId: run.id,
                    type: "success",
                    message: "Protected £268.00 MRR from churn risk signals.",
                    data: { mrrProtectedMinor: 26800 },
                    isDemo: true,
                    createdAt: daysAgo(7),
                },
            ],
        });

        // ----------------------------
        // 7) Retention actions + executions
        // ----------------------------
        const ra1 = await tx.retentionAction.create({
            data: {
                planId: plan.id,
                customerId: cedar.id,
                customerName: cedar.name,
                title: "Send personal check-in email",
                reason: "Usage dropped sharply; likely adoption blocker",
                priority: "High",
                type: "email",
                payload: { template: "check_in", tone: "warm" },
                status: "applied",
                appliedAt: daysAgo(6),
                isDemo: true,
            },
        });

        const ra2 = await tx.retentionAction.create({
            data: {
                planId: plan.id,
                customerId: kite.id,
                customerName: kite.name,
                title: "Offer annual switch incentive",
                reason: "Renewal window approaching; keep contract value",
                priority: "Medium",
                type: "inapp_nudge",
                payload: { offer: "10% annual discount", expiryDays: 7 },
                status: "pending",
                isDemo: true,
            },
        });

        await tx.actionExecution.createMany({
            data: [
                {
                    actionId: ra1.id,
                    status: "success",
                    provider: "demo",
                    request: { channel: "email" },
                    response: { delivered: true },
                    isDemo: true,
                    createdAt: daysAgo(6),
                },
                {
                    actionId: ra2.id,
                    status: "queued",
                    provider: "demo",
                    request: { channel: "inapp" },
                    response: null,
                    isDemo: true,
                    createdAt: daysAgo(1),
                },
            ] as any,
        });
        // ----------------------------
        // 8) InsightRun (optional, for analytics summary)
        // ----------------------------
        await tx.insightRun.create({
            data: {
                workspaceId,
                type: "dashboard_summary",
                result: {
                    headline: "£268 MRR protected",
                    drivers: ["usage_drop", "renewal_window", "low_adoption"],
                    notes: ["Connect Stripe to compute your real MRR at risk."],
                    mode: "demo",
                    timeframe: "last_30d",
                },
                createdAt: daysAgo(1),
            },
        });

        // ----------------------------
        // 9) Mark seeded
        // ----------------------------
        await tx.workspace.update({
            where: { id: workspaceId },
            data: { demoSeededAt: new Date() },
        });
    });

    return { ok: true, seeded: true };
}
