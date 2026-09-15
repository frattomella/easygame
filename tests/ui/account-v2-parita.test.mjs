import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  CLUB_ACCESS_STATUS,
  CONTACT_STATUS,
  SEARCH_THRESHOLD,
  SUPPORT_URL,
  clubPlace,
  etichettaProfili,
  getAccountFirstName,
  matchesQuery,
  profileFormDirty,
  profileNeedsCurrentPassword,
  validateProfileForm,
} from "@/components/account/v2/account-model";
import { createProfileDefaults } from "@/components/account/account-shared";

/**
 * Parita della home account V2 con l'audit V1
 * (`docs/redesign/audit/wave-e-account.md`).
 */
const read = (relative) => readFileSync(path.join(process.cwd(), relative), "utf8");
const V2 = "src/components/account/v2";
const sources = {
  route: read("src/app/account/page.tsx"),
  createClubRoute: read("src/app/create-club/page.tsx"),
  redirect: read("src/components/account/create-club-redirect.tsx"),
  screen: read(`${V2}/account-home-screen.tsx`),
  profile: read(`${V2}/account-profile-drawer.tsx`),
  createClub: read(`${V2}/account-create-club-drawer.tsx`),
  redeem: read(`${V2}/account-redeem-access-drawer.tsx`),
  model: read(`${V2}/account-model.ts`),
};
const everything = Object.values(sources).join("\n");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("le rotte montano la V2 e la V1 non esiste piu", () => {
  assert.match(sources.route, /@\/components\/account\/v2\/account-home-screen/);
  assert.match(sources.createClubRoute, /create-club-redirect/);
  assert.match(sources.redirect, /\/account\?openCreateClub=1/);
  for (const v1 of ["account-home-screen.tsx", "account-profile-dialog.tsx", "account-create-club-dialog.tsx", "account-redeem-access-dialog.tsx"]) {
    assert.throws(() => read(`src/components/account/${v1}`), `${v1}: la V1 va rimossa, non affiancata`);
  }
});

test("ambiente 3: cielo pieno, marchio bianco, menu account con le tre voci della V1", () => {
  assert.match(sources.screen, /egw-sky-full/);
  assert.match(sources.screen, /logotipo-w\.png/);
  assert.match(sources.screen, /<PageHeader\s+onSky/);
  assert.match(sources.screen, /title=\{`Ciao, \$\{firstName\}`\}/);
  assert.match(sources.screen, /Profilo account/);
  assert.match(sources.screen, /Esci dall&apos;account/);
  assert.match(sources.screen, /void signOut\(\)/);
  assert.match(sources.screen, /window\.open\(SUPPORT_URL, "_blank", "noopener,noreferrer"\)/);
  assert.equal(SUPPORT_URL, "https://www.cedisoft.it/contatti/");
  assert.equal((sources.screen.match(/variant="inverted-on-sky"/g) || []).length, 1, "un solo primario sul cielo: Crea club");
  assert.doesNotMatch(sources.screen, /variant="primary"/, "il gradiente d'azione non si usa sul blu");
  assert.doesNotMatch(sources.screen, /account-hero/, "l'immagine decorativa della V1 non serve al lavoro");
});

test("i due pannelli: proprieta e accessi assegnati, con stati, ricerca sopra la soglia e slot", () => {
  assert.match(sources.screen, /title="Club di proprietà"/);
  assert.match(sources.screen, /I club che hai creato e amministri come proprietario\./);
  assert.match(sources.screen, /title="Accessi assegnati"/);
  assert.match(sources.screen, /I club dove qualcun altro ti ha dato un ruolo\./);
  assert.match(sources.screen, /slot disponibili su \$\{clubSlotLimit\}/);
  assert.match(sources.screen, /totalClubs >= SEARCH_THRESHOLD/);
  assert.equal(SEARCH_THRESHOLD, 5);
  assert.match(sources.screen, /placeholder="Cerca per nome, città o ruolo"/);
  assert.match(sources.screen, /function PanelSkeleton/);
  assert.match(sources.screen, /Non hai ancora creato un club/);
  assert.match(sources.screen, /Nessun accesso assegnato/);
  assert.match(sources.screen, /Nessun club corrisponde alla ricerca/);
  assert.match(sources.screen, /Non riusciamo a caricare i tuoi club/);
  assert.match(sources.screen, /Aggiornamento dei club non riuscito/);
  assert.match(sources.screen, /<StatusPill status=\{CLUB_ACCESS_STATUS\.open\}/, "il club aperto e una parola di stato");
  assert.match(sources.screen, /\{ownerMode \? "Proprietà" : club\.roleLabel\}/);
  assert.match(sources.screen, /club\.activeSeasonLabel/);
  assert.match(sources.screen, /data-testid="profili-collegati"/);
  assert.match(sources.screen, /etichettaProfili\(club\.linkedProfiles\)/);
});

test("aprire un club: attivazione, localStorage dichiarato, redirect del ruolo, gli stessi toast", () => {
  assert.match(sources.screen, /apiRequest<MembershipRecord>\("\/api\/v1\/auth\/memberships\/activate"/);
  assert.match(sources.screen, /window\.localStorage\.setItem\("activeClub", JSON\.stringify\(nextActiveClub\)\)/);
  assert.match(sources.screen, /window\.localStorage\.setItem\(`activeClub_\$\{user\.id\}`, JSON\.stringify\(nextActiveClub\)\)/);
  assert.match(sources.screen, /getAccessRedirectPath\(/);
  assert.match(sources.screen, /Accesso attivato, ma il profilo collegato non è disponibile/);
  assert.match(sources.screen, /Errore cambio club attivo/);
  assert.match(sources.screen, /fetchMemberships<MembershipRecord>\(user\.id\)/);
  assert.match(sources.screen, /classifyMembershipResponse\(response\)/);
  assert.match(sources.screen, /router\.replace\("\/login"\)/);
});

test("verifiche di email e telefono e link per la password: stessi endpoint, stessi testi", () => {
  assert.match(sources.screen, /`\/api\/v1\/auth\/verify\/\$\{channel\}\/send`/);
  assert.match(sources.screen, /`\/api\/v1\/auth\/verify\/\$\{channel\}\/confirm`/);
  assert.match(sources.screen, /"\/api\/v1\/auth\/password\/forgot"/);
  assert.match(sources.screen, /RESEND_TOO_SOON/);
  for (const frase of ["Ti abbiamo inviato un codice via email.", "Ti abbiamo inviato un codice via SMS.", '"Codice non valido"', '"Email verificata" : "Telefono verificato"', "apri il link per impostare una password.", "Rimanda il codice", "Codice a 6 cifre"]) {
    assert.ok(sources.screen.includes(frase), `manca ${frase}`);
  }
  assert.match(sources.screen, /title="Telefono non verificato"/);
  assert.match(sources.screen, /title="Email non verificata"/);
  assert.match(sources.screen, /Ricevi un link per impostarla/);
});

test("profilo: cassetto da 480 con gli otto campi, gli id e la validazione della V1, niente credenziali nel browser", () => {
  assert.match(sources.profile, /width="default"/);
  assert.match(sources.profile, /dirty=\{dirty\}/);
  for (const id of ["profile-first-name", "profile-last-name", "profile-email", "profile-phone", "profile-current-password", "profile-new-password", "profile-confirm-password"]) {
    assert.ok(sources.profile.includes(`id="${id}"`), `manca il campo ${id}`);
  }
  assert.match(sources.profile, /<AvatarUpload/);
  assert.match(sources.profile, /Rimuovi immagine/);
  assert.match(sources.profile, /autoComplete="current-password"/);
  assert.match(sources.profile, /Cambiando email o cellulare, EasyGame richiede una nuova verifica\./);
  assert.match(sources.profile, /Ruolo base/);
  assert.match(sources.profile, /Nessun club attivo selezionato/);
  assert.match(sources.profile, /Salva profilo/);
  assert.match(sources.screen, /supabase\.auth\.updateUser\(\{/);
  assert.match(sources.screen, /currentPassword: richiedePassword \? profileForm\.currentPassword : undefined/);
  assert.match(sources.screen, /Profilo aggiornato\. Email e telefono richiederanno una nuova verifica\./);
  assert.match(sources.screen, /Profilo aggiornato correttamente/);
  assert.match(sources.screen, /Errore aggiornamento profilo/);
  assert.doesNotMatch(senzaCommenti(everything), /(localStorage|sessionStorage)[^\n]*(password|Password|token|Token)/, "nessuna credenziale in un archivio del browser");

  const user = { email: "a@b.it", user_metadata: { phone: "333" } };
  const base = { ...createProfileDefaults(user) };
  assert.deepEqual(validateProfileForm(base, user), []);
  assert.deepEqual(
    validateProfileForm({ ...base, newPassword: "x", confirmPassword: "y" }, user).map((e) => e.message),
    ["Le password non coincidono", "Per cambiare email, cellulare o password serve la password attuale. Se non ne hai una, usa «Ricevi un link per impostarla»."],
  );
  assert.equal(profileNeedsCurrentPassword({ ...base, firstName: "Mario" }, user), false, "correggere il nome non chiede la password");
  assert.equal(profileNeedsCurrentPassword({ ...base, phone: "334" }, user), true);
  assert.equal(profileFormDirty(base, base), false);
  assert.equal(profileFormDirty({ ...base, lastName: "Rossi" }, base), true);
  assert.equal(CONTACT_STATUS.verified.label, "VERIFICATO");
  assert.equal(CONTACT_STATUS.to_verify.label, "DA VERIFICARE");
  assert.equal(CLUB_ACCESS_STATUS.open.label, "APERTO");
});

test("crea club: cassetto da 720 con le sei sezioni e tutti i campi della V1, obbligatori portati alla loro sezione", () => {
  assert.match(sources.createClub, /width="wide"/);
  assert.match(sources.createClub, /dirty=\{dirty\}/);
  for (const id of ["general", "fiscal", "bank", "contacts", "federation", "social"]) {
    assert.ok(sources.createClub.includes(`<Section id="${id}"`), `manca la sezione ${id}`);
  }
  for (const id of ["club-name", "club-type", "club-founding-year", "club-address", "legal-address", "youtube", "club-contactEmail", "club-contactPhone"]) {
    assert.ok(sources.createClub.includes(`id="${id}"`), `manca il campo ${id}`);
  }
  for (const label of ["Ragione sociale", "PEC", "Partita IVA", "Codice fiscale", "Regime fiscale", "Codice ATECO", "Codice SDI", "Città sede legale", "CAP sede legale", "Regione sede legale", "Provincia sede legale", "Paese sede legale", "Nome rappresentante", "Cognome rappresentante", "Codice fiscale rappresentante", "Nome banca", "IBAN", "Email contatto", "Telefono contatto", "Nome contatto", "Sito web", "Facebook", "Instagram", "X / Twitter", "Federazione", "Numero iscrizione", "Data affiliazione"]) {
    assert.ok(sources.createClub.includes(`label="${label}"`), `manca il campo ${label}`);
  }
  assert.match(sources.createClub, /CLUB_TYPE_PRESETS\.map/);
  assert.match(sources.createClub, /FEDERATION_PRESETS\.map/);
  assert.match(sources.createClub, /<AssistedAddressFields/);
  assert.match(sources.createClub, /<LogoUpload/, "il logo era montato ma nascosto: ora e raggiungibile");
  assert.match(sources.createClub, /Aggiungi federazione/);
  assert.match(sources.createClub, /Nessuna affiliazione inserita per ora\./);
  assert.match(sources.createClub, /Crea club/);
  assert.match(sources.screen, /Hai esaurito gli slot disponibili per i club/);
  assert.match(sources.screen, /apiRequest<any>\("\/api\/v1\/clubs", \{\s*method: "POST",\s*body: \{\s*mode: "create",\s*data: buildClubPayload\(createClubForm, user, shouldBePrimary\)/);
  assert.match(sources.screen, /Errore creazione club/);
  assert.match(sources.screen, /creato\. Ti accompagniamo nella configurazione iniziale\./);
  assert.match(sources.screen, /router\.push\("\/onboarding"\)/);
});

test("aggiungi accesso: un campo, lo stesso endpoint e gli stessi toast", () => {
  assert.match(sources.redeem, /id="access-token"/);
  assert.match(sources.redeem, /placeholder="Es\. EGCLUB8H2K9"/);
  assert.match(sources.redeem, /Collega accesso/);
  assert.match(sources.screen, /"\/api\/v1\/auth\/access\/redeem"/);
  assert.match(sources.screen, /Inserisci il token condiviso dal club/);
  assert.match(sources.screen, /Accesso aggiunto correttamente al tuo account/);
  assert.match(sources.screen, /Errore collegamento al club/);
});

test("eliminare un accesso assegnato: conferma del sistema con il testo della V1, stesso endpoint, pulizia del club attivo", () => {
  assert.match(sources.screen, /<DangerConfirmDialog/);
  assert.match(sources.screen, /Il profilo collegato verrà scollegato dal tuo account, ma non verrà eliminato dal club\./);
  assert.match(sources.screen, /confirmLabel="Elimina accesso"/);
  assert.match(sources.screen, /"\/api\/v1\/auth\/memberships\/delete"/);
  assert.match(sources.screen, /Accesso assegnato non valido/);
  assert.match(sources.screen, /Accesso eliminato e profilo scollegato/);
  assert.match(sources.screen, /window\.localStorage\.removeItem\("activeClub"\)/);
  assert.match(sources.screen, /setActiveClub\(null\)/);
  assert.match(sources.screen, /aria-label=\{`Elimina l'accesso \$\{club\.roleLabel\} a \$\{club\.name\}`\}/);
  assert.match(sources.screen, /\{!ownerMode && onDelete \? \(/, "solo sugli accessi assegnati");
  assert.doesNotMatch(senzaCommenti(everything), /window\.confirm|[^.\w]confirm\(/);
});

test("navigazione: i due parametri di ingresso restano", () => {
  assert.match(sources.screen, /params\.get\("openCreateClub"\) === "1"/);
  assert.match(sources.screen, /params\.get\("profile"\) === "1"/);
  assert.match(sources.screen, /window\.history\.replaceState\(\{\}, "", "\/account"\)/);
});

test("modello: nomi dei legami, ricerca, primo nome, luogo", () => {
  assert.equal(etichettaProfili([{ kind: "guardian", id: "1", name: "A" }]), "Tutore di");
  assert.equal(etichettaProfili([{ kind: "athlete", id: "1", name: "A" }]), "La tua scheda");
  assert.equal(etichettaProfili([{ kind: "trainer", id: "1", name: "A" }]), "Scheda allenatore");
  assert.equal(etichettaProfili([{ kind: "trainer", id: "1", name: "A" }, { kind: "guardian", id: "2", name: "B" }]), "Profili collegati");
  assert.equal(getAccountFirstName("Mario Rossi"), "Mario");
  assert.equal(getAccountFirstName(""), "EasyGamer");
  const club = { name: "Fortitudo", city: "Scauri", province: "LT", roleLabel: "Allenatore" };
  assert.equal(matchesQuery(club, ""), true);
  assert.equal(matchesQuery(club, "scau"), true);
  assert.equal(matchesQuery(club, "allen"), true);
  assert.equal(matchesQuery(club, "roma"), false);
  assert.equal(clubPlace(club), "Scauri, LT");
});

test("disciplina V2: niente componenti V1, niente tavolozza propria, niente gradienti fuori sistema", () => {
  assert.doesNotMatch(everything, /@\/components\/ui\/(card|badge|button|input|label|dialog|tabs|dropdown-menu)"/);
  assert.doesNotMatch(everything, /bg-gradient-to-|#[0-9a-fA-F]{6}\b|font-display|var\(--eg-[a-z]/);
  assert.doesNotMatch(everything, /[!]"|[!]\s*<|[!]\s*$/m, "niente punti esclamativi nei testi");
  assert.doesNotMatch(senzaCommenti(everything), /\bfetch\(/);
  for (const [name, source] of Object.entries(sources)) {
    const griglieSenzaRottura = [...source.matchAll(/className="([^"]*\bgrid-cols-\d[^"]*)"/g)].filter((m) => !/\b(sm|md|lg|xl|laptop):grid-cols-/.test(m[1]));
    assert.deepEqual(griglieSenzaRottura, [], `${name}: una griglia a colonne fisse`);
  }
});
