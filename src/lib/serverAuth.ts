import { verifyFirebaseIdToken } from "@/lib/firebaseAdmin";

export async function requireUserFromAuthHeader(req: Request) {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
        throw new Error("Missing Authorization Bearer token.");
    }

    const decoded = await verifyFirebaseIdToken(token);

    return decoded;
}