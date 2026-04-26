import { prisma } from "@/lib/prisma";
import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";
import { NextRequest, NextResponse } from "next/server";

function getBearerToken(req: NextRequest) {
    const authHeader = req.headers.get("authorization") || "";
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    return m?.[1] ?? null;
}

async function getWorkspaceIdFromAuth(req: NextRequest) {
    const token = getBearerToken(req);
    if (!token) throw new Error("Missing Authorization Bearer token");

    const decoded = await verifyFirebaseIdToken(token);
    const firebaseUid = decoded.uid;
    const email = decoded.email ?? null;

    // requires: model User { firebaseUid, email, workspaceId }
    const ors = [
        ...(firebaseUid ? [{ firebaseUid }] : []),
        ...(email ? [{ email }] : []),
    ];

    const user = await prisma.user.findFirst({
        where: { OR: ors },
        select: { workspaceId: true },
    });

    if (!user?.workspaceId) throw new Error("No workspace linked to user");
    return user.workspaceId;
}

function monthKey(d: Date) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
}

export async function GET(req: NextRequest) {
    try {
        const workspaceId = await getWorkspaceIdFromAuth(req);

        // last 6 months including current month
        const now = new Date();
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1, 0, 0, 0));

        // Build a fixed month axis so your chart doesn't jump
        const months: string[] = [];
        for (let i = 0; i < 6; i++) {
            const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
            months.push(monthKey(d));
        }

        // Query counts by month using Postgres date_trunc
        // Uses lastActiveAt if present, else createdAt, to approximate churn month.
        const rows = await prisma.$queryRaw<
            Array<{ month: Date; churned: bigint; total: bigint }>
        >`
      SELECT
        date_trunc('month', COALESCE(c."lastActiveAt", c."createdAt")) AS month,
        SUM(CASE WHEN c."status" = 'churned' THEN 1 ELSE 0 END) AS churned,
        COUNT(*) AS total
      FROM "customers" c
      WHERE c."workspaceId" = ${workspaceId}
        AND COALESCE(c."lastActiveAt", c."createdAt") >= ${start}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

        const map = new Map<string, { churned: number; total: number }>();
        for (const r of rows) {
            map.set(monthKey(r.month), {
                churned: Number(r.churned ?? 0),
                total: Number(r.total ?? 0),
            });
        }

        const points = months.map((m) => {
            const v = map.get(m) ?? { churned: 0, total: 0 };
            const churnPct = v.total > 0 ? (v.churned / v.total) * 100 : 0;
            return { month: m, churnPct: Number(churnPct.toFixed(1)) };
        });

        return NextResponse.json({ ok: true, points });
    } catch (e: any) {
        return NextResponse.json(
            { ok: false, error: e?.message ?? "Unknown error" },
            { status: 401 }
        );
    }
}
