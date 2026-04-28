import { Prisma, PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __easygame_prisma__: PrismaClient | undefined;
}

const databaseUrl = String(process.env.DATABASE_URL || "").trim();

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is missing. Set DATABASE_URL to the Neon pooled Postgres URL for this environment.",
  );
}

export const isPrismaConnectionError = (error: unknown) =>
  error instanceof Prisma.PrismaClientInitializationError ||
  /can't reach database server/i.test(String((error as Error | undefined)?.message || ""));

export const getPrismaConnectionErrorMessage = () =>
  "Connessione database non disponibile. Verifica DATABASE_URL nell'ambiente corrente e conferma che l'endpoint Neon configurato sia raggiungibile da Prisma. DIRECT_URL serve ai comandi Prisma CLI/migrazioni.";

export const prisma =
  global.__easygame_prisma__ ||
  new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__easygame_prisma__ = prisma;
}
