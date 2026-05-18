import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const customerId = params.id;

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