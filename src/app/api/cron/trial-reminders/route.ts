import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { Resend } from "resend";

import { prisma } from "@/lib/prisma";
import { loadAtStake } from "@/lib/trial";
import { hasActiveSubscription, isOwnerExempt, parseExemptEmails } from "@/lib/billing/access-rules";
import { buildTrialEndingEmail } from "@/lib/billing/trialEmail";
import { trackConversion } from "@/lib/billing/conversion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Send the reminder once, when the trial has this many days or fewer left. */
const REMIND_WITHIN_DAYS = 3;
const FROM = "Cobrai <support@cobrai.uk>";

function isAuthorised(req: Request) {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) return false;
    const header = req.headers.get("authorization") || "";
    const received = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const a = Buffer.from(received);
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
}

/*
 * Daily (Vercel Cron, see vercel.json): emails each workspace owner once,
 * about 3 days before their free trial ends, with what's at stake in their
 * business. Skips paying, exempt and already-emailed workspaces. Only sends
 * when EMAIL_DELIVERY_ENABLED=true, so previews and local runs don't email.
 */
export async function GET(req: Request) {
    if (!isAuthorised(req)) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const deliveryEnabled = process.env.EMAIL_DELIVERY_ENABLED === "true" && Boolean(process.env.RESEND_API_KEY);
    const now = new Date();
    const until = new Date(now.getTime() + REMIND_WITHIN_DAYS * 24 * 60 * 60 * 1000);
    const exempt = parseExemptEmails(process.env.BILLING_EXEMPT_EMAILS);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://cobrai.uk";

    const candidates = await prisma.workspace.findMany({
        where: {
            trialEndsAt: { gt: now, lte: until },
            trialEndingEmailSentAt: null,
        },
        select: {
            id: true,
            ownerEmail: true,
            currency: true,
            trialEndsAt: true,
            stripeSubscriptions: {
                orderBy: { updatedAt: "desc" },
                take: 5,
                select: { status: true, currentPeriodEnd: true, endedAt: true },
            },
        },
        take: 200,
    });

    const resend = deliveryEnabled ? new Resend(process.env.RESEND_API_KEY) : null;
    const results = { candidates: candidates.length, sent: 0, skipped: 0, failed: 0, deliveryEnabled };

    for (const ws of candidates) {
        const email = ws.ownerEmail?.trim();
        if (
            !email ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
            isOwnerExempt(email, exempt) ||
            hasActiveSubscription(ws.stripeSubscriptions, now)
        ) {
            results.skipped += 1;
            continue;
        }

        const stake = await loadAtStake(ws.id, now);
        const daysRemaining = Math.max(1, Math.ceil(((ws.trialEndsAt?.getTime() ?? now.getTime()) - now.getTime()) / 86_400_000));
        const message = buildTrialEndingEmail({
            daysRemaining,
            currency: (ws.currency || "GBP").toUpperCase(),
            appUrl,
            atRiskMinor: stake.atRiskMinor,
            atRiskAccounts: stake.atRiskAccounts,
            failedPaymentsMinor: stake.failedPaymentsMinor,
            failedPayments: stake.failedPayments,
            topAccounts: stake.topAccounts,
        });

        if (!resend) {
            results.skipped += 1;
            continue;
        }

        try {
            const { error } = await resend.emails.send({
                from: FROM,
                to: email,
                replyTo: process.env.COBRAI_SUPPORT_EMAIL || "cobrai@cobrai.uk",
                subject: message.subject,
                html: message.html,
                text: message.text,
            });
            if (error) throw new Error(error.message);

            await prisma.workspace.update({ where: { id: ws.id }, data: { trialEndingEmailSentAt: now } });
            await trackConversion(ws.id, "trial_email_sent", { daysRemaining, hasData: stake.atRiskMinor + stake.failedPaymentsMinor > 0 });
            results.sent += 1;
        } catch (error) {
            results.failed += 1;
            console.error(`[cron/trial-reminders] workspace ${ws.id} failed:`, error);
        }
    }

    return NextResponse.json({ ok: true, ...results });
}
