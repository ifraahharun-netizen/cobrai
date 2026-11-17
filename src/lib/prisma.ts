import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma 7 connects through the node-postgres driver adapter.
 *
 * DATABASE_URL is the Supabase pooler address with Prisma 6 options in the
 * query string (pgbouncer, connection_limit, sslmode). node-postgres doesn't
 * understand those, so they are read here and turned into driver settings:
 * - connection_limit → pool size (1 per serverless instance, like before)
 * - sslmode=require  → encrypted connection. Like Prisma 6, the certificate
 *   isn't checked against a CA, because Supabase's pooler uses its own CA.
 *
 * The client is created on the first database call, not at import, so
 * `next build` (which imports every route) never needs a working
 * DATABASE_URL.
 */

/** The address as typed into a dashboard: tolerate quotes, spaces and a "DATABASE_URL=" prefix. */
function cleanDatabaseUrl(value: string) {
    let v = value.trim().replace(/^DATABASE_URL\s*=\s*/, "").trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1).trim();
    }
    return v;
}

function createPrismaClient() {
    const raw = process.env.DATABASE_URL;
    if (!raw || !raw.trim()) {
        throw new Error("Missing required environment variable: DATABASE_URL");
    }

    let url: URL;
    try {
        url = new URL(cleanDatabaseUrl(raw));
    } catch {
        // Never echo the value: it contains the database password.
        throw new Error(
            "DATABASE_URL is not a valid address. Expected postgresql://user:password@host:port/db"
        );
    }

    const poolSize = Number(url.searchParams.get("connection_limit")) || 1;
    const sslMode = url.searchParams.get("sslmode");
    for (const key of ["pgbouncer", "connection_limit", "sslmode", "schema"]) {
        url.searchParams.delete(key);
    }

    const adapter = new PrismaPg({
        connectionString: url.toString(),
        max: poolSize,
        ssl: sslMode === "disable" ? false : { rejectUnauthorized: false },
    });

    return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prismaClient?: PrismaClient };

function getClient(): PrismaClient {
    if (!globalForPrisma.prismaClient) {
        globalForPrisma.prismaClient = createPrismaClient();
    }
    return globalForPrisma.prismaClient;
}

/** Same API as a PrismaClient; the real client is created on first use. */
export const prisma = new Proxy({} as PrismaClient, {
    get(_target, prop) {
        const client = getClient();
        const value = Reflect.get(client, prop, client);
        return typeof value === "function" ? value.bind(client) : value;
    },
});

export default prisma;
