import { PrismaClient } from "@prisma/client";

for (const variableName of ["DATABASE_URL", "DIRECT_URL"]) {
  const currentUrl = process.env[variableName];
  if (!currentUrl) {
    throw new Error(`${variableName} is not configured`);
  }

  const url = new URL(currentUrl);
  url.searchParams.set("sslmode", "verify-full");

  const prisma = new PrismaClient({
    datasources: { db: { url: url.toString() } },
  });

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log(`${variableName}: verify-full OK`);
  } finally {
    await prisma.$disconnect();
  }
}
