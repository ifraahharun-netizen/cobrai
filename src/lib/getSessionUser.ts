
import "server-only";
import { cookies } from "next/headers";
import { getAdminAuth } from "@/lib/firebaseAdmin";

export async function getSessionUser() {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session");

    if (!sessionCookie) return null;

    try {
        const decoded = await getAdminAuth().verifySessionCookie(
            sessionCookie.value,
            true
        );

        return decoded; // uid, email, etc
    } catch {
        return null;
    }
}
