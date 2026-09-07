/**
 * **Le sonde mordono? Si misura rompendo il codice.**
 *
 * ---
 *
 * ## Perche esiste
 *
 * Una sonda verde dice due cose diverse, e non si distinguono guardandola:
 * «l'invariante vale» oppure «la sonda non la misura». Quindici revisioni su
 * questo pacchetto hanno trovato piu volte la seconda — una difesa che
 * esisteva ed era **disarmata**, un test che confrontava un testo invece di
 * tentare la violazione.
 *
 * Questo file introduce **mutazioni vere** nel codice sorgente — una alla
 * volta, ognuna la riscrittura esatta di un difetto gia costato una tornata —
 * e pretende che la sonda corrispondente diventi **rossa**. Una mutazione che
 * lascia tutto verde e una sonda che non misura niente.
 *
 * Nessuna asserzione qui confronta una stringa del sorgente con un'attesa: si
 * rompe il comportamento e si guarda chi se ne accorge.
 *
 * ## Come si esegue
 *
 * ```
 * node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *   scripts/pp-02-mutazioni.mjs
 * ```
 *
 * Ogni mutazione viene **sempre** annullata, anche se la sonda si interrompe:
 * il ripristino sta in `finally`, e alla fine si verifica che l'albero sia
 * tornato com'era.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

/* ------------------------------------------------------------------ arnesi */

const ORIGINALI = new Map();

const applica = (percorso, da, a) => {
  const testo = readFileSync(percorso, "utf8");
  if (!ORIGINALI.has(percorso)) ORIGINALI.set(percorso, testo);

  if (!testo.includes(da)) {
    throw new Error(
      `la mutazione non si aggancia piu a ${percorso}: il codice e cambiato, e la mutazione va riscritta`,
    );
  }

  writeFileSync(percorso, testo.replace(da, a), "utf8");
};

const ripristina = () => {
  for (const [percorso, testo] of ORIGINALI) writeFileSync(percorso, testo, "utf8");
  ORIGINALI.clear();
};

/** Vero se il comando **fallisce**, che e cio che ci si aspetta sotto mutazione. */
const diventaRossa = (comando) => {
  try {
    execFileSync(comando[0], comando.slice(1), {
      stdio: "pipe",
      env: process.env,
    });
    return false;
  } catch {
    return true;
  }
};

const UNITA = [
  process.execPath,
  "--experimental-strip-types",
  "--import",
  "./tests/helpers/register-hooks.mjs",
  "--test",
  "tests/lib/tutori-primitive.test.mjs",
];

const MATRICE = [
  process.execPath,
  "--experimental-strip-types",
  "--import",
  "./tests/helpers/register-hooks.mjs",
  "scripts/pp-02-consolidamento.mjs",
];

const CENSIMENTO = [
  process.execPath,
  "--experimental-strip-types",
  "--import",
  "./tests/helpers/register-hooks.mjs",
  "scripts/pp-02-censimento.mjs",
];

/* ----------------------------------------------------------- le mutazioni */

/**
 * Ognuna e la riscrittura di un difetto **gia accaduto**, non un guasto
 * inventato: `nota` dice quale, e `sonda` chi dovrebbe accorgersene.
 */
const MUTAZIONI = [
  {
    nome: "M1  l'esclusione torna un AND",
    nota:
      "il difetto del quindicesimo vaglio: una voce revocata **e** di solo " +
      "recapito era esclusa, una revocata soltanto no.",
    sonda: UNITA,
    tocca: () =>
      applica(
        "src/lib/guardians/exclusion.ts",
        "  isGuardianRevoked(voce) || isGuardianContactOnly(voce);",
        "  isGuardianRevoked(voce) && isGuardianContactOnly(voce);",
      ),
  },
  {
    nome: "M2  i marchi si piegano con due AND indipendenti",
    nota:
      "due righe escluse in modi diversi perdevano entrambi i marchi, e la " +
      "voce usciva viva: la ricevuta si intestava a chi il club aveva escluso.",
    sonda: UNITA,
    tocca: () =>
      applica(
        "src/lib/guardians/exclusion.ts",
        "  const tutte = righe.length > 0 && righe.every((riga) => isGuardianExcluded(riga));",
        "  const tutte =\n    righe.length > 0 &&\n    righe.every((riga) => isGuardianRevoked(riga)) &&\n    righe.every((riga) => isGuardianContactOnly(riga));",
      ),
  },
  {
    nome: "M3  la voce fusa eredita i campi della riga esclusa",
    nota:
      "la ricevuta intestata al padre con il codice fiscale e l'indirizzo " +
      "della madre revocata: un documento fiscalmente falso.",
    sonda: UNITA,
    tocca: () =>
      applica(
        "src/lib/guardians/projection.ts",
        "      const voce: Record<string, unknown> = {\n        ...projectGuardianRow(scelta),",
        "      const voce: Record<string, unknown> = {\n        ...dietro.reduce(\n          (insieme, riga) => ({ ...projectGuardianRow(riga), ...insieme }),\n          {} as Record<string, unknown>,\n        ),\n        ...projectGuardianRow(scelta),",
      ),
  },
  {
    nome: "M4  la voce esclusa sparisce invece di rispondere vuoto",
    nota:
      "togliere le voci escluse dall'elenco fa **slittare** le posizioni: il " +
      "codice fiscale stampato su una ricevuta cambia persona.",
    sonda: UNITA,
    tocca: () =>
      applica(
        "src/lib/guardians/documents.ts",
        "  readGuardianEntries(data).map((voce) =>",
        "  readGuardianEntries(data).filter((voce) => !isGuardianExcluded(voce)).map((voce) =>",
      ),
  },
  {
    nome: "M5  le notifiche tornano a leggere due grafie dell'utenza",
    nota:
      "misurato su una riga `{ userId, email }`: accesso si, solleciti si, " +
      "promemoria si, notifiche documentali no.",
    sonda: UNITA,
    tocca: () =>
      applica(
        "src/lib/guardians/identity.ts",
        'const CHIAVI_UTENZA = [\n  "linkedUserId",\n  "linked_user_id",\n  "userId",\n  "user_id",\n] as const;',
        'const CHIAVI_UTENZA = ["linkedUserId", "linked_user_id"] as const;',
      ),
  },
  {
    nome: "M6  un indirizzo revocato esce da una riga superstite",
    nota:
      "l'uscita «un legame dichiarato vince» tiene in piedi la riga del padre, " +
      "che pero porta l'indirizzo di famiglia condiviso: la notifica finiva " +
      "nella bacheca della madre revocata, con il nome del minore.",
    sonda: UNITA,
    tocca: () =>
      applica(
        "src/lib/guardians/notifications.ts",
        '        linkedUserEmail:\n          scritto && revocate.has(normalizeGuardianIdentity(scritto)) ? "" : scritto,',
        "        linkedUserEmail: scritto,",
      ),
  },
  {
    nome: "M7  il confine di club torna uno spread condizionale",
    nota:
      "in Prisma `undefined` non e un filtro: lo toglie. Il riepilogo " +
      "conterebbe, e la cancellazione toglierebbe, i gettoni di un altro club.",
    sonda: MATRICE,
    tocca: () =>
      applica(
        "src/lib/server/athlete-guardians.ts",
        '  const club = String(organizationId || "").trim();\n  if (!club) {\n    throw new Error(\n      "Accesso negato: gli inviti di una scheda si cercano solo dentro un club",\n    );\n  }\n\n  return {\n    resource_type: "access_tokens",\n    organization_id: club,',
        '  const club = String(organizationId || "").trim();\n\n  return {\n    resource_type: "access_tokens",\n    ...(club ? { organization_id: club } : {}),',
      ),
  },
  {
    nome: "M8  il riscatto torna a cercare dentro la proiezione",
    nota:
      "la guardia e l'uso rispondevano diverso: un invito coniato per la riga " +
      "nascosta dietro una voce fusa veniva rifiutato con 404.",
    sonda: MATRICE,
    tocca: () =>
      applica(
        "src/lib/server/athlete-guardians.ts",
        "  return (\n    (eUnIdentificativo && candidate.find((riga) => riga.id === chiave)) ||\n    candidate.find((riga) => riga.legacy_id === chiave) ||\n    candidate.find((riga) => riga.identity_key === normalizza(chiave)) ||\n    candidate.find((riga) => guardianRowNamedBy(riga, chiave)) ||\n    null\n  );",
        "  return (\n    (eUnIdentificativo &&\n      candidate.find((riga) => riga.id === chiave && !riga.contact_only)) ||\n    null\n  );",
      ),
  },
  {
    nome: "M9  un consumatore canonico smette di importare la primitiva",
    nota:
      "e la forma con cui il dominio e cresciuto per quindici tornate: un " +
      "lettore che si ricostruisce la regola in casa. C3 deve vederlo.",
    sonda: CENSIMENTO,
    tocca: () =>
      applica(
        "src/lib/documents/fiscal-recipient.ts",
        'import { resolveDocumentGuardians } from "@/lib/guardians/documents";\n',
        "const resolveDocumentGuardians = (data: any): any[] =>\n  Array.isArray(data?.guardians) ? data.guardians : [];\n",
      ),
  },
  {
    nome: "M11  il soggetto di un modulo si sceglie senza i marchi",
    nota:
      "la bozza di rinnovo pescava il tutore dalla proiezione guardando solo " +
      "l'utenza: la guardia decideva sulle righe, l'uso su un altro oggetto.",
    sonda: UNITA,
    tocca: () =>
      applica(
        "src/lib/guardians/documents.ts",
        "    resolveDocumentGuardians(data).find(",
        "    readGuardianEntries(data).find(",
      ),
  },
  {
    nome: "M12  la revoca chiude meno di quanto il riscatto colleghi",
    nota:
      "un invito coniato sull'indirizzo era riscattabile e non chiudibile: " +
      "la revoca lo lasciava attivo e la scheda non lo mostrava.",
    sonda: MATRICE,
    tocca: () =>
      applica(
        "src/lib/guardians/identity.ts",
        "    cercata === String(r.id ?? \"\") ||\n    cercata === String(r.legacy_id ?? \"\") ||\n    (Boolean(r.identity_key) && normale === normalizeGuardianIdentity(r.identity_key))",
        "    cercata === String(r.id ?? \"\") || cercata === String(r.legacy_id ?? \"\")",
      ),
  },
  {
    nome: "M13  la guardia vede la chiave e non l'indirizzo",
    nota:
      "con `{ userId, email }` insieme la chiave e l'utenza, e l'indirizzo " +
      "verificato di un terzo usciva dal vaglio: area famiglia aperta senza permesso.",
    sonda: MATRICE,
    tocca: () =>
      applica(
        "src/lib/server/athlete-guardians.ts",
        "        contactOnly || giaPresente ? [] : guardianIdentityCandidates(row),",
        "        contactOnly || giaPresente ? [] : [identityKey],",
      ),
  },
  {
    nome: "M14  il legame dichiarato vince anche sul marchio di riga",
    nota:
      "una riga `contact_only` che porta un'utenza — cio che la §3 del travaso " +
      "produce — riceveva su tutti e tre i canali.",
    sonda: UNITA,
    tocca: () =>
      applica(
        "src/lib/guardians/notifications.ts",
        "      if (isGuardianExcludedPerRiga(riga)) return false;\n\n      /* Un legame dichiarato e non revocato vince **sul registro**. */\n      if (identita.userIds.some((voce) => !revocate.has(voce))) return true;",
        "      if (identita.userIds.some((voce) => !revocate.has(voce))) return true;\n      if (isGuardianExcludedPerRiga(riga)) return false;",
      ),
  },
  {
    nome: "M15  l'elenco vuoto fa risuscitare il blob storico",
    nota:
      "tolta l'ultima riga di tutore, l'ex tutore continuava a ricevere per " +
      "sempre i solleciti con il nome del minore e il link per pagare.",
    sonda: UNITA,
    tocca: () =>
      applica(
        "src/lib/guardians/notifications.ts",
        "  if (Array.isArray(d.guardians)) return elenco;",
        "  if (elenco.length > 0) return elenco;",
      ),
  },
  {
    nome: "M16  il residuo torna a portare i marchi nella voce",
    nota:
      "un `revoked_at` dentro `data` marcava un tutore **vivo**: spariva dal " +
      "destinatario fiscale, e chi paga cambiava persona.",
    sonda: UNITA,
    tocca: () =>
      applica(
        "src/lib/guardians/projection.ts",
        "  ...residuoSicuro(riga.data),",
        "  ...((riga.data && typeof riga.data === \"object\" ? riga.data : {}) as Record<\n    string,\n    unknown\n  >),",
      ),
  },
  {
    nome: "M17  una voce non-oggetto torna a far slittare le posizioni",
    nota:
      "lo stesso slittamento gia pagato con il codice fiscale stampato su una " +
      "ricevuta, prodotto da una difesa contro un dato malformato.",
    sonda: UNITA,
    tocca: () =>
      applica(
        "src/lib/guardians/documents.ts",
        "  return elenco.map((voce) => asGuardianRecord(voce));",
        "  return elenco.filter(\n    (voce) => Boolean(voce) && typeof voce === \"object\" && !Array.isArray(voce),\n  );",
      ),
  },
  {
    nome: "M10  qualcuno ripiega l'OR dell'esclusione in casa",
    nota:
      "il predicato riscritto a mano in un consumatore: la firma esatta del " +
      "difetto che ha tenuto in piedi quindici revisioni. C5 deve vederlo.",
    sonda: CENSIMENTO,
    tocca: () =>
      applica(
        "src/lib/server/document-placeholders.ts",
        "const guardianAt = (athlete: Record<string, any>, index: number) =>\n  asRecord(documentGuardianAt(asRecord(athlete.data), index));",
        "const guardianAt = (athlete: Record<string, any>, index: number) => {\n  const voce = asRecord(asRecord(athlete.data).guardians?.[index]);\n  const fuori = voce.accessRevokedAt || voce.contact_only === true;\n  return fuori ? asRecord(null) : voce;\n};",
      ),
  },
];

/* ------------------------------------------------------------------- corsa */

/**
 * **L'albero com'era prima delle mutazioni, non com'e su `main`.**
 *
 * Il confronto giusto e con l'istante precedente: questa sonda gira anche —
 * anzi, soprattutto — mentre il lavoro e in corso e l'albero ha gia modifiche
 * legittime. Confrontare con `HEAD` avrebbe chiamato «mutazione non
 * ripristinata» ogni riga che si stava scrivendo.
 */
const impronta = () => {
  try {
    return execFileSync("git", ["status", "--porcelain", "--", "src/"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
};

const PRIMA = impronta();

console.log("\n=== VERIFICA PER MUTAZIONE ===\n");
console.log("  Una mutazione che lascia la sonda verde e una sonda che non misura.\n");

const esiti = [];

for (const mutazione of MUTAZIONI) {
  process.stdout.write(`  ${mutazione.nome.padEnd(56)}`);

  let rossa = false;
  let inciampo = null;

  try {
    mutazione.tocca();
    rossa = diventaRossa(mutazione.sonda);
  } catch (errore) {
    inciampo = String(errore?.message || errore);
  } finally {
    ripristina();
  }

  const ok = rossa && !inciampo;
  esiti.push({ nome: mutazione.nome, ok });
  console.log(ok ? "la sonda diventa ROSSA  ✓" : "la sonda resta verde  ✗");
  if (inciampo) console.log(`        ${inciampo}`);
  if (!ok && !inciampo) console.log(`        ${mutazione.nota}`);
}

/* ------------------------------------------------- l'albero e tornato com'era */

const DOPO = impronta();
const ripristinato = PRIMA !== null && DOPO === PRIMA;

esiti.push({ nome: "R  l'albero e tornato com'era", ok: ripristinato });
console.log(
  `\n  ${"R  l'albero e tornato com'era".padEnd(56)}` +
    (ripristinato ? "identico a prima  ✓" : `DIVERSO da prima  ✗\n${DOPO}`),
);

const ko = esiti.filter((e) => !e.ok).length;
console.log(`\nEsito: ${esiti.length - ko}/${esiti.length}\n`);
process.exit(ko ? 1 : 0);
