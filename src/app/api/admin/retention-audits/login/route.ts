import { NextResponse } from "next/server";

import {
    isValidAdminSecret,
    setRetentionAuditAdminCookie,
} from "@/lib/retention-audit/admin-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
    const formData = await request.formData();
    const secret = String(formData.get("secret") ?? "");

    if (!isValidAdminSecret(secret)) {
        return NextResponse.redirect(
            new URL(
                "/admin/retention-audits/login?error=1",
                request.url,
            ),
            303,
        );
    }

    await setRetentionAuditAdminCookie();

    return NextResponse.redirect(
        new URL("/admin/retention-audits", request.url),
        303,
    );
}
