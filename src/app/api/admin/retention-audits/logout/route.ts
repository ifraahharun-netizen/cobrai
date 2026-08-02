import { NextResponse } from "next/server";

import { clearRetentionAuditAdminCookie } from "@/lib/retention-audit/admin-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
    await clearRetentionAuditAdminCookie();

    return NextResponse.redirect(
        new URL("/admin/retention-audits/login", request.url),
        303,
    );
}
