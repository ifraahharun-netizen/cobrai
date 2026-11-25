import { after } from "next/server";
import { syncConnectedStripeWorkspace } from "@/lib/stripe-connect/sync";

/**
 * Run the first Stripe sync straight after a customer connects, in the
 * background (after the redirect is sent), so their dashboard fills up
 * within a minute or two instead of waiting for the nightly sync.
 * The route calling this needs a maxDuration long enough for a sync (300s).
 */
export function syncStripeAfterConnect(workspaceId: string) {
    after(async () => {
        try {
            await syncConnectedStripeWorkspace(workspaceId);
        } catch (error) {
            console.error(`[stripe-connect] first sync failed for workspace ${workspaceId}:`, error);
        }
    });
}
