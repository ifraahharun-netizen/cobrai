import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
    req: Request,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;
    const body = await req.json();
    const status = body?.status === "done" ? "done" : "open";

    const task = await prisma.task.update({
        where: { id },
        data: { status },
    });

    return NextResponse.json({ task });
}