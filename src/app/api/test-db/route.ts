import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Hide credentials in anything that looks like a connection string. */
function redact(text: string) {
    return text.replace(/([a-z]+:\/\/[^:\s/]+:)[^@\s]+@/gi, "$1***@");
}

export async function GET() {
    try {
        const result = await prisma.$queryRaw`SELECT 1 as ok`;
        return Response.json({ db: result });
    } catch (error) {
        console.error("test-db failed", error);

        // Outside production, say why the connection failed (credentials
        // redacted) so preview environment problems can be diagnosed.
        if (process.env.VERCEL_ENV !== "production") {
            const e = error as { name?: string; code?: string; errorCode?: string; message?: string };
            const url = process.env.DATABASE_URL || "";
            let host = "";
            try {
                host = url ? new URL(url).host : "";
            } catch {
                host = "(DATABASE_URL is not a valid URL)";
            }
            return Response.json(
                {
                    ok: false,
                    env: process.env.VERCEL_ENV ?? "unknown",
                    databaseUrlSet: Boolean(url.trim()),
                    databaseUrlStartsWithQuote: /^["']/.test(url.trim()),
                    host,
                    error: e?.name,
                    code: e?.code ?? e?.errorCode ?? null,
                    message: redact(String(e?.message ?? error)).slice(0, 600),
                },
                { status: 500 }
            );
        }

        return Response.json({ ok: false }, { status: 500 });
    }
}
