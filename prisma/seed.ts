import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    await prisma.accountRisk.createMany({
        data: [
            {
                workspaceId: "demo-workspace",
                companyName: "Acme SaaS",
                riskScore: 82,
                reasonKey: "low_usage",
                reasonLabel: "Low product usage",
                mrr: 420.0, // ✅ NUMBER (not string)
            },
            {
                workspaceId: "demo-workspace",
                companyName: "Growthly",
                riskScore: 67,
                reasonKey: "payment_failed",
                reasonLabel: "Payment failed",
                mrr: 310.0,
            },
            {
                workspaceId: "demo-workspace",
                companyName: "CloudDesk",
                riskScore: 91,
                reasonKey: "no_login",
                reasonLabel: "No recent logins",
                mrr: 780.0,
            },
        ],
    });
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });