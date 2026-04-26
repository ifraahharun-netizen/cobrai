export async function GET() {
    return Response.json({
        DATABASE_URL: process.env.DATABASE_URL ?? null,
        NODE_ENV: process.env.NODE_ENV ?? null,
    });
}
