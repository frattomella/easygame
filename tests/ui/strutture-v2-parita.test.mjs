import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  BOOKING_STATUS,
  computeStructureAlerts,
  countEventsUsingStructure,
  describeFieldSlots,
  describeStructureHours,
  newField,
  rentPaymentSpec,
  resolveStructureArea,
  structureSiteName,
} from "@/components/structures/v2/structure-model";
import { buildBooking, emptyBookingForm, toDateTime } from "@/components/structures/v2/booking-model";
import { normalizeStructure } from "@/lib/structures-utils";

/**
 * Parita delle pagine Strutture V2 con l'audit V1
 * (`docs/redesign/audit/wave-d-strutture.md`).
 *
 * Il redesign cambia forma, non capacita: ogni etichetta, azione, campo ed
 * endpoint che l'audit elenca deve restare nel sorgente V2. Un test statico
 * non prova che funzioni — lo fa il lead a schermo — ma impedisce che una
 * capacita sparisca per distrazione.
 */
const read = (relative) => readFileSync(path.join(process.cwd(), relative), "utf8");
const V2 = "src/components/structures/v2";
const sources = {
  list: read("src/app/structures/page.tsx"),
  detail: read("src/app/structures/[id]/page.tsx"),
  drawer: read(`${V2}/structure-drawer.tsx`),
  sites: read(`${V2}/sites-drawer.tsx`),
  booking: read(`${V2}/booking-drawer.tsx`),
  bookingModel: read(`${V2}/booking-model.ts`),
  calendar: read(`${V2}/bookings-calendar.tsx`),
  payment: read(`${V2}/rent-payment-drawer.tsx`),
  del: read(`${V2}/delete-structure-dialog.tsx`),
  model: read(`${V2}/structure-model.ts`),
  clubId: read("src/components/web/hooks/use-route-club-id.ts"),
};
const everything = Object.values(sources).join("\n");

/* ------------------------------------------------------- /structures (elenco) */

test("/structures: intestazione di pagina con una sola azione primaria e le sedi nell'overflow", () => {
  assert.match(sources.list, /<PageHeader/);
  assert.match(sources.list, /title="Strutture"/);
  assert.match(sources.list, /<HeaderStat/);
  assert.equal((sources.list.match(/variant="primary"/g) || []).length, 2, "il primario di pagina e quello dello stato vuoto: nessun altro gradiente");
  assert.match(sources.list, /Nuova struttura/);
  assert.match(sources.list, /Gestisci sedi/);
  assert.match(sources.list, /<SitesDrawer/);
  assert.match(sources.list, /<SiteContextControl/, "il filtro sede e il controllo di contesto condiviso, montato solo per un club multi-sede");
  assert.match(sources.list, /filterStructuresBySite\(structures, siteFilter\)/, "il filtro passa dal modulo proprietario (ADR-0038)");
});

test("/structures: la griglia porta cio che le card V1 mostravano", () => {
  assert.match(sources.list, /module="strutture"/);
  for (const column of ['id: "identity"', 'id: "type"', 'id: "site"', 'id: "address"', 'id: "fields"', 'id: "hours"', 'id: "bookings"', 'id: "visibility"', 'id: "bookable"']) {
    assert.ok(sources.list.includes(column), `manca la colonna ${column}`);
  }
  // la card diceva Affittabile e Tipo (Pubblica/Privata): restano come colonne nascoste
  for (const hidden of ['id: "ownership"', 'id: "rentable"', 'id: "contact"']) {
    assert.ok(sources.list.includes(hidden), `manca la colonna nascosta ${hidden}`);
  }
  assert.match(sources.list, /if \(multiSite\) \{/, "la colonna sede compare solo per un club multi-sede");
  assert.match(sources.list, /describeStructureHours\(row\)/);
  assert.match(sources.list, /<StatusPill size="sm" status=\{row\.isVisibleToMembers \? STRUCTURE_VISIBILITY\.visible : STRUCTURE_VISIBILITY\.hidden\}/);
});

test("/structures: azioni di riga, viste e filtri", () => {
  for (const action of ['id: "open", label: "Apri scheda"', 'id: "edit", label: "Modifica"', 'id: "delete", label: "Elimina"']) {
    assert.ok(sources.list.includes(action), `manca l'azione ${action}`);
  }
  assert.match(sources.list, /tone: "danger", onClick: \(row\) => setDeleting\(row\)/);
  for (const filter of ['id: "visibility"', 'id: "bookable"', 'id: "rentable"', 'id: "ownership"', 'id: "type"']) {
    assert.ok(sources.list.includes(filter), `manca il filtro ${filter}`);
  }
  assert.match(sources.list, /Prenotabili dalle famiglie/);
  assert.equal(sources.list.includes("export={"), false, "la V1 non aveva esportazione: non se ne inventa una");
  assert.equal(sources.list.includes("bulkActions"), false, "la V1 non aveva azioni di massa");
});

test("/structures: le stesse letture e scritture della V1", () => {
  assert.match(sources.list, /getClubStructures\(clubId\)/);
  assert.match(sources.list, /getClubData\(clubId, "club_sites"\)/);
  assert.match(sources.list, /saveClubStructures\(clubId, next\)/);
  assert.match(sources.list, /updateClubData\(clubId, "club_sites", next\.map\(serializeClubSite\)\)/);
  assert.match(sources.list, /normalizeStructure\(item\)/);
  for (const message of ["Errore nel caricamento delle strutture", "Salvataggio strutture fallito", "Sedi aggiornate", "Salvataggio sedi fallito", "Struttura salvata", "Struttura eliminata", "Nessun club selezionato"]) {
    assert.ok(sources.list.includes(message), `manca il messaggio «${message}»`);
  }
  assert.match(sources.list, /if \(!exists\) openDetail\(next\)/, "dopo la creazione si apre la scheda, come nella V1");
  assert.equal(/\bfetch\(/.test(everything), false, "nessun fetch diretto: solo simplified-db");
});

test("/structures: niente doppia barra mobile, niente window.confirm", () => {
  assert.equal(sources.list.includes("<MobileTopBar"), false, "`Header` monta gia la barra mobile");
  assert.equal(/window\.confirm|\bconfirm\(["']/.test(everything), false);
  assert.equal(/@\/components\/ui\/(alert-dialog|dialog|card|badge|switch|select|accordion|tabs)/.test(everything), false, "niente primitive V1 nelle pagine V2");
});

/* ------------------------------------------------------- il cassetto struttura */

test("cassetto struttura: ogni campo del dialog V1 e delle tab Informazioni / Campi / Tariffe / Fitti", () => {
  for (const label of [
    'label="Nome"',
    'label="Tipologia"',
    'label="Indirizzo"',
    'label="Città"',
    'label="Sede"',
    'label="Referente"',
    'label="Telefono"',
    'label="Email"',
    'label="Struttura pubblica"',
    'label="Visibile ai tesserati"',
    'label="Prenotabile dalle famiglie"',
    'label="Affittabile"',
    'label="Note"',
    'label="Nome campo"',
    'label="Proprietà"',
    'label="In affitto"',
    'label="Prenotabile"',
    'label="Inizio"',
    'label="Fine"',
    'label="Durata (minuti)"',
    'label="Prezzo"',
    'label="Canone"',
    'label="Frequenza"',
    'label="Giorno scadenza"',
    'label="Inizio contratto"',
    'label="Fine contratto"',
    'label="Note contratto"',
  ]) {
    assert.ok(sources.drawer.includes(label), `manca il campo ${label}`);
  }
  assert.match(sources.drawer, /width=\{meta\.width\}/);
  assert.match(sources.drawer, /dirty=\{dirty\}/, "guardia sulle modifiche non salvate");
  assert.match(sources.drawer, /Inserisci il nome della struttura/, "l'unica validazione V1 resta");
  assert.match(sources.drawer, /Senza sede la struttura resta visibile con qualunque filtro\./);
  assert.match(sources.drawer, /Non riguarda le prenotazioni delle famiglie\./, "«Affittabile» dice che non e la prenotabilita (W6-54)");
  assert.match(sources.drawer, /<TimeInput/, "le fasce si scrivono con il TimeInput del sistema");
  assert.match(sources.drawer, /<FieldGroup key=\{day\.key\} eyebrow=\{day\.label\}/, "una fieldset per giorno della settimana");
  assert.match(sources.drawer, /WEEK_DAYS\.map/);
  assert.match(sources.drawer, /Aggiungi fascia/);
  assert.match(sources.drawer, /Aggiungi campo/);
  assert.match(sources.drawer, /Aggiungi tariffa/);
  assert.match(sources.drawer, /clampDuration\(event\.target\.value\)/, "la durata resta fra 15 e 240");
  assert.match(sources.drawer, /if \(activeSites\.length\) \{|activeSites\.length \? \(/, "la sede si sceglie solo se il club ne ha almeno una");
});

test("cassetto struttura: il campo nuovo non nasce con tariffe a zero (W6-55)", () => {
  const field = newField();
  assert.equal(field.pricing.length, 0);
  assert.deepEqual(field.availability.Lun, [{ start: "18:00", end: "22:00" }]);
  assert.deepEqual(field.availability.Mar, []);
  assert.equal(field.isBookable, true);
  assert.equal(field.isVisible, true);
});

/* ------------------------------------------------------- le sedi */

test("cassetto sedi: gli stessi campi, messaggi e regole della sezione V1", () => {
  for (const text of ["Nome sede", "Città", "Indirizzo", "Note", "Sede attiva", "Il nome della sede e obbligatorio", "Esiste gia una sede con questo nome", "Nessuna sede configurata: il club lavora come mono-sede.", "Nessun indirizzo"]) {
    assert.ok(sources.sites.includes(text), `manca «${text}»`);
  }
  assert.match(sources.sites, /normalizeClubSites\(next\.map\(serializeClubSite\)\)/);
  assert.match(sources.sites, /<ConfirmDialog/, "eliminare una sede chiede conferma");
  assert.equal(sources.sites.includes("disabled={disabled"), false, "permesso negato = assente, mai disabilitato");
});

/* ------------------------------------------------------- /structures/[id] */

test("/structures/[id]: intestazione di scheda, quattro aree, distruttiva solo nel menu", () => {
  assert.match(sources.detail, /<RecordHeader/);
  assert.match(sources.detail, /useBreadcrumbLabel\(structure \? structureDisplayName\(structure\) : null\)/);
  assert.match(sources.detail, /<RecordAreaSwitcher/);
  assert.match(sources.detail, /<RecordAlertStrip/);
  assert.match(sources.detail, /tone: "danger", overflow: true, onClick: \(\) => setDeleting\(true\)/);
  assert.match(sources.detail, /<DeleteStructureDialog/);
  for (const area of ['area === "struttura"', 'area === "campi"', 'area === "tariffe"', 'area === "prenotazioni"']) {
    assert.ok(sources.detail.includes(area), `manca l'area ${area}`);
  }
  assert.deepEqual(
    ["info", "fields", "pricing", "rent", "bookings", "notes", "", "x"].map(resolveStructureArea),
    ["struttura", "campi", "tariffe", "tariffe", "prenotazioni", "struttura", "struttura", "struttura"],
    "i nomi delle sei tab V1 restano link validi",
  );
});

test("/structures/[id]: ogni sezione V1 vive in un'area, con il suo cassetto", () => {
  // Informazioni + Note
  assert.match(sources.detail, /<DetailCard eyebrow="Anagrafica" title="Informazioni" fields=\{infoFields\} onEdit=\{\(\) => setEditing\("info"\)\}/);
  assert.match(sources.detail, /title="Note interne"/);
  // Campi e disponibilita
  assert.match(sources.detail, /title="Orari per campo"/);
  assert.match(sources.detail, /Modifica campi/);
  assert.match(sources.detail, /describeFieldSlots\(field\)/);
  // Tariffe + Pagamenti / Fitti
  assert.match(sources.detail, /title="Durata e prezzo per campo"/);
  assert.match(sources.detail, /title="Contratto di affitto"/);
  assert.match(sources.detail, /module="strutture-affitti"/);
  assert.match(sources.detail, /Registra pagamento/);
  assert.match(sources.detail, /<RentPaymentDrawer/);
  assert.match(sources.detail, /formatMoney\(row\.amount\)/, "gli importi passano da formatMoney");
  assert.match(sources.detail, /rentPaymentSpec\(row\.status\)/);
  // Prenotazioni
  assert.match(sources.detail, /<BookingsCalendar/);
  assert.match(sources.detail, /module="strutture-prenotazioni"/);
  assert.match(sources.detail, /hideViews/);
  assert.match(sources.detail, /<BookingDrawer/);
  assert.match(sources.detail, /Nuova prenotazione/);
  assert.match(sources.detail, /bookingFormForDate\(structure, date\)/, "un giorno del calendario precompila la creazione");
  assert.match(sources.detail, /bookingFormFrom\(booking\)/, "una prenotazione del calendario apre la modifica");
});

test("/structures/[id]: la stessa scrittura della V1, senza il Salva unico", () => {
  assert.match(sources.detail, /getClubStructures\(clubId\)/);
  assert.match(sources.detail, /findStructureById\(structures, structureId\)/);
  assert.match(sources.detail, /saveClubStructures\(clubId, nextStructures\)/);
  assert.match(sources.detail, /structures\.map\(\(item\) => \(item\.id === normalized\.id \? normalized : item\)\)/, "la struttura si sostituisce nell'array, come la V1");
  for (const message of [
    "Errore nel caricamento della struttura",
    "Struttura non trovata",
    "La struttura richiesta non esiste o non appartiene al club attivo.",
    "Torna alle strutture",
    "Struttura salvata",
    "Salvataggio struttura fallito",
    "Pagamento aggiunto con successo",
    "Pagamento eliminato",
    "Prenotazione salvata",
    "Prenotazione eliminata",
    "Struttura eliminata",
  ]) {
    assert.ok(sources.detail.includes(message), `manca il messaggio «${message}»`);
  }
  assert.match(sources.detail, /useConfirm\(\)/, "eliminare un pagamento o una prenotazione chiede conferma (immediato, non piu in un draft)");
  assert.match(sources.detail, /searchParams\?\.get\("clubId"\)/);
  assert.match(sources.detail, /withClubId\("\/structures", clubId\)/);
});

/* ------------------------------------------------------- prenotazioni */

test("prenotazione: gli undici campi e le tre validazioni della V1", () => {
  for (const label of ['label="Campo"', 'label="Titolo"', 'label="Data inizio"', 'label="Ora inizio"', 'label="Data fine"', 'label="Ora fine"', 'label="Stato"', 'label="Soggetto prenotante"', 'label="Importo"', 'label="Stato pagamento"', 'label="Note"']) {
    assert.ok(sources.booking.includes(label), `manca il campo ${label}`);
  }
  assert.match(sources.booking, /width="wide"/, "undici campi: 720");
  for (const message of ["Campo, titolo e orari sono obbligatori", "L'orario di fine deve essere successivo all'inizio", "Slot gia occupato per questo campo"]) {
    assert.ok(sources.bookingModel.includes(message), `manca «${message}»`);
  }
  assert.match(sources.bookingModel, /hasBookingConflict\(bookings, booking\)/);
  assert.match(sources.bookingModel, /date: localDateKey\(date\)/, "la data si rilegge con gli accessori locali, come l'ora (bug UAT date-only timezone shift)");
  assert.match(sources.bookingModel, /bookedByType: existing\?\.bookedByType \|\| "club"/, "confermare una richiesta della famiglia non ne cancella la firma");
  for (const option of ["In attesa", "Confermata", "Annullata", "Non pagato", "Parziale", "Pagato"]) {
    assert.ok(sources.model.includes(`label: "${option}"`), `manca l'opzione «${option}»`);
  }
});

test("prenotazione: buildBooking applica le validazioni V1 con gli stessi messaggi", () => {
  const structure = normalizeStructure({
    id: "s1",
    name: "PalaSport",
    fields: [{ id: "f1", name: "Campo A" }],
    bookings: [{ id: "b0", fieldId: "f1", title: "Occupato", start: toDateTime("2027-03-01", "18:00"), end: toDateTime("2027-03-01", "19:00"), status: "confirmed" }],
  });
  const base = { ...emptyBookingForm(), fieldId: "f1", startDate: "2027-03-01", endDate: "2027-03-01" };

  assert.equal(buildBooking(structure, { ...base, fieldId: "" }).errors[0].label, "Campo, titolo e orari sono obbligatori");
  assert.equal(buildBooking(structure, { ...base, startTime: "19:00", endTime: "18:00" }).errors[0].label, "L'orario di fine deve essere successivo all'inizio");
  assert.equal(buildBooking(structure, { ...base, startTime: "18:30", endTime: "19:30" }).errors[0].label, "Slot gia occupato per questo campo");
  const ok = buildBooking(structure, { ...base, startTime: "19:00", endTime: "20:00", amount: "12,5" });
  assert.ok(ok.booking);
  assert.equal(ok.booking.amount, 12.5);
  assert.equal(ok.booking.bookedByType, "club");
  assert.equal(ok.booking.fieldName, "Campo A");
  // una prenotazione annullata non occupa lo slot
  const cancelled = normalizeStructure({ ...structure, bookings: [{ ...structure.bookings[0], status: "cancelled" }] });
  assert.ok(buildBooking(cancelled, { ...base, startTime: "18:30", endTime: "19:30" }).booking);
});

test("calendario: sei settimane, colori per campo, giorno e prenotazione cliccabili", () => {
  assert.match(sources.calendar, /getCalendarDays\(monthDate\)/);
  assert.match(sources.calendar, /min-w-\[760px\]/, "sotto i 760 px scorre nel proprio contenitore");
  assert.match(sources.calendar, /overflow-x-auto/);
  assert.match(sources.calendar, /fieldTone\(String\(booking\.fieldId \|\| ""\), fieldIds\)/);
  assert.match(sources.calendar, /\+\{dayBookings\.length - visible\.length\} altre/);
  assert.match(sources.calendar, /Mese precedente/);
  assert.match(sources.calendar, /Mese successivo/);
  assert.match(sources.calendar, /onPickDay\(day\)/);
  assert.match(sources.calendar, /onPickBooking\(booking\)/);
});

/* ------------------------------------------------------- pagamenti d'affitto */

test("pagamento d'affitto: quattro campi, tre stati, gli stessi ripieghi della V1", () => {
  for (const label of ['label="Data"', 'label="Descrizione"', 'label="Importo"', 'label="Stato"']) {
    assert.ok(sources.payment.includes(label), `manca il campo ${label}`);
  }
  assert.match(sources.payment, /description: "Canone struttura"/);
  assert.match(sources.payment, /status: "In attesa"/);
  assert.match(sources.payment, /type: "Quota"/);
  assert.match(sources.payment, /todayLocalDateOnly\(\)/);
  assert.equal(rentPaymentSpec("Pagato").label, "PAGATO", "denaro in uscita: «pagato», non «incassato»");
  assert.equal(rentPaymentSpec("Scaduto").label, "SCADUTO");
  assert.equal(rentPaymentSpec("In attesa").label, "IN ATTESA");
});

/* ------------------------------------------------------- distruttiva */

test("eliminare una struttura: conferma distruttiva con cio che se ne va, eventi compresi", () => {
  assert.match(sources.del, /<DangerConfirmDialog/);
  assert.match(sources.del, /Questa azione eliminerà anche campi, tariffe e pagamenti associati\./, "la frase V1 resta");
  assert.match(sources.del, /getClubTrainings\(clubId\), getClubData\(clubId, "matches"\)/, "gli eventi che la usano si contano dalle proiezioni storiche");
  assert.match(sources.del, /Promise\.allSettled/, "la conferma non dipende da una lettura in piu");
  assert.equal(sources.del.includes("typedConfirmation"), false, "un record: nessuna conferma scritta");
  assert.equal(countEventsUsingStructure([{ structureId: "s1" }, { structure_id: "s1" }, { structureId: "s2" }, null], "s1"), 2);
});

/* ------------------------------------------------------- modello puro */

test("modello: gli orari dell'elenco sono l'unione delle fasce dei campi", () => {
  const structure = normalizeStructure({
    id: "s",
    name: "S",
    fields: [
      { id: "a", name: "A", availability: { Lun: [{ start: "18:00", end: "20:00" }], Ven: [{ start: "22:00", end: "02:00" }] } },
      { id: "b", name: "B", availability: { Lun: [{ start: "19:00", end: "22:00" }, { start: "09:00", end: "11:00" }] } },
    ],
  });
  assert.equal(describeStructureHours(structure), "Lun 09:00–11:00, 18:00–22:00 · Ven 22:00–02:00");
  assert.equal(describeStructureHours(normalizeStructure({ id: "x", name: "X", fields: [{ id: "f", name: "F" }] })), "", "senza fasce l'orario non e dichiarato: la cella scrive —");
  assert.equal(describeFieldSlots(structure.fields[1]), "Lun 19:00–22:00, 09:00–11:00");
});

test("modello: gli avvisi della scheda nominano cio che blocca la famiglia", () => {
  const closed = normalizeStructure({ id: "s", name: "S", fields: [] });
  assert.deepEqual(
    computeStructureAlerts(closed).map((a) => a.id),
    ["no-fields"],
    "visibile e prenotabile ma senza campi: la famiglia non puo prenotare",
  );
  const hidden = normalizeStructure({ id: "s", name: "S", isVisibleToMembers: false, fields: [] });
  assert.deepEqual(computeStructureAlerts(hidden), [], "una struttura nascosta non promette niente");
  const busy = normalizeStructure({
    id: "s",
    name: "S",
    fields: [{ id: "f", name: "F", availability: {} }],
    bookings: [{ id: "b", fieldId: "f", title: "T", start: "2027-03-01T18:00:00.000Z", end: "2027-03-01T19:00:00.000Z", status: "pending" }],
    payments: [{ id: "p", date: "2027-01-01", description: "Canone", amount: 100, status: "Scaduto" }],
  });
  assert.deepEqual(
    computeStructureAlerts(busy).map((a) => a.id),
    ["pending-bookings", "no-slots", "overdue-rent"],
  );
  assert.equal(computeStructureAlerts(null).length, 0);
});

test("modello: la sede si legge dall'indice delle sedi e lo stato di una prenotazione e una parola", () => {
  const sites = [{ id: "site-1", name: "Roma", city: "", address: "", notes: "", active: true }];
  assert.equal(structureSiteName({ siteId: "site-1" }, sites), "Roma");
  assert.equal(structureSiteName({ siteId: "site-9" }, sites), "", "una sede sconosciuta non si inventa");
  assert.equal(structureSiteName({ siteId: "" }, sites), "");
  assert.equal(BOOKING_STATUS.confirmed.label, "CONFERMATA");
  assert.equal(BOOKING_STATUS.pending.label, "IN ATTESA");
  assert.equal(BOOKING_STATUS.cancelled.label, "ANNULLATA");
});

test("il codice V1 specifico della rotta e stato rimosso", () => {
  for (const file of [
    "src/components/structures/StructureDetailPage.tsx",
    "src/components/structures/StructureInfoSection.tsx",
    "src/components/structures/StructureFieldsSection.tsx",
    "src/components/structures/StructurePricingSection.tsx",
    "src/components/structures/StructureRentPaymentsSection.tsx",
    "src/components/structures/StructureBookingsSection.tsx",
    "src/components/sites/club-sites-section.tsx",
  ]) {
    assert.equal(existsSync(path.join(process.cwd(), file)), false, `${file} non deve restare in parallelo alla V2`);
  }
  assert.equal(sources.list.includes("normalizeAvailability"), false, "la seconda copia di normalizeAvailability (PP-02 §L) e sparita con la pagina V1");
  assert.match(sources.clubId, /activeClub_\$\{owner\}/, "il ripiego sul club salvato per utente resta");
});
