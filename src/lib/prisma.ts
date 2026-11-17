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
 */
function createPrismaClient() {
    const raw = process.env.DATABASE_URL;
    if (!raw) {
        throw new Error("Missing required environment variable: DATABASE_URL");
    }

    const url = new URL(raw);
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

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
