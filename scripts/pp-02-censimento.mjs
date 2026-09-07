/**
 * **Il censimento del dominio dei tutori, derivato dal codice.**
 *
 * ---
 *
 * ## Perche esiste
 *
 * Quindici revisioni indipendenti hanno trovato settantasei difetti, e **tutti**
 * stavano sul bordo: dove il modulo proprietario incontra chi lo chiama. Nelle
 * ultime due tornate i reperti non erano piu difetti residui del dominio ma
 * **regressioni delle correzioni precedenti**: il ciclo revisione → correzione
 * locale → revisione non convergeva.
 *
 * La ragione, letta a posteriori, e sempre la stessa: una regola veniva
 * **ricostruita** in casa da ogni consumatore. «Questa voce e esclusa?» era
 * scritta a mano in nove file, con nove sfumature; «chiudi l'invito» in cinque;
 * «restringi al club» in una decina. Correggerne una lasciava le altre, e ogni
 * correzione ne creava una nuova versione.
 *
 * Questo file non e un elenco: e una **derivazione**. Percorre l'albero, trova
 * chi tocca il dominio, e pretende che ogni percorso trovato sia **classificato**
 * nella tabella qui sotto. Un consumatore nuovo che nasca domani fa fallire il
 * censimento il giorno in cui viene scritto — non il giorno in cui un cliente
 * perde una revoca.
 *
 * ## Come si legge l'esito
 *
 * `node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *   scripts/pp-02-censimento.mjs`
 *
 * Stampa la tabella e chiude con `Esito: N/N`. Fallisce se:
 *
 *   * un percorso trovato non e classificato (**il dominio e cresciuto**);
 *   * un percorso classificato non esiste piu (**la tabella e invecchiata**);
 *   * un percorso dichiarato `canonico: true` non importa la primitiva.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/* ------------------------------------------------------------------ albero */

const RADICI = ["src"];

const percorsi = [];
const cammina = (dir) => {
  for (const voce of readdirSync(dir)) {
    const intero = path.join(dir, voce);
    if (statSync(intero).isDirectory()) {
      if (voce === "node_modules" || voce === ".next") continue;
      cammina(intero);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(voce)) continue;
    percorsi.push(intero.split(path.sep).join("/"));
  }
};
for (const radice of RADICI) cammina(radice);

/* ------------------------------------------------------- cosa fa un dominio */

/**
 * I marcatori che dicono «questo file tocca il dominio dei tutori».
 *
 * Sono volutamente **larghi**: un falso positivo costa una riga di
 * classificazione, un falso negativo costa un difetto che nessuno vede.
 */
const MARCATORI = [
  { chiave: "autorita", regex: /athleteGuardian\./ },
  /*
    **Il marcatore cercava `data.guardians`, e questo e un falso negativo.**

    `enrollment-requests.ts` scriveva `asRecord(athlete.data).guardians` — la
    stessa lettura, con una funzione in mezzo — e il censimento non lo vedeva:
    pescava dentro la proiezione un tutore per utenza **senza guardare i
    marchi**, mentre la sua guardia decideva sulle righe. Due oggetti diversi
    per la stessa domanda, cioe la forma che ADR-0151 vieta, dentro un file che
    la tabella non nominava.

    «Un falso positivo costa una riga di classificazione, un falso negativo
    costa un difetto che nessuno vede»: era scritto qui sopra, e il marcatore
    era stretto lo stesso.
  */
  { chiave: "proiezione", regex: /\.guardians\b|guardians\[|guardians:/ },
  { chiave: "esclusione", regex: /accessRevokedAt|access_revoked_at|contactOnly|contact_only/ },
  { chiave: "posizione", regex: /billingGuardianIndex|guardianAt\(|perPosizione|projectGuardianEntries/ },
  { chiave: "inviti", regex: /access_tokens|accessTokenRecordId|parent_access/ },
  { chiave: "legame", regex: /linkGuardianAccount|unlinkGuardianAccount|revokeGuardianRow|revokeGuardianAccessInClub/ },
  /*
    **Chi passa dalle primitive tocca il dominio**, e va classificato come
    chiunque altro.

    Senza questo marcatore i moduli canonici nuovi — `src/lib/guardians/` —
    sarebbero rimasti fuori dall'albero: `identity.ts` non nomina nessuna delle
    sei parole qui sopra, e sarebbe finito nella tabella senza essere trovato,
    cioe avrebbe fatto fallire C2 invece di essere censito.
  */
  { chiave: "primitive", regex: /lib\/guardians\/|resolveGuardianIdentity|isGuardianExcluded/ },
];

const tocca = (testo) =>
  MARCATORI.filter(({ regex }) => regex.test(testo)).map(({ chiave }) => chiave);

const trovati = new Map();
for (const percorso of percorsi) {
  const testo = readFileSync(percorso, "utf8");
  const chiavi = tocca(testo);
  if (chiavi.length) trovati.set(percorso, chiavi);
}

/* --------------------------------------------------------- la tabella vera */

/**
 * La classificazione. **Non** e la fonte dell'elenco — l'elenco lo deriva
 * l'albero — ma la fonte del **giudizio**: che cosa fa quel percorso, su quale
 * autorita, con quale confine, e se passa dalle primitive canoniche.
 *
 * `canonico: true` significa che quel file **deve** importare almeno una delle
 * primitive: e la proprieta che impedisce a un consumatore di ricostruirsi le
 * regole in casa.
 */
/**
 * **I moduli che possiedono le regole.**
 *
 * Non e un elenco di nomi di funzione: e un elenco di **file**. La differenza
 * conta, perche cio che C3 verifica non e piu «il testo contiene questa
 * parola» — un commento la conteneva, e passava — ma «questo file **importa**
 * qualcosa che uno di questi moduli **esporta davvero**».
 *
 * L'insieme dei nomi ammessi si deriva percio dagli `export` di questi file,
 * non da una lista scritta a mano: una primitiva che venga rinominata domani
 * non lascia la lista indietro, e una parola che non e un export non vale.
 */
const CANONICI = [
  "src/lib/guardians/exclusion.ts",
  "src/lib/guardians/identity.ts",
  "src/lib/guardians/projection.ts",
  "src/lib/guardians/documents.ts",
  "src/lib/guardians/notifications.ts",
  "src/lib/server/athlete-guardians.ts",
  "src/lib/server/profile-account-links.ts",
];

/** Gli export di un modulo, derivati dal suo testo. */
const esportaDa = (percorso) => {
  const testo = readFileSync(percorso, "utf8");
  const nomi = new Set();

  const dichiarazioni =
    /export\s+(?:const|function|async\s+function|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
  for (const trovato of testo.matchAll(dichiarazioni)) nomi.add(trovato[1]);

  /* `export { a, b as c }` e `export type { X }`. */
  const rilanci = /export\s+(?:type\s+)?\{([^}]*)\}/g;
  for (const trovato of testo.matchAll(rilanci)) {
    for (const pezzo of trovato[1].split(",")) {
      const nome = pezzo.trim().split(/\s+as\s+/).pop()?.trim();
      if (nome) nomi.add(nome.replace(/^type\s+/, ""));
    }
  }

  return nomi;
};

const EXPORT_CANONICI = new Map(
  CANONICI.map((percorso) => [percorso, esportaDa(percorso)]),
);

const TABELLA = {
  /* ---------------- il proprietario ---------------- */
  "src/lib/server/athlete-guardians.ts": {
    azione: "proprietario del dominio",
    verso: "read+write",
    autorita: "riga",
    tenant: "organization_id su ogni scrittura",
    permesso: "canGrantAccess dal chiamante",
    canonico: false,
    impatto: "massimo",
    nota: "definisce le primitive: non le importa",
  },
  "src/lib/athlete-guardians.ts": {
    azione: "recapiti per solleciti e comunicazioni",
    verso: "read",
    autorita: "proiezione + registri derivati",
    tenant: "ereditato dalla scheda",
    permesso: "n/d",
    canonico: true,
    /*
      **Era «presentazione», e non lo e.** Da `readAthleteGuardianContacts`
      escono i solleciti degli insoluti — nome del minore, importo e un
      **collegamento a gettone per pagare** — e le comunicazioni di gruppo:
      decide **chi riceve**, esattamente come gli altri due canali. Essendo
      classificato non canonico, aveva la propria copia delle tre difese: il
      terzo gemello, che nessuna delle due tornate precedenti aveva allargato
      perche nessuno lo contava fra i lettori che decidono.
    */
    impatto: "notifica e sollecito di pagamento",
  },

  /* ---------------- le primitive ---------------- */
  "src/lib/guardians/exclusion.ts": {
    azione: "il predicato dell'esclusione",
    verso: "read",
    autorita: "definisce",
    tenant: "n/d",
    permesso: "n/d",
    canonico: false,
    impatto: "massimo",
    nota: "definisce le primitive: non le importa",
  },
  "src/lib/guardians/identity.ts": {
    azione: "le grafie di un'identita",
    verso: "read",
    autorita: "definisce",
    tenant: "n/d",
    permesso: "n/d",
    canonico: false,
    impatto: "massimo",
  },
  "src/lib/guardians/projection.ts": {
    azione: "da righe a voci",
    verso: "read",
    autorita: "definisce",
    tenant: "n/d",
    permesso: "n/d",
    canonico: false,
    impatto: "massimo",
  },
  "src/lib/guardians/documents.ts": {
    azione: "chi un documento nuovo puo nominare",
    verso: "read",
    autorita: "definisce",
    tenant: "n/d",
    permesso: "n/d",
    canonico: false,
    impatto: "documento fiscale",
  },
  "src/lib/guardians/notifications.ts": {
    azione: "chi riceve un avviso nuovo",
    verso: "read",
    autorita: "definisce",
    tenant: "n/d",
    permesso: "n/d",
    canonico: false,
    impatto: "notifica",
  },

  /* ---------------- le porte che aprono o chiudono ---------------- */
  "src/app/api/v1/auth/access/redeem/route.ts": {
    azione: "riscatto di un invito",
    verso: "write",
    autorita: "riga",
    tenant: "guardia scoped + identificativo di riga",
    permesso: "gettone",
    canonico: true,
    impatto: "apre accesso",
  },
  "src/lib/server/profile-account-links.ts": {
    azione: "scollega profilo, sweep di revoca",
    verso: "write",
    autorita: "riga",
    tenant: "organization_id",
    permesso: "accounts.*.manage",
    canonico: true,
    impatto: "toglie accesso",
  },
  "src/lib/server/club-roles.ts": {
    azione: "revoca della tessera",
    verso: "write",
    autorita: "riga (via sweep)",
    tenant: "organization_id",
    permesso: "accounts.club.manage",
    canonico: true,
    impatto: "toglie accesso",
  },
  "src/lib/server/form-submissions.ts": {
    azione: "approvazione di una compilazione",
    verso: "write",
    autorita: "riga",
    tenant: "organization_id",
    permesso: "forms.submissions.review",
    canonico: true,
    impatto: "apre accesso",
  },
  "src/lib/server/data-subject.ts": {
    azione: "diritti dell'interessato",
    verso: "write",
    autorita: "riga",
    tenant: "organization_id",
    permesso: "gdpr",
    canonico: true,
    impatto: "cancella",
  },
  "src/lib/server/resources.ts": {
    azione: "rotta generica",
    verso: "read+write",
    autorita: "riga (via primitiva)",
    tenant: "scope",
    permesso: "matrice risorse",
    canonico: true,
    impatto: "apre e toglie",
  },
  "src/lib/server/athlete-accounts.ts": {
    azione: "accesso dell'atleta",
    verso: "write",
    autorita: "riga",
    tenant: "organization_id",
    permesso: "accounts.athlete.manage",
    canonico: false,
    impatto: "apre accesso (atleta, non tutore)",
  },

  /* ---------------- i lettori che decidono ---------------- */
  /*
    **Un falso positivo, e si paga con una riga.**

    `athlete-membership.ts` (PP-04) risponde a «chi e, o e stato, l’atleta di
    questa scheda»: legge tessere e inviti dell’**atleta**, mai una riga di
    tutore. Lo pesca il marcatore `proiezione` per una parola in un commento,
    ed e esattamente il verso in cui i marcatori sono stati scelti larghi — un
    falso positivo costa una riga di classificazione.

    Serve pero al ramo esclusivo di `parent-dashboard.ts`, cioe a una
    decisione di accesso: sta qui perche chi legge la tabella lo trovi, non
    perche porti un’autorita sul dominio. Non e canonico — non ha regole di
    tutore da chiedere a nessuno.
  */
  "src/lib/server/athlete-membership.ts": {
    azione: "chi e, o e stato, l’atleta di questa scheda",
    verso: "read",
    autorita: "nessuna: tessere e inviti dell’atleta",
    tenant: "organization_id delle schede passate",
    permesso: "n/d",
    canonico: false,
    impatto: "alimenta il ramo esclusivo del legame diretto",
  },
  "src/lib/server/parent-dashboard.ts": {
    azione: "apre l'area famiglia",
    verso: "read",
    autorita: "riga (findGuardianLinks)",
    tenant: "organizationIdsForEmail",
    permesso: "sessione",
    canonico: true,
    impatto: "decide l'accesso",
  },
  "src/lib/documents/fiscal-recipient.ts": {
    azione: "intestatario di una ricevuta",
    verso: "read",
    autorita: "proiezione",
    tenant: "ereditato dalla scheda",
    permesso: "n/d",
    canonico: true,
    impatto: "documento fiscale",
  },
  "src/lib/server/document-placeholders.ts": {
    azione: "segnaposto {{parent.N.*}}",
    verso: "read",
    autorita: "proiezione",
    tenant: "ereditato dalla scheda",
    permesso: "n/d",
    canonico: true,
    impatto: "documento",
  },
  "src/lib/server/medical-certificate-reminders.ts": {
    azione: "destinatari dei promemoria",
    verso: "read",
    autorita: "proiezione + registri derivati",
    tenant: "organization_id",
    permesso: "n/d",
    canonico: true,
    impatto: "notifica sanitaria",
  },
  "src/lib/server/document-requests.ts": {
    azione: "destinatari documentali",
    verso: "read",
    autorita: "proiezione + registri derivati",
    tenant: "organization_id",
    permesso: "n/d",
    canonico: true,
    impatto: "notifica",
  },
  "src/lib/health/permissions.ts": {
    azione: "guardia sul dato clinico",
    verso: "read",
    autorita: "proiezione (solo lettura di contorno)",
    tenant: "scope",
    permesso: "clinical.read",
    canonico: false,
    impatto: "dato sanitario",
  },
  "src/lib/server/enrollment-requests.ts": {
    azione: "bozza di rinnovo: precompila con il tutore che apre",
    verso: "read",
    autorita: "proiezione (via primitiva)",
    tenant: "organization_id dallo scope della famiglia",
    permesso: "legame con l'atleta",
    canonico: true,
    /*
      **Non c'era, e il marcatore e la ragione.** Cercava `data.guardians`, e
      qui c'era `asRecord(athlete.data).guardians`: la stessa lettura, con una
      funzione in mezzo. Dentro, la ricerca del tutore leggeva le quattro
      grafie dell'utenza e **non** i marchi, mentre la sua guardia decide sulle
      righe: due oggetti diversi per la stessa domanda.
    */
    impatto: "precompilazione di un modulo",
  },
  "src/lib/athlete-profile-utils.ts": {
    azione: "normalizza le raccolte di una scheda",
    verso: "read",
    autorita: "nessuna (non guarda dentro le voci)",
    tenant: "n/d",
    permesso: "n/d",
    canonico: false,
    impatto: "presentazione",
  },
  "src/components/parent-dashboard/parent-dashboard-types.ts": {
    azione: "forma della risposta dell'area famiglia",
    verso: "read",
    autorita: "nessuna (dichiara un tipo)",
    tenant: "n/d",
    permesso: "n/d",
    canonico: false,
    impatto: "definizione",
  },
  "src/components/parent-dashboard/parent-dashboard-pages.tsx": {
    azione: "area famiglia: elenca i tutori",
    verso: "read",
    autorita: "proiezione (gia filtrata dal server)",
    tenant: "risposta del server",
    permesso: "sessione",
    canonico: false,
    impatto: "presentazione",
  },
  "src/components/forms/AthleteCreateForm.tsx": {
    azione: "bozza di una scheda nuova",
    verso: "read",
    autorita: "nessuna (stato del modulo, non la proiezione)",
    tenant: "n/d",
    permesso: "athletes.create",
    canonico: false,
    impatto: "presentazione",
  },

  "src/lib/server/anagrafica.ts": {
    azione: "scheda anagrafica",
    verso: "read",
    autorita: "proiezione",
    tenant: "scope",
    permesso: "athletes.read",
    canonico: false,
    impatto: "presentazione",
  },
  "src/app/api/v1/documents/[kind]/[id]/route.ts": {
    azione: "documento gia emesso",
    verso: "read",
    autorita: "istantanea congelata",
    tenant: "scope",
    permesso: "documents.read",
    canonico: false,
    impatto: "storico immutabile",
  },
  /* ---------------- le rotte ---------------- */
  "src/app/api/v1/guardian-accounts/[athleteId]/[guardianId]/route.ts": {
    azione: "rotta: scollega un tutore",
    verso: "write",
    autorita: "riga (via primitiva)",
    tenant: "scope della sessione",
    permesso: "accounts.parent.manage",
    canonico: true,
    impatto: "toglie accesso",
  },
  "src/app/api/v1/auth/memberships/activate/route.ts": {
    azione: "rotta: attiva una tessera",
    verso: "read",
    autorita: "proiezione (solo lettura)",
    tenant: "scope della sessione",
    permesso: "sessione",
    canonico: false,
    impatto: "presentazione",
  },

  /* ---------------- le schermate ---------------- */
  "src/app/athletes/[id]/page.tsx": {
    azione: "scheda atleta: mostra e conia inviti",
    verso: "read",
    autorita: "proiezione",
    tenant: "scope della sessione",
    permesso: "athletes.read",
    canonico: false,
    impatto: "presentazione + conio",
  },
  "src/app/trainers/[id]/page.tsx": {
    azione: "scheda allenatore: conia inviti",
    verso: "read",
    autorita: "proiezione",
    tenant: "scope della sessione",
    permesso: "accounts.trainer.manage",
    canonico: false,
    impatto: "conio",
  },
  "src/app/dashboard/access-management/page.tsx": {
    azione: "gestione accessi",
    verso: "read",
    autorita: "proiezione",
    tenant: "scope della sessione",
    permesso: "accounts.club.manage",
    canonico: false,
    impatto: "presentazione",
  },
  "src/app/secretariat/page.tsx": {
    azione: "segreteria",
    verso: "read",
    autorita: "proiezione",
    tenant: "scope della sessione",
    permesso: "athletes.read",
    canonico: false,
    impatto: "presentazione",
  },
  "src/components/parent-dashboard/parent-dashboard-context.tsx": {
    azione: "area famiglia lato client",
    verso: "read",
    autorita: "proiezione",
    tenant: "risposta del server",
    permesso: "sessione",
    canonico: false,
    impatto: "presentazione",
  },
  "src/components/trainer/trainer-athlete-profile-page.tsx": {
    azione: "scheda atleta lato allenatore",
    verso: "read",
    autorita: "proiezione",
    tenant: "risposta del server",
    permesso: "perimetro allenatore",
    canonico: false,
    impatto: "presentazione",
  },

  /* ---------------- vocabolari e registri (nessuna decisione) ---------------- */
  "src/lib/access-roles.ts": {
    azione: "vocabolario dei ruoli e delle risorse",
    verso: "read",
    autorita: "nessuna",
    tenant: "n/d",
    permesso: "n/d",
    canonico: false,
    impatto: "nomina `access_tokens` come risorsa",
  },
  "src/lib/api/registry.ts": {
    azione: "registro degli endpoint",
    verso: "read",
    autorita: "nessuna",
    tenant: "n/d",
    permesso: "n/d",
    canonico: false,
    impatto: "documentazione",
  },
  "src/lib/api-docs/internal-api-registry.ts": {
    azione: "registro interno degli endpoint",
    verso: "read",
    autorita: "nessuna",
    tenant: "n/d",
    permesso: "n/d",
    canonico: false,
    impatto: "documentazione",
  },
  "src/lib/server/audit.ts": {
    azione: "registro degli eventi",
    verso: "write",
    autorita: "nessuna",
    tenant: "organization_id",
    permesso: "n/d",
    canonico: false,
    impatto: "traccia",
  },
  "src/lib/forms/dynamic-fields.ts": {
    azione: "campi dinamici dei moduli",
    verso: "read",
    autorita: "nessuna (definisce i campi)",
    tenant: "n/d",
    permesso: "n/d",
    canonico: false,
    impatto: "definizione",
  },
};

/* ------------------------------------------------------------------ esiti */

/**
 * **La stampa si accende solo quando questo file e il comando.**
 *
 * Importato — dal test di totalita, che deriva le proprie asserzioni da qui
 * invece che da un elenco scritto a mano — il censimento e una funzione che
 * restituisce l'esito e non scrive niente.
 */
const IN_ESECUZIONE =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

const dire = (...righe) => {
  if (IN_ESECUZIONE) console.log(...righe);
};

const esiti = [];
const prova = (titolo, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ titolo, ok, trovato, nota });
  dire(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(66)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) dire(`        nota: ${nota}`);
};

dire("\n=== CENSIMENTO DEL DOMINIO DEI TUTORI ===\n");
dire(
  "  PERCORSO".padEnd(58) +
    "AZIONE".padEnd(34) +
    "VERSO".padEnd(12) +
    "AUTORITA".padEnd(30) +
    "CANONICO",
);
dire("  " + "-".repeat(140));

const elenco = [...trovati.keys()].sort();
for (const percorso of elenco) {
  const voce = TABELLA[percorso];
  const riga =
    "  " +
    percorso.padEnd(56) +
    String(voce?.azione ?? "??? NON CLASSIFICATO").padEnd(34) +
    String(voce?.verso ?? "?").padEnd(12) +
    String(voce?.autorita ?? "?").padEnd(30) +
    (voce?.canonico ? "si" : "no");
  dire(riga);
}

dire("\n=== PROPRIETA ===\n");

/* 1 — il dominio non e cresciuto senza che nessuno lo dicesse */
const nonClassificati = elenco.filter((percorso) => !TABELLA[percorso]);
prova(
  "C1 ogni percorso che tocca il dominio e classificato",
  [],
  nonClassificati,
  "un consumatore nuovo: va classificato qui prima di essere scritto",
);

/* 2 — la tabella non e invecchiata */
const spariti = Object.keys(TABELLA).filter((percorso) => !trovati.has(percorso));
prova(
  "C2 ogni percorso classificato tocca ancora il dominio",
  [],
  spariti,
  "un percorso qui dentro non tocca piu il dominio: la tabella e vecchia",
);

/* 3 — chi deve passare dalle primitive le importa davvero */

/**
 * Dove porta uno specificatore di import, in forma di percorso del repository.
 *
 * Copre le due forme che questo albero usa: l'alias `@/` e il relativo. Non
 * risolve `index.ts` ne le estensioni implicite oltre a `.ts`/`.tsx`, e non
 * serve: i moduli canonici sono file, e sono elencati per nome.
 */
const doveporta = (percorso, specificatore) => {
  const base = specificatore.startsWith("@/")
    ? `src/${specificatore.slice(2)}`
    : specificatore.startsWith(".")
      ? path
          .join(path.dirname(percorso), specificatore)
          .split(path.sep)
          .join("/")
      : null;

  if (!base) return null;
  return [`${base}.ts`, `${base}.tsx`, base].find((forma) =>
    EXPORT_CANONICI.has(forma),
  );
};

/**
 * I nomi che questo file importa **da un modulo canonico**.
 *
 * Un nome che il modulo non esporta non conta: e la differenza fra «importa
 * una primitiva» e «nomina una parola». La stesura prima di questa cercava la
 * parola nel testo, quindi un **commento** che citasse `revokeGuardianRow`
 * bastava a dichiarare canonico un file che si ricostruiva le regole in casa.
 */
const primitiveImportate = (percorso) => {
  const testo = readFileSync(percorso, "utf8");
  const trovate = [];

  const importazioni =
    /import\s+(?:type\s+)?(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?[^;]*?from\s+["']([^"']+)["']/g;

  for (const trovato of testo.matchAll(importazioni)) {
    const modulo = doveporta(percorso, trovato[3]);
    if (!modulo) continue;

    const esportati = EXPORT_CANONICI.get(modulo);
    const nomi = [
      ...(trovato[1] ? [trovato[1]] : []),
      ...(trovato[2] || "")
        .split(",")
        .map((pezzo) => pezzo.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim())
        .filter(Boolean),
    ];

    for (const nome of nomi) {
      if (esportati.has(nome)) trovate.push(`${modulo}#${nome}`);
    }
  }

  return trovate;
};

const senzaPrimitiva = Object.entries(TABELLA)
  .filter(([, voce]) => voce.canonico)
  .filter(([percorso]) => primitiveImportate(percorso).length === 0)
  .map(([percorso]) => percorso);

prova(
  "C3 chi e dichiarato canonico importa una primitiva che esiste davvero",
  [],
  senzaPrimitiva,
  "un consumatore che si ricostruisce le regole in casa",
);

/* 4 — l'autorita ha un solo scrittore */
const scrittoriDellAutorita = elenco.filter((percorso) => {
  if (percorso === "src/lib/server/athlete-guardians.ts") return false;
  const testo = readFileSync(percorso, "utf8");
  return /athleteGuardian\.(create|update|upsert|delete)/.test(testo);
});

prova(
  "C4 nessuno scrive `athlete_guardians` fuori dal modulo proprietario",
  [],
  scrittoriDellAutorita,
  "e l'invariante che il vaglio dell'archivio fa valere: qui si vede prima",
);

/* 5 — nessuno riscrive il predicato dell'esclusione in casa */

/**
 * Il testo senza commenti.
 *
 * Serve perche C5 misura cosa il **codice** fa, non cosa i commenti
 * raccontano: questo pacchetto ha commenti che citano `revoked_at` e
 * `contact_only` per spiegare perche non si leggono piu a mano, e prenderli
 * per una violazione sarebbe punire proprio la documentazione della
 * correzione.
 */
const senzaCommenti = (testo) =>
  testo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const REVOCA = /\baccessRevokedAt\b|\baccess_revoked_at\b|\brevoked_at\b|\brevokedAt\b/;
const SOLO_RECAPITO = /\bcontactOnly\b|\bcontact_only\b/;

/**
 * **Chi nomina tutti e due i marchi sta ripiegando l'OR in casa.**
 *
 * E la firma esatta del difetto che ha tenuto in piedi quindici revisioni:
 * `esclusa = revocata || contactOnly`, scritta a mano in nove file con nove
 * sfumature. Correggerne una lasciava le altre.
 *
 * I moduli canonici sono l'eccezione perche sono **la** definizione; la
 * proiezione lo e perche traduce le colonne nelle chiavi della voce, che e
 * l'unico posto dove le due grafie devono convivere per costruzione.
 */
const ricostruzioni = elenco.filter((percorso) => {
  if (CANONICI.includes(percorso)) return false;
  const codice = senzaCommenti(readFileSync(percorso, "utf8"));
  return REVOCA.test(codice) && SOLO_RECAPITO.test(codice);
});

prova(
  "C5 nessuno fuori dai moduli canonici ripiega l'OR dell'esclusione",
  [],
  ricostruzioni,
  "il predicato e `isGuardianExcluded`: chi lo riscrive lo fa divergere",
);

/* 6 — i numeri, derivati */
const perChiave = {};
for (const chiavi of trovati.values()) {
  for (const chiave of chiavi) perChiave[chiave] = (perChiave[chiave] || 0) + 1;
}

dire("\n=== NUMERI (derivati dall'albero) ===\n");
dire(`  percorsi che toccano il dominio : ${elenco.length}`);
for (const [chiave, quanti] of Object.entries(perChiave).sort()) {
  dire(`  ${chiave.padEnd(30)} : ${quanti}`);
}
dire(
  `  di cui dichiarati canonici     : ${
    Object.values(TABELLA).filter((v) => v.canonico).length
  }`,
);


const ko = esiti.filter((e) => !e.ok).length;
dire(`\nEsito: ${esiti.length - ko}/${esiti.length}\n`);

/**
 * **L'esito, per chi importa questo file.**
 *
 * Il test di totalita deriva le proprie asserzioni da qui: l'elenco dei
 * percorsi che toccano il dominio, la loro classificazione e le cinque
 * proprieta. Non c'e nessuna lista scritta a mano dall'altra parte, ed e la
 * ragione per cui un consumatore nuovo fa fallire i test il giorno in cui
 * viene scritto invece del giorno in cui un cliente perde una revoca.
 */
export const censimento = () => ({
  percorsi: elenco,
  tabella: TABELLA,
  canonici: CANONICI,
  esportati: EXPORT_CANONICI,
  esiti,
  marcatori: Object.fromEntries(trovati),
  numeri: perChiave,
  primitiveImportate,
});

if (IN_ESECUZIONE) process.exit(ko ? 1 : 0);
