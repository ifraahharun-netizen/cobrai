export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

import { runWorkspaceAnalyticsPipeline } from "@/lib/analytics/runWorkspaceAnalyticsPipeline";

export async function POST(
    req: NextRequest
) {
    try {
        const auth =
            req.headers.get("authorization");

        if (
            auth !==
            `Bearer ${process.env.INTERNAL_ANALYTICS_SECRET}`
        ) {
            return NextResponse.json(
                {
                    error: "Unauthorized",
                },
                {
                    status: 401,
                }
            );
        }

        const body = await req.json();

        const workspaceId =
            body?.workspaceId;

        if (!workspaceId) {
            return NextResponse.json(
                {
                    error: "Missing workspaceId",
                },
                {
                    status: 400,
                }
            );
        }

        await runWorkspaceAnalyticsPipeline(
            workspaceId
        );

        return NextResponse.json({
            ok: true,
        });
    } catch (error) {
        console.error(
            "Analytics background job failed:",
            error
        );

        return NextResponse.json(
            {
                error: "Failed",
            },
            {
                status: 500,
            }
        );
    }
}