import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id: customerId } = await context.params;

        const events = await prisma.accountTimelineEvent.findMany({
            where: {
                customerId,
            },

            orderBy: {
                createdAt: "desc",
            },

            take: 50,
        });

        return NextResponse.json({
            ok: true,
            events,
        });
    } catch (error) {
        console.error(error);

        return NextResponse.json(
            {
                ok: false,
                error: "Failed to load timeline",
            },
            {
                status: 500,
            }
        );
    }
}