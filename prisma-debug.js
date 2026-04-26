const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();

  console.log(Object.keys(prisma));

  await prisma.$disconnect();
}

main();

