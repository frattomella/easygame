import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __easygame_prisma__: PrismaClient | undefined;
}

export const isPrismaConnectionError = (error: unknown) =>
  error instanceof Prisma.PrismaClientInitializationError ||
  /can't reach database server/i.test(String((error as Error | undefined)?.message || ""));

export const getPrismaConnectionErrorMessage = () =>
  "Connessione database non disponibile. Verifica DATABASE_URL nell'ambiente corrente e conferma che l'endpoint Neon configurato sia raggiungibile da Prisma. DIRECT_URL serve ai comandi Prisma CLI/migrazioni.";

let realPrismaClient: PrismaClient | undefined;

// Building the real client (and its pg pool/adapter) is deferred to first
// actual use, not done at import time. Production always has DATABASE_URL
// set, so this changes nothing there — it just means importing this module
// (e.g. from a test that will immediately call __setPrismaClientForTests)
// never has to construct a real connection pool it will never use.
const getRealPrismaClient = (): PrismaClient => {
  if (realPrismaClient) {
    return realPrismaClient;
  }

  if (global.__easygame_prisma__) {
    realPrismaClient = global.__easygame_prisma__;
    return realPrismaClient;
  }

  const databaseUrl = String(process.env.DATABASE_URL || "").trim();
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is missing. Set DATABASE_URL to the Neon pooled Postgres URL for this environment.",
    );
  }

  const prismaAdapter = new PrismaPg(databaseUrl, {
    onPoolError: (error) => {
      console.error("Prisma PostgreSQL pool error:", error);
    },
    onConnectionError: (error) => {
      console.error("Prisma PostgreSQL connection error:", error);
    },
  });

  realPrismaClient = new PrismaClient({
    adapter: prismaAdapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  if (process.env.NODE_ENV !== "production") {
    global.__easygame_prisma__ = realPrismaClient;
  }

  return realPrismaClient;
};

let overridePrismaClient: PrismaClient | null = null;

// A thin lazy proxy: it resolves to the test override when set, otherwise
// to the real (lazily-built) client, on every property access. Function
// properties are bound to the underlying client so methods relying on
// internal state (e.g. $transaction) keep the right `this` when called as
// `prisma.$transaction(...)`.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = overridePrismaClient ?? getRealPrismaClient();
    const value = (client as unknown as Record<PropertyKey, unknown>)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
  set(_target, prop, value) {
    const client = overridePrismaClient ?? getRealPrismaClient();
    (client as unknown as Record<PropertyKey, unknown>)[prop] = value;
    return true;
  },
}) as PrismaClient;

/**
 * Test-only seam: lets integration tests substitute a fake Prisma client so
 * server logic (e.g. the training-automation runner) can be exercised
 * end-to-end without a real database. Never available in production.
 */
export const __setPrismaClientForTests = (client: PrismaClient | null) => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("__setPrismaClientForTests is not available in production");
  }

  overridePrismaClient = client;
};
