import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { isRetentionAuditAdmin } from "@/lib/retention-audit/admin-auth";
import { CONVERSION_EVENTS, type ConversionEventName } from "@/lib/billing/conversion";

export const dynamic = "force-dynamic";

const LABELS: Record<ConversionEventName, string> = {
    banner_viewed: "Saw the “trial ends soon” banner",
    banner_clicked: "Opened the report from the banner",
    trial_email_sent: "Got the reminder email",
    reminder_viewed: "Viewed the report before the trial ended",
    report_viewed: "Hit the lock screen (trial ended)",
    connect_stripe_clicked: "Clicked Connect Stripe on the report",
    talk_to_us_clicked: "Clicked “Talk to us”",
    plan_clicked: "Clicked a plan",
    checkout_started: "Started Stripe checkout",
    checkout_completed: "Paid",
};

const ORDER: ConversionEventName[] = [
    "trial_email_sent",
    "banner_viewed",
    "banner_clicked",
    "reminder_viewed",
    "report_viewed",
    "connect_stripe_clicked",
    "talk_to_us_clicked",
    "plan_clicked",
    "checkout_started",
    "checkout_completed",
];

export default async function ConversionPage({
    searchParams,
}: {
    searchParams: Promise<{ days?: string }>;
}) {
    if (!(await isRetentionAuditAdmin())) redirect("/admin/retention-audits/login");

    const { days: daysParam } = await searchParams;
    const days = [7, 30, 90].includes(Number(daysParam)) ? Number(daysParam) : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await prisma.conversionEvent.groupBy({
        by: ["name"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
    });
    const workspaceRows = await prisma.conversionEvent.findMany({
        where: { createdAt: { gte: since } },
        distinct: ["name", "workspaceId"],
        select: { name: true },
    });

    const events = new Map<string, number>(rows.map((r) => [r.name, r._count._all]));
    const workspaces = new Map<string, number>();
    for (const r of workspaceRows) workspaces.set(r.name, (workspaces.get(r.name) ?? 0) + 1);

    const reached = (name: ConversionEventName) => workspaces.get(name) ?? 0;
    const saw = Math.max(reached("reminder_viewed") + reached("report_viewed"), 0);
    const paid = reached("checkout_completed");
    const known = new Set<string>(CONVERSION_EVENTS);

    const cell: React.CSSProperties = { padding: "10px 12px", borderTop: "1px solid #f0eee6", fontSize: 14 };

    return (
        <main style={{ maxWidth: 820, margin: "0 auto", padding: "32px 20px", fontFamily: "ui-sans-serif, system-ui, sans-serif", color: "#1f1e1d" }}>
            <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 30, margin: "0 0 6px" }}>Trial conversion</h1>
            <p style={{ color: "#73726c", margin: "0 0 20px" }}>
                Last {days} days ·{" "}
                {[7, 30, 90].map((d) => (
                    <a key={d} href={`?days=${d}`} style={{ marginRight: 10, color: d === days ? "#1f1e1d" : "#73726c", fontWeight: d === days ? 600 : 400 }}>
                        {d} days
                    </a>
                ))}
            </p>

            <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", border: "1px solid #e8e6dc", borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
                {[
                    { label: "Saw the report", value: saw.toLocaleString("en-GB") },
                    { label: "Paid", value: paid.toLocaleString("en-GB") },
                    { label: "Report → paid", value: saw > 0 ? `${((paid / saw) * 100).toFixed(1)}%` : "—" },
                ].map((k, i) => (
                    <div key={k.label} style={{ padding: "16px 18px", borderLeft: i ? "1px solid #f0eee6" : 0 }}>
                        <div style={{ color: "#73726c", fontSize: 13 }}>{k.label}</div>
                        <div style={{ fontSize: 26, fontWeight: 500 }}>{k.value}</div>
                    </div>
                ))}
            </section>

            <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #e8e6dc", borderRadius: 12 }}>
                <thead>
                    <tr style={{ textAlign: "left", color: "#73726c", fontSize: 13 }}>
                        <th style={{ padding: "10px 12px", fontWeight: 500 }}>Step</th>
                        <th style={{ padding: "10px 12px", fontWeight: 500, textAlign: "right" }}>Workspaces</th>
                        <th style={{ padding: "10px 12px", fontWeight: 500, textAlign: "right" }}>Events</th>
                    </tr>
                </thead>
                <tbody>
                    {ORDER.filter((n) => known.has(n)).map((name) => (
                        <tr key={name}>
                            <td style={cell}>{LABELS[name]}</td>
                            <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{reached(name).toLocaleString("en-GB")}</td>
                            <td style={{ ...cell, textAlign: "right", color: "#73726c", fontVariantNumeric: "tabular-nums" }}>{(events.get(name) ?? 0).toLocaleString("en-GB")}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p style={{ color: "#a3a29d", fontSize: 12.5, marginTop: 12 }}>
                “Workspaces” counts each workspace once per step. “Paid” comes from Stripe&apos;s confirmation, so it&apos;s exact.
            </p>
        </main>
    );
}
