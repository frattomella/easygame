import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  LEGACY_TAB_TO_AREA,
  TRAINER_AREAS,
  createTrainerAccessToken,
  deriveTrainerRecordAlerts,
  formatTrainerAccessToken,
  normalizeTrainerStatusValue,
  resolveTrainerAccess,
  resolveTrainerArea,
  trainerAccessFilterOf,
} from "@/components/trainer/v2/trainer-record-model";
import { ACCOUNT_STATUS, PERSON_STATUS } from "@/lib/web/status";

/**
 * Parita delle pagine Allenatori V2 con l'audit V1
 * (`docs/redesign/audit/wave-a-allenatori-staff.md`, sezioni `/trainers*`).
 *
 * Il redesign cambia forma, non capacita: ogni etichetta, azione ed endpoint
 * che l'audit elenca deve restare nel sorgente V2. Un test statico non prova
 * che funzioni — lo fa il lead a schermo — ma impedisce che una capacita
 * sparisca per distrazione in una ripulitura.
 */
const read = (relative) => readFileSync(path.join(process.cwd(), relative), "utf8");

const sources = {
  list: read("src/app/trainers/page.tsx"),
  create: read("src/app/trainers/new/page.tsx"),
  record: read("src/app/trainers/[id]/page.tsx"),
  edit: read("src/app/trainers/[id]/edit/page.tsx"),
  drawer: read("src/components/trainer/v2/trainer-section-drawer.tsx"),
  access: read("src/components/trainer/v2/trainer-access-panel.tsx"),
  payments: read("src/components/trainer/v2/trainer-payments-panel.tsx"),
  documents: read("src/components/trainer/trainer-documents-panel.tsx"),
  model: read("src/components/trainer/v2/trainer-record-model.ts"),
};
const everything = Object.values(sources).join("\n");

/* ── Il modello puro ───────────────────────────────────────────────────── */

test("lo stato dell'accesso EasyGame ha le sei letture della V1, nello stesso ordine", () => {
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const past = new Date(Date.now() - 3_600_000).toISOString();

  assert.equal(resolveTrainerAccess({ linkedUserId: "u1", accessTokenStatus: "expired" }).key, "linked");
  assert.equal(resolveTrainerAccess({ accessTokenStatus: "revoked" }).key, "revoked");
  assert.equal(resolveTrainerAccess({ access_token_status: "unlinked" }).key, "revoked");
  assert.equal(resolveTrainerAccess({ accessTokenStatus: "redeemed" }).key, "redeemed");
  assert.equal(
    resolveTrainerAccess({ accessTokenRecordId: "t1", accessTokenValue: "TRN1", accessTokenExpiresAt: past }).key,
    "expired",
  );
  assert.equal(
    resolveTrainerAccess({ accessTokenRecordId: "t1", accessTokenValue: "TRN1", accessTokenExpiresAt: future }).key,
    "token",
  );
  assert.equal(resolveTrainerAccess({}).key, "none");
  assert.equal(resolveTrainerAccess(null).key, "none");
});

test("la pillola dell'accesso e quella del sistema: collegato · invitato · senza accesso · revocato", () => {
  assert.equal(resolveTrainerAccess({ linkedUserId: "u1" }).status, ACCOUNT_STATUS.linked);
  assert.equal(resolveTrainerAccess({ accessTokenStatus: "redeemed" }).status, ACCOUNT_STATUS.linked);
  assert.equal(
    resolveTrainerAccess({ accessTokenRecordId: "t1", accessTokenValue: "TRN1" }).status,
    ACCOUNT_STATUS.invited,
  );
  assert.equal(resolveTrainerAccess({ accessTokenStatus: "revoked" }).status, ACCOUNT_STATUS.revoked);
  assert.equal(resolveTrainerAccess({}).status, ACCOUNT_STATUS.none);

  assert.equal(trainerAccessFilterOf(resolveTrainerAccess({ linkedUserId: "u1" })), "linked");
  assert.equal(trainerAccessFilterOf(resolveTrainerAccess({ accessTokenRecordId: "t1", accessTokenValue: "x" })), "invited");
  assert.equal(trainerAccessFilterOf(resolveTrainerAccess({ accessTokenStatus: "revoked" })), "none");
});

test("il token ha la forma della V1: TRN + nove simboli, letto a gruppi di quattro", () => {
  const token = createTrainerAccessToken(() => [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.match(token, /^TRN[A-Z2-9]{9}$/);
  assert.equal(formatTrainerAccessToken("trnabcd 2345-6789"), "TRNA-BCD2-3456-789");
  assert.equal(formatTrainerAccessToken(""), "—");
});

test("lo stato dell'allenatore e binario, come nell'elenco V1", () => {
  assert.equal(normalizeTrainerStatusValue("suspended"), "suspended");
  assert.equal(normalizeTrainerStatusValue("inactive"), "suspended");
  assert.equal(normalizeTrainerStatusValue(undefined), "active");
  assert.equal(normalizeTrainerStatusValue("active"), "active");
});

test("le sette tab della V1 atterrano tutte in una delle quattro aree", () => {
  const v1Tabs = ["anagrafica", "pagamenti", "accesso", "societari", "medici", "presenze", "lavoro"];
  const areaIds = TRAINER_AREAS.map((area) => area.value);
  assert.equal(areaIds.length, 4);
  for (const tab of v1Tabs) {
    assert.ok(areaIds.includes(LEGACY_TAB_TO_AREA[tab]), `la tab «${tab}» deve avere un'area`);
    assert.equal(resolveTrainerArea(tab), LEGACY_TAB_TO_AREA[tab]);
  }
  assert.equal(resolveTrainerArea("compensi"), "compensi", "le aree nuove si accettano per nome");
  assert.equal(resolveTrainerArea("qualcosa"), "profilo", "un valore sconosciuto porta al profilo");
  assert.equal(resolveTrainerArea(null), "profilo");
});

test("gli avvisi della scheda nascono dai dati gia caricati, e una scheda in ordine non ne ha", () => {
  const today = new Date(2026, 8, 15);
  const clean = deriveTrainerRecordAlerts({
    access: resolveTrainerAccess({ linkedUserId: "u1" }),
    medicalVisitExpiry: "2027-06-01",
    documentExpiry: "2030-01-01",
    expiredDocuments: 0,
    today,
  });
  assert.deepEqual(clean, []);

  const dirty = deriveTrainerRecordAlerts({
    access: resolveTrainerAccess({}),
    medicalVisitExpiry: "2026-09-01",
    documentExpiry: "2026-01-01",
    expiredDocuments: 2,
    today,
  });
  assert.deepEqual(
    dirty.map((alert) => [alert.id, alert.severity, alert.area]),
    [
      ["access", "warning", "club"],
      ["medical-expired", "danger", "documenti"],
      ["identity-document", "warning", "profilo"],
      ["documents", "danger", "documenti"],
    ],
  );

  const expiring = deriveTrainerRecordAlerts({
    access: resolveTrainerAccess({ linkedUserId: "u1" }),
    medicalVisitExpiry: "2026-09-25",
    expiredDocuments: 0,
    today,
  });
  assert.equal(expiring[0]?.id, "medical-expiring");
  assert.match(expiring[0].text, /10 giorni/);
});

/* ── `/trainers` ───────────────────────────────────────────────────────── */

test("l'elenco legge e scrive con le funzioni della V1", () => {
  assert.match(sources.list, /getClubTrainers\(clubId\)/);
  assert.match(sources.list, /deleteClubTrainer\(\s*clubId,\s*String\(deleteTarget\.id\),?\s*\)/);
  assert.match(sources.list, /updateClubDataItem\(\s*clubId,\s*"trainers"/);
  assert.match(sources.list, /updateClubDataItem\(\s*clubId,\s*"staff_members"/, "ripiego sui membri staff con ruolo allenatore");
  assert.match(sources.list, /\/api\/v1\/trainer-accounts\//, "lo scollegamento passa dalla rotta dedicata (ADR-0110)");
  /* \`settings\` in piu dal lotto ADR-0197: le stagioni per spaccare le assegnazioni. */
  assert.match(sources.list, /select\(\s*"categories, club_sites, category_groups, trainers, staff_members, settings",?\s*\)/);
  assert.equal(/fetch\(/.test(sources.list), false, "nessun fetch diretto");
});

test("l'elenco e il pattern 1: intestazione con i contatori, un primario, il DataGrid", () => {
  assert.match(sources.list, /<PageHeader/);
  assert.match(sources.list, /title="Allenatori"/);
  assert.match(sources.list, /Gestisci staff tecnico, categorie assegnate e stato operativo degli allenatori del club\./);
  assert.match(sources.list, /<HeaderStat\s+value=\{counts\.total\}\s+label="allenatori"/);
  assert.match(sources.list, /<HeaderStat\s+value=\{counts\.active\}\s+label="attivi"/);
  assert.match(sources.list, /Nuovo allenatore/);
  assert.match(sources.list, /module="allenatori"/);
  assert.equal((sources.list.match(/variant="primary"/g) || []).length <= 3, true, "un solo gradiente di pagina piu i primari degli stati vuoti/cassetti");
});

test("l'elenco ha le colonne della V1 piu l'accesso EasyGame, le viste per stato e i filtri", () => {
  for (const header of ['header: "Allenatore"', 'header: "Email"', 'header: "Telefono"', 'header: "Stato"', 'header: "Accesso EasyGame"', 'header: "Data inizio"']) {
    assert.ok(sources.list.includes(header), `manca la colonna ${header}`);
  }
  /* La colonna delle categorie porta la stagione nell'intestazione (ADR-0197 §18). */
  assert.ok(sources.list.includes("header: selectedSeasonLabel ? `Categorie ${selectedSeasonLabel}` : \"Categorie\""), "manca la colonna Categorie con la stagione");
  assert.match(sources.list, /id: "active",\s*label: "Attivi",\s*filters: \{ status: "active" \},\s*isDefault: true/, "la V1 partiva da «Attivi»");
  assert.match(sources.list, /id: "suspended",\s*label: "Sospesi"/);
  for (const filter of ['id: "status"', 'id: "category"', 'id: "site"', 'id: "access"']) {
    assert.ok(sources.list.includes(filter), `manca il filtro ${filter}`);
  }
  assert.match(sources.list, /search=\{\{/, "la ricerca in griglia sostituisce «Cerca allenatori…»");
  assert.match(sources.list, /splitTrainerAssignmentsBySeason/, "le assegnazioni si spaccano per stagione (ADR-0197)");
  assert.ok(sources.list.includes("if (groupLabels.length) return groupLabels;"), "i gruppi vincono sulle categorie, come in V1");
});

test("l'elenco ha le azioni di riga e di massa della V1, senza eliminazione di massa", () => {
  for (const action of ['label: "Apri scheda"', 'label: "Modifica"', 'label: "Sospendi"', 'label: "Attiva"', 'label: "Scollega accesso"', 'label: "Elimina"']) {
    assert.ok(sources.list.includes(action), `manca l'azione di riga ${action}`);
  }
  assert.match(sources.list, /assignByGroup \? "Assegna a un gruppo" : "Assegna a una categoria"/);
  assert.match(sources.list, /Si aggiunge ai gruppi già seguiti/);
  assert.match(sources.list, /label: "Esporta PDF"/);
  assert.match(sources.list, /label: "Esporta CSV"/);
  assert.match(sources.list, /non sono stati aggiornati/, "il fallimento parziale si dice");
  assert.equal(/window\.confirm|[^.]confirm\(/.test(sources.list), false, "niente dialoghi nativi");
  assert.match(sources.list, /<DangerConfirmDialog/);
  assert.match(sources.list, /Allenatore non trovato tra i dati del club/);
  assert.match(sources.list, /Impossibile eliminare l'allenatore/);
});

test("l'esportazione passa dal menu della griglia con lo stesso motore e le stesse colonne", () => {
  assert.match(sources.list, /exportPeoplePdf\(input\)/);
  assert.match(sources.list, /exportPeopleCsv\(input\)/);
  assert.match(sources.list, /entity: "trainers" as const/);
  assert.match(sources.list, /visibleColumns: null/);
  assert.match(sources.list, /Consenti i popup per generare il PDF/);
  assert.match(sources.list, /PDF pronto: si apre la finestra di stampa/);
  assert.match(sources.list, /CSV scaricato/);
  assert.match(sources.list, /Nessun elemento da esportare/);
});

test("l'elenco ha i suoi stati: caricamento a scheletro, vuoto, errore con «Riprova»", () => {
  assert.match(sources.list, /state=\{\s*loading \? "loading" : loadError \? "error" : "ready"\s*\}/);
  assert.match(sources.list, /onRetry=\{\(\) => void fetchData\(\)\}/);
  assert.match(sources.list, /Nessun allenatore in archivio/);
  assert.equal(/AppLoadingScreen/.test(sources.list), false, "niente spinner a pagina intera");
});

/* ── `/trainers/new` ───────────────────────────────────────────────────── */

test("il nuovo allenatore ha tutti i campi e le regole della V1", () => {
  for (const needle of [
    "<DocumentExtractionField",
    "<PersonIdentityFields",
    'required={{ firstName: true, lastName: true }}',
    "<PhoneField",
    "<PersonResidenceFields",
    "<ClothingSizesFields",
    'label="Data inizio"',
    'label="Compenso mensile"',
    'label="Categorie allenate"',
    'label="Note professionali"',
    "Es. marco.bianchi@easygame.it",
    "Nessuna categoria disponibile",
    "Nessuna categoria selezionata.",
    "startDate: todayLocalDateOnly()",
  ]) {
    assert.ok(sources.create.includes(needle), `manca ${needle}`);
  }
  assert.match(sources.create, /Club attivo non trovato\. Seleziona prima un club\./);
  assert.match(sources.create, /label: "Nome" \}/);
  assert.match(sources.create, /label: "Cognome" \}/);
  assert.match(sources.create, /Almeno un contatto tra email e telefono/);
  assert.match(sources.create, /<ValidationSummary errors=\{errors\}/);
  assert.match(sources.create, /addClubData\(clubId, "trainers", newTrainer\)/);
  assert.match(sources.create, /Allenatore creato con successo/);
  assert.match(sources.create, /role: "trainer"/);
  assert.match(sources.create, /status: "active"/);
  assert.match(sources.create, /birthYear: formData\.birthDate \? Number/);
  assert.match(sources.create, /Modifiche non salvate/, "la barra appiccicata dice quando il modulo e sporco");
  assert.match(sources.create, /Salva allenatore/);
});

/* ── `/trainers/[id]` ──────────────────────────────────────────────────── */

test("la scheda legge e scrive come la V1", () => {
  assert.match(sources.record, /select\("categories, trainers, staff_members, club_sites, category_groups, settings"\)/);
  assert.match(sources.record, /staff\.role === "trainer" \|\| staff\.role === "allenatore"/);
  assert.match(sources.record, /updateClubDataItem\(clubId, "trainers", trainerId, updates\)/);
  assert.match(sources.record, /updateClubDataItem\(clubId, "staff_members", trainerId, updates\)/);
  assert.match(sources.record, /deleteStaffMember\(clubId, trainerId\)/);
  assert.match(sources.record, /\/api\/v1\/access_tokens\/\$\{/);
  assert.match(sources.record, /apiRequest<any>\("\/api\/v1\/access_tokens"/);
  assert.match(sources.record, /\/api\/v1\/users\/\$\{currentTrainer\.linkedUserId\}/);
  assert.match(sources.record, /\/api\/v1\/organization_users\?organization_id=/);
  assert.match(sources.record, /\/api\/v1\/trainer-accounts\/\$\{encodeURIComponent\(trainerId\)\}/);
  assert.match(sources.record, /addTrainerPayment\(clubId, trainerId, paymentData\)/);
  assert.match(sources.record, /updateTrainerPayment\(clubId, trainerId, paymentId, updates\)/);
  assert.match(sources.record, /deleteTrainerPayment\(clubId, trainerId, paymentId\)/);
  assert.match(sources.record, /trainerData\.startDate \|\| trainerData\.hireDate/);
  assert.match(sources.record, /normalizedUpdateData\.hireDate = normalizedUpdateData\.startDate/);
  assert.match(sources.record, /token_type: "trainer_access"/);
  assert.match(sources.record, /superseded_by_trainer_id: trainerId/);
  assert.equal(/fetch\(/.test(sources.record), false, "nessun fetch diretto");
});

test("la scheda e il pattern 2: intestazione di record, avvisi, quattro aree, cassetti", () => {
  assert.match(sources.record, /<RecordHeader/);
  assert.match(sources.record, /<RecordAlertStrip/);
  assert.match(sources.record, /<RecordAreaSwitcher/);
  assert.match(sources.record, /useBreadcrumbLabel\(trainerHeaderName/);
  assert.match(sources.record, /searchParams\?\.get\("area"\) \|\| searchParams\?\.get\("tab"\)/, "i vecchi ?tab= restano validi");
  assert.match(sources.record, /<TrainerSectionDrawer/);
  assert.match(sources.record, /tone: "danger", overflow: true/, "l'eliminazione sta solo nel ···");
  assert.equal(/<Tabs|TabsTrigger/.test(sources.record), false, "niente tab farm");
  assert.equal(/window\.confirm|[^.]confirm\(/.test(everything), false, "niente dialoghi nativi");
  assert.equal(/trainingSessions|handleSendMessage|newMessage/.test(sources.record), false, "il codice morto della V1 non si traduce");
});

test("ogni sezione delle sette tab V1 ha un posto nelle aree V2", () => {
  const sections = [
    // Anagrafica
    'title="Informazioni personali"',
    "title=\"Documento d'identità\"",
    'title="Contatti e residenza"',
    // Dati societari
    'title="Informazioni societarie"',
    'title="Taglie vestiario"',
    "<TrainerDocumentsPanel",
    // Accesso account
    "<TrainerAccessPanel",
    // Dati medici
    'title="Visita medica"',
    'title="Attestati"',
    'title="Anagrafica sanitaria"',
    // Pagamenti
    'title="Informazioni bancarie"',
    "<TrainerPaymentsPanel",
    // Lavoro e compensi
    '<PersonCompensationTab',
    'originType="trainer"',
  ];
  for (const needle of sections) {
    assert.ok(sources.record.includes(needle), `manca la sezione ${needle}`);
  }
  assert.match(sources.record, /Il registro pagamenti è un promemoria, non una contabilità dei compensi/);
  assert.match(sources.record, /<ClothingSizesSummary/);
  assert.match(sources.record, /<CertificateAttachmentField/);
  for (const certificate of ['label: "BLSD"', 'label: "Primo soccorso"', 'label: "Antincendio"']) {
    assert.ok(sources.record.includes(certificate), `manca l'attestato ${certificate}`);
  }
});

test("i campi delle otto sezioni modificabili sono tutti nel cassetto", () => {
  const fields = [
    // personal
    "<PersonIdentityFields",
    'label="Età"',
    'label="Nazionalità"',
    'label="Formazione scolastica"',
    'label="Note"',
    // document
    'label="Tipo di documento"',
    'label="Numero documento"',
    'label="Data di rilascio"',
    'label="Scadenza del documento"',
    'label="Scadenza permesso di soggiorno"',
    // contacts
    'label="Email"',
    "<PhoneField",
    "<PersonResidenceFields",
    // banking
    'label="IBAN"',
    'label="Stipendio mensile"',
    // company
    'label="Tesserato"',
    'label="Numero di tesseramento"',
    'label="Data di tesseramento"',
    'label="Data di inizio"',
    'label="Categorie assegnate"',
    'label="Gruppi seguiti"',
    // clothing
    "<ClothingSizesFields",
    // certificates
    '"hasBlsd", "BLSD"',
    '"hasFirstAid", "Primo soccorso"',
    '"hasFireSafety", "Antincendio"',
    // health
    'label="Tessera sanitaria"',
    'label="Assicurazione"',
    'label="Patologie e malattie"',
    'label="Allergie e preferenze alimentari"',
  ];
  for (const needle of fields) {
    assert.ok(sources.drawer.includes(needle), `manca il campo ${needle}`);
  }
  assert.match(sources.drawer, /dirty=\{dirty\}/, "la guardia sulle modifiche non salvate");
  assert.match(sources.drawer, /<FieldSizeProvider size="sm">/);
  assert.equal(/label="Ruolo"/.test(sources.drawer), false, "«Ruolo» resta fuori (vale sempre «Allenatore»)");
});

test("l'accesso EasyGame ha token, copia, scollegamento e l'account collegato", () => {
  for (const needle of [
    "Genera token",
    "Rigenera token",
    "Copia token",
    "Scollega account",
    "Token attuale",
    "Stato token",
    "Scadenza",
    "Ultimo collegamento",
    "Nome account",
    "ID account",
    "Ruolo nel club",
    "Membership creata il",
    "Account creato il",
    "Token generato il",
    "Token riscattato il",
    "Rigenerare il token?",
    "Scollegare questo account?",
  ]) {
    assert.ok(sources.access.includes(needle), `manca ${needle}`);
  }
  assert.equal(/Scollega tutti gli account/.test(sources.access), false, "il doppione della V1 con lo stesso gestore non si ricrea");
  assert.match(sources.record, /Token allenatore generato\./);
  assert.match(sources.record, /Account scollegato dal profilo allenatore/);
  assert.match(sources.record, /Token copiato negli appunti/);
});

test("il registro pagamenti ha le colonne, le azioni e le conferme della V1", () => {
  for (const needle of [
    'header: "Mese"',
    'header: "Importo"',
    'header: "Data pagamento"',
    'header: "Stato"',
    'label: "Registra pagamento"',
    'label: "Ricevuta"',
    'label: "Fattura"',
    'label: "Cambia stato"',
    'label: "Elimina"',
    "Aggiungi pagamento",
    'label="Mese di riferimento"',
    'label="Importo"',
    'label="Stato pagamento"',
    'label="Data pagamento"',
    "Eliminare il compenso?",
    "Cambiare lo stato del compenso?",
    "Nessun pagamento registrato per questo allenatore",
    "Operazione fuori campo IVA ai sensi dell'art. 5 DPR 633/72",
    "buildAttachmentFileName",
  ]) {
    assert.ok(sources.payments.includes(needle), `manca ${needle}`);
  }
  assert.match(sources.payments, /draft\.status === "paid" \? draft\.date : ""/, "la data si scrive solo se pagato");
  assert.equal(existsSync(path.join(process.cwd(), "src/components/forms/AddTrainerPaymentForm.tsx")), false, "il dialogo V1 non resta in parallelo");
});

test("i documenti restano su Attachment Core, con la griglia e il cassetto del sistema", () => {
  assert.match(sources.documents, /<DataGrid/);
  assert.match(sources.documents, /<Drawer/);
  assert.match(sources.documents, /<DangerConfirmDialog/);
  for (const needle of ['label: "Visualizza"', 'label: "Scarica"', 'label: "Sostituisci"', 'label: "Elimina"', 'label="Tipo"', 'label="Titolo"', 'label="Scadenza"', 'label="File"', "Nuovo documento", "Documento caricato", "Documento sostituito", "Documento eliminato"]) {
    assert.ok(sources.documents.includes(needle), `manca ${needle}`);
  }
  assert.match(sources.documents, /hidden: \(\) => !canWrite/, "chi non puo scrivere non vede le azioni, invece di vederle spente");
});

test("la visita medica si salva subito e gli attestati hanno l'allegato solo se conseguiti", () => {
  assert.match(sources.record, /saveMedicalVisit\(\{ medicalVisitType: value \}\)/);
  assert.match(sources.record, /saveMedicalVisit\(\{ medicalVisitExpiry: event\.target\.value \}\)/);
  assert.match(sources.record, /saveMedicalVisit\(\{ medicalVisitFile: next \}\)/);
  assert.match(sources.record, /certificate\.has \? \(/);
  assert.match(sources.record, /saveCertificateFile\(certificate\.key, next\)/);
  assert.match(sources.record, /Salvataggio della visita medica non riuscito/);
});

test("la V1 specifica di queste pagine non resta in parallelo", () => {
  for (const removed of [
    "AppLoadingScreen",
    "BulkSelectionToolbar",
    "SelectRowCheckbox",
    "DropdownMenuTrigger",
    "AlertDialogContent",
    "bg-gradient-to",
    "window.confirm",
    "max-h-[90vh]",
  ]) {
    assert.equal(everything.includes(removed), false, `${removed} appartiene alla V1`);
  }
  assert.equal(/<Card\b|CardContent|CardHeader/.test(everything), false, "le superfici sono Panel/DetailCard, non Card");
  assert.equal(/from "@\/components\/ui\/(badge|table|tabs|dropdown-menu|alert-dialog|card)"/.test(everything), false);
});

test("la rotta di modifica resta un rimando alla scheda, dove la modifica avviene nei cassetti", () => {
  assert.match(sources.edit, /redirect\(/);
  assert.equal(existsSync(path.join(process.cwd(), "src/app/trainers/[id]/contracts")), false);
});

test("le persone: stesse etichette di stato del sistema", () => {
  assert.equal(PERSON_STATUS.active.label, "ATTIVO");
  assert.equal(PERSON_STATUS.suspended.label, "SOSPESO");
  assert.match(sources.model, /PERSON_STATUS\.suspended/);
  assert.match(sources.model, /PERSON_STATUS\.active/);
});
