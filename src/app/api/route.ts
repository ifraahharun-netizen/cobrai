import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
    _req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const id = params.id;

        const customer = await prisma.customer.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
                plan: true,
                mrr: true,
                churnRisk: true,
                healthScore: true,
                lastActiveAt: true,
                createdAt: true,
            },
        });

        if (!customer) {
            return NextResponse.json({ error: "Customer not found" }, { status: 404 });
        }

        return NextResponse.json(customer);
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Failed to load customer" }, { status: 500 });
    }
}
