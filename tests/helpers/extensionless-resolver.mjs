import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * ESM resolution hook for tests only.
 *
 * Application code uses extensionless imports (`./prisma`) and the `@/`
 * path alias (`@/lib/server/prisma`), because that's how Next's bundler
 * resolves them. Plain Node ESM requires an extension and knows nothing
 * about tsconfig path aliases, so `src/**` isn't importable from the native
 * test runner without this.
 *
 * This hook bridges those two gaps for tests only. It does not touch
 * production code and does not change how Next builds the app.
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
    if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
      // Same gap, other side of the boundary: e.g. `next/server` exists as
      // `next/server.js`, and Next 14 doesn't declare an `exports` map that
      // tells Node so. The bundler resolves it; Node in ESM does not.
      for (const suffix of [".js", ".mjs", ".cjs"]) {
        try {
          return await nextResolve(specifier + suffix, context);
        } catch {
          // try the next suffix; if none work, the original error stands
        }
      }

      throw error;
    }

    if (!context.parentURL) throw error;

    const resolved = firstExisting(new URL(specifier, context.parentURL).href);
    if (resolved) return nextResolve(resolved, context);

    throw error;
  }
}
