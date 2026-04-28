import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __easygame_prisma__: PrismaClient | undefined;
}

export const prisma =
  global.__easygame_prisma__ ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__easygame_prisma__ = prisma;
}
