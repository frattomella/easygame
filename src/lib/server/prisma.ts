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

const createPrismaClient = () => {
  const databaseUrl = String(process.env.DATABASE_URL || "").trim();

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is missing. Set DATABASE_URL to the pooled Postgres URL for this environment.",
    );
  }

  const adapter = new PrismaPg(databaseUrl, {
    onPoolError: (error) => {
      console.error("Prisma PostgreSQL pool error:", error);
    },
    onConnectionError: (error) => {
      console.error("Prisma PostgreSQL connection error:", error);
    },
  });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
};

/**
 * Client sostitutivo usato **solo dai test**, per esercitare il data layer
 * senza un database reale. In esecuzione normale resta sempre `null`.
 */
let testClient: PrismaClient | null = null;

const resolvePrismaClient = (): PrismaClient => {
  if (testClient) return testClient;

  if (!global.__easygame_prisma__) {
    const client = createPrismaClient();
    // In produzione ogni istanza serverless ha il proprio client; in sviluppo
    // la cache globale evita di aprire un pool nuovo a ogni hot reload.
    if (process.env.NODE_ENV !== "production") {
      global.__easygame_prisma__ = client;
      return client;
    }
    return (global.__easygame_prisma__ = client);
  }

  return global.__easygame_prisma__;
};

/**
 * Il client e costruito **alla prima query**, non all'import del modulo.
 *
 * Cosi importare `src/lib/server/**` non apre un pool ne richiede
 * `DATABASE_URL`, e i test possono sostituire il client con un doppio.
 * I metodi vengono restituiti gia legati al client reale, perche Prisma usa
 * `this` internamente.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get: (_target, property, receiver) => {
    const client = resolvePrismaClient() as any;
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
  set: (_target, property, value) => {
    (resolvePrismaClient() as any)[property] = value;
    return true;
  },
  has: (_target, property) => property in (resolvePrismaClient() as any),
});

/**
 * Sostituisce il client Prisma. **Solo per i test**: passare `null` ripristina
 * il client reale.
 */
export const __setPrismaClientForTests = (client: unknown) => {
  testClient = (client as PrismaClient) || null;
};
