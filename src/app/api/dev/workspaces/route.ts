import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const list = await prisma.workspace.findMany({
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({ count: list.length, workspaces: list });
  } catch (e: any) {
    console.error("dev/workspaces error:", e);
    return NextResponse.json(
      { error: e?.message ?? "Failed to load workspaces" },
      { status: 500 }
    );
  }
}


