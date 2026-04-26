import { prisma } from "@/lib/prisma";

export async function GET() {
    const result = await prisma.$queryRaw`SELECT 1 as ok`;
    return Response.json({ db: result });
}
