#!/usr/bin/env node
/**
 * **D-RD-16 — bonifica delle righe storiche di `athlete_category_memberships`.**
 *
 * Piano: `docs/redesign/D-RD-16-piano-bonifica-appartenenze.md`. Le regole
 * vivono in `scripts/lib/bonifica-appartenenze.mjs` (puro, provato su
 * fixture); qui c'e solo il database, le guardie e i file di uscita.
 *
 * ## Dry-run (default)
 *
 * ```bash
 * node scripts/bonifica-appartenenze-legacy.mjs --club <organization_id>
 * ```
 *
 * Apre solo `SELECT`, senza transazione ne blocchi. Scrive in
 * `.codex-scratch/drd16/<run_id>/` (gitignorato):
 *
 * - `piano.json` — ogni mutazione con tabella, riga, operazione, prima, dopo,
 *   regola, determinismo, motivo; la distribuzione R1/R2/R3/R0; le righe da
 *   rivedere; le `--attese` da passare all'esecuzione;
 * - `prima.json` — l'estratto di **tutte** le righe del club e delle colonne
 *   e proiezioni degli atleti toccati: e il materiale del ritorno;
 * - `inverso.json` — le operazioni inverse, gia scritte;
 * - `validazioni.json` — V1–V5 sullo stato letto e sullo stato simulato dopo,
 *   la prova di idempotenza (il piano sullo stato dopo e vuoto) e la prova di
 *   ritorno (inverso applicato allo stato dopo = stato prima);
 * - `traccia-<riga>.md` — per ogni riga R3, il fascicolo per la conferma;
 * - `report.md` — il riepilogo leggibile.
 *
 * Esce con 0 se il piano e tutto deterministico, con 3 se c'e una riga R0.
 *
 * ## Esecuzione (**non** autorizzata finche qualcuno non lo scrive)
 *
 * Servono **tutte** le condizioni, altrimenti non parte:
 * `--esegui`, `--confermo <organization_id>` uguale a `--club`,
 * `--attese update=…,delete=…,colonne=…` uguali a quelle del dry-run,
 * `--snapshot <branch o snapshot Neon>` creato prima, `--conferma-r3 <id,…>`
 * con **ogni** riga R3 del piano, `--url` con la connection string
 * **diretta** (non il pooler) del branch ammesso, `EASYGAME_DB_ENV` uguale a
 * quel branch e `BONIFICA_APPARTENENZE_AUTORIZZATA=<run_id del dry-run>`.
 * Il branch ammesso e uno solo (`BRANCH_AMMESSI`): un altro bersaglio e una
 * modifica del codice, con la sua autorizzazione.
 *
 * Una transazione per club; blocco delle schede in un lotto crescente
 * (ADR-0138); ricalcolo del piano dentro la transazione e confronto con le
 * attese e con il piano del dry-run; audit nella stessa transazione;
 * V1–V6 prima del `COMMIT`; qualunque scostamento → `ROLLBACK`.
 *
 * ## Ritorno
 *
 * `--annulla <run_id>` con le stesse guardie: applica `inverso.json` (o la
 * tabella di audit) in una transazione.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import pg from "pg";

import {
  applicaInMemoria,
  applicaInversaInMemoria,
  atteseDaConteggi,
  invertiMutazioni,
  leggiAttese,
  pianificaBonifica,
  validaStato,
} from "./lib/bonifica-appartenenze.mjs";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * L'unico bersaglio ammesso in questa versione. La chiave e il valore di
 * `EASYGAME_DB_ENV`, il valore e l'identificativo dell'endpoint Neon che
 * compare nell'host della connection string. Lo staging Fortitudo e la
 * produzione **non** ci sono: aggiungerli e una decisione, non un parametro.
 */
const BRANCH_AMMESSI = Object.freeze({
  "web-redesign-staging": "ep-dry-block-alkxdiiu",
});

const TABELLA_AUDIT = "bonifica_appartenenze_audit";

/* ---------- argomenti ---------- */

const argv = process.argv.slice(2);
const opzione = (nome) => {
  const i = argv.indexOf(nome);
  return i >= 0 ? String(argv[i + 1] ?? "") : "";
};
const flag = (nome) => argv.includes(nome);

const CLUB = opzione("--club");
const ESEGUI = flag("--esegui");
const ANNULLA = opzione("--annulla");
const CONFERMO = opzione("--confermo");
const ATTESE = opzione("--attese");
const SNAPSHOT = opzione("--snapshot");
const CONFERMA_R3 = opzione("--conferma-r3").split(",").map((s) => s.trim()).filter(Boolean);
const OUT = path.resolve(RADICE, opzione("--out") || ".codex-scratch/drd16");
const RUN_ID = opzione("--run-id") || `${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}-${randomUUID().slice(0, 8)}`;
const AMBIENTE = opzione("--ambiente") || "web-redesign-staging";

const esci = (codice, messaggio) => {
  console.error(messaggio);
  process.exit(codice);
};

if (!CLUB) esci(1, "Uso: node scripts/bonifica-appartenenze-legacy.mjs --club <organization_id> [--url <cs>] [--esegui …] [--annulla <run_id>]");
if (ESEGUI && ANNULLA) esci(1, "--esegui e --annulla si escludono.");

/* ---------- connection string e guardia di branch ---------- */

const senzaSegreti = (url) => {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "(connection string non interpretabile)";
  }
};

const urlEsplicita = opzione("--url");
const SCRIVE = ESEGUI || Boolean(ANNULLA);
const URL_DB = urlEsplicita || (SCRIVE ? "" : String(process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim());
if (!URL_DB) esci(1, SCRIVE ? "In scrittura la connection string va passata con --url, esplicitamente." : "Nessuna connection string: --url, DIRECT_URL o DATABASE_URL.");

const endpointAmmesso = BRANCH_AMMESSI[AMBIENTE];
if (!endpointAmmesso) esci(1, `Ambiente «${AMBIENTE}» non previsto: gli ambienti ammessi sono ${Object.keys(BRANCH_AMMESSI).join(", ")}.`);
let host = "";
try { host = new URL(URL_DB).hostname; } catch { esci(1, "Connection string non interpretabile."); }
if (!host.startsWith(`${endpointAmmesso}.`) && !host.startsWith(`${endpointAmmesso}-pooler.`)) {
  esci(1, `Rifiuto: l'host ${host} non e il branch ${AMBIENTE} (${endpointAmmesso}). Questo script non tocca altri branch.`);
}
if (SCRIVE) {
  if (host.includes("-pooler")) esci(1, "In scrittura serve l'endpoint diretto, non il pooler.");
  if (String(process.env.EASYGAME_DB_ENV || "") !== AMBIENTE) esci(1, `In scrittura EASYGAME_DB_ENV deve valere «${AMBIENTE}».`);
}

/* ---------- lettura ---------- */

const client = new pg.Client({ connectionString: URL_DB });
await client.connect();

const q = async (sql, params = []) => (await client.query(sql, params)).rows;

const leggiClub = async (organizationId) => {
  const [club] = await q(`select id, name, categories from clubs where id = $1::uuid`, [organizationId]);
  if (!club) throw new Error(`Club ${organizationId} non trovato.`);
  const catalogo = await q(
    `select payload->>'id' as id, coalesce(payload->>'name', name) as name
       from club_resource_items where organization_id = $1::uuid and resource_type = 'categories' order by created_at`,
    [organizationId],
  );
  /* Il catalogo vive in due posti che `resources.ts` tiene allineati: se non lo sono, non si bonifica niente. */
  const idsColonna = new Set((Array.isArray(club.categories) ? club.categories : []).map((c) => String(c?.id ?? "")).filter(Boolean));
  const idsItems = new Set(catalogo.map((c) => String(c.id)));
  const disallineati = [...idsColonna].filter((id) => !idsItems.has(id)).concat([...idsItems].filter((id) => !idsColonna.has(id)));
  if (disallineati.length) throw new Error(`Catalogo disallineato fra clubs.categories e club_resource_items: ${disallineati.join(", ")}`);

  const righe = await q(
    `select id, organization_id, athlete_id, category_id, category_name, is_primary, site_id, created_at, updated_at
       from athlete_category_memberships where organization_id = $1::uuid order by athlete_id, is_primary desc, created_at, id`,
    [organizationId],
  );
  const atleti = await q(
    `select id, first_name, last_name, category_id, category_name from athletes where organization_id = $1::uuid order by id`,
    [organizationId],
  );
  const gruppi = await q(
    `select payload->>'id' as id, payload->>'categoryId' as category_id, payload->>'siteId' as site_id, payload->>'active' as active
       from club_resource_items where organization_id = $1::uuid and resource_type = 'category_groups'`,
    [organizationId],
  );
  const sedi = await q(
    `select payload->>'id' as id, payload->>'name' as name from club_resource_items where organization_id = $1::uuid and resource_type = 'club_sites'`,
    [organizationId],
  );
  return { club, catalogo, righe, atleti, gruppi, sedi };
};

const serializzaRighe = (righe) => righe.map((r) => ({ ...r, created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at, updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at }));

/* ---------- il fascicolo di una riga R3 ---------- */

const scriviTraccia = (dir, dati, piano, rigaId) => {
  const m = piano.mutazioni.find((x) => x.riga === rigaId && x.tabella === "athlete_category_memberships");
  if (!m) return;
  const atleta = dati.atleti.find((a) => String(a.id) === m.athlete_id);
  const righeAtleta = dati.righe.filter((r) => String(r.athlete_id) === m.athlete_id);
  const nomeSede = (id) => dati.sedi.find((s) => s.id === id)?.name || (id ? "(sede sconosciuta)" : "—");
  const contesto = (categoryId) => {
    const gruppi = dati.gruppi.filter((g) => g.category_id === categoryId);
    return gruppi.length
      ? gruppi.map((g) => `gruppo ${g.id} · sede ${nomeSede(g.site_id)}${g.active === "false" ? " · ARCHIVIATO" : ""}`).join("; ")
      : "nessun gruppo";
  };
  const dopo = applicaInMemoria({ righe: dati.righe, atleti: dati.atleti }, piano.mutazioni);
  const righeAtletaDopo = dopo.righe.filter((r) => String(r.athlete_id) === m.athlete_id);
  const nome = (id) => piano.indice.nomePerId.get(id) || "?";
  const tabella = (righe) => [
    "| riga | category_id | category_name | primaria | site_id |",
    "| --- | --- | --- | --- | --- |",
    ...righe.map((r) => `| \`${r.id}\` | \`${r.category_id}\` | ${r.category_name ?? "—"} | ${r.is_primary ? "sì" : "no"} | ${r.site_id ?? "—"} |`),
  ].join("\n");
  const testo = `# Fascicolo R3 — riga \`${rigaId}\` (CONFERMA A MANO)

Run \`${piano.runId}\` · club ${dati.club.name} (\`${dati.club.id}\`) · generato in dry-run, nessuna scrittura.

## Atleta

\`${m.athlete_id}\` — ${atleta ? `${atleta.first_name ?? ""} ${atleta.last_name ?? ""}`.trim() : "(non trovato)"}
Colonna \`athletes.category_id\`: \`${atleta?.category_id ?? "—"}\` · \`category_name\`: ${atleta?.category_name ?? "—"}

## Righe grezze dell'atleta (prima)

${tabella(righeAtleta)}

## Candidati per il nome «${m.prima.category_id}»

${m.candidati.map((id) => `- \`${id}\` «${nome(id)}» — ${contesto(id)}${id === m.target ? " ← **scelta**" : ""}`).join("\n")}

## Perche R3 sceglie \`${m.target}\`

${m.motivo}

Le altre righe dello stesso atleta, dopo R1/R2:
${piano.mutazioni.filter((x) => x.athlete_id === m.athlete_id && x.riga !== rigaId).map((x) => `- \`${x.riga}\` ${x.operazione} (${x.regola}) → \`${x.target}\`: ${x.motivo}`).join("\n") || "- nessuna"}

## Azione proposta

**${m.operazione}** su \`${m.tabella}\` riga \`${m.riga}\`${m.gemella ? ` — copia della riga \`${m.gemella}\`` : ""}.
Determinismo: ${m.determinismo}. Conferma manuale: **richiesta** (\`--conferma-r3 ${rigaId}\`).

## Righe dell'atleta dopo (simulate)

${tabella(righeAtletaDopo)}

## Cosa direbbe l'alternativa

Se l'atleta fosse davvero in **entrambe** le «${nome(m.candidati[0])}» (una per sede), la riga andrebbe **aggiornata** a \`${m.candidati.find((c) => c !== m.target)}\` e non cancellata. Il piano non lo sa: lo sa il club. Senza conferma la riga non si tocca.
`;
  fs.writeFileSync(path.join(dir, `traccia-${rigaId}.md`), testo);
};

/* ---------- dry-run ---------- */

const dryRun = async () => {
  const dati = await leggiClub(CLUB);
  const righe = serializzaRighe(dati.righe);
  const stato = { organizationId: CLUB, catalogo: dati.catalogo, righe, atleti: dati.atleti };
  const piano = pianificaBonifica(stato);
  piano.runId = RUN_ID;

  const dopo = applicaInMemoria(stato, piano.mutazioni);
  const statoDopo = { organizationId: CLUB, catalogo: dati.catalogo, ...dopo };
  const validazioniPrima = validaStato(stato);
  const validazioniDopo = validaStato(statoDopo, {
    V1: 0,
    V2: piano.conteggi.righeDopoAttese,
    V3: righe.filter((r) => r.is_primary).length,
    V4: 0,
    V5: 0,
  });

  /* Idempotenza: il piano sullo stato dopo deve essere vuoto. */
  const secondo = pianificaBonifica(statoDopo);
  const idempotente = secondo.mutazioni.length === 0 && secondo.revisione.length === 0;

  /* Ritorno: l'inverso applicato allo stato dopo restituisce lo stato prima. */
  const inverso = invertiMutazioni(piano.mutazioni);
  const tornato = applicaInversaInMemoria(dopo, inverso);
  const chiave = (rs) => JSON.stringify([...rs].sort((a, b) => String(a.id).localeCompare(String(b.id))));
  const ritornoEsatto = chiave(tornato.righe) === chiave(righe) && chiave(tornato.atleti) === chiave(dati.atleti);

  const dir = path.join(OUT, RUN_ID);
  fs.mkdirSync(dir, { recursive: true });

  const atletiToccati = new Set(piano.mutazioni.map((m) => m.athlete_id).concat(piano.revisione.map((r) => r.athlete_id)));
  const proiezioni = atletiToccati.size
    ? await q(`select id, category_id, category_name, data->'categories' as categories, data->'categoryMemberships' as category_memberships from athletes where id = any($1::uuid[])`, [[...atletiToccati]])
    : [];

  const { indice, ...pianoSerializzabile } = piano;
  fs.writeFileSync(path.join(dir, "piano.json"), JSON.stringify({
    ...pianoSerializzabile,
    modalita: "dry-run",
    ambiente: AMBIENTE,
    database: senzaSegreti(URL_DB),
    club: { id: dati.club.id, name: dati.club.name },
    catalogo: dati.catalogo,
    attese: atteseDaConteggi(piano.conteggi),
    snapshot: SNAPSHOT || null,
    generato: new Date().toISOString(),
  }, null, 2));
  fs.writeFileSync(path.join(dir, "prima.json"), JSON.stringify({ righe, atleti: dati.atleti, proiezioni }, null, 2));
  fs.writeFileSync(path.join(dir, "inverso.json"), JSON.stringify(inverso, null, 2));
  fs.writeFileSync(path.join(dir, "validazioni.json"), JSON.stringify({ prima: validazioniPrima, dopoSimulato: validazioniDopo, idempotente, secondoPiano: { mutazioni: secondo.mutazioni.length, revisione: secondo.revisione.length }, ritornoEsatto }, null, 2));
  for (const id of piano.daConfermare) scriviTraccia(dir, dati, piano, id);

  const righeReport = [
    `# D-RD-16 — dry-run \`${RUN_ID}\``,
    "",
    `Club **${dati.club.name}** (\`${dati.club.id}\`) · database \`${senzaSegreti(URL_DB)}\` · ambiente \`${AMBIENTE}\` · **nessuna scrittura**.`,
    SNAPSHOT ? `Copia di sicurezza dichiarata: \`${SNAPSHOT}\`.` : "Copia di sicurezza: non dichiarata (`--snapshot`).",
    "",
    "## Conteggi",
    "",
    "| misura | valore |", "| --- | ---: |",
    `| righe del club prima | ${piano.conteggi.righePrima} |`,
    `| righe storiche (fuori catalogo) | ${piano.conteggi.storiche} |`,
    `| UPDATE category_id | ${piano.conteggi.update} |`,
    `| UPDATE sulla gemella (primaria/sede trasferita) | ${piano.conteggi.updateGemella} |`,
    `| DELETE (copie) | ${piano.conteggi.delete} |`,
    `| UPDATE athletes.category_id | ${piano.conteggi.colonne} |`,
    `| righe attese dopo | ${piano.conteggi.righeDopoAttese} |`,
    `| righe R0 (da rivedere, non toccate) | ${piano.conteggi.revisione} |`,
    "",
    `Distribuzione: R1 ${piano.distribuzione.R1} · R2 ${piano.distribuzione.R2} · R3 ${piano.distribuzione.R3} (conferma a mano: ${piano.daConfermare.map((id) => `\`${id}\``).join(", ") || "nessuna"}) · R0 ${piano.distribuzione.R0}`,
    "",
    `\`--attese ${atteseDaConteggi(piano.conteggi)}\``,
    "",
    "## Validazioni (stato letto → stato simulato dopo)",
    "",
    "| controllo | prima | dopo | atteso | esito |", "| --- | ---: | ---: | ---: | --- |",
    ...validazioniDopo.map((v, i) => `| ${v.nome} | ${validazioniPrima[i].valore} | ${v.valore} | ${v.atteso ?? "—"} | ${v.ok ? "OK" : "**KO**"} |`),
    "| V6 audit fuori club | — | — | 0 | n/a in dry-run (la tabella di audit nasce in esecuzione) |",
    "",
    `Idempotenza: secondo piano sullo stato dopo → ${secondo.mutazioni.length} mutazioni, ${secondo.revisione.length} revisioni → **${idempotente ? "OK" : "KO"}**.`,
    `Ritorno: inverso applicato allo stato dopo = stato prima → **${ritornoEsatto ? "OK" : "KO"}** (${inverso.length} operazioni in \`inverso.json\`).`,
    "",
    "## Mutazioni per etichetta",
    "",
    "| etichetta | regola | target | UPDATE | DELETE |", "| --- | --- | --- | ---: | ---: |",
    ...Object.entries(piano.mutazioni.filter((m) => m.tabella === "athlete_category_memberships" && (m.operazione === "DELETE" || m.campi?.category_id)).reduce((acc, m) => {
      const k = `${m.prima.category_id}|${m.regola}|${m.target}`;
      acc[k] = acc[k] || { u: 0, d: 0 };
      acc[k][m.operazione === "DELETE" ? "d" : "u"] += 1;
      return acc;
    }, {})).sort((a, b) => (b[1].u + b[1].d) - (a[1].u + a[1].d)).map(([k, v]) => { const [e, r, t] = k.split("|"); return `| ${e} | ${r} | \`${t}\` | ${v.u} | ${v.d} |`; }),
    "",
    piano.revisione.length ? ["## Righe R0 (non si toccano)", "", ...piano.revisione.map((r) => `- \`${r.tabella}\` \`${r.riga}\` «${r.etichetta}»: ${r.motivo}`), ""].join("\n") : "",
    "## Ogni mutazione",
    "",
    "| # | tabella | riga | op | prima | dopo | regola | determinismo | conferma | motivo |", "| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...piano.mutazioni.map((m, i) => `| ${i + 1} | ${m.tabella} | \`${m.riga}\` | ${m.operazione} | ${m.tabella === "athletes" ? `\`${m.prima.category_id}\`` : `\`${m.prima.category_id}\` (${m.prima.is_primary ? "P" : "s"})`} | ${m.dopo ? `\`${m.dopo.category_id}\`${m.campi && !m.campi.category_id ? ` ${JSON.stringify(m.campi)}` : ""}` : "—"} | ${m.regola} | ${m.determinismo} | ${m.confermaManuale ? "**sì**" : "no"} | ${m.motivo} |`),
    "",
  ];
  fs.writeFileSync(path.join(dir, "report.md"), righeReport.join("\n"));

  console.log(righeReport.slice(0, righeReport.indexOf("## Mutazioni per etichetta")).join("\n"));
  console.log(`\nFile in ${dir}`);
  return piano.revisione.length ? 3 : 0;
};

/* ---------- esecuzione (guardata; non autorizzata finche non lo e) ---------- */

const guardieScrittura = (pianoDryRun) => {
  const errori = [];
  if (CONFERMO !== CLUB) errori.push("--confermo deve ripetere esattamente --club.");
  if (!ATTESE) errori.push("--attese mancante.");
  if (!SNAPSHOT) errori.push("--snapshot mancante: prima la copia di sicurezza.");
  const runAutorizzato = String(process.env.BONIFICA_APPARTENENZE_AUTORIZZATA || "");
  if (!runAutorizzato) errori.push("BONIFICA_APPARTENENZE_AUTORIZZATA mancante: va impostata al run_id del dry-run approvato.");
  if (runAutorizzato && (!pianoDryRun || pianoDryRun.runId !== runAutorizzato)) errori.push(`Il dry-run ${runAutorizzato} non e in ${OUT}.`);
  if (pianoDryRun) {
    if (pianoDryRun.club?.id !== CLUB) errori.push("Il dry-run approvato riguarda un altro club.");
    if (pianoDryRun.attese !== ATTESE) errori.push(`--attese (${ATTESE}) diverse da quelle del dry-run (${pianoDryRun.attese}).`);
    if (pianoDryRun.revisione?.length) errori.push(`Il dry-run ha ${pianoDryRun.revisione.length} righe R0: si risolvono prima.`);
    const mancanti = (pianoDryRun.daConfermare || []).filter((id) => !CONFERMA_R3.includes(id));
    if (mancanti.length) errori.push(`Righe R3 non confermate con --conferma-r3: ${mancanti.join(", ")}.`);
    const estranee = CONFERMA_R3.filter((id) => !(pianoDryRun.daConfermare || []).includes(id));
    if (estranee.length) errori.push(`--conferma-r3 cita righe che non sono R3 nel dry-run: ${estranee.join(", ")}.`);
  }
  return errori;
};

const leggiPianoDryRun = () => {
  const runId = String(process.env.BONIFICA_APPARTENENZE_AUTORIZZATA || "");
  const file = path.join(OUT, runId, "piano.json");
  if (!runId || !fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
};

const esegui = async () => {
  const pianoDryRun = leggiPianoDryRun();
  const errori = guardieScrittura(pianoDryRun);
  if (errori.length) esci(1, ["Esecuzione rifiutata:", ...errori.map((e) => `  - ${e}`)].join("\n"));
  const attese = leggiAttese(ATTESE);

  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL statement_timeout = '60s'");
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query(`CREATE TABLE IF NOT EXISTS ${TABELLA_AUDIT} (
      id uuid primary key default gen_random_uuid(),
      run_id text not null,
      organization_id uuid not null,
      tabella text not null,
      riga_id uuid not null,
      operazione text not null,
      regola text not null,
      prima jsonb,
      dopo jsonb,
      eseguita_at timestamptz not null default now(),
      unique (run_id, tabella, riga_id, operazione)
    )`);

    /* I blocchi: le schede toccate, in un lotto solo, crescente (ADR-0138). */
    const dati = await leggiClub(CLUB);
    const righe = serializzaRighe(dati.righe);
    const anteprima = pianificaBonifica({ organizationId: CLUB, catalogo: dati.catalogo, righe, atleti: dati.atleti });
    const atletiToccati = [...new Set(anteprima.mutazioni.map((m) => m.athlete_id))].sort();
    await client.query(`SELECT id FROM athletes WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [atletiToccati]);

    /* Con i blocchi in mano si rilegge e si ripianifica: e questo il piano che si esegue. */
    const bloccati = await leggiClub(CLUB);
    const righeBloccate = serializzaRighe(bloccati.righe);
    const stato = { organizationId: CLUB, catalogo: bloccati.catalogo, righe: righeBloccate, atleti: bloccati.atleti };
    const piano = pianificaBonifica(stato);
    if (piano.revisione.length) throw Object.assign(new Error(`Righe R0 dentro la transazione: ${piano.revisione.length}`), { codice: 3 });
    if (piano.conteggi.update !== attese.update || piano.conteggi.delete !== attese.delete || piano.conteggi.colonne !== attese.colonne) {
      throw Object.assign(new Error(`Conteggi diversi dalle attese: ${atteseDaConteggi(piano.conteggi)} ≠ ${ATTESE}`), { codice: 2 });
    }
    const firma = (ms) => ms.map((m) => `${m.tabella}:${m.riga}:${m.operazione}:${m.target}`).sort().join("\n");
    if (firma(piano.mutazioni) !== firma(pianoDryRun.mutazioni)) {
      throw Object.assign(new Error("Il piano ricalcolato con i blocchi non coincide con il dry-run approvato: lo stato e cambiato."), { codice: 2 });
    }
    const nonConfermate = piano.daConfermare.filter((id) => !CONFERMA_R3.includes(id));
    if (nonConfermate.length) throw Object.assign(new Error(`R3 non confermate: ${nonConfermate.join(", ")}`), { codice: 3 });

    for (const m of piano.mutazioni) {
      if (m.tabella === "athlete_category_memberships" && m.operazione === "UPDATE") {
        const chiavi = Object.keys(m.campi);
        const set = chiavi.map((k, i) => `${k} = $${i + 2}`).join(", ");
        const r = await client.query(`UPDATE athlete_category_memberships SET ${set}, updated_at = now() WHERE id = $1::uuid AND organization_id = $${chiavi.length + 2}::uuid`, [m.riga, ...chiavi.map((k) => m.campi[k]), CLUB]);
        if (r.rowCount !== 1) throw Object.assign(new Error(`UPDATE su ${m.riga}: ${r.rowCount} righe`), { codice: 4 });
      } else if (m.tabella === "athlete_category_memberships" && m.operazione === "DELETE") {
        const r = await client.query(`DELETE FROM athlete_category_memberships WHERE id = $1::uuid AND organization_id = $2::uuid AND category_id = $3`, [m.riga, CLUB, m.prima.category_id]);
        if (r.rowCount !== 1) throw Object.assign(new Error(`DELETE su ${m.riga}: ${r.rowCount} righe`), { codice: 4 });
      } else if (m.tabella === "athletes") {
        const r = await client.query(`UPDATE athletes SET category_id = $2, category_name = $3, updated_at = now() WHERE id = $1::uuid AND organization_id = $4::uuid`, [m.riga, m.campi.category_id, m.campi.category_name, CLUB]);
        if (r.rowCount !== 1) throw Object.assign(new Error(`UPDATE athletes ${m.riga}: ${r.rowCount} righe`), { codice: 4 });
      }
      await client.query(
        `INSERT INTO ${TABELLA_AUDIT} (run_id, organization_id, tabella, riga_id, operazione, regola, prima, dopo) VALUES ($1, $2::uuid, $3, $4::uuid, $5, $6, $7::jsonb, $8::jsonb) ON CONFLICT DO NOTHING`,
        [RUN_ID, CLUB, m.tabella, m.riga, m.operazione, m.regola, JSON.stringify(m.prima), JSON.stringify(m.dopo)],
      );
    }

    /* V1–V6 in SQL, dentro la transazione. */
    const v = async (sql, params) => Number((await client.query(sql, params)).rows[0].n);
    const fuoriCatalogo = `select count(*)::int n from athlete_category_memberships m where m.organization_id = $1::uuid and not exists (select 1 from club_resource_items c where c.organization_id = m.organization_id and c.resource_type = 'categories' and c.payload->>'id' = m.category_id)`;
    const controlli = [
      ["V1", await v(fuoriCatalogo, [CLUB]), 0],
      ["V2", await v(`select count(*)::int n from athlete_category_memberships where organization_id = $1::uuid`, [CLUB]), piano.conteggi.righeDopoAttese],
      ["V3", await v(`select count(*)::int n from athlete_category_memberships where organization_id = $1::uuid and is_primary`, [CLUB]), righeBloccate.filter((r) => r.is_primary).length],
      ["V3b", await v(`select count(*)::int n from (select athlete_id from athlete_category_memberships where organization_id = $1::uuid group by 1 having count(*) filter (where is_primary) <> 1) s`, [CLUB]), 0],
      ["V4", await v(`select count(*)::int n from athletes a where a.organization_id = $1::uuid and a.category_id is not null and not exists (select 1 from club_resource_items c where c.organization_id = a.organization_id and c.resource_type = 'categories' and c.payload->>'id' = a.category_id)`, [CLUB]), 0],
      ["V5", await v(`select count(*)::int n from athletes a join athlete_category_memberships m on m.athlete_id = a.id and m.is_primary where a.organization_id = $1::uuid and a.category_id is distinct from m.category_id`, [CLUB]), 0],
      ["V6", await v(`select count(*)::int n from ${TABELLA_AUDIT} where run_id = $1 and organization_id <> $2::uuid`, [RUN_ID, CLUB]), 0],
    ];
    const falliti = controlli.filter(([, valore, atteso]) => valore !== atteso);
    if (falliti.length) throw Object.assign(new Error(`Validazioni fallite: ${falliti.map(([n, v2, a]) => `${n}=${v2}≠${a}`).join(", ")}`), { codice: 4 });

    await client.query("COMMIT");
    const dir = path.join(OUT, RUN_ID);
    fs.mkdirSync(dir, { recursive: true });
    /* Il pacchetto di ritorno vive sotto il run_id eseguito: `--annulla <RUN_ID>` lo trova qui. */
    for (const nome of ["piano.json", "prima.json", "inverso.json"]) {
      const sorgente = path.join(OUT, pianoDryRun.runId, nome);
      if (fs.existsSync(sorgente) && sorgente !== path.join(dir, nome)) fs.copyFileSync(sorgente, path.join(dir, nome));
    }
    fs.writeFileSync(path.join(dir, "esecuzione.json"), JSON.stringify({ runId: RUN_ID, dryRun: pianoDryRun.runId, snapshot: SNAPSHOT, club: CLUB, conteggi: piano.conteggi, controlli, eseguito: new Date().toISOString() }, null, 2));
    console.log(`COMMIT. ${piano.mutazioni.length} mutazioni, audit in ${TABELLA_AUDIT} con run_id ${RUN_ID}.`);
    return 0;
  } catch (errore) {
    await client.query("ROLLBACK");
    console.error(`ROLLBACK: ${errore.message}`);
    return errore.codice || 1;
  }
};

/* ---------- ritorno ---------- */

const annulla = async () => {
  const file = path.join(OUT, ANNULLA, "inverso.json");
  const errori = [];
  if (CONFERMO !== CLUB) errori.push("--confermo deve ripetere esattamente --club.");
  if (!fs.existsSync(file)) errori.push(`Manca ${file}.`);
  if (String(process.env.BONIFICA_APPARTENENZE_AUTORIZZATA || "") !== ANNULLA) errori.push("BONIFICA_APPARTENENZE_AUTORIZZATA deve valere il run_id da annullare.");
  if (errori.length) esci(1, ["Ritorno rifiutato:", ...errori.map((e) => `  - ${e}`)].join("\n"));
  const inverso = JSON.parse(fs.readFileSync(file, "utf8"));

  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL statement_timeout = '60s'");
    await client.query("SET LOCAL lock_timeout = '10s'");
    const atleti = [...new Set(inverso.map((op) => (op.tabella === "athletes" ? op.riga : op.valori?.athlete_id || null)).filter(Boolean))].sort();
    if (atleti.length) await client.query(`SELECT id FROM athletes WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [atleti]);
    for (const op of inverso) {
      if (op.tabella === "athlete_category_memberships" && op.operazione === "INSERT") {
        const v2 = op.valori;
        const r = await client.query(
          `INSERT INTO athlete_category_memberships (id, organization_id, athlete_id, category_id, category_name, is_primary, site_id, created_at, updated_at)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz) ON CONFLICT (id) DO NOTHING`,
          [v2.id, v2.organization_id, v2.athlete_id, v2.category_id, v2.category_name, Boolean(v2.is_primary), v2.site_id, v2.created_at, v2.updated_at],
        );
        if (r.rowCount !== 1) throw new Error(`INSERT di ritorno su ${op.riga}: ${r.rowCount} righe (gia presente?)`);
        if (String(v2.organization_id) !== CLUB) throw new Error(`Riga di ritorno di un altro club: ${op.riga}`);
      } else if (op.tabella === "athlete_category_memberships") {
        const chiavi = Object.keys(op.campi);
        const set = chiavi.map((k, i) => `${k} = $${i + 2}`).join(", ");
        const r = await client.query(`UPDATE athlete_category_memberships SET ${set}, updated_at = now() WHERE id = $1::uuid AND organization_id = $${chiavi.length + 2}::uuid`, [op.riga, ...chiavi.map((k) => op.campi[k]), CLUB]);
        if (r.rowCount !== 1) throw new Error(`UPDATE di ritorno su ${op.riga}: ${r.rowCount} righe`);
      } else {
        const r = await client.query(`UPDATE athletes SET category_id = $2, category_name = $3, updated_at = now() WHERE id = $1::uuid AND organization_id = $4::uuid`, [op.riga, op.campi.category_id, op.campi.category_name, CLUB]);
        if (r.rowCount !== 1) throw new Error(`UPDATE athletes di ritorno ${op.riga}: ${r.rowCount} righe`);
      }
    }
    await client.query(`INSERT INTO ${TABELLA_AUDIT} (run_id, organization_id, tabella, riga_id, operazione, regola, prima, dopo) VALUES ($1, $2::uuid, 'run', $3::uuid, 'ANNULLA', 'ritorno', $4::jsonb, null) ON CONFLICT DO NOTHING`, [`${ANNULLA}:annulla`, CLUB, randomUUID(), JSON.stringify({ annullato: ANNULLA, operazioni: inverso.length })]);
    await client.query("COMMIT");
    console.log(`COMMIT: ritorno di ${ANNULLA}, ${inverso.length} operazioni.`);
    return 0;
  } catch (errore) {
    await client.query("ROLLBACK");
    console.error(`ROLLBACK: ${errore.message}`);
    return 1;
  }
};

/* ---------- main ---------- */

let codice = 1;
try {
  codice = ESEGUI ? await esegui() : ANNULLA ? await annulla() : await dryRun();
} catch (errore) {
  console.error(errore?.message || errore);
  codice = 1;
} finally {
  await client.end();
}
process.exit(codice);
