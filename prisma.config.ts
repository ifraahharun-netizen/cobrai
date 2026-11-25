import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Local development has its own database: when .env.development.local exists
// (it's git-ignored, so only on developers' machines), Prisma CLI commands use
// it instead of the production URLs in .env. dotenv never overrides a value
// that's already set, so the first file wins and a DATABASE_URL passed on the
// command line wins over both. Vercel and CI have neither file.
config({ path: ".env.development.local", quiet: true });
config({ quiet: true });

export default defineConfig({
    schema: "prisma/schema.prisma",
});
