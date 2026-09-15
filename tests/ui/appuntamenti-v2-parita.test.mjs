import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  GIORNI,
  SLOT_STATUS,
  emptySlotForm,
  estraiOperatori,
  nomeGiorno,
  nomeOperatore,
  nomeSede,
  slotFormFrom,
  slotKindLabel,
  slotSortKey,
  slotStatusKey,
  slotStatusSpec,
  validateSlotForm,
} from "@/components/appuntamenti/v2/slot-model";

/**
 * Parita della pagina Disponibilita appuntamenti V2 con l'audit V1
 * (`docs/redesign/audit/wave-e-appuntamenti.md`).
 *
 * Il redesign cambia forma, non capacita: ogni etichetta, azione, campo ed
 * endpoint che l'audit elenca deve restare nel sorgente V2.
 */
const read = (relative) => readFileSync(path.join(process.cwd(), relative), "utf8");
const V2 = "src/components/appuntamenti/v2";
const sources = {
  page: read("src/app/appuntamenti/page.tsx"),
  model: read(`${V2}/slot-model.ts`),
  grid: read(`${V2}/slots-grid.tsx`),
  drawer: read(`${V2}/slot-drawer.tsx`),
};
const everything = Object.values(sources).join("\n");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("disponibilita: intestazione V2, un primario, il gate del dominio e la frase per chi non lo passa", () => {
  assert.match(sources.page, /<PageHeader/);
  assert.match(sources.page, /title="Disponibilita appuntamenti"/);
  assert.match(sources.page, /Dichiara quando la societa riceve: giorni, orari, durata del colloquio, sede e operatore\./);
  assert.match(sources.page, /<HeaderStat/);
  assert.match(sources.page, /Nuova fascia/);
  assert.match(sources.page, /isManagementAccessRole\(activeClub\?\.role\)/, "il gate della schermata e lo stesso del dominio");
  assert.match(sources.page, /Gli orari di ricevimento del club li configura chi lo amministra/);
  assert.match(sources.page, /Gli appuntamenti che ti sono assegnati restano nella tua agenda\./);
  assert.match(sources.page, /href="\/secretariat"/, "gli appuntamenti gia presi si lavorano dalla Segreteria");
  assert.match(sources.page, /searchParams\.get\("action"\) !== "new"/, "?action=new apre la nuova fascia");
  assert.equal(everything.includes("window.confirm"), false);
  assert.equal(/\balert\(/.test(everything), false);
  assert.equal(sources.page.includes("bg-gradient-to-r"), false);
  assert.equal(/[!]["»]/.test(everything), false, "niente punti esclamativi nelle frasi");
});

test("disponibilita: le cinque letture e i quattro verbi delle fasce restano gli stessi", () => {
  for (const lettura of [
    "listAppointmentSlots(intestazioniClub(activeClub.id))",
    'getClubData(activeClub.id, "club_sites")',
    'getClubData(activeClub.id, "staff_members")',
    'getClubData(activeClub.id, "trainers")',
    'apiRequest<AppointmentsConfig>("/api/v1/appointments/config"',
  ]) {
    assert.ok(sources.page.includes(lettura), `manca la lettura ${lettura}`);
  }
  for (const verbo of ["createAppointmentSlot(corpo", "updateAppointmentSlot(modulo.id, corpo", "deleteAppointmentSlot(slot.id", 'method: "PUT"']) {
    assert.ok(sources.page.includes(verbo), `manca la scrittura ${verbo}`);
  }
  assert.equal(/fetch\(/.test(everything), false, "nessun fetch diretto");
  assert.equal(/capacity\s*[:=]/.test(everything), false, "W6-56: la capienza non e dichiarabile");
  for (const campo of ["siteId", "assignedToUserId", "weekday", "specificDate", "startTime", "endTime", "durationMinutes", "validFrom", "validUntil", "active", "notes"]) {
    assert.ok(sources.page.includes(`${campo}:`), `${campo} e nel contratto di AppointmentSlotInput: la pagina lo scrive`);
    assert.ok(sources.drawer.includes(`"${campo}"`) || sources.drawer.includes(`slot-${campo}`), `${campo} si dichiara nel cassetto`);
  }
});

test("disponibilita: la configurazione «Come riceviamo» (PP-02 §K) resta con i suoi testi e il suo salvataggio", () => {
  const pagina = senzaCommenti(sources.page);
  assert.ok(pagina.includes("Le famiglie possono prenotare"));
  assert.ok(pagina.includes("Motivi che accettiamo"));
  assert.ok(pagina.includes("salvaConfigurazione("));
  assert.ok(pagina.includes("!familyCanRequestAppointment(configurazione)"), "chi chiude la porta deve vederla chiusa");
  assert.ok(pagina.includes("Le famiglie possono chiederlo"));
  assert.ok(pagina.includes("solo dal desk"));
  assert.ok(pagina.includes("Es. Colloquio con la segreteria"));
  assert.ok(pagina.includes("setConfigurazione(precedente)"), "il server ha detto di no: si torna a cio che era vero");
  assert.ok(pagina.includes('{ id: "", name: nome, bookable: true }'), "lo slug lo assegna il server");
  assert.match(sources.page, /<Toggle/, "l'interruttore dice il suo stato a parole");
  assert.match(sources.page, /Attivo" : "Non attivo/);
});

test("disponibilita: il ripiego e un avviso azionabile, non un dettaglio nascosto", () => {
  assert.match(sources.page, /Nessuna fascia attiva: si sta usando l'orario di apertura\./);
  assert.match(sources.page, /<AlertBlock/);
  assert.match(sources.page, /Dichiara la prima fascia/);
  assert.match(sources.page, /inRipiego && !caricamento/);
});

test("disponibilita: griglia unica delle fasce con viste, filtri, ricerca e le tre azioni di riga", () => {
  assert.match(sources.page, /module="appuntamenti-fasce"/);
  for (const column of ['id: "identity"', 'id: "time"', 'id: "duration"', 'id: "site"', 'id: "operator"', 'id: "status"', 'id: "validity"', 'id: "notes"']) {
    assert.ok(sources.grid.includes(column), `manca la colonna ${column}`);
  }
  for (const view of ['id: "weekly"', 'id: "dates"', 'id: "inactive"']) {
    assert.ok(sources.grid.includes(view), `manca la vista ${view}`);
  }
  for (const filter of ['id: "kind"', 'id: "status"', 'id: "weekday"', 'id: "site"', 'id: "operator"']) {
    assert.ok(sources.grid.includes(filter), `manca il filtro ${filter}`);
  }
  assert.match(sources.page, /id: "edit", label: "Modifica"/);
  assert.match(sources.page, /id: "toggle-off", label: "Disattiva"/);
  assert.match(sources.page, /id: "toggle-on", label: "Riattiva"/);
  assert.match(sources.page, /id: "delete", label: "Elimina"/);
  assert.match(sources.page, /canSelect=\{false\}/, "la V1 non aveva selezione ne azioni di massa");
  assert.match(sources.page, /title: "Nessuna fascia dichiarata\."/);
});

test("disponibilita: disattivare rimanda tutta la riga, eliminare chiede una conferma distruttiva", () => {
  const inizio = sources.page.indexOf("const cambiaAttivazione");
  const fine = sources.page.indexOf("const rimuovi");
  assert.ok(inizio > 0 && fine > inizio);
  const corpo = sources.page.slice(inizio, fine);
  for (const campo of ["siteId: slot.site_id", "assignedToUserId: slot.assigned_to_user_id", "active: slot.active === false", "notes: slot.notes"]) {
    assert.ok(corpo.includes(campo), `un campo assente viaggerebbe come null: ${campo}`);
  }
  assert.match(sources.page, /useConfirm\(\)/);
  assert.match(sources.page, /Eliminare questa fascia\?/);
  assert.match(sources.page, /Per smettere di offrirla senza toglierla dalla storia, disattivala\./);
  assert.match(sources.page, /Gli appuntamenti gia presi su questa fascia restano in agenda/);
  assert.match(sources.page, /irreversible: true/);
  for (const messaggio of [
    "Fascia aggiornata: le famiglie vedono subito la nuova disponibilita",
    "Fascia aggiunta: le famiglie possono prenotarla",
    "Non riesco a salvare la fascia",
    "Fascia riattivata",
    "Fascia disattivata",
    "Non riesco a cambiare la fascia",
    "Fascia rimossa",
    "Non riesco a rimuovere la fascia",
    "Non riesco a leggere la disponibilita configurata",
    "Non riesco a salvare la configurazione",
  ]) {
    assert.ok(sources.page.includes(messaggio), `manca il messaggio «${messaggio}»`);
  }
});

test("cassetto della fascia: 720, quattro sezioni, guardia sulle modifiche, gli undici campi con le loro parole", () => {
  assert.match(sources.drawer, /width="wide"/);
  assert.match(sources.drawer, /dirty=\{dirty && !busy\}/);
  for (const testo of ["Ogni settimana", "Una data sola", "Giorno della settimana", "Durata del colloquio", "Dalle", "Alle", "Sede", "Operatore", "Solo chi ha un account puo tenere un'agenda propria.", "In vigore dal", "Fino al", "Note interne", "Promemoria per chi tiene l'agenda: la famiglia non le legge", "Fascia attiva", "quel giorno non si riceve, nemmeno nelle fasce settimanali", "Salva la fascia", "Aggiungi la fascia"]) {
    assert.ok(sources.drawer.includes(testo), `manca «${testo}» nel cassetto`);
  }
  assert.match(sources.drawer, /<ValidationSummary/);
  assert.equal(sources.drawer.includes("<Modal"), false, "i cassetti creano e modificano; i modali confermano");
});

test("modello: modulo, corpo, stati e ordinamento come la V1", () => {
  assert.deepEqual(emptySlotForm(), { id: null, ambito: "weekly", weekday: "1", specificDate: "", startTime: "09:00", endTime: "12:00", durationMinutes: "30", siteId: "", assignedToUserId: "", validFrom: "", validUntil: "", active: true, notes: "" });
  const riga = { id: "s1", organization_id: "c", site_id: null, assigned_to_user_id: "u1", weekday: null, specific_date: "2026-09-20T00:00:00.000Z", start_time: "09:00", end_time: "10:00", duration_minutes: 20, valid_from: null, valid_until: "2026-12-31T00:00:00.000Z", active: false, notes: "x" };
  const modulo = slotFormFrom(riga);
  assert.equal(modulo.ambito, "date");
  assert.equal(modulo.specificDate, "2026-09-20");
  assert.equal(modulo.validUntil, "2026-12-31");
  assert.equal(modulo.durationMinutes, "20");
  assert.equal(modulo.active, false);
  assert.deepEqual(validateSlotForm({ ...modulo, specificDate: "" }), { specificDate: "Indica la data della fascia" });
  assert.deepEqual(validateSlotForm({ ...modulo, endTime: "08:00" }), { endTime: "L'orario di fine deve seguire quello di inizio" });
  assert.deepEqual(validateSlotForm(emptySlotForm()), {});
  assert.equal(slotStatusKey(riga), "closure");
  assert.equal(slotStatusSpec(riga).label, "CHIUSURA");
  assert.equal(slotStatusSpec({ ...riga, specific_date: null, weekday: 1 }).label, "DISATTIVATA");
  assert.equal(slotStatusSpec({ ...riga, active: true }).label, "ATTIVA");
  for (const spec of Object.values(SLOT_STATUS)) {
    assert.ok(["quiet", "outline", "solid", "urgent"].includes(spec.weight));
    assert.ok(["neutral", "green", "amber", "red", "blue", "orange"].includes(spec.hue));
  }
  assert.equal(slotKindLabel(riga), "Una data sola");
  assert.equal(nomeGiorno(3), "Mercoledi");
  assert.equal(nomeGiorno(null), "Giorno non indicato");
  assert.equal(GIORNI.length, 7);
  const settimanale = { ...riga, specific_date: null, weekday: 2, start_time: "15:00" };
  assert.ok(slotSortKey(settimanale) < slotSortKey(riga), "settimanali prima delle date");
  assert.equal(nomeSede([{ id: "a", name: "Palestra" }], null), "Tutte le sedi");
  assert.equal(nomeSede([{ id: "a", name: "Palestra" }], "b"), "Sede rimossa");
  assert.equal(nomeOperatore([], null), "Segreteria");
  assert.equal(nomeOperatore([], "u9"), "Operatore non piu in organico");
});

test("modello: gli operatori sono solo chi ha un account, deduplicati e ordinati", () => {
  const operatori = estraiOperatori([
    { id: "s1", name: "Zeno", surname: "Bianchi", linkedUserId: "u2" },
    { id: "s2", name: "Senza account" },
    { id: "t1", fullName: "Anna Rossi", data: { userId: "u1" } },
    { id: "t2", email: "dup@x.it", user_id: "u1" },
  ]);
  assert.deepEqual(operatori, [
    { userId: "u1", nome: "Anna Rossi" },
    { userId: "u2", nome: "Zeno Bianchi" },
  ]);
});

test("disponibilita: usabile a 375, 768 e 1280 px", () => {
  for (const [name, source] of Object.entries(sources)) {
    const offending = source.split(/\r?\n/).filter((line) => /(?<![a-z:])grid-cols-[23]\b/.test(line));
    assert.deepEqual(offending, [], `${name}: griglia a due o tre colonne senza breakpoint`);
  }
  assert.match(sources.page, /lg:grid-cols-\[minmax\(0,1fr\)_340px\]/, "griglia + rail solo dai 1024 px");
  assert.match(sources.page, /flex-wrap/, "i comandi dei motivi vanno a capo");
});
