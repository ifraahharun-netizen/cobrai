import { prisma } from "@/lib/prisma";

async function main() {
    const risks = await prisma.accountRisk.findMany({
        where: {
            customerId: null,
        },
        select: {
            id: true,
            workspaceId: true,
            companyName: true,
        },
    });

    let updated = 0;

    for (const risk of risks) {
        const customer = await prisma.customer.findFirst({
            where: {
                workspaceId: risk.workspaceId,
                name: risk.companyName,
            },
            select: { id: true },
        });

        if (!customer) continue;

        await prisma.accountRisk.update({
            where: { id: risk.id },
            data: { customerId: customer.id },
        });

        updated += 1;
    }

    console.log(`Backfill complete. Updated ${updated} account risk rows.`);
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });