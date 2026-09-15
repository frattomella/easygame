import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  STAFF_ON_LEAVE_STATUS,
  computeStaffAlerts,
  departmentChipTone,
  getStaffDisplayName,
  resolveStaffArea,
  staffHireDate,
  staffStatusSpec,
} from "@/components/staff/v2/staff-model";
import { staffSectionPayload, staffFormValuesFrom, validateStaffForm } from "@/components/staff/v2/staff-form-model";

/**
 * Parita delle pagine Staff V2 con l'audit V1
 * (`docs/redesign/audit/wave-a-allenatori-staff.md`, sezioni `/staff*`).
 *
 * Il redesign cambia forma, non capacita: ogni etichetta, azione, campo ed
 * endpoint che l'audit elenca deve restare nel sorgente V2. Un test statico
 * non prova che funzioni — lo fa il lead a schermo — ma impedisce che una
 * capacita sparisca per distrazione.
 */
const read = (relative) => readFileSync(path.join(process.cwd(), relative), "utf8");
const V2 = "src/components/staff/v2";
const sources = {
  list: read("src/app/staff/page.tsx"),
  create: read("src/app/staff/new/page.tsx"),
  detail: read("src/app/staff/[id]/page.tsx"),
  edit: read("src/app/staff/[id]/edit/page.tsx"),
  form: read(`${V2}/staff-form.tsx`),
  drawer: read(`${V2}/staff-section-drawer.tsx`),
  formModel: read(`${V2}/staff-form-model.ts`),
  departments: read(`${V2}/departments-drawer.tsx`),
  move: read(`${V2}/move-department-drawer.tsx`),
  del: read(`${V2}/delete-staff-dialog.tsx`),
  access: read(`${V2}/use-staff-access-emails.ts`),
  model: read(`${V2}/staff-model.ts`),
};
const everything = Object.values(sources).join("\n");

/* ------------------------------------------------------------ /staff (elenco) */

test("/staff: intestazione di pagina con una sola azione primaria e i reparti nell'overflow", () => {
  assert.match(sources.list, /<PageHeader/);
  assert.match(sources.list, /title="Staff"/);
  assert.match(sources.list, /<HeaderStat/);
  assert.equal((sources.list.match(/variant="primary"/g) || []).length, 2, "il primario di pagina e quello dello stato vuoto: nessun altro gradiente");
  assert.match(sources.list, /Nuovo membro dello staff/);
  assert.match(sources.list, /withClubId\("\/staff\/new", clubId\)/);
  assert.match(sources.list, /Gestisci reparti/);
  assert.match(sources.list, /<DepartmentsDrawer/);
});

test("/staff: la griglia unica porta le colonne della tabella e della vista a card V1", () => {
  assert.match(sources.list, /module="staff"/);
  for (const column of ['id: "identity"', 'id: "department"', 'id: "role"', 'id: "status"', 'id: "email"', 'id: "phone"', 'id: "hireDate"']) {
    assert.ok(sources.list.includes(column), `manca la colonna ${column}`);
  }
  // la card mostrava ruolo come sottotitolo e «Non assegnato» per il reparto
  assert.match(sources.list, /meta=\{joinMeta\(row\.role, normalizeDepartmentName\(row\.department\) \|\| "Non assegnato"\)\}/);
  assert.match(sources.list, /<IdentityCell/);
  assert.match(sources.list, /<StatusPill status=\{staffStatusSpec\(row\.status\)\}/);
  // colonne nascoste di default
  for (const hidden of ['id: "documentExpiry"', 'id: "fiscalCode"', 'id: "city"']) {
    assert.ok(sources.list.includes(hidden), `manca la colonna nascosta ${hidden}`);
  }
  assert.equal((sources.list.match(/hidden: true/g) || []).length, 3);
});

test("/staff: la colonna «Accesso EasyGame» usa la stessa rotta e lo stesso perimetro della scheda", () => {
  assert.match(sources.access, /\/api\/v1\/club-roles\/assignments/);
  assert.match(sources.access, /canManageClubConfigurationAsActor/);
  assert.match(sources.access, /ACCOUNT_STATUS\.linked/);
  assert.match(sources.access, /ACCOUNT_STATUS\.none/);
  assert.match(sources.list, /if \(access\.enabled\) \{/, "senza permesso la colonna e assente, non disabilitata");
  assert.match(sources.list, /header: "Accesso EasyGame"/);
});

test("/staff: filtri e viste rispecchiano il filtro reparto della V1 e lo stato", () => {
  assert.match(sources.list, /id: "department",\s*label: "Reparto",\s*type: "select",\s*pinned: true/);
  assert.match(sources.list, /label: "Stato"/);
  assert.match(sources.list, /label: "Ruolo"/);
  assert.match(sources.list, /label: "Senza reparto"/);
  assert.match(sources.list, /label: "Attivi"/);
  assert.match(sources.list, /label: "Non attivi"/);
  assert.match(sources.list, /search=\{search\}/, "la V1 non cercava; la griglia si");
});

test("/staff: azioni di riga e di massa della V1, senza eliminazione di massa", () => {
  assert.match(sources.list, /label: "Apri scheda", icon: <ChevronRight \/>, primary: true/);
  assert.match(sources.list, /label: "Modifica"/);
  assert.match(sources.list, /label: "Elimina", icon: <Trash2 \/>, tone: "danger"/);
  assert.match(sources.list, /<DeleteStaffDialog/);
  const code = everything.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /window\.confirm|[^.\w]confirm\(/, "nessuna conferma nativa");
  for (const bulk of ['label: "Attiva"', 'label: "Disattiva"', 'label: "Sposta in un reparto"', 'label: "Esporta PDF"', 'label: "Esporta CSV"']) {
    assert.ok(sources.list.includes(bulk), `manca l'azione di massa ${bulk}`);
  }
  assert.ok(sources.list.includes('membri dello staff ${status === "active" ? "attivati" : "disattivati"}'), "toast di attivazione e disattivazione della V1");
  assert.match(sources.list, /membri dello staff spostati in \$\{department\.name\}/);
  assert.match(sources.move, /Il reparto è uno solo: sostituisce/);
  // una sola UPDATE per l'intero lotto
  assert.match(sources.list, /const updated = staffMembers\.map\(\(member\) => \(targetIds\.has/);
  assert.match(sources.list, /await writeStaffMembers\(updated\)/);
  assert.match(sources.list, /showToast\("error", "Operazione non riuscita"\)/);
});

test("/staff: export con il motore condiviso e i toast della V1", () => {
  assert.match(sources.list, /exportPeoplePdf\(\{\s*entity: "staff"/);
  assert.match(sources.list, /exportPeopleCsv\(\{\s*entity: "staff"/);
  assert.match(sources.list, /kinds: \["csv", "pdf"\]/);
  for (const toast of ["Nessun elemento da esportare", "Consenti i popup per generare il PDF", "PDF pronto: si apre la finestra di stampa", "CSV scaricato"]) {
    assert.ok(sources.list.includes(toast), `manca il toast «${toast}»`);
  }
  for (const key of ["role:", "department:", "email:", "phone:", "status:", "hireDate:"]) {
    assert.ok(sources.list.includes(`${key} columnIds.includes(`), `le colonne visibili non governano ${key}`);
  }
});

test("/staff: stati vuoto, filtrato-vuoto, caricamento ed errore", () => {
  assert.match(sources.list, /title: "Nessun membro dello staff"/);
  assert.match(sources.list, /Inizia aggiungendo il primo membro del tuo staff/);
  assert.match(sources.list, /state=\{gridState\}/);
  assert.match(sources.list, /onRetry=\{reload\}/);
  assert.match(sources.list, /loading \? "loading" : loadError \? "error" : "ready"/);
});

test("/staff: stesse letture e scritture della V1", () => {
  assert.match(sources.list, /\.select\("staff_members, settings"\)/);
  assert.match(sources.list, /resolveStaffDepartments\(settings, members\)/);
  assert.match(sources.list, /\.update\(\{ staff_members: next \}\)/);
  assert.match(sources.list, /saveStaffDepartments\(clubId, next\)/);
  assert.match(sources.list, /deleteStaffDepartment\(clubId, departmentId\)/);
  assert.match(sources.list, /department: "" \} : member/, "eliminare un reparto azzera il reparto dei membri che lo usavano");
  assert.doesNotMatch(sources.list, /settings:\s*\{/, "il blob settings non si riscrive dalla pagina");
});

test("/staff: il cassetto reparti tiene nome, descrizione, colore, modifica ed eliminazione", () => {
  assert.match(sources.departments, /<Drawer/);
  assert.match(sources.departments, /width="default"/);
  assert.match(sources.departments, /Nome reparto/);
  assert.match(sources.departments, /Descrizione/);
  assert.match(sources.departments, /STAFF_DEPARTMENT_COLORS\.map/);
  assert.match(sources.departments, /makeDepartmentId\(name\)/, "l'id deriva dal nome, non dall'orologio");
  assert.match(sources.departments, /Inserisci un nome per il reparto/);
  assert.match(sources.departments, /esiste già/);
  assert.match(sources.departments, /creato con successo/);
  assert.match(sources.departments, /staff assegnati/);
  assert.match(sources.departments, /Nessun reparto creato/);
  assert.match(sources.departments, /Crea reparto/);
  assert.match(sources.departments, /Salva reparto/);
  assert.match(sources.departments, /Annulla modifica/);
  assert.match(sources.departments, /<ConfirmDialog/, "eliminare un reparto chiede: azzera il reparto di chi lo usava");
});

test("/staff: la vecchia tabella e la vecchia dialog non esistono piu", () => {
  assert.equal(existsSync(path.join(process.cwd(), "src/components/staff/StaffTable.tsx")), false);
  assert.equal(existsSync(path.join(process.cwd(), "src/components/staff/DepartmentManagement.tsx")), false);
  assert.doesNotMatch(sources.list, /viewMode|LayoutGrid|BulkSelectionToolbar|useListSelection/);
});

/* ------------------------------------------------------ /staff/new e /edit */

test("/staff/new: modulo a pagina intera con le sei sezioni della V1", () => {
  assert.match(sources.create, /<StaffForm/);
  assert.match(sources.create, /mode="create"/);
  assert.match(sources.create, /title="Nuovo membro dello staff"/);
  assert.match(sources.create, /submitLabel="Salva membro"/);
  for (const eyebrow of ['eyebrow="Anagrafica"', 'eyebrow="Taglie vestiario"', 'eyebrow="Contatti"', 'eyebrow="Documenti"', 'eyebrow="Dati societari"', 'eyebrow="Note"']) {
    assert.ok(sources.form.includes(eyebrow), `manca la sezione ${eyebrow}`);
  }
  assert.match(sources.form, /<ValidationSummary/);
  assert.match(sources.form, /Modifiche non salvate/);
  assert.match(sources.form, /sticky bottom-0/);
});

test("/staff/new: ogni campo della V1 e nel modulo, con i blocchi condivisi", () => {
  for (const block of ["<DocumentExtractionField", "<PersonIdentityFields", "<ClothingSizesFields", "<PhoneField", "<PersonResidenceFields"]) {
    assert.ok(sources.form.includes(block), `manca ${block}`);
  }
  assert.match(sources.form, /withDocumentReader=\{mode === "create"\}/, "la lettura del documento e nella creazione, come nella V1");
  assert.match(sources.form, /required=\{requireNames \? \{ firstName: true, lastName: true \} : undefined\}/);
  assert.match(sources.form, /label="Nazionalità"/);
  assert.match(sources.formModel, /nationality: "Italiana"/, "default V1");
  assert.match(sources.form, /placeholder="email@esempio.com"/);
  assert.match(sources.form, /\* Almeno un contatto è obbligatorio/);
  for (const label of ['label="Tipo documento"', 'label="Numero documento"', 'label="Scadenza documento"', 'label="Data di rilascio"', 'label="Scadenza permesso di soggiorno"']) {
    assert.ok(sources.form.includes(label), `manca ${label}`);
  }
  assert.match(sources.model, /Carta d'Identità/);
  assert.match(sources.model, /Patente/);
  assert.match(sources.model, /Passaporto/);
  assert.match(sources.form, /label="Ruolo"[^>]*required/);
  assert.match(sources.form, /label: "Altro\.\.\."/);
  assert.match(sources.form, /CUSTOM_OPTION_VALUE/);
  assert.match(sources.form, /Inserisci ruolo personalizzato/);
  assert.match(sources.form, /Inserisci reparto personalizzato/);
  assert.match(sources.form, /label="Data assunzione"/);
  assert.match(sources.model, /label: "In congedo"/, "il terzo stato della V1 resta");
  assert.match(sources.form, /placeholder="Inserisci eventuali note\.\.\."/);
});

test("/staff/new: validazioni e scritture della V1", () => {
  const errors = validateStaffForm({ ...staffFormValuesFrom(null) }, "staff").map((e) => e.label);
  assert.deepEqual(errors, [
    "Il nome è obbligatorio",
    "Il cognome è obbligatorio",
    "È necessario inserire almeno un contatto (email o telefono)",
    "Il ruolo è obbligatorio",
  ]);
  assert.deepEqual(
    validateStaffForm({ ...staffFormValuesFrom(null), name: "A", surname: "B", phone: "333", role: "Custode" }, "staff"),
    [],
  );
  assert.match(sources.create, /ID del club mancante\. Impossibile salvare\./);
  assert.match(sources.create, /await addStaffMember\(clubId, \{/);
  assert.match(sources.create, /await ensureStaffDepartment\(clubId, values\.department\)/);
  assert.match(sources.create, /Membro dello staff aggiunto con successo/);
  assert.match(sources.create, /router\.push\(withClubId\("\/staff", clubId\)\)/);
  assert.match(sources.create, /collectStaffRoles\(members\)/);
});

test("/staff/[id]/edit: e un modulo intero, non piu un rinvio", () => {
  assert.doesNotMatch(sources.edit, /redirect\(/);
  assert.match(sources.edit, /mode="edit"/);
  assert.match(sources.edit, /updateClubDataItem\(clubId, "staff_members", staffId, payload\)/);
  assert.match(sources.edit, /ensureStaffDepartment\(clubId, payload\.department\)/);
  assert.match(sources.edit, /Modifiche salvate con successo/);
  assert.match(sources.edit, /Errore nel salvataggio delle modifiche/);
  assert.match(sources.edit, /useBreadcrumbLabel/);
  assert.match(sources.edit, /Zona pericolosa|dangerZone=/);
  assert.match(sources.edit, /deleteStaffMember\(clubId, staffId\)/);
});

/* ------------------------------------------------------------ /staff/[id] */

test("/staff/[id]: intestazione di scheda con Elimina solo nell'overflow", () => {
  assert.match(sources.detail, /<RecordHeader/);
  assert.match(sources.detail, /identity=\{\{ name: identity\.fullName, round: true \}\}/);
  assert.match(sources.detail, /<RecordAlertStrip/);
  assert.match(sources.detail, /<RecordAreaSwitcher/);
  assert.match(sources.detail, /useBreadcrumbLabel\(displayName\)/);
  assert.match(sources.detail, /id: "delete", label: "Elimina", icon: <Trash2 \/>, tone: "danger", overflow: true/);
  assert.match(sources.detail, /id: "edit", label: "Modifica"/);
  assert.doesNotMatch(sources.detail, /Invia Credenziali|handleShareCredentials/);
});

test("/staff/[id]: le quattro tab V1 vivono nelle tre aree", () => {
  assert.deepEqual(resolveStaffArea("anagrafica"), { area: "profilo" });
  assert.deepEqual(resolveStaffArea("documenti"), { area: "profilo", section: "documento" });
  assert.deepEqual(resolveStaffArea("societari"), { area: "incarico" });
  assert.deepEqual(resolveStaffArea("lavoro"), { area: "lavoro" });
  assert.deepEqual(resolveStaffArea(null), { area: "profilo" });
  assert.match(sources.detail, /searchParams\?\.get\("tab"\)/);
  assert.match(sources.detail, /query\.set\("tab", next\)/, "cambiare area aggiorna il link profondo");

  // Profilo: Informazioni personali + Contatti e residenza + Documento
  for (const label of ['"Nome"', '"Cognome"', '"Età"', '"Data di nascita"', '"Nazionalità"', '"Luogo di nascita"', '"Sesso"', '"Formazione scolastica"', '"Codice fiscale"', '"Note"']) {
    assert.ok(sources.detail.includes(`label: ${label}`), `manca il campo ${label} in Informazioni personali`);
  }
  for (const label of ['"Email"', '"Telefono"', '"Indirizzo"', '"Città"', '"CAP"']) {
    assert.ok(sources.detail.includes(`label: ${label}`), `manca il campo ${label} in Contatti e residenza`);
  }
  for (const label of ['"Tipo di documento"', '"Numero documento"', '"Data di rilascio"', '"Scadenza del documento"', '"Scadenza permesso di soggiorno"']) {
    assert.ok(sources.detail.includes(`label: ${label}`), `manca il campo ${label} nel documento`);
  }
  assert.match(sources.detail, /title="Documento di identità"/);
  // Incarico: Informazioni societarie + Taglie + Accesso EasyGame
  assert.match(sources.detail, /title="Informazioni societarie"/);
  for (const label of ['"Ruolo"', '"Stato"', '"Data di assunzione"', '"Reparto"']) {
    assert.ok(sources.detail.includes(`label: ${label}`), `manca ${label} in Informazioni societarie`);
  }
  assert.match(sources.detail, /title="Taglie vestiario"/);
  assert.match(sources.detail, /<ClothingSizesSummary/);
  assert.match(sources.detail, /<ClubPersonAccessCard email=\{staffMember\.email\} personaLabel="membro dello staff" \/>/);
  // Lavoro e compensi
  assert.match(sources.detail, /<PersonCompensationTab\s+originType="staff_member"/);
});

test("/staff/[id]: il reparto si salva in linea, il resto nei cassetti", () => {
  assert.match(sources.detail, /onValueChange=\{\(value\) => void handleDepartmentChange\(value\)\}/);
  assert.match(sources.detail, /I reparti disponibili arrivano dalla gestione reparti dello staff\./);
  assert.match(sources.detail, /label: "Non assegnato"/);
  assert.match(sources.detail, /Reparto aggiornato con successo/);
  assert.match(sources.detail, /Errore nell'aggiornamento del reparto/);
  assert.match(sources.detail, /await ensureStaffDepartment\(clubId, nextDepartment\)/);
  assert.match(sources.detail, /<StaffSectionDrawer/);
  for (const section of ['"personal"', '"contacts"', '"company"', '"clothing"', '"document"']) {
    assert.ok(
      sources.detail.includes(`setEditingSection(${section})`) || sources.detail.includes(`editButton(${section})`),
      `nessun pulsante apre la sezione ${section}`,
    );
  }
  assert.match(sources.drawer, /<Drawer/);
  assert.match(sources.drawer, /dirty=\{dirty\}/, "la guardia sulle modifiche non salvate");
  assert.match(sources.drawer, /Salva modifiche/);
  assert.match(sources.detail, /updateClubDataItem\(clubId, "staff_members", staffId, payload\)/);
  assert.match(sources.detail, /Modifiche salvate con successo/);
  assert.match(sources.detail, /Errore nel salvataggio delle modifiche/);
});

test("/staff/[id]: eliminazione, stati e retry come nella V1", () => {
  assert.match(sources.detail, /deleteStaffMember\(clubId, staffId\)/);
  assert.match(sources.detail, /Membro dello staff eliminato con successo/);
  assert.match(sources.detail, /Errore nell'eliminazione del membro dello staff/);
  assert.match(sources.detail, /retryCount < 3/);
  assert.match(sources.detail, /1000 \* \(retryCount \+ 1\)/);
  for (const toast of [
    "ID del membro dello staff mancante",
    "Errore nel caricamento dei dati del club:",
    "Club non trovato. Verifica l'ID del club.",
    "Membro dello staff non trovato",
    "Errore nel caricamento dei dati del membro dello staff",
    "Torna alla lista staff",
  ]) {
    assert.ok(sources.detail.includes(toast), `manca «${toast}»`);
  }
  assert.match(sources.del, /Sei sicuro di voler eliminare questo membro dello staff\?/);
  assert.match(sources.del, /<DangerConfirmDialog/);
});

/* ----------------------------------------------------------- modello puro */

test("il modello: stato, nome, data di assunzione e reparto", () => {
  assert.equal(staffStatusSpec("active").label, "ATTIVO");
  assert.equal(staffStatusSpec("inactive").label, "DISATTIVATO");
  assert.equal(staffStatusSpec("on_leave"), STAFF_ON_LEAVE_STATUS);
  assert.equal(staffStatusSpec("").label, "NON REGISTRATO");
  assert.equal(getStaffDisplayName({ name: "Anna", surname: "Rossi" }), "Anna Rossi");
  assert.equal(getStaffDisplayName({ fullName: "Anna Rossi", name: "Anna" }), "Anna Rossi");
  assert.equal(getStaffDisplayName({}), "Nome non disponibile");
  assert.equal(staffHireDate({ hire_date: "2024-01-02" }), "2024-01-02");
  assert.equal(staffHireDate({ hireDate: "2024-01-03" }), "2024-01-03");
  assert.equal(departmentChipTone({ color: "yellow" }), "amber");
  assert.equal(departmentChipTone(null), "neutral");
});

test("il modello: gli avvisi della scheda nascono dai dati, e una scheda in ordine non ne ha", () => {
  const today = new Date(2026, 8, 15);
  assert.deepEqual(computeStaffAlerts({ email: "a@b.it", documentExpiry: "2027-01-01" }, today), []);
  const alerts = computeStaffAlerts({ documentExpiry: "2026-09-01", residencePermitExpiry: "2026-09-25" }, today);
  assert.deepEqual(
    alerts.map((a) => [a.id, a.severity]),
    [
      ["document-expired", "danger"],
      ["permit-expiring", "warning"],
      ["no-contact", "warning"],
    ],
  );
});

test("il cassetto di sezione scrive solo i campi della sua sezione, e il nome su tutte le chiavi", () => {
  const values = { ...staffFormValuesFrom({ name: "Anna", surname: "Rossi", email: "a@b.it", role: "Custode" }), name: "Anna Maria" };
  const personal = staffSectionPayload("personal", values);
  assert.equal(personal.firstName, "Anna Maria");
  assert.equal(personal.name, "Anna Maria");
  assert.equal(personal.lastName, "Rossi");
  assert.equal(personal.fullName, "Anna Maria Rossi");
  assert.equal("email" in personal, false);
  const company = staffSectionPayload("company", values);
  assert.deepEqual(Object.keys(company).sort(), ["department", "hireDate", "role", "status"]);
});

test("nessuna pagina staff monta il vecchio linguaggio visivo", () => {
  for (const [name, source] of Object.entries(sources)) {
    assert.doesNotMatch(source, /from "@\/components\/ui\/(card|table|tabs|badge|dropdown-menu|dialog|list-selection)"/, `${name}: primitive V1`);
    assert.doesNotMatch(source, /bg-gradient-to-r from-blue-600 to-purple-600/, `${name}: titolo in gradiente`);
    assert.doesNotMatch(source, /(?<![a-z:])grid-cols-[23]\b/, `${name}: griglia a due colonne senza breakpoint`);
  }
  assert.doesNotMatch(sources.detail, /<Tabs|TabsList/);
});
