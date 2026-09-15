import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  MEMBER_AREAS,
  computeMemberAlerts,
  getMemberDisplayName,
  isRegisteredMember,
  memberCardStatusSpec,
  memberRecordFrom,
  memberStatusDetail,
  memberStatusFilterKey,
  memberStatusSpec,
  mergeRegisterRows,
  registerStatusSpec,
  resolveMemberArea,
  withRegisterRecord,
} from "@/components/soci/v2/member-model";
import {
  emptyMemberFormValues,
  memberAdmissionPayload,
  memberEditPayload,
  memberFormValuesFrom,
  memberSectionPayload,
  validateMemberForm,
  validateMemberSection,
} from "@/components/soci/v2/member-form-model";
import { MEMBERSHIP_STATUS, PERSON_STATUS, resolveStatus } from "@/lib/web/status";
import { deriveMemberStatus } from "@/lib/members/model";

/**
 * Parita delle pagine Soci V2 con l'audit V1
 * (`docs/redesign/audit/wave-d-soci.md`).
 *
 * Il redesign cambia forma, non capacita: ogni etichetta, azione, campo ed
 * endpoint che l'audit elenca deve restare nel sorgente V2. Un test statico
 * non prova che funzioni — lo fa il lead a schermo — ma impedisce che una
 * capacita sparisca per distrazione.
 */
const read = (relative) => readFileSync(path.join(process.cwd(), relative), "utf8");
const V2 = "src/components/soci/v2";
const sources = {
  list: read("src/app/soci/page.tsx"),
  create: read("src/app/soci/new/page.tsx"),
  detail: read("src/app/soci/[id]/page.tsx"),
  edit: read("src/app/soci/[id]/edit/page.tsx"),
  form: read(`${V2}/member-form.tsx`),
  formModel: read(`${V2}/member-form-model.ts`),
  model: read(`${V2}/member-model.ts`),
  drawer: read(`${V2}/member-section-drawer.tsx`),
  eventDrawer: read(`${V2}/membership-event-drawer.tsx`),
  register: read(`${V2}/membership-register-section.tsx`),
  setType: read(`${V2}/set-member-type-drawer.tsx`),
  del: read(`${V2}/delete-member-dialog.tsx`),
  clubId: read(`${V2}/use-member-club-id.ts`),
};
const everything = Object.values(sources).join("\n");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ------------------------------------------------------------- /soci (elenco) */

test("/soci: intestazione di pagina con una sola azione primaria, i numeri e il disclaimer", () => {
  assert.match(sources.list, /<PageHeader/);
  assert.match(sources.list, /title="Soci"/);
  assert.match(sources.list, /<HeaderStat/);
  assert.equal((sources.list.match(/variant="primary"/g) || []).length, 2, "il primario di pagina e quello dello stato vuoto: nessun altro gradiente");
  assert.match(sources.list, /Nuovo socio/);
  assert.match(sources.list, /withClubId\("\/soci\/new", clubId\)/);
  assert.match(sources.list, /MEMBERSHIP_REGISTER_DISCLAIMER/, "cosa e questo elenco, detto nel prodotto");
  assert.match(sources.list, /label="attivi nel libro"/);
  assert.match(sources.list, /label="non nel libro"/);
});

test("/soci: la griglia unica porta le colonne della tabella e della vista a card V1 piu il libro", () => {
  assert.match(sources.list, /module="soci"/);
  for (const column of ['id: "identity"', 'id: "type"', 'id: "status"', 'id: "membershipNumber"', 'id: "registrationDate"', 'id: "email"', 'id: "phone"']) {
    assert.ok(sources.list.includes(column), `manca la colonna ${column}`);
  }
  assert.match(sources.list, /<IdentityCell/);
  assert.match(sources.list, /<StatusPill status=\{memberStatusSpec\(row\)\} detail=\{memberStatusDetail\(row\)\}/);
  for (const hidden of ['id: "admissionDate"', 'id: "cessationDate"', 'id: "cessationReason"', 'id: "cardStatus"', 'id: "fiscalCode"', 'id: "city"']) {
    assert.ok(sources.list.includes(hidden), `manca la colonna nascosta ${hidden}`);
  }
  assert.equal((sources.list.match(/hidden: true/g) || []).length, 6);
});

test("/soci: viste e filtri nascono dallo stato del libro; la V1 non filtrava e non cercava", () => {
  assert.match(sources.list, /label: "Soci", filters: \{ status: "member" \}/);
  assert.match(sources.list, /label: "Cessati"/);
  assert.match(sources.list, /label: "Non nel libro"[^\n]*tone: "amber"/);
  assert.match(sources.list, /id: "status",\s*label: "Stato",\s*type: "select",\s*pinned: true/);
  assert.match(sources.list, /label: "Tipo socio"/);
  assert.match(sources.list, /label: "Scheda"/);
  assert.match(sources.list, /search=\{search\}/);
  assert.match(sources.list, /requestedViewId=\{requestedViewId\}/, "i contatori dell'intestazione accendono la vista");
});

test("/soci: azioni di riga e di massa della V1, senza eliminazione di massa e senza conferma nativa", () => {
  assert.match(sources.list, /label: "Apri scheda", icon: <ChevronRight \/>, primary: true/);
  assert.match(sources.list, /label: "Modifica"/);
  assert.match(sources.list, /label: "Elimina", icon: <Trash2 \/>, tone: "danger"/);
  assert.match(sources.list, /<DeleteMemberDialog/);
  assert.doesNotMatch(senzaCommenti(everything), /window\.confirm|[^.\w]confirm\(/, "nessuna conferma nativa");
  for (const bulk of ['label: "Attiva"', 'label: "Disattiva"', 'label: "Tipo socio"', 'label: "Esporta PDF"', 'label: "Esporta CSV"']) {
    assert.ok(sources.list.includes(bulk), `manca l'azione di massa ${bulk}`);
  }
  assert.ok(sources.list.includes('soci ${status === "active" ? "attivati" : "disattivati"}'), "toast di attivazione e disattivazione della V1");
  assert.match(sources.list, /soci impostati come \$\{type\}/);
  assert.match(sources.setType, /Il tipo è uno solo: sostituisce/);
  assert.match(sources.setType, /MEMBER_TYPES\.map/, "l'elenco dei tipi e quello di lib/member-types.ts");
  // una scrittura per socio, mai la colonna intera; rilettura sempre; esito parziale detto
  assert.match(sources.list, /rows\.map\(\(socio\) => updateMemberProfile\(\{ clubId, memberId: String\(socio\.id\), updates: updatesFor\(socio\) \}\)\)/);
  assert.match(sources.list, /non sono stati aggiornati: /);
  assert.match(sources.list, /showToast\("error", error instanceof Error && error\.message \? error\.message : "Operazione non riuscita"\)/);
  assert.doesNotMatch(sources.list, /\.update\(\s*\{\s*members/, "l'anagrafica non si riscrive dal browser");
});

test("/soci: export con il motore condiviso, le stesse colonne toggle e i toast della V1", () => {
  assert.match(sources.list, /exportPeoplePdf\(\{\s*entity: "members"/);
  assert.match(sources.list, /exportPeopleCsv\(\{\s*entity: "members"/);
  assert.match(sources.list, /kinds: \["csv", "pdf"\]/);
  for (const toast of ["Nessun socio da esportare", "Consenti i popup per generare il PDF", "PDF pronto: si apre la finestra di stampa", "CSV scaricato"]) {
    assert.ok(sources.list.includes(toast), `manca il toast «${toast}»`);
  }
  for (const key of ["email:", "phone:", "membershipDate:", "status:"]) {
    assert.ok(sources.list.includes(`${key} columnIds.includes(`), `le colonne visibili non governano ${key}`);
  }
});

test("/soci: stati vuoto, caricamento ed errore; il libro non fa sparire l'elenco", () => {
  assert.match(sources.list, /title: "Nessun socio"/);
  assert.match(sources.list, /Inizia aggiungendo il primo socio della tua associazione/);
  assert.match(sources.list, /state=\{gridState\}/);
  assert.match(sources.list, /onRetry=\{reload\}/);
  assert.match(sources.list, /fetchMembershipRegister\(\{ clubId \}\)/);
  assert.match(sources.list, /if \(!libroError && libro\)/, "senza libro l'elenco resta quello dell'anagrafica");
  assert.match(sources.list, /\.select\("members"\)/);
});

test("/soci: i permessi sono quelli del dominio, e a chi non puo scrivere le azioni sono assenti", () => {
  assert.match(sources.list, /canManageMembershipRegister\(role\)/);
  assert.match(sources.list, /canReadMembershipRegister\(role\)/);
  assert.match(sources.list, /hidden: \(\) => !canManage, onClick: \(row\) => router\.push\(withClubId\(`\/soci\/\$\{row\.id\}\/edit`/);
  assert.match(sources.list, /hidden: !canManage, onRun: \(rows\) => setRowsStatus/);
  assert.doesNotMatch(senzaCommenti(sources.list), /disabled=\{!canManage\}/, "permesso negato = assente, mai disabilitato");
  assert.match(sources.list, /canManage \? \(\s*<Button variant="primary" icon=\{<Plus \/>\} onClick=\{goToNew\}>/);
});

/* ------------------------------------------------------------- /soci/new */

test("/soci/new: modulo intero con le sezioni della V1 e la stessa scrittura", () => {
  assert.match(sources.create, /<PageHeader eyebrow="Soci" title="Nuovo socio"/);
  assert.match(sources.create, /<MemberForm/);
  assert.match(sources.create, /mode="create"/);
  assert.match(sources.create, /admitNewMember\(\{ clubId, \.\.\.memberAdmissionPayload\(values\) \}\)/, "POST /api/v1/membership/admissions, una chiamata sola");
  assert.match(sources.create, /Socio ammesso con la tessera n\. \$\{data\.event\.membershipNumber\}/);
  assert.match(sources.create, /showToast\("error", "ID del club mancante"\)/);
  assert.match(sources.create, /withClubId\("\/soci", clubId\)/);
  for (const eyebrow of ['eyebrow="Anagrafica"', 'eyebrow="Contatti"', 'eyebrow="Taglie vestiario"', 'eyebrow="Libro soci" title="Ammissione"', 'eyebrow="Note"']) {
    assert.ok(sources.form.includes(eyebrow), `manca la sezione ${eyebrow}`);
  }
  for (const shared of ["<DocumentExtractionField", "<PersonIdentityFields", "<PhoneField", "<PersonResidenceFields", "<ClothingSizesFields"]) {
    assert.ok(sources.form.includes(shared), `il modulo deve montare ${shared}`);
  }
  for (const label of ['label="Tipo socio"', 'label="Data di ammissione"', 'label="Data della delibera"', 'label="Estremi della delibera"', 'label="Note"', 'addressLabel="Via\/Piazza"']) {
    assert.ok(sources.form.includes(label), `manca il campo ${label}`);
  }
  assert.match(sources.form, /Il numero di tessera lo assegna il libro soci: non si digita più a mano\./);
  assert.match(sources.form, /Delibera del consiglio direttivo n\. 12 del 28\/08\/2026/);
  assert.match(sources.form, /<StickyActionBar/);
  assert.match(sources.form, /<ValidationSummary/);
  assert.doesNotMatch(senzaCommenti(sources.form), /membershipNumber/, "il numero di tessera non si digita");
});

test("/soci/new: la validazione client ha le frasi della V1", () => {
  const idp = "member";
  const empty = emptyMemberFormValues();
  const errors = validateMemberForm(empty, idp, "create").map((e) => e.label);
  assert.deepEqual(errors, ["Nome e cognome sono obbligatori", "Servono gli estremi della delibera che ha ammesso il socio"]);
  const ok = validateMemberForm({ ...empty, firstName: "Mario", lastName: "Rossi", resolutionReference: "Delibera n. 1" }, idp, "create");
  assert.deepEqual(ok, []);
  // in modifica la delibera non si chiede: l'ammissione e gia nel libro
  assert.deepEqual(validateMemberForm({ ...empty, firstName: "Mario", lastName: "Rossi" }, idp, "edit"), []);
  assert.equal(empty.type, "Socio Ordinario");
  assert.match(empty.membershipDate, /^\d{4}-\d{2}-\d{2}$/, "la data di ammissione parte da oggi");
});

test("/soci/new: il payload dell'ammissione porta le stesse chiavi della V1", () => {
  const values = { ...emptyMemberFormValues(), firstName: " Mario ", lastName: "Rossi", email: "", phone: "333", fiscalCode: "RSSMRA", type: "Socio Onorario", membershipDate: "2026-09-01", resolutionReference: "Delibera 3", notes: "" };
  const payload = memberAdmissionPayload(values);
  assert.equal(payload.member.firstName, "Mario");
  assert.equal(payload.member.email, null, "un campo vuoto viaggia come null, come nella V1");
  assert.equal(payload.member.phone, "333");
  assert.equal(payload.member.type, "Socio Onorario");
  assert.equal(payload.effectiveDate, "2026-09-01");
  assert.equal(payload.resolutionReference, "Delibera 3");
  assert.equal(payload.resolutionDate, null);
  assert.deepEqual(Object.keys(payload.member).sort(), ["address", "birthDate", "birthPlace", "birthPlaceCode", "city", "clothingSizes", "email", "firstName", "fiscalCode", "gender", "lastName", "notes", "phone", "postalCode", "type"]);
  assert.ok(!("membershipNumber" in payload.member));
});

/* ------------------------------------------------------------- /soci/[id] */

test("/soci/[id]: intestazione di scheda, tre aree, avvisi e azioni distruttive solo nel menu", () => {
  assert.match(sources.detail, /<RecordHeader/);
  assert.match(sources.detail, /useBreadcrumbLabel\(member\?\.name \|\| null\)/);
  assert.match(sources.detail, /<RecordAreaSwitcher/);
  assert.match(sources.detail, /<RecordAlertStrip/);
  assert.match(sources.detail, /<CollapsedSection id="taglie"/);
  assert.match(sources.detail, /label: "Elimina", icon: <Trash2 \/>, tone: "danger", overflow: true, hidden: !canManage/);
  assert.match(sources.detail, /label: "Modifica", icon: <Pencil \/>, hidden: !canManage/);
  assert.deepEqual(MEMBER_AREAS.map((a) => a.value), ["profilo", "associativo", "libro"]);
  assert.equal(resolveMemberArea("anagrafica"), "profilo");
  assert.equal(resolveMemberArea("associativi"), "associativo");
  assert.equal(resolveMemberArea("libro"), "libro");
  assert.equal(resolveMemberArea(null), "profilo");
});

test("/soci/[id]: ogni sezione delle tre tab V1 ha un posto", () => {
  for (const label of [
    'title="Informazioni personali"',
    'title="Contatti e residenza"',
    'title="Taglie vestiario"',
    'title="Dati associativi"',
    "<ClubPersonAccessCard",
    'personaLabel="socio"',
    "<MembershipRegisterSection",
    "<ClothingSizesSummary",
  ]) {
    assert.ok(sources.detail.includes(label), `manca ${label}`);
  }
  for (const field of ['label: "Nome"', 'label: "Cognome"', 'label: "Data di nascita"', 'label: "Sesso"', 'label: "Luogo di nascita"', 'label: "Codice fiscale"', 'label: "Note"', 'label: "Email"', 'label: "Telefono"', 'label: "Indirizzo"', 'label: "Città"', 'label: "CAP"', 'label: "Tipo socio"', 'label: "Scheda"', 'label: "Data iscrizione"', 'label: "Scadenza iscrizione"', 'label: "Numero tessera (storico)"']) {
    assert.ok(sources.detail.includes(field), `manca il campo ${field}`);
  }
  assert.match(sources.detail, /La qualifica di socio è nell&apos;area «Libro soci»\./);
  for (const field of ['label: "Stato"', 'label: "Numero di tessera"', 'label: "Ammesso il"', 'label: "Delibera"', 'label: "Cessazione"', 'label: "Motivo"', 'title="Storico"']) {
    assert.ok(sources.register.includes(field), `manca nel libro ${field}`);
  }
  assert.match(sources.register, /Lo stato non è un campo: si ricava dagli eventi qui sotto\./);
  assert.match(sources.register, /Nessun evento nel libro per questo socio/);
  assert.match(sources.register, /Registrato il \{dateOrMissing\(evento\.createdAt\)\} a nome di \{evento\.memberLabel\}/);
  assert.match(sources.register, /MEMBERSHIP_REGISTER_DISCLAIMER/);
});

test("/soci/[id]: le modifiche per sezione vivono nei cassetti con la stessa scrittura della V1", () => {
  assert.match(sources.detail, /<MemberSectionDrawer/);
  assert.match(sources.detail, /updateMemberProfile\(\{ clubId, memberId, updates: payload \}\)/, "PATCH /api/v1/membership/profiles/{id}, una riga sola");
  assert.match(sources.detail, /showToast\("success", "Modifiche salvate con successo"\)/);
  assert.match(sources.detail, /"Errore nel salvataggio delle modifiche"/);
  assert.match(sources.drawer, /<Drawer/);
  assert.match(sources.drawer, /dirty=\{dirty\}/, "guardia sulle modifiche non salvate");
  assert.match(sources.drawer, /<FieldSizeProvider size="sm">/);
  for (const section of ['section === "personal"', 'section === "contacts"', 'section === "clothing"', 'section === "membership"']) {
    assert.ok(sources.drawer.includes(section), `manca il cassetto ${section}`);
  }
  assert.match(sources.form, /label="Stato della scheda"/);
  assert.match(sources.form, /label="Data iscrizione"/);
  assert.match(sources.form, /label="Scadenza iscrizione"/);
  assert.match(sources.form, /\{ value: "active", label: "Attivo" \},\s*\{ value: "inactive", label: "Inattivo" \}/);
});

test("/soci/[id]: eliminazione con il dialogo distruttivo e la frase della V1; il libro sa dire di no", () => {
  assert.match(sources.del, /<DangerConfirmDialog/);
  assert.match(sources.del, /Sei sicuro di voler eliminare questo socio\?/);
  assert.match(sources.del, /confirmLabel="Elimina"/);
  assert.match(sources.del, /la cancellazione verrà rifiutata/);
  assert.match(sources.detail, /removeMemberProfile\(\{ clubId, memberId \}\)/, "DELETE /api/v1/membership/profiles/{id}");
  assert.match(sources.detail, /"Socio eliminato con successo"/);
  assert.match(sources.detail, /"Errore nell'eliminazione del socio"/);
  assert.match(sources.list, /"Socio eliminato"/);
  assert.match(sources.detail, /Torna alla lista soci/);
});

test("/soci/[id]: il libro si legge con fetchMembershipRecord e si scrive solo aggiungendo un evento", () => {
  assert.match(sources.detail, /fetchMembershipRecord\(memberId, \{ clubId \}\)/, "GET /api/v1/membership/events?member_id=");
  assert.match(sources.eventDrawer, /recordMembershipEvent\(\{/, "POST /api/v1/membership/events");
  assert.match(sources.eventDrawer, /canApplyMembershipEvent\(stato, tipo\)/, "solo gli eventi possibili dallo stato corrente");
  assert.match(sources.eventDrawer, /validateMembershipEventDraft\(/, "la stessa validazione del server, prima del clic");
  for (const label of ['label="Evento"', 'label="Ha effetto dal"', 'label="Motivo"', 'label="Estremi della delibera"', 'label="Data della delibera"', 'label="Note"']) {
    assert.ok(sources.eventDrawer.includes(label), `manca il campo ${label}`);
  }
  assert.match(sources.eventDrawer, /Dimissioni volontarie, morosità, trasferimento…/);
  assert.match(sources.eventDrawer, /Registra nel libro/);
  assert.match(sources.eventDrawer, /"Evento registrato nel libro soci"/);
  assert.match(sources.eventDrawer, /<DangerConfirmDialog/, "una cessazione chiude la qualifica e il registro e append-only");
  assert.match(sources.eventDrawer, /if \(serveMotivo\) \{\s*setConfirming\(true\);/);
  assert.match(sources.register, /canManage && eventiPossibili\.length > 0 \?/, "senza permesso il pulsante e assente");
  assert.match(sources.detail, /\{canManage \? \(\s*<MembershipEventDrawer/);
  assert.match(sources.detail, /canManageMembershipRegister\(role\)/);
  assert.match(sources.detail, /canReadMembershipRegister\(role\)/);
  assert.doesNotMatch(everything, /@\/lib\/server\/members/, "nessun componente client importa il servizio");
  assert.doesNotMatch(everything, /libro soci (ufficiale|conforme|a norma)/i);
});

/* ------------------------------------------------------------- /soci/[id]/edit */

test("/soci/[id]/edit: il modulo intero in modifica, con la zona pericolosa", () => {
  assert.ok(existsSync(path.join(process.cwd(), "src/app/soci/[id]/edit/page.tsx")));
  assert.match(sources.edit, /mode="edit"/);
  assert.match(sources.edit, /updateMemberProfile\(\{ clubId, memberId, updates: memberEditPayload\(values\) \}\)/);
  assert.match(sources.edit, /dangerZone=/);
  assert.match(sources.edit, /Elimina socio/);
  assert.match(sources.edit, /useBreadcrumbLabel\(member\?\.name \|\| null\)/);
  assert.match(sources.edit, /!canManage \?/, "a chi non puo scrivere si mostra la scheda, non il modulo");
});

/* ------------------------------------------------------------- il modello */

test("il record si legge da una funzione sola, con i ripieghi della V1", () => {
  const raw = { id: 7, first_name: "Mario", surname: "Rossi", email: "m@x.it", type: "", status: undefined, membershipDate: "2024-01-05", membershipNumber: "12", notes: "n", clothingSizes: { shirt: "M" } };
  const record = memberRecordFrom({ ...raw, id: String(raw.id) });
  assert.equal(record.name, "Rossi Mario");
  assert.equal(record.firstName, "Mario");
  assert.equal(record.lastName, "Rossi");
  assert.equal(record.type, "Socio Ordinario");
  assert.equal(record.status, "active");
  assert.equal(record.registrationDate, "2024-01-05");
  assert.equal(record.legacyMembershipNumber, "12", "il numero digitato a mano resta leggibile, non e piu la fonte");
  assert.equal(record.membershipNumber, "", "il numero del libro arriva dal registro");
  assert.equal(record.inRegister, false);
  assert.equal(getMemberDisplayName({ name: "undefined undefined" }), "Nome non disponibile");
  assert.equal(isRegisteredMember({ id: "x" }), false);
  assert.equal(isRegisteredMember({ id: "x", email: "a@b.c" }), true);
});

test("il libro si fonde riga per riga e chi non e nel libro resta com'e", () => {
  const a = memberRecordFrom({ id: "a", firstName: "Anna", lastName: "Bianchi" });
  const b = memberRecordFrom({ id: "b", firstName: "Bruno", lastName: "Verdi", status: "inactive" });
  const derived = deriveMemberStatus([
    { id: "e1", eventType: "ADMISSION", effectiveDate: "2024-01-10", membershipNumber: "0004", resolutionReference: "Del. 1", createdAt: "2024-01-10" },
    { id: "e2", eventType: "LAPSE", effectiveDate: "2025-03-01", reason: "morosita", createdAt: "2025-03-01" },
  ]);
  const merged = mergeRegisterRows([a, b], [{ memberId: "a", memberLabel: "Bianchi Anna", memberType: null, status: derived, eventCount: 2, onlyInRegister: false }]);
  assert.equal(merged[0].inRegister, true);
  assert.equal(merged[0].isMemberNow, false);
  assert.equal(merged[0].membershipNumber, "0004");
  assert.equal(merged[0].cessationReason, "morosita");
  assert.equal(memberStatusSpec(merged[0]), MEMBERSHIP_STATUS.lapsed);
  assert.equal(memberStatusFilterKey(merged[0]), "ceased");
  assert.match(memberStatusDetail(merged[0]), /^dal /);
  assert.equal(merged[1].inRegister, false);
  assert.equal(memberStatusSpec(merged[1]), MEMBERSHIP_STATUS.card_inactive, "fuori dal libro parla la scheda");
  assert.equal(memberStatusFilterKey(merged[1]), "not_in_register");
  const active = withRegisterRecord(b, { memberId: "b", memberLabel: "", status: deriveMemberStatus([{ id: "e", eventType: "ADMISSION", effectiveDate: "2024-01-01" }]), events: [{ id: "e" }] });
  assert.equal(memberStatusSpec(active), PERSON_STATUS.active, "socio attivo si pronuncia come una persona attiva");
  assert.equal(memberStatusFilterKey(active), "member");
});

test("le parole del libro vivono in lib/web/status e nessuna di persona o iscrizione le diceva", () => {
  assert.deepEqual(MEMBERSHIP_STATUS.resigned, { label: "DIMESSO", weight: "quiet", hue: "neutral" });
  assert.deepEqual(MEMBERSHIP_STATUS.lapsed, { label: "DECADUTO", weight: "outline", hue: "amber" });
  assert.deepEqual(MEMBERSHIP_STATUS.expelled, { label: "ESCLUSO", weight: "urgent", hue: "red" });
  assert.deepEqual(MEMBERSHIP_STATUS.none, { label: "NON SOCIO", weight: "quiet", hue: "neutral" });
  assert.deepEqual(MEMBERSHIP_STATUS.reinstated, { label: "RIAMMESSO", weight: "solid", hue: "green" });
  assert.equal(MEMBERSHIP_STATUS.admitted, PERSON_STATUS.active);
  assert.equal(registerStatusSpec("espulso"), MEMBERSHIP_STATUS.expelled);
  assert.equal(registerStatusSpec("mai_ammesso"), MEMBERSHIP_STATUS.none);
  assert.equal(resolveStatus("Dimesso"), MEMBERSHIP_STATUS.resigned);
  assert.equal(memberCardStatusSpec("active").label, "SCHEDA ATTIVA");
  assert.equal(memberCardStatusSpec("inactive").label, "SCHEDA NON ATTIVA");
});

test("gli avvisi della scheda nascono dai dati gia caricati", () => {
  const base = memberRecordFrom({ id: "x", firstName: "A", lastName: "B", email: "a@b.c" });
  assert.deepEqual(computeMemberAlerts(base).map((a) => a.id), ["not-in-register"]);
  assert.deepEqual(computeMemberAlerts(base, { registerReadable: false }), [], "a chi non legge il libro non si dice che manca");
  const noContact = { ...base, email: "", phone: "" };
  assert.deepEqual(computeMemberAlerts(noContact).map((a) => a.id), ["not-in-register", "no-contact"]);
  const socioMaSchedaSpenta = { ...base, status: "inactive", inRegister: true, isMemberNow: true, registerStatus: "ammesso" };
  assert.deepEqual(computeMemberAlerts(socioMaSchedaSpenta).map((a) => a.id), ["card-inactive"]);
  assert.deepEqual(computeMemberAlerts(null), []);
});

test("i cassetti scrivono solo la loro sezione; il nome intero segue nome e cognome; la tessera mai", () => {
  const values = { ...memberFormValuesFrom({ id: "x", firstName: "Mario", lastName: "Rossi", email: "m@x.it", type: "Socio Sostenitore", membershipExpiry: "2027-01-01" }), firstName: "Maria" };
  const personal = memberSectionPayload("personal", values);
  assert.equal(personal.firstName, "Maria");
  assert.equal(personal.name, "Rossi Maria");
  assert.equal(personal.fullName, "Rossi Maria");
  assert.ok(!("email" in personal));
  const contacts = memberSectionPayload("contacts", values);
  assert.deepEqual(Object.keys(contacts).sort(), ["address", "city", "email", "phone", "postalCode"]);
  const membership = memberSectionPayload("membership", values);
  assert.deepEqual(Object.keys(membership).sort(), ["membershipExpiry", "registrationDate", "status", "type"]);
  assert.ok(!("membershipNumber" in membership), "il server lo scartava: il campo morto della V1 non torna");
  assert.deepEqual(Object.keys(memberSectionPayload("clothing", values)), ["clothingSizes"]);
  const full = memberEditPayload(values);
  assert.equal(full.type, "Socio Sostenitore");
  assert.equal(full.membershipExpiry, "2027-01-01");
  assert.ok(!("resolutionReference" in full), "la delibera non e un campo della scheda");
  assert.deepEqual(validateMemberSection("personal", { ...values, lastName: "" }, "member-edit").map((e) => e.label), ["Nome e cognome sono obbligatori"]);
  assert.deepEqual(validateMemberSection("contacts", { ...values, lastName: "" }, "member-edit"), []);
});

test("il clubId si risolve come nella V1: URL, poi contesto, poi localStorage", () => {
  assert.match(sources.clubId, /localStorage\.getItem\("activeClub"\)/);
  assert.match(sources.clubId, /if \(isValid\(preferred\)\)/);
  assert.match(sources.clubId, /if \(activeClub\?\.id\)/);
  assert.match(sources.clubId, /export const withClubId/);
});

test("la V1 specifica di questa rotta e stata rimossa", () => {
  assert.equal(existsSync(path.join(process.cwd(), "src/app/soci/[id]/membership-register-panel.tsx")), false);
  assert.equal(existsSync(path.join(process.cwd(), "src/components/club/ClubPersonDetailHeader.tsx")), false, "aveva un solo importatore: la scheda socio");
  for (const legacy of ["MembershipStatusBadge", "getSocioIdentity", "isRegisteredSocio", "<MobileTopBar", "BulkSelectionToolbar", "SharedPageHeader", "<Tabs"]) {
    assert.ok(!senzaCommenti(everything).includes(legacy), `${legacy} non deve restare in parallelo alla V2`);
  }
});
