import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const customers = await prisma.customer.findMany({
            where: {
                churnRisk: { gte: 65 }, // tweak threshold
                status: "active",
            },
            orderBy: { churnRisk: "desc" },
            take: 50,
            select: {
                id: true,
                name: true,
                email: true,
                plan: true,
                churnRisk: true,
                healthScore: true,
                lastActiveAt: true,
                mrr: true,
                createdAt: true,
                status: true,
            },
        });

        return NextResponse.json(customers);
    } catch (e: any) {
        console.error("At-risk error:", e);
        return NextResponse.json({ error: "Failed to load at-risk customers" }, { status: 500 });
    }
}
