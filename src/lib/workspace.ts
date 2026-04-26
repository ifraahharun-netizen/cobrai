import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const ws = await prisma.workspace.findFirst({
            orderBy: { createdAt: "asc" },
            select: { id: true, name: true, createdAt: true },
        });

        if (!ws) {
            return NextResponse.json(
                { error: "No workspace found in DB. Create one first." },
                { status: 404 }
            );
        }

        return NextResponse.json({ workspaceId: ws.id, workspace: ws });
    } catch (e: any) {
        console.error(e);
        return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
    }
}
