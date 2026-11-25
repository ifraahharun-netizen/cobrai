import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserFromAuthHeader } from "@/lib/serverAuth";
import { syncConnectedStripeWorkspace } from "@/lib/stripe-connect/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function getWorkspaceForUid(uid: string) {
    return prisma.workspace.findFirst({
        where: {
            user: {
                some: {
                    firebaseUid: uid,
                },
            },
        },
        select: {
            id: true,
            stripeAccountId: true,
        },
    });
}

export async function POST(req: Request) {
    let uid: string;
    try {
        // The user comes from the verified sign-in token, never the request.
        uid = (await requireUserFromAuthHeader(req)).uid;
    } catch {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const workspace = await getWorkspaceForUid(uid);

        if (!workspace) {
            return NextResponse.json(
                { error: "Workspace not found" },
                { status: 404 }
            );
        }

        if (!workspace.stripeAccountId) {
            return NextResponse.json(
                { error: "Stripe is not connected for this workspace" },
                { status: 400 }
            );
        }

        // ?rebuildHistory=1 re-derives the last 12 months of snapshots.
        const rebuildHistory =
            new URL(req.url).searchParams.get("rebuildHistory") === "1";

        const result = await syncConnectedStripeWorkspace(workspace.id, {
            rebuildHistory,
        });

        return NextResponse.json({
            ok: true,
            workspaceId: result.workspaceId,
            stripeAccountId: result.stripeAccountId,
            synced: {
                customers: result.customers,
                subscriptions: result.subscriptions,
                invoices: result.invoices,
                month: result.month,
                monthsWritten: result.monthsWritten,
                historyRebuilt: result.historyRebuilt,
                currency: result.currency,
                totalMrrMinor: result.totalMrrMinor,
                trialMrrMinor: result.trialMrrMinor,
                otherCurrencyMrrMinor: result.otherCurrencyMrrMinor,
            },
        });
    } catch (error) {
        console.error("[Stripe Sync] failed:", error);

        return NextResponse.json(
            { error: "Failed to sync Stripe data" },
            { status: 500 }
        );
    }
}
