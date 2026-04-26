import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
    try {
        // ⚠️ Replace with a REAL workspaceId from your Workspace table
        const workspaceId = "YOUR_WORKSPACE_ID";

        const customer = await prisma.customer.create({
            data: {
                workspaceId,
                name: "Test Customer",
                email: "test@customer.com",
                plan: "starter",
                mrr: 14900, // pennies
                churnRisk: 22.5,
                healthScore: 78,
                status: "active",
            },
            select: { id: true, name: true, email: true },
        });

        return NextResponse.json(customer);
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
    }
}
