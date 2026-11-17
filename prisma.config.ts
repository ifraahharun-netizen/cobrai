import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
        seed: "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts",
    },
    // Migrations run against the direct database address: the connection
    // pooler (DATABASE_URL, pgbouncer) can't run them.
    datasource: {
        url: process.env.DIRECT_URL || process.env.DATABASE_URL || "",
    },
});
