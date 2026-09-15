import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * **Scheda atleta, Web V2 — parita con l'audit della V1.**
 *
 * `docs/redesign/audit/wave-a-atleti.md` §4 elenca cio che la scheda faceva:
 * intestazione, «Accesso EasyGame», otto schede con i loro campi, azioni,
 * permessi ed endpoint. Il redesign (09 §9.8) ha ripiegato le otto schede in
 * quattro aree: questo file cerca **ogni capacita dell'audit** nella
 * superficie V2 — la pagina, i pannelli di `profile/` e i blocchi di
 * `profile/v2/` — cosi una funzione che sparisce in un redesign fallisce qui
 * prima che la cerchi un utente (CLAUDE.md §11.8).
 *
 * Le regole del brief che non si piegano (10 §10.5) hanno ciascuna un
 * controllo: le distruttive solo nel `···`, nessun `window.prompt`/`confirm`,
 * nessun gradiente da tabella, permesso negato = assente.
 */

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const PAGE = path.join(ROOT, "src/app/athletes/[id]/page.tsx");
const PROFILE = path.join(ROOT, "src/components/athletes/profile");
const V2 = path.join(PROFILE, "v2");

const read = (file) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const listTsx = (dir) =>
  readdirSync(dir)
    .filter((name) => name.endsWith(".tsx") || name.endsWith(".ts"))
    .map((name) => path.join(dir, name));

const page = read(PAGE);
const surface = [PAGE, ...listTsx(PROFILE), ...listTsx(V2)].map(read).join("\n");
const strip = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const surfaceCode = strip(surface);

/* ── §4.3 intestazione ─────────────────────────────────────────────────── */
test("§4.3 · l'intestazione e il RecordHeader del sistema, con le azioni dove il design le vuole", () => {
  const header = read(path.join(V2, "AthleteRecordHeader.tsx"));
  assert.match(header, /<RecordHeader/);
  assert.match(header, /useBreadcrumbLabel\(/, "il breadcrumb porta il nome dell'atleta");
  assert.match(header, /RecordAlertStrip/, "la striscia degli avvisi sta sotto il nome");
  assert.match(header, /RecordAreaSwitcher/, "le aree, non nove tab");
  assert.match(header, /Accesso EasyGame/);
  assert.match(header, /label: "Modifica"/);
  /* La distruttiva sta nel `···`, mai come pulsante rosso in intestazione. */
  assert.match(header, /label: "Elimina atleta",[\s\S]{0,120}tone: "danger",\s*overflow: true/);
  /* La foto profilo resta una capacita: cambia e rimuovi, con i limiti di sempre. */
  assert.match(header, /Cambia foto profilo/);
  assert.match(header, /Rimuovi foto profilo/);
  assert.match(header, /5 \* 1024 \* 1024/);
  assert.match(page, /onAvatarChange=\{handleAvatarChange\}/);
});

test("§4.3 · eliminare un atleta passa dal modale distruttivo e nomina «Dati personali»", () => {
  assert.match(page, /title: `Eliminare \$\{nome\}\?`/);
  assert.match(page, /confirmText: "Elimina atleta"/);
  assert.match(page, /consequences: \[/);
  assert.match(page, /sezione «Dati personali» di questa scheda/);
  assert.match(page, /eDatiPersonaliDaSmaltire\(messaggio\)/);
  assert.match(page, /<DangerConfirmDialog/);
});

/* ── le quattro aree e il `?tab=` ──────────────────────────────────────── */
test("le otto schede della V1 hanno ciascuna un'area, e `?tab=` atterra ancora", () => {
  assert.match(page, /resolveAthleteRecordTarget\(requestedTab\)/);
  for (const area of ["profilo", "attivita", "amministrazione", "documenti"]) {
    assert.match(page, new RegExp(`area === "${area}"`), `l'area ${area} deve esistere`);
  }
});

/* ── §4.4 Accesso EasyGame ─────────────────────────────────────────────── */
test("§4.4 · il pannello «Accesso EasyGame» ha i quattro stati e le sette azioni", () => {
  const account = read(path.join(PROFILE, "athlete-account-section.tsx"));
  for (const azione of [
    "Scollega account",
    "Revoca l&apos;accesso",
    "Reinvia l&apos;invito",
    "Cambia indirizzo e reinvia",
    "Revoca l&apos;invito",
    "Invita di nuovo",
    "Invita l’atleta",
  ]) {
    assert.ok(account.includes(azione), `manca «${azione}»`);
  }
  for (const rotta of [
    "/api/v1/athlete-accounts/${athleteId}/link",
    "/api/v1/athlete-accounts/${athleteId}/resend",
    "/api/v1/athlete-accounts/${athleteId}/email",
  ]) {
    assert.ok(account.includes(rotta), `manca la rotta ${rotta}`);
  }
  assert.match(account, /athleteAccountStatus\(stato\.status\)/, "lo stato e una pillola del sistema");
  assert.match(account, /Cosa è successo/);
  assert.match(account, /<Drawer/, "il pannello e un cassetto, non un modale lungo");
});

/* ── §4.6 Generale → Profilo + Amministrazione ─────────────────────────── */
test("§4.6 · anagrafica, categorie, tesseramenti e dati personali", () => {
  const profilo = read(path.join(V2, "AthleteProfileSections.tsx"));
  for (const label of ["Nome", "Cognome", "Codice fiscale", "Data di nascita", "Nazionalità", "Comune", "Sesso", "Categorie di appartenenza", "Note"]) {
    assert.ok(profilo.includes(`"${label}"`), `manca il campo «${label}»`);
  }
  const drawers = read(path.join(V2, "AthleteProfileDrawers.tsx"));
  assert.match(drawers, /<PersonIdentityFields/);
  assert.match(drawers, /<AthleteCategoriesPanel/);
  assert.match(drawers, /Nazionalità/);

  const registrations = read(path.join(PROFILE, "athlete-registrations-panel.tsx"));
  assert.match(registrations, /Aggiungi tesseramento/);
  assert.match(registrations, /Nessuna federazione o ente registrato nel club/);
  assert.match(registrations, /Nessun tesseramento registrato/);
  const dialog = read(path.join(PROFILE, "athlete-registration-dialog.tsx"));
  for (const label of ["Federazione/Ente", "Numero tessera", "Data emissione", "Data scadenza", "Stato", "Note", "Sostituisci allegato"]) {
    assert.ok(dialog.includes(label), `manca «${label}» nel cassetto del tesseramento`);
  }
  assert.match(page, /Questa federazione non e fra quelle configurate dal club/);

  assert.match(page, /<AthleteDataSubjectSection/);
  assert.match(page, /puoTrattareDatiPersonali \?/, "la riga compare solo a chi ha una delle due chiavi");
  const dataSubject = read(path.join(PROFILE, "athlete-data-subject-section.tsx"));
  for (const label of ["Mostra cosa contiene", "Aggiorna il riepilogo", "Esporta i dati", "Cancella i dati personali", "Cancella definitivamente"]) {
    assert.ok(dataSubject.includes(label), `manca «${label}»`);
  }
});

/* ── §4.7 Contatti → Profilo ───────────────────────────────────────────── */
test("§4.7 · contatti, tutori e accesso genitore", () => {
  const profilo = read(path.join(V2, "AthleteProfileSections.tsx"));
  for (const label of ["Telefono", "Email", "Parentela", "Genera token", "Rigenera token", "Scollega account", "Copia token", "Nessun genitore o tutore registrato"]) {
    assert.ok(profilo.includes(label), `manca «${label}»`);
  }
  assert.match(profilo, /getGuardianAccessStatus\(guardian, Date\.now\(\), contactOnlyIdentities\)/, "il registro dei soli recapiti arriva al badge");
  assert.match(profilo, /formatParentAccessToken\(tokenValue\)/);
  assert.match(page, /\/api\/v1\/guardian-accounts\//);
  assert.match(page, /"\/api\/v1\/access_tokens"/);
  assert.match(page, /PARENT_TOKEN_EXPIRY_HOURS/);
  assert.match(page, /Rigenerare il token di accesso\?/);
  assert.match(page, /Scollegare l'account da questo genitore\?/);

  const drawers = read(path.join(V2, "AthleteProfileDrawers.tsx"));
  assert.match(drawers, /<DocumentExtractionField/);
  for (const parentela of ["Padre", "Madre", "Tutore Legale", "Nonno", "Nonna", "Altro"]) {
    assert.ok(drawers.includes(`"${parentela}"`), `manca la parentela «${parentela}»`);
  }
  assert.match(page, /Nome e cognome sono obbligatori/);
  for (const label of ["Indirizzo", "N. civico", "CAP", "Paese", "Regione", "Provincia"]) {
    assert.ok(profilo.includes(`"${label}"`), `manca «${label}» nell'indirizzo`);
  }
  assert.match(drawers, /<AssistedAddressFields/);
});

/* ── §4.8 Dati sanitari → Documenti e sanità ───────────────────────────── */
test("§4.8 · certificati, visite, attestati, anagrafica sanitaria", () => {
  const certificates = read(path.join(PROFILE, "athlete-certificates-panel.tsx"));
  assert.match(certificates, /Aggiungi certificato medico/);
  assert.match(certificates, /medicalCertificateStatus\(certificate\.status\)/);
  assert.match(page, /Eliminare il certificato medico\?/);
  assert.match(page, /\/api\/v1\/medical_certificates\//);
  assert.match(page, /handleUpdateMedicalCertificate/);

  const health = read(path.join(V2, "AthleteHealthSections.tsx"));
  for (const label of ["BLSD", "Primo soccorso", "Antincendio", "Gruppo sanguigno", "Allergie", "Malattie croniche", "Farmaci", "Contatto di emergenza", "Telefono di emergenza", "Nessuna visita medica registrata"]) {
    assert.ok(health.includes(label), `manca «${label}»`);
  }
  assert.match(health, /<CertificateAttachmentField/);
  const drawers = read(path.join(V2, "AthleteDocumentDrawers.tsx"));
  for (const label of ["Agonistica", "Non agonistica", "Controllo", "Atleta", "Club", "Famiglia", "Esito", "Luogo", "Descrizione", "Allegato visita"]) {
    assert.ok(drawers.includes(label), `manca «${label}» nel cassetto della visita`);
  }
  assert.match(page, /Titolo e data della visita sono obbligatori/);
  assert.match(page, /Eliminare la visita medica\?/);
  const editDrawer = read(path.join(V2, "AthleteProfileDrawers.tsx"));
  assert.match(editDrawer, /"A\+", "A-", "B\+", "B-", "AB\+", "AB-", "0\+", "0-"/);
});

/* ── §4.9 Iscrizione → Amministrazione ─────────────────────────────────── */
test("§4.9 · l'iscrizione e il componente condiviso, con piano, conferma e voci manuali", () => {
  assert.match(page, /<AthleteEnrollmentTab/);
  assert.match(page, /<EnrollmentPaymentBreakdown/);
  assert.match(page, /<AthletePlanEditor/);
  assert.match(page, /<AthletePlanConfirmationDrawer/);
  assert.match(page, /<CreatePaymentsConfirmDialog/);
  assert.match(page, /<AthletePaymentDialogs/);
  assert.match(page, /syncAthleteEnrollmentInstallmentPayments/);
  assert.match(page, /Piano assegnato e pagamenti in attesa creati correttamente/);
  assert.match(page, /"\/api\/v1\/simplified_payments"/);
  assert.match(page, /\/api\/athlete-payments\//);
  assert.match(page, /Solo i pagamenti in attesa possono essere modificati/);

  const admin = read(path.join(V2, "AthleteAdministrationParts.tsx"));
  for (const label of ["Piano di pagamento", "Sconto applicato", "Data inizio abbonamento", "Importo personalizzato", "Servizi", "Pro-rata", "Sconti", "Totale finale", "Anteprima pagamenti", "Creare i pagamenti?", "Conferma e crea pagamenti"]) {
    assert.ok(admin.includes(label), `manca «${label}»`);
  }
  const payments = read(path.join(PROFILE, "athlete-payment-dialogs.tsx"));
  for (const label of ["Modifica pagamento", "Modificare il pagamento?", "Eliminare il pagamento in attesa?", "Annullare il pagamento saldato?", "Quota", "Iscrizione", "Abbigliamento", "Trasferta", "Altro"]) {
    assert.ok(payments.includes(label), `manca «${label}»`);
  }
});

/* ── §4.10 Abbigliamento → Attività sportiva ───────────────────────────── */
test("§4.10 · taglie, numero maglia, numeri assegnati e kit", () => {
  const activity = read(path.join(V2, "AthleteActivitySections.tsx"));
  for (const label of ["Profilo taglie", "Taglia maglietta", "Taglia pantaloni", "Taglia scarpe", "Salva taglie", "Numero maglia", "Duplicato", "Random:", "Nessun numero assegnato a gruppi numerazione.", "Nessuna assegnazione registrata", "Consegnato", "Annulla", "Da assegnazione kit", "Manuale", "Magazzino", "Fornitore"]) {
    assert.ok(activity.includes(label), `manca «${label}»`);
  }
  const drawers = read(path.join(V2, "AthleteActivityDrawers.tsx"));
  for (const label of ["Gruppo numerazione", "Crea prima un gruppo numerazione dalla pagina Abbigliamento.", "Random", "Kit completo", "Componenti singoli", "Seleziona kit", "Nuova assegnazione"]) {
    assert.ok(drawers.includes(label), `manca «${label}»`);
  }
  assert.match(drawers, /CustomKitComponentsBuilder/);
  assert.match(page, /canAssignNumber\(/);
  assert.match(page, /"Numero non disponibile"/);
  assert.match(page, /jerseyNumber: nextNumber/, "il numero si scrive anche sul record atleta (ripiego legacy)");
});

/* ── §4.11 Documenti → Documenti e sanità ──────────────────────────────── */
test("§4.11 · documenti condivisi, documento d'identita, allegati e altri documenti", () => {
  const docs = read(path.join(V2, "AthleteDocumentSections.tsx"));
  for (const label of ["Richiedi documento", "Carica documento club", "Compila modulo", "Approva", "Rifiuta", "Sollecita", "Visualizza", "Scarica", "Nessun documento condiviso o richiesto.", "Motivo rifiuto:", "Tipo di documento", "Numero documento", "Rilascio", "Scadenza", "Scadenza permesso di soggiorno"]) {
    assert.ok(docs.includes(label), `manca «${label}»`);
  }
  assert.match(docs, /\/api\/athletes\/\$\{athleteId\}\/documents\/\$\{document\.id\}\/file\?download=1/);
  assert.match(docs, /\["under_review", "uploaded", "rejected"\]/);
  assert.match(docs, /\["required", "rejected", "expired"\]/);
  const drawers = read(path.join(V2, "AthleteDocumentDrawers.tsx"));
  for (const label of ["Richiedi alla famiglia", "Condividi con la famiglia", "Motivo del rifiuto", "Nome documento", "Tipo documento", "Certificato Medico", "Documento Identità", "Tesserino", "Liberatoria", "Privacy"]) {
    assert.ok(drawers.includes(label), `manca «${label}»`);
  }
  assert.match(page, /Inserisci il titolo del documento richiesto/);
  assert.match(page, /Seleziona un file da condividere/);
  assert.match(page, /Il motivo del rifiuto è obbligatorio/);
  assert.match(page, /Nome documento e file sono obbligatori/);
  assert.match(page, /Compila tutti i campi obbligatori/);
  assert.match(page, /normalizeDocumentKind\(newDocument\.type\)/);
  const editDrawer = read(path.join(V2, "AthleteProfileDrawers.tsx"));
  assert.match(editDrawer, /"Carta d'identità", "Passaporto", "Patente"/);
});

/* ── §4.12 · §4.13 componenti condivisi ────────────────────────────────── */
test("§4.12 · §4.13 · analitiche e compensi restano i componenti condivisi", () => {
  assert.match(page, /<AthleteCategoryAnalyticsSection analytics=\{athleteCategoryAnalytics\} \/>/);
  assert.match(page, /<PersonCompensationTab\s+originType="athlete"/);
});

/* ── §4.14 permessi ────────────────────────────────────────────────────── */
test("§4.14 · gli stessi predicati della V1: nessuna chiave in pagina, nessun pulsante disabilitato per ruolo", () => {
  /* Si guarda il codice, non la prosa: i commenti nominano le chiavi apposta. */
  assert.equal((strip(page).match(/accounts\.athlete\.manage|data_subject\.(export|erase)/g) || []).length, 0);
  assert.match(page, /usePuoGestireAccessoAtleta\(\)/);
  assert.match(page, /usePuoTrattareDatiPersonali\(\)/);
  assert.match(page, /athleteId && puoGestireAccesso\s*\?\s*\(\) => setPannelloAccessoAperto\(true\)\s*:\s*null/);
});

/* ── le regole che non si piegano ──────────────────────────────────────── */
test("nessun prompt o confirm del browser, nessun gradiente da tabella, nessuna tab V1", () => {
  assert.doesNotMatch(surfaceCode, /window\.prompt|window\.confirm|(^|[^.\w])confirm\s*\(/m);
  assert.doesNotMatch(surfaceCode, /bg-gradient-to-r from-blue-600 to-purple-600/);
  assert.doesNotMatch(surfaceCode, /<TabsContent|<TabsList|<TabsTrigger/);
  assert.doesNotMatch(surfaceCode, /from "@\/components\/ui\/dialog"|from "@\/components\/ui\/alert-dialog"|from "@\/components\/ui\/card"/);
  assert.doesNotMatch(page, /<table\b/);
});

test("le sezioni meno usate sono righe chiuse del sistema, con lo stato per tipo di record", () => {
  const collapsed = page.match(/<CollapsedSection\b[\s\S]{0,120}?recordType="atleta"/g) || [];
  assert.ok(collapsed.length >= 8, `attese almeno 8 righe chiuse, trovate ${collapsed.length}`);
  for (const id of ["indirizzo", "dati-personali", "numeri-maglia", "kit", "compensi", "visite", "attestati", "documento-identita", "altri-documenti"]) {
    assert.ok(page.includes(`id="${id}"`), `manca la riga chiusa «${id}»`);
  }
});
