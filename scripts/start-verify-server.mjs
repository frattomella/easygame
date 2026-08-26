/**
 * Avvia la build di verifica su una porta dedicata.
 *
 * **Perche esiste.** La verifica su schermo del responsive (ADR-0025) va
 * fatta su un'applicazione che gira, e su una copia di lavoro condivisa
 * capita che un `next dev` sia gia in ascolto sulla porta di sviluppo. Due
 * processi Next sulla stessa cartella `.next` si cancellano i chunk a vicenda
 * e ogni pagina risponde `Cannot find module`. Questo script parte da una
 * build **separata** (`NEXT_DIST_DIR`) su una porta **separata**, e non tocca
 * nulla di cio che sta girando.
 *
 *     NEXT_DIST_DIR=.next-verify npm run build
 *     node scripts/start-verify-server.mjs
 *
 * Non e un modo di servire l'applicazione in produzione: li c'e
 * `npm run start`, che usa `.next` come sempre.
 *
 * **Nota.** La build di verifica aggiunge da sola `.next-verify/types` a
 * `tsconfig.json`: e Next che lo fa, e va scartato (`git checkout --
 * tsconfig.json`) prima di committare. La cartella e in `.gitignore`.
 */

import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const distDir = process.env.NEXT_DIST_DIR || ".next-verify";
const port = process.env.VERIFY_PORT || "3010";

/*
  Si chiama il binario di Next direttamente e non `npx`: su Windows lo spawn
  di uno script `.cmd` senza shell fallisce con `EINVAL`, e con la shell
  aperta il segnale di arresto non arriva al processo figlio.
*/
const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const child = spawn(
  process.execPath,
  [nextBin, "start", "--hostname", "127.0.0.1", "--port", port],
  {
    stdio: "inherit",
    env: { ...process.env, NEXT_DIST_DIR: distDir },
  },
);

child.on("exit", (code) => process.exit(code ?? 0));
