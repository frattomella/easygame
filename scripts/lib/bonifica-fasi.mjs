/**
 * **D-RD-16, fasi B e C — i pianificatori. Puri: nessun database.**
 *
 * - **Fase C — nomi stantii**: una riga identificata (`category_id` nel
 *   catalogo) che porta ancora un `category_name` diverso dal nome corrente
 *   della categoria. L'identita e certa; si allinea **solo** il nome. Va
 *   fatta **dopo** la fase A: quei nomi erano gli alias con cui R2 leggeva
 *   le gemelle (ADR-0185 §8), e con 0 righe storiche non servono piu.
 *
 * - **Fase B — proiezioni**: `athletes.data.{category, categoryName,
 *   categoryMemberships, categories}` sono cio che il writer scrive a ogni
 *   salvataggio come proiezione delle appartenenze. Dopo la fase A dicono
 *   ancora le righe cancellate. Si ricostruiscono con **la stessa funzione**
 *   del writer (`buildAthleteCategoryProjection`) dalle righe canoniche: la
 *   proiezione attesa e derivabile 1:1, e non porta informazione propria.
 *
 * Ogni mutazione dice tabella, riga, operazione, prima, dopo, regola,
 * determinismo e motivo. `REVIEW` = non si tocca e l'esecuzione non parte.
 */

import { buildClubCategoryOptions } from "../../src/lib/category-utils.ts";
import {
  buildAthleteCategoryProjection,
  collectDanglingAthleteCategoryReferences,
  normalizeAthleteCategoryMemberships,
} from "../../src/lib/athlete-category-memberships.ts";

const copia = (v) => JSON.parse(JSON.stringify(v ?? null));

/** JSON con le chiavi ordinate: due proiezioni uguali si confrontano come stringhe. */
export const canonico = (value) =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
      : v,
  );

/* ------------------------------------------------------------------ */
/* Fase C                                                              */
/* ------------------------------------------------------------------ */

export const pianificaNomiStantii = ({ organizationId, catalogo, righe }) => {
  const nomePerId = new Map(catalogo.map((c) => [String(c.id), String(c.name ?? "").trim()]));
  const mutazioni = [];
  const revisione = [];
  const delClub = righe.filter((r) => String(r.organization_id) === String(organizationId));

  for (const riga of delClub) {
    const id = String(riga.category_id);
    if (!nomePerId.has(id)) continue; // fuori catalogo: e la fase A, non questa
    const corrente = nomePerId.get(id);
    if (!corrente) {
      revisione.push({ tabella: "athlete_category_memberships", riga: String(riga.id), regola: "REVIEW", motivo: `la categoria ${id} non ha un nome nel catalogo`, prima: copia(riga) });
      continue;
    }
    if (String(riga.category_name ?? "").trim() === corrente) continue;
    mutazioni.push({
      tabella: "athlete_category_memberships",
      riga: String(riga.id),
      athlete_id: String(riga.athlete_id),
      operazione: "UPDATE",
      prima: copia(riga),
      dopo: { ...copia(riga), category_name: corrente },
      campi: { category_name: corrente },
      regola: "C1",
      determinismo: "HIGH",
      confermaManuale: false,
      motivo: `l'identificativo ${id} e certo; il nome sulla riga «${riga.category_name}» e quello di prima della rinomina, il corrente e «${corrente}»`,
    });
  }

  const conteggi = { righe: delClub.length, update: mutazioni.length, revisione: revisione.length };
  return { fase: "nomi", organizationId, mutazioni, revisione, daConfermare: [], conteggi, distribuzione: { C1: mutazioni.length, REVIEW: revisione.length } };
};

/* ------------------------------------------------------------------ */
/* Fase B                                                              */
/* ------------------------------------------------------------------ */

const CHIAVI_PROIEZIONE = ["category", "categoryName", "categoryMemberships", "categories"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const estraiProiezione = (data) => {
  const d = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  return Object.fromEntries(CHIAVI_PROIEZIONE.map((k) => [k, d[k] === undefined ? null : copia(d[k])]));
};

/** Le chiavi della proiezione che nel `data` letto **mancavano**: il ritorno le toglie, non le mette a null. */
const chiaviAssenti = (data) => {
  const d = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  return CHIAVI_PROIEZIONE.filter((k) => d[k] === undefined);
};

/**
 * La proiezione ridotta a cio che significa (revisione ostile B5): l'ordine
 * delle appartenenze e gli identificativi sintetici (`<cat>:membership`, che
 * il writer scrive prima di avere la riga) non sono una differenza. Due
 * proiezioni con la stessa firma dicono la stessa cosa, e non si toccano.
 */
export const firmaProiezione = (proiezione) => {
  const p = proiezione && typeof proiezione === "object" ? proiezione : {};
  const membership = (m) => ({
    category_id: String(m?.category_id ?? m?.categoryId ?? ""),
    category_name: String(m?.category_name ?? m?.categoryName ?? ""),
    is_primary: Boolean(m?.is_primary ?? m?.isPrimary),
    site_id: m?.site_id ?? m?.siteId ?? null,
    id: UUID.test(String(m?.id ?? "")) ? String(m.id) : null,
  });
  return canonico({
    category: p.category ?? null,
    categoryName: p.categoryName ?? null,
    categoryMemberships: (Array.isArray(p.categoryMemberships) ? p.categoryMemberships : [])
      .map(membership)
      .sort((a, b) => a.category_id.localeCompare(b.category_id)),
    categories: [...(Array.isArray(p.categories) ? p.categories : [])].map(String).sort(),
  });
};

/**
 * @param {{ organizationId, clubCategories, resourceCategories, righe, atleti }} dati
 *   `atleti`: `{ id, category_id, category_name, data }`; `righe`: tutte le righe del club.
 */
export const pianificaProiezioni = ({ organizationId, clubCategories = [], resourceCategories = [], righe, atleti }) => {
  const opzioni = buildClubCategoryOptions({ clubCategories, resourceCategories });
  const catalogo = opzioni.filter((o) => o.configured !== false);
  const mutazioni = [];
  const revisione = [];
  let senzaRighe = 0;
  let giaAllineati = 0;

  const perAtleta = new Map();
  for (const r of righe) {
    if (String(r.organization_id) !== String(organizationId)) continue;
    const k = String(r.athlete_id);
    if (!perAtleta.has(k)) perAtleta.set(k, []);
    perAtleta.get(k).push(r);
  }

  for (const atleta of atleti) {
    const righeAtleta = perAtleta.get(String(atleta.id)) || [];
    if (!righeAtleta.length) {
      senzaRighe += 1;
      continue; // senza righe la proiezione non ha una sorgente: non si tocca, si conta
    }
    /*
      **Solo le righe** (revisione ostile B4): la colonna storica e la vecchia
      proiezione non entrano nel soggetto, altrimenti il normalizzatore le
      rileggerebbe come sorgenti (C2, sede dalla proiezione) e la «ricostruzione»
      copierebbe cio che deve sostituire. Le righe devono dichiarare **una**
      primaria e la colonna deve dirla: altrimenti e un disaccordo da vedere.
    */
    const primarie = righeAtleta.filter((r) => Boolean(r.is_primary));
    const prima = estraiProiezione(atleta.data);
    if (primarie.length !== 1) {
      revisione.push({ tabella: "athletes", riga: String(atleta.id), regola: "REVIEW", motivo: `le righe dichiarano ${primarie.length} primarie`, prima });
      continue;
    }
    const colonna = String(atleta.category_id ?? "").trim();
    if (colonna && colonna !== String(primarie[0].category_id)) {
      revisione.push({ tabella: "athletes", riga: String(atleta.id), regola: "REVIEW", motivo: `athletes.category_id (${colonna}) non e la primaria delle righe (${primarie[0].category_id})`, prima });
      continue;
    }
    const soggetto = { id: String(atleta.id), organization_id: organizationId, category_memberships: righeAtleta };
    const memberships = normalizeAthleteCategoryMemberships(soggetto, catalogo);
    const pendenti = collectDanglingAthleteCategoryReferences(soggetto, catalogo);
    if (pendenti.length) {
      revisione.push({ tabella: "athletes", riga: String(atleta.id), regola: "REVIEW", motivo: `riferimenti pendenti: ${pendenti.map((p) => `${p.membership.categoryId} (${p.reason})`).join(", ")}`, prima });
      continue;
    }
    const attesa = buildAthleteCategoryProjection(memberships, { clubId: organizationId, athleteId: String(atleta.id) });
    if (firmaProiezione(prima) === firmaProiezione(attesa)) {
      giaAllineati += 1;
      continue;
    }
    mutazioni.push({
      tabella: "athletes",
      riga: String(atleta.id),
      athlete_id: String(atleta.id),
      operazione: "UPDATE",
      colonna: "data",
      prima,
      /* Le chiavi che mancavano: il ritorno le toglie invece di scrivere null (revisione ostile B7). */
      assenti: chiaviAssenti(atleta.data),
      dopo: copia(attesa),
      campi: copia(attesa),
      regola: "B1",
      determinismo: "HIGH",
      confermaManuale: false,
      motivo: `la proiezione in athletes.data (${CHIAVI_PROIEZIONE.join(", ")}) non coincide con le ${memberships.length} appartenenze canoniche: si ricostruisce con buildAthleteCategoryProjection`,
    });
  }

  const conteggi = { atleti: atleti.length, senzaRighe, giaAllineati, update: mutazioni.length, revisione: revisione.length };
  return { fase: "proiezioni", organizationId, mutazioni, revisione, daConfermare: [], conteggi, distribuzione: { B1: mutazioni.length, REVIEW: revisione.length } };
};

/* ------------------------------------------------------------------ */
/* Applicazione in memoria, inverso, validazioni                       */
/* ------------------------------------------------------------------ */

export const applicaFaseInMemoria = ({ righe, atleti }, mutazioni) => {
  const righeDopo = new Map(righe.map((r) => [String(r.id), copia(r)]));
  const atletiDopo = new Map(atleti.map((a) => [String(a.id), copia(a)]));
  for (const m of mutazioni) {
    if (m.tabella === "athlete_category_memberships") {
      const r = righeDopo.get(m.riga);
      if (!r) throw new Error(`riga assente: ${m.riga}`);
      Object.assign(r, m.campi);
    } else if (m.tabella === "athletes" && m.colonna === "data") {
      const a = atletiDopo.get(m.riga);
      if (!a) throw new Error(`atleta assente: ${m.riga}`);
      a.data = { ...(a.data && typeof a.data === "object" ? a.data : {}), ...m.campi };
    } else {
      throw new Error(`mutazione non prevista: ${m.tabella}/${m.colonna ?? ""}`);
    }
  }
  return { righe: Array.from(righeDopo.values()), atleti: Array.from(atletiDopo.values()) };
};

export const invertiFase = (mutazioni) =>
  [...mutazioni].reverse().map((m) => ({
    tabella: m.tabella,
    riga: m.riga,
    colonna: m.colonna ?? null,
    operazione: "UPDATE",
    campi: m.colonna === "data"
      ? Object.fromEntries(Object.entries(copia(m.prima)).filter(([k]) => !(m.assenti || []).includes(k)))
      : Object.fromEntries(Object.keys(m.campi).map((k) => [k, m.prima[k] ?? null])),
    /* Le chiavi che prima non c'erano: si tolgono, non si azzerano. */
    rimuovi: m.colonna === "data" ? [...(m.assenti || [])] : [],
    /* Lo stato che il run ha scritto: il ritorno rifiuta una riga che nel frattempo e cambiata (revisione ostile B7). */
    attesoOra: m.colonna === "data" ? copia(m.dopo) : copia(m.campi),
    inverteDi: m.riga,
  }));

export const applicaInversaFaseInMemoria = (stato, inverse) => {
  const dopo = applicaFaseInMemoria(stato, inverse.map((op) => ({ tabella: op.tabella, riga: op.riga, colonna: op.colonna ?? undefined, campi: op.campi })));
  for (const op of inverse) {
    if (op.colonna !== "data" || !op.rimuovi?.length) continue;
    const a = dopo.atleti.find((x) => String(x.id) === op.riga);
    if (a && a.data) for (const k of op.rimuovi) delete a.data[k];
  }
  return dopo;
};

/** Le misure di fase: nomi stantii e proiezioni non allineate. */
export const misuraFasi = ({ organizationId, clubCategories = [], resourceCategories = [], catalogo, righe, atleti }) => {
  const nomi = pianificaNomiStantii({ organizationId, catalogo, righe });
  const proiezioni = pianificaProiezioni({ organizationId, clubCategories, resourceCategories, righe, atleti });
  return { nomiStantii: nomi.mutazioni.length, proiezioniStantie: proiezioni.mutazioni.length, revisioni: nomi.revisione.length + proiezioni.revisione.length };
};
