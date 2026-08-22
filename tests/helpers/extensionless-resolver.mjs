import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Hook di risoluzione ESM per i soli test.
 *
 * Il codice applicativo usa import senza estensione (`./prisma`) e l'alias di
 * percorso `@/` (`@/lib/access-roles`), perche e cosi che li risolve il
 * bundler di Next. Node in modalita ESM pretende invece l'estensione e non
 * conosce gli alias di `tsconfig.json`: per questo `src/lib/server/**` non era
 * importabile dal test runner (ADR-0008, WP-04).
 *
 * Questo hook colma le due differenze **solo durante i test**. Non tocca il
 * codice di produzione e non cambia il modo in cui Next costruisce il bundle.
 */

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC_URL = pathToFileURL(path.join(PROJECT_ROOT, "src") + path.sep).href;

const SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".mts",
  ".js",
  ".mjs",
  "/index.ts",
  "/index.tsx",
  "/index.js",
];

const firstExisting = (baseHref) => {
  for (const suffix of SUFFIXES) {
    const candidate = baseHref + suffix;
    const filePath = fileURLToPath(candidate);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return candidate;
    }
  }
  return null;
};

export async function resolve(specifier, context, nextResolve) {
  // Alias "@/..." -> "<root>/src/..."
  if (specifier.startsWith("@/")) {
    const resolved = firstExisting(SRC_URL + specifier.slice(2));
    if (resolved) return nextResolve(resolved, context);
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!specifier.startsWith(".") && !specifier.startsWith("/")) throw error;
    if (!context.parentURL) throw error;

    const resolved = firstExisting(new URL(specifier, context.parentURL).href);
    if (resolved) return nextResolve(resolved, context);

    throw error;
  }
}
