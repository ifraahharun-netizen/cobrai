import { prisma } from "@/lib/prisma";

function clamp(value: number, min = 0, max = 100) {
    return Math.max(min, Math.min(max, value));
}

export async function getAiEffectivenessScore(workspaceId: string) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const executions = await prisma.actionExecution.findMany({
        where: {
            workspaceId,
            createdAt: {
                gte: since,
            },
        },
        include: {
            outcomeSnapshots: {
                orderBy: {
                    createdAt: "desc",
                },
                take: 1,
            },
        },
    });

    const total = executions.length;

    if (!total) {
        return {
            score: 0,
            label: "Not enough activity yet",
            summary:
                "Cobrai needs more retention actions before it can score AI effectiveness.",
            drivers: [],
        };
    }

    const successful = executions.filter((item) =>
        ["success", "recovered", "retained", "replied"].includes(
            String(item.status || "").toLowerCase()
        )
    ).length;

    const engagement = executions.filter(
        (item) => item.openedAt || item.clickedAt || item.repliedAt
    ).length;

    const outcomes = executions
        .map((item) => item.outcomeSnapshots[0])
        .filter(Boolean);

    const riskReductions = outcomes
        .map((item) => {
            const before = item.riskScoreBefore ?? null;
            const after = item.riskScoreAfter ?? null;

            if (before === null || after === null || before <= after) return 0;

            return before - after;
        })
        .filter((value) => value > 0);

    const retainedRevenueMinor = outcomes.reduce(
        (sum, item) => sum + Number(item.retainedRevenueMinor || 0),
        0
    );

    const successRate = Math.round((successful / total) * 100);
    const engagementRate = Math.round((engagement / total) * 100);

    const avgRiskReduction = riskReductions.length
        ? Math.round(
            riskReductions.reduce((sum, value) => sum + value, 0) /
            riskReductions.length
        )
        : 0;

    const revenueScore = retainedRevenueMinor > 0 ? 20 : 0;

    const score = clamp(
        Math.round(
            successRate * 0.35 +
            engagementRate * 0.25 +
            avgRiskReduction * 0.2 +
            revenueScore
        )
    );

    const label =
        score >= 75
            ? "High AI effectiveness"
            : score >= 50
                ? "Moderate AI effectiveness"
                : "Early AI effectiveness signal";

    return {
        score,
        label,
        summary:
            score >= 75
                ? `AI actions are performing strongly. ${successRate}% of actions converted into successful outcomes, with ${engagementRate}% showing customer engagement.`
                : score >= 50
                    ? `AI actions are showing useful traction. ${engagementRate}% of actions created engagement, but more completed outcomes are needed.`
                    : `AI actions are still building signal. Cobrai has tracked ${total} action${total === 1 ? "" : "s"} in the last 30 days.`,

        drivers: [
            {
                label: "Success rate",
                value: `${successRate}%`,
            },
            {
                label: "Engagement rate",
                value: `${engagementRate}%`,
            },
            {
                label: "Avg risk reduction",
                value: `${avgRiskReduction} pts`,
            },
            {
                label: "Revenue protected",
                value: retainedRevenueMinor,
            },
        ],
    };
}