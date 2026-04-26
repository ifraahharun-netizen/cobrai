import { prisma } from "@/lib/prisma";

function startOfUtcDay(date = new Date()) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function poundsToPennies(maybePounds: number | null | undefined) {
    return Math.round(Number(maybePounds || 0) * 100);
}

export async function writeDailyAccountRiskSnapshotsForWorkspace(
    workspaceId: string,
    date = new Date()
) {
    const snapshotDate = startOfUtcDay(date);

    const risks = await prisma.accountRisk.findMany({
        where: { workspaceId },
        select: {
            id: true,
            companyName: true,
            riskScore: true,
            reasonKey: true,
            reasonLabel: true,
            mrr: true,
        },
    });

    if (!risks.length) return { inserted: 0 };

    // idempotent per workspace/day/company
    await prisma.accountRiskSnapshot.deleteMany({
        where: {
            workspaceId,
            snapshotDate,
        },
    });

    await prisma.accountRiskSnapshot.createMany({
        data: risks.map((r) => ({
            workspaceId,
            accountRiskId: r.id,
            companyName: r.companyName,
            riskScore: r.riskScore,
            reasonKey: r.reasonKey,
            reasonLabel: r.reasonLabel,
            mrrMinor: poundsToPennies(r.mrr),
            snapshotDate,
        })),
    });

    return { inserted: risks.length };
}