import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const workspaceId = "ws_demo";
    const tasks = await prisma.task.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 10,
    });
    return NextResponse.json({ tasks });
}

export async function POST(req: Request) {
    const workspaceId = "ws_demo";
    const body = await req.json();
    const title = String(body?.title || "").trim();
    if (!title) return NextResponse.json({ error: "Missing title" }, { status: 400 });

    const task = await prisma.task.create({
        data: { workspaceId, title, status: "open" },
    });

    return NextResponse.json({ task });
}
