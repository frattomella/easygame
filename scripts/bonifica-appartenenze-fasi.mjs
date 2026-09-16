#!/usr/bin/env node
/**
 * **D-RD-16, fasi B e C — nomi stantii e proiezioni di `athletes.data`.**
 *
 * Piano: `docs/redesign/D-RD-16-piano-bonifica-appartenenze.md` §11. Le regole
 * vivono in `scripts/lib/bonifica-fasi.mjs` (pure, provate su fixture); le
 * guardie in `scripts/lib/bonifica-guardie.mjs` (le stesse della fase A).
 * Serve il caricatore dei tipi, perche la fase B usa le funzioni vere
 * dell'applicazione:
 *
 * ```bash
 * node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *   scripts/bonifica-appartenenze-fasi.mjs --fase nomi|proiezioni --club <organization_id>
 * ```
 *
 * ## Dry-run (default)
 *
 * Solo `SELECT`. Scrive in `.codex-scratch/drd16/<run_id>/`: `piano.json`,
 * `prima.json`, `inverso.json`, `validazioni.json`, `report.md`. Esce con 0
 * se tutto e deterministico, con 3 se c'e una riga REVIEW.
 *
 * ## Esecuzione
 *
 * Tutte le condizioni della fase A: `--esegui`, `--confermo <club>`,
 * `--attese update=N`, `--snapshot <branch>`, `--url` diretta,
 * `EASYGAME_DB_ENV`, `BONIFICA_APPARTENENZE_AUTORIZZATA=<run_id del dry-run>`
 * della **stessa fase**. Una transazione, blocchi crescenti sulle schede,
 * piano ricalcolato e identico al dry-run, audit nella transazione, gli
 * invarianti di D-RD-16 (V1–V5) piu la misura della fase = 0 e V6, poi COMMIT.
 * La fase C va **prima** della B: la B copia i nomi delle righe.
 *
 * ## Ritorno: `--annulla <run_id>` con le stesse guardie.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import pg from "pg";

import {
  applicaFaseInMemoria,
  applicaInversaFaseInMemoria,
  canonico,
  firmaProiezione,
  invertiFase,
  misuraFasi,
  pianificaNomiStantii,
  pianificaProiezioni,
} from "./lib/bonifica-fasi.mjs";
import { validaStato } from "./lib/bonifica-appartenenze.mjs";
import { buildClubCategoryOptions } from "../src/lib/category-utils.ts";
import {
  SQL_TABELLA_AUDIT,
  TABELLA_AUDIT,
  motiviDiRifiutoDelBersaglio,
  senzaSegreti,
} from "./lib/bonifica-guardie.mjs";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opzione = (nome) => { const i = argv.indexOf(nome); return i >= 0 ? String(argv[i + 1] ?? "") : ""; };
const flag = (nome) => argv.includes(nome);

const FASE = opzione("--fase");
const CLUB = opzione("--club");
const ESEGUI = flag("--esegui");
const ANNULLA = opzione("--annulla");
const CONFERMO = opzione("--confermo");
const ATTESE = opzione("--attese");
const SNAPSHOT = opzione("--snapshot");
const OUT = path.resolve(RADICE, opzione("--out") || ".codex-scratch/drd16");
const RUN_ID = opzione("--run-id") || `${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}-${FASE}-${randomUUID().slice(0, 8)}`;
const AMBIENTE = opzione("--ambiente") || "web-redesign-staging";

const esci = (codice, messaggio) => { console.error(messaggio); process.exit(codice); };

if (!["nomi", "proiezioni"].includes(FASE)) esci(1, "Uso: … --fase nomi|proiezioni --club <organization_id> [--url <cs>] [--esegui …] [--annulla <run_id>]");
if (!CLUB) esci(1, "--club mancante.");
if (ESEGUI && ANNULLA) esci(1, "--esegui e --annulla si escludono.");

const SCRIVE = ESEGUI || Boolean(ANNULLA);
const URL_DB = opzione("--url") || (SCRIVE ? "" : String(process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim());
if (!URL_DB) esci(1, SCRIVE ? "In scrittura la connection string va passata con --url, esplicitamente." : "Nessuna connection string: --url, DIRECT_URL o DATABASE_URL.");
const rifiuti = motiviDiRifiutoDelBersaglio({ url: URL_DB, ambiente: AMBIENTE, scrive: SCRIVE });
if (rifiuti.length) esci(1, rifiuti.join("\n"));

const client = new pg.Client({ connectionString: URL_DB });
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

const iso = (v) => (v instanceof Date ? v.toISOString() : v);

const leggiClub = async (organizationId) => {
  const [club] = await q(`select id, name, categories from clubs where id = $1::uuid`, [organizationId]);
  if (!club) throw new Error(`Club ${organizationId} non trovato.`);
  const items = await q(
    `select id, name, payload from club_resource_items where organization_id = $1::uuid and resource_type = 'categories' order by created_at`,
    [organizationId],
  );
  const resourceCategories = items.map((i) => ({ ...(i.payload || {}), id: String(i.payload?.id || i.id), name: String(i.payload?.name || i.name || "") }));
  /* Il catalogo dalle due sorgenti che `resources.ts` tiene allineate, come il vaglio del server (revisione ostile B10). */
  const catalogo = buildClubCategoryOptions({
    clubCategories: Array.isArray(club.categories) ? club.categories : [],
    resourceCategories,
  })
    .filter((voce) => voce.configured !== false)
    .map((voce) => ({ id: String(voce.id), name: String(voce.name ?? "") }));
  const righe = (await q(
    `select id, organization_id, athlete_id, category_id, category_name, is_primary, site_id, created_at, updated_at
       from athlete_category_memberships where organization_id = $1::uuid order by athlete_id, is_primary desc, created_at, id`,
    [organizationId],
  )).map((r) => ({ ...r, created_at: iso(r.created_at), updated_at: iso(r.updated_at) }));
  const atleti = await q(`select id, category_id, category_name, data from athletes where organization_id = $1::uuid order by id`, [organizationId]);
  return { club, clubCategories: Array.isArray(club.categories) ? club.categories : [], resourceCategories, catalogo, righe, atleti };
};

const pianifica = (dati) =>
  FASE === "nomi"
    ? pianificaNomiStantii({ organizationId: CLUB, catalogo: dati.catalogo, righe: dati.righe })
    : pianificaProiezioni({ organizationId: CLUB, clubCategories: dati.clubCategories, resourceCategories: dati.resourceCategories, righe: dati.righe, atleti: dati.atleti });

/**
 * **I nomi che la fase C ritira sono ancora un alias per qualcuno?** (revisione
 * ostile B6). Allenamenti, gare, programma settimanale ed eventi possono
 * portare la categoria per nome: se uno di loro dice «Scoiattoli S. Cosma»,
 * dopo la fase C non risolverebbe piu. Si conta, e se c'e anche uno solo la
 * fase e REVIEW.
 */
const referentiDeiNomi = async (organizationId, nomi) => {
  if (!nomi.length) return [];
  const trovati = [];
  for (const colonna of ["trainings", "matches", "weekly_schedule"]) {
    const [r] = await q(
      `select count(*)::int n from clubs, jsonb_array_elements(case when jsonb_typeof(${colonna}) = 'array' then ${colonna} else '[]'::jsonb end) e
         where id = $1::uuid and (e->>'category' = any($2) or e->>'categoryName' = any($2) or e->>'category_name' = any($2) or e->>'categoryId' = any($2))`,
      [organizationId, nomi],
    );
    if (r.n) trovati.push(`clubs.${colonna}: ${r.n}`);
  }
  const items = await q(
    `select resource_type, count(*)::int n from club_resource_items where organization_id = $1::uuid
       and (payload->>'category' = any($2) or payload->>'categoryName' = any($2) or payload->>'category_name' = any($2) or payload->>'categoryId' = any($2)) group by 1`,
    [organizationId, nomi],
  );
  for (const r of items) trovati.push(`club_resource_items.${r.resource_type}: ${r.n}`);
  const [eventi] = await q(
    `select count(*)::int n from club_events where organization_id = $1::uuid and (category_id = any($2) or category_name = any($2))`,
    [organizationId, nomi],
  ).catch(() => [{ n: 0 }]);
  if (eventi.n) trovati.push(`club_events: ${eventi.n}`);
  return trovati;
};

const firma = (mutazioni) => mutazioni.map((m) => `${m.tabella}:${m.riga}:${m.operazione}:${canonico(m.campi)}`).sort().join("\n");

const validaInvariantiDRD16 = (dati) => {
  const attesePrima = validaStato({ organizationId: CLUB, catalogo: dati.catalogo, righe: dati.righe, atleti: dati.atleti });
  return attesePrima;
};

/* ---------- dry-run ---------- */

const dryRun = async () => {
  const dati = await leggiClub(CLUB);
  const piano = pianifica(dati);
  piano.runId = RUN_ID;
  if (FASE === "nomi") {
    const nomiRitirati = [...new Set(piano.mutazioni.map((m) => String(m.prima.category_name ?? "")).filter(Boolean))];
    const referenti = await referentiDeiNomi(CLUB, nomiRitirati);
    piano.referenti = referenti;
    if (referenti.length) {
      piano.revisione.push({ tabella: "clubs", riga: CLUB, regola: "REVIEW", motivo: `i nomi ritirati sono ancora citati da: ${referenti.join("; ")}`, prima: null });
    }
  }
  const dopo = applicaFaseInMemoria(dati, piano.mutazioni);
  const datiDopo = { ...dati, ...dopo };

  const invariantiPrima = validaInvariantiDRD16(dati);
  const invariantiDopo = validaInvariantiDRD16(datiDopo);
  const misuraPrima = misuraFasi({ organizationId: CLUB, clubCategories: dati.clubCategories, resourceCategories: dati.resourceCategories, catalogo: dati.catalogo, righe: dati.righe, atleti: dati.atleti });
  const misuraDopo = misuraFasi({ organizationId: CLUB, clubCategories: dati.clubCategories, resourceCategories: dati.resourceCategories, catalogo: dati.catalogo, righe: dopo.righe, atleti: dopo.atleti });
  const secondo = pianifica(datiDopo);
  const idempotente = secondo.mutazioni.length === 0 && secondo.revisione.length === 0;
  const inverso = invertiFase(piano.mutazioni);
  const tornato = applicaInversaFaseInMemoria(dopo, inverso);
  const chiave = (rs) => canonico([...rs].sort((a, b) => String(a.id).localeCompare(String(b.id))));
  const ritornoEsatto = chiave(tornato.righe) === chiave(dati.righe) && chiave(tornato.atleti) === chiave(dati.atleti);
  const invariantiTenuti = invariantiDopo.every((v, i) => v.valore === invariantiPrima[i].valore);

  const dir = path.join(OUT, RUN_ID);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "piano.json"), JSON.stringify({ ...piano, modalita: "dry-run", ambiente: AMBIENTE, database: senzaSegreti(URL_DB), club: { id: dati.club.id, name: dati.club.name }, attese: `update=${piano.mutazioni.length}`, snapshot: SNAPSHOT || null, generato: new Date().toISOString() }, null, 2));
  fs.writeFileSync(path.join(dir, "prima.json"), JSON.stringify({ righe: dati.righe, atleti: dati.atleti }, null, 2));
  fs.writeFileSync(path.join(dir, "inverso.json"), JSON.stringify(inverso, null, 2));
  fs.writeFileSync(path.join(dir, "validazioni.json"), JSON.stringify({ invariantiPrima, invariantiDopo, invariantiTenuti, misuraPrima, misuraDopo, idempotente, secondoPiano: { mutazioni: secondo.mutazioni.length, revisione: secondo.revisione.length }, ritornoEsatto }, null, 2));

  const perEtichetta = FASE === "nomi"
    ? Object.entries(piano.mutazioni.reduce((acc, m) => { const k = `${m.prima.category_id}|${m.prima.category_name}|${m.dopo.category_name}`; acc[k] = (acc[k] || 0) + 1; return acc; }, {})).map(([k, n]) => { const [id, da, a] = k.split("|"); return `| \`${id}\` | ${da} | ${a} | ${n} |`; })
    : [];
  const report = [
    `# D-RD-16 fase ${FASE === "nomi" ? "C — nomi stantii" : "B — proiezioni athletes.data"} — dry-run \`${RUN_ID}\``,
    "",
    `Club **${dati.club.name}** (\`${dati.club.id}\`) · database \`${senzaSegreti(URL_DB)}\` · ambiente \`${AMBIENTE}\` · **nessuna scrittura**.`,
    SNAPSHOT ? `Copia di sicurezza dichiarata: \`${SNAPSHOT}\`.` : "Copia di sicurezza: non dichiarata (`--snapshot`).",
    "",
    "## Conteggi", "", "| misura | valore |", "| --- | ---: |",
    ...Object.entries(piano.conteggi).map(([k, v]) => `| ${k} | ${v} |`),
    `| distribuzione | ${Object.entries(piano.distribuzione).map(([k, v]) => `${k} ${v}`).join(" · ")} |`,
    "", `\`--attese update=${piano.mutazioni.length}\``, "",
    "## Invarianti D-RD-16 (prima → dopo simulato; devono restare uguali)", "", "| controllo | prima | dopo | esito |", "| --- | ---: | ---: | --- |",
    ...invariantiDopo.map((v, i) => `| ${v.nome} | ${invariantiPrima[i].valore} | ${v.valore} | ${v.valore === invariantiPrima[i].valore ? "OK" : "**KO**"} |`),
    "", `Misura di fase: nomi stantii ${misuraPrima.nomiStantii} → ${misuraDopo.nomiStantii} · proiezioni stantie ${misuraPrima.proiezioniStantie} → ${misuraDopo.proiezioniStantie} · revisioni ${misuraDopo.revisioni}`,
    `Idempotenza: secondo piano sullo stato dopo → ${secondo.mutazioni.length} mutazioni, ${secondo.revisione.length} revisioni → **${idempotente ? "OK" : "KO"}**.`,
    `Ritorno: inverso applicato allo stato dopo = stato prima → **${ritornoEsatto ? "OK" : "KO"}** (${inverso.length} operazioni).`,
    "",
    ...(perEtichetta.length ? ["## Nomi per categoria", "", "| categoria | nome sulla riga | nome corrente | righe |", "| --- | --- | --- | ---: |", ...perEtichetta, ""] : []),
    ...(piano.revisione.length ? ["## REVIEW (non si toccano)", "", ...piano.revisione.map((r) => `- \`${r.tabella}\` \`${r.riga}\`: ${r.motivo}`), ""] : []),
    "## Ogni mutazione", "", "| # | tabella | riga | op | prima | dopo | regola | determinismo | motivo |", "| ---: | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...piano.mutazioni.map((m, i) => `| ${i + 1} | ${m.tabella}${m.colonna ? `.${m.colonna}` : ""} | \`${m.riga}\` | ${m.operazione} | ${FASE === "nomi" ? m.prima.category_name : `${(m.prima.categoryMemberships || []).length} righe, categories ${JSON.stringify(m.prima.categories)}`} | ${FASE === "nomi" ? m.dopo.category_name : `${m.dopo.categoryMemberships.length} righe, categories ${JSON.stringify(m.dopo.categories)}`} | ${m.regola} | ${m.determinismo} | ${m.motivo} |`),
    "",
  ];
  fs.writeFileSync(path.join(dir, "report.md"), report.join("\n"));
  console.log(report.slice(0, report.indexOf("## Ogni mutazione")).join("\n"));
  console.log(`\nFile in ${dir}`);
  return piano.revisione.length || !invariantiTenuti || !ritornoEsatto || !idempotente ? 3 : 0;
};

/* ---------- esecuzione ---------- */

const leggiPianoDryRun = () => {
  const runId = String(process.env.BONIFICA_APPARTENENZE_AUTORIZZATA || "");
  const file = path.join(OUT, runId, "piano.json");
  return runId && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
};

const esegui = async () => {
  const pianoDryRun = leggiPianoDryRun();
  const errori = [];
  if (CONFERMO !== CLUB) errori.push("--confermo deve ripetere esattamente --club.");
  if (!ATTESE) errori.push("--attese mancante.");
  if (!SNAPSHOT) errori.push("--snapshot mancante: prima la copia di sicurezza.");
  const autorizzato = String(process.env.BONIFICA_APPARTENENZE_AUTORIZZATA || "");
  if (!autorizzato) errori.push("BONIFICA_APPARTENENZE_AUTORIZZATA mancante: va impostata al run_id del dry-run approvato.");
  if (autorizzato && !pianoDryRun) errori.push(`Il dry-run ${autorizzato} non e in ${OUT}.`);
  if (pianoDryRun) {
    if (pianoDryRun.fase !== FASE) errori.push(`Il dry-run approvato e della fase «${pianoDryRun.fase}», non «${FASE}».`);
    if (pianoDryRun.club?.id !== CLUB) errori.push("Il dry-run approvato riguarda un altro club.");
    if (pianoDryRun.attese !== ATTESE) errori.push(`--attese (${ATTESE}) diverse da quelle del dry-run (${pianoDryRun.attese}).`);
    if (pianoDryRun.revisione?.length) errori.push(`Il dry-run ha ${pianoDryRun.revisione.length} righe REVIEW: si risolvono prima.`);
  }
  if (errori.length) esci(1, ["Esecuzione rifiutata:", ...errori.map((e) => `  - ${e}`)].join("\n"));
  const atteseUpdate = Number(String(ATTESE).replace(/^update=/, ""));

  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL statement_timeout = '120s'");
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query(SQL_TABELLA_AUDIT);

    const anteprima = pianifica(await leggiClub(CLUB));
    const atletiToccati = [...new Set(anteprima.mutazioni.map((m) => m.athlete_id))].sort();
    if (atletiToccati.length) await client.query(`SELECT id FROM athletes WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [atletiToccati]);

    const dati = await leggiClub(CLUB);
    const piano = pianifica(dati);
    if (piano.revisione.length) throw Object.assign(new Error(`REVIEW dentro la transazione: ${piano.revisione.length}`), { codice: 3 });
    if (FASE === "nomi") {
      const referenti = await referentiDeiNomi(CLUB, [...new Set(piano.mutazioni.map((m) => String(m.prima.category_name ?? "")).filter(Boolean))]);
      if (referenti.length) throw Object.assign(new Error(`I nomi ritirati sono ancora citati: ${referenti.join("; ")}`), { codice: 3 });
    }
    if (piano.mutazioni.length !== atteseUpdate) throw Object.assign(new Error(`Conteggi diversi dalle attese: update=${piano.mutazioni.length} ≠ ${ATTESE}`), { codice: 2 });
    if (firma(piano.mutazioni) !== firma(pianoDryRun.mutazioni)) throw Object.assign(new Error("Il piano ricalcolato con i blocchi non coincide con il dry-run approvato: lo stato e cambiato."), { codice: 2 });
    const invariantiPrima = validaInvariantiDRD16(dati);

    for (const m of piano.mutazioni) {
      let r;
      if (m.tabella === "athlete_category_memberships") {
        r = await client.query(`UPDATE athlete_category_memberships SET category_name = $2, updated_at = now() WHERE id = $1::uuid AND organization_id = $3::uuid AND category_id = $4`, [m.riga, m.campi.category_name, CLUB, m.prima.category_id]);
      } else {
        r = await client.query(`UPDATE athletes SET data = coalesce(data, '{}'::jsonb) || $2::jsonb, updated_at = now() WHERE id = $1::uuid AND organization_id = $3::uuid`, [m.riga, JSON.stringify(m.campi), CLUB]);
      }
      if (r.rowCount !== 1) throw Object.assign(new Error(`UPDATE su ${m.tabella} ${m.riga}: ${r.rowCount} righe`), { codice: 4 });
      await client.query(
        `INSERT INTO ${TABELLA_AUDIT} (run_id, organization_id, tabella, riga_id, operazione, regola, prima, dopo) VALUES ($1, $2::uuid, $3, $4::uuid, $5, $6, $7::jsonb, $8::jsonb) ON CONFLICT DO NOTHING`,
        [RUN_ID, CLUB, `${m.tabella}${m.colonna ? `.${m.colonna}` : ""}`, m.riga, m.operazione, m.regola, JSON.stringify(m.prima), JSON.stringify(m.dopo)],
      );
    }

    /* Gli invarianti di D-RD-16 devono restare quelli di prima; la misura della fase deve azzerarsi; niente audit fuori club. */
    const datiDopo = await leggiClub(CLUB);
    const invariantiDopo = validaInvariantiDRD16(datiDopo);
    const regrediti = invariantiDopo.filter((v, i) => v.valore !== invariantiPrima[i].valore);
    if (regrediti.length) throw Object.assign(new Error(`Invarianti D-RD-16 cambiati: ${regrediti.map((v) => v.nome).join(", ")}`), { codice: 4 });
    const misura = misuraFasi({ organizationId: CLUB, clubCategories: datiDopo.clubCategories, resourceCategories: datiDopo.resourceCategories, catalogo: datiDopo.catalogo, righe: datiDopo.righe, atleti: datiDopo.atleti });
    const residuo = FASE === "nomi" ? misura.nomiStantii : misura.proiezioniStantie;
    if (residuo !== 0) throw Object.assign(new Error(`La misura della fase non e zero dopo le scritture: ${residuo}`), { codice: 4 });
    const secondo = pianifica(datiDopo);
    if (secondo.mutazioni.length) throw Object.assign(new Error(`Il secondo piano dentro la transazione non e vuoto: ${secondo.mutazioni.length}`), { codice: 4 });
    const fuoriClub = Number((await client.query(`select count(*)::int n from ${TABELLA_AUDIT} where run_id = $1 and organization_id <> $2::uuid`, [RUN_ID, CLUB])).rows[0].n);
    if (fuoriClub) throw Object.assign(new Error(`Audit fuori club: ${fuoriClub}`), { codice: 4 });

    await client.query("COMMIT");
    const dir = path.join(OUT, RUN_ID);
    fs.mkdirSync(dir, { recursive: true });
    for (const nome of ["piano.json", "prima.json", "inverso.json"]) {
      const sorgente = path.join(OUT, pianoDryRun.runId, nome);
      if (fs.existsSync(sorgente) && sorgente !== path.join(dir, nome)) fs.copyFileSync(sorgente, path.join(dir, nome));
    }
    fs.writeFileSync(path.join(dir, "esecuzione.json"), JSON.stringify({ runId: RUN_ID, fase: FASE, dryRun: pianoDryRun.runId, snapshot: SNAPSHOT, club: CLUB, mutazioni: piano.mutazioni.length, invariantiPrima, invariantiDopo, misuraDopo: misura, eseguito: new Date().toISOString() }, null, 2));
    console.log(`COMMIT. Fase ${FASE}: ${piano.mutazioni.length} mutazioni, audit in ${TABELLA_AUDIT} con run_id ${RUN_ID}.`);
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
    await client.query("SET LOCAL statement_timeout = '120s'");
    await client.query("SET LOCAL lock_timeout = '10s'");
    /* I blocchi come in esecuzione, e per ogni riga il controllo che nessuno l'abbia cambiata dopo il run (revisione ostile B7). */
    const atleti = [...new Set(inverso.map((op) => (op.tabella === "athletes" ? op.riga : null)).filter(Boolean))].sort();
    if (atleti.length) await client.query(`SELECT id FROM athletes WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [atleti]);
    for (const op of inverso) {
      let r;
      if (op.tabella === "athlete_category_memberships") {
        const [corrente] = await q(`select category_name from athlete_category_memberships where id = $1::uuid and organization_id = $2::uuid for update`, [op.riga, CLUB]);
        if (!corrente) throw new Error(`Ritorno su riga ${op.riga}: non esiste piu`);
        if (op.attesoOra && String(corrente.category_name ?? "") !== String(op.attesoOra.category_name ?? "")) {
          throw new Error(`Ritorno su riga ${op.riga}: il nome e cambiato dopo il run («${corrente.category_name}»), non si sovrascrive`);
        }
        r = await client.query(`UPDATE athlete_category_memberships SET category_name = $2, updated_at = now() WHERE id = $1::uuid AND organization_id = $3::uuid`, [op.riga, op.campi.category_name, CLUB]);
      } else {
        const [corrente] = await q(`select data from athletes where id = $1::uuid and organization_id = $2::uuid`, [op.riga, CLUB]);
        if (!corrente) throw new Error(`Ritorno su atleta ${op.riga}: non esiste piu`);
        if (op.attesoOra && firmaProiezione(corrente.data) !== firmaProiezione(op.attesoOra)) {
          throw new Error(`Ritorno su atleta ${op.riga}: la proiezione e cambiata dopo il run, non si sovrascrive`);
        }
        r = await client.query(`UPDATE athletes SET data = (coalesce(data, '{}'::jsonb) || $2::jsonb) - $4::text[], updated_at = now() WHERE id = $1::uuid AND organization_id = $3::uuid`, [op.riga, JSON.stringify(op.campi), CLUB, op.rimuovi || []]);
      }
      if (r.rowCount !== 1) throw new Error(`Ritorno su ${op.tabella} ${op.riga}: ${r.rowCount} righe`);
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
