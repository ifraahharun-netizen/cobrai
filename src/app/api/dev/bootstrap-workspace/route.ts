import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST() {
    try {
        const ws = await prisma.workspace.create({
            data: {
                name: "Default Workspace",
            } as any,
            select: { id: true, name: true, createdAt: true },
        });

        return NextResponse.json({ ok: true, workspaceId: ws.id, workspace: ws });
    } catch (e: any) {
        console.error("bootstrap-workspace error:", e);
        return NextResponse.json(
            { ok: false, error: e?.message ?? "Failed to create workspace" },
            { status: 500 }
        );
    }
}
