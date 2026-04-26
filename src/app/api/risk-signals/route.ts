import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Severity = "Low" | "Medium" | "High";

export async function GET() {
    try {
        const grouped = await prisma.accountRisk.groupBy({
            by: ["reasonKey", "reasonLabel"],
            _count: { id: true },            // ✅ count a real field
            _max: { riskScore: true },
            orderBy: { _count: { id: "desc" } }, // ✅ order by that field count
            take: 8,
        });

        const severityFromMax = (max: number | null): Severity => {
            const v = max ?? 0;
            if (v >= 80) return "High";
            if (v >= 60) return "Medium";
            return "Low";
        };

        const suggestedMap: Record<string, string> = {
            usage_drop: "Review engagement + send check-in",
            failed_payment: "Send card update reminder",
            onboarding_incomplete: "Nudge activation steps",
            unresolved_ticket: "Follow up personally",
        };

        return NextResponse.json(
            grouped.map((g) => ({
                key: g.reasonKey,
                signal: g.reasonLabel,
                affected: g._count.id, // ✅ instead of g._count._all
                severity: severityFromMax(g._max.riskScore),
                suggested: suggestedMap[g.reasonKey] ?? "Review accounts and take action",
            }))
        );
    } catch (err) {
        console.error("risk-signals error:", err);
        return NextResponse.json({ error: "Failed to load risk signals" }, { status: 500 });
    }
}