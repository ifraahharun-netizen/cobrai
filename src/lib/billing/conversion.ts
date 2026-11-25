import { prisma } from "@/lib/prisma";

/**
 * Trial-to-paid funnel events, stored in ConversionEvent and summarised on
 * /admin/conversion. Recording never throws: tracking must not break billing.
 */
export const CONVERSION_EVENTS = [
    // In the app (sent from the browser via /api/billing/track)
    "banner_viewed", // "trial ends soon" banner shown
    "banner_clicked", // banner opened the report
    "reminder_viewed", // report opened as a reminder, before the trial ends
    "report_viewed", // report shown as the lock screen, after the trial ended
    "plan_clicked", // a plan's button was clicked ({ tier, from })
    "connect_stripe_clicked",
    "talk_to_us_clicked",
    // On the server
    "trial_email_sent",
    "checkout_started", // Stripe checkout session created ({ tier })
    "checkout_completed", // Stripe confirmed the payment ({ tier })
] as const;

export type ConversionEventName = (typeof CONVERSION_EVENTS)[number];

/** Events the browser is allowed to send. */
export const CLIENT_CONVERSION_EVENTS = new Set<ConversionEventName>([
    "banner_viewed",
    "banner_clicked",
    "reminder_viewed",
    "report_viewed",
    "plan_clicked",
    "connect_stripe_clicked",
    "talk_to_us_clicked",
]);

export async function trackConversion(
    workspaceId: string | null | undefined,
    name: ConversionEventName,
    data?: Record<string, string | number | boolean | null>
): Promise<void> {
    if (!workspaceId) return;
    try {
        await prisma.conversionEvent.create({
            data: { workspaceId, name, data: data ?? undefined },
        });
    } catch (error) {
        console.warn(`[conversion] could not record ${name}:`, error);
    }
}
