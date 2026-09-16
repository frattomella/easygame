import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * **Le superfici della passata di completamento (ADR-0187, ADR-0188).**
 *
 * Prove statiche: ogni schermata che il mandato nomina monta il guscio e i
 * pezzi del sistema che le spettano, nessuna rotta utente e rimasta sulla
 * V1, e la tavolozza legacy non rientra nei file utente. Non sostituiscono
 * la UAT: dicono che cio che la UAT ha visto non puo sparire in silenzio.
 */

const leggi = (p) => readFileSync(p, "utf8");

/* ------------------------------------------------------ ambiente 3 */

test("accesso, registrazione, recupero e conferma stanno su OutsideShell e non su un guscio proprio", () => {
  for (const file of [
    "src/components/auth/auth-shell.tsx",
    "src/components/auth/password-reset-shell.tsx",
    "src/app/auth/complete/page.tsx",
    "src/components/athlete/athlete-invite-redeem-screen.tsx",
    "src/app/parent-view/page.tsx",
    "src/components/forms/public-form-page.tsx",
    "src/components/enrollment/PublicEnrollmentStatusPage.tsx",
    "src/components/payments/PublicPaymentLinkPage.tsx",
  ]) {
    const s = leggi(file);
    assert.match(s, /from "@\/components\/web\/shell\/OutsideShell"/, `${file} monta OutsideShell`);
    assert.doesNotMatch(s, /bg-gradient-to-(br|b|r) from-(blue|sky|indigo)-/, `${file} non dipinge un cielo proprio`);
  }
});

test("la logica dell'accesso non e cambiata: OTP email e SMS, OAuth e rinvii restano nel guscio", () => {
  const s = leggi("src/components/auth/auth-shell.tsx");
  for (const marcatore of ["Inserisci il codice email", "Inserisci il codice SMS", "Reinvia codice", "SegmentedControl"]) {
    assert.ok(s.includes(marcatore), `auth-shell porta «${marcatore}»`);
  }
  assert.match(s, /AlertBlock severity="danger" role="alert"/, "l'errore e un AlertBlock annunciato");
  assert.match(s, /from "@\/lib\/api\/client"|from "@\/lib\/supabase"/, "il trasporto e quello di sempre");
});

test("il ripiego di Suspense delle pagine fuori dal club e sui token", () => {
  for (const file of ["src/app/page.tsx", "src/app/login/page.tsx", "src/app/register/page.tsx", "src/app/auth/forgot-password/page.tsx", "src/app/auth/reset-password/page.tsx"]) {
    const s = leggi(file);
    assert.doesNotMatch(s, /bg-slate-50/, `${file} non usa bg-slate-50`);
    assert.match(s, /bg-egw-page/, `${file} usa il fondo del sistema`);
  }
});

/* ------------------------------------------------------ le tre aree */

test("famiglia, allenatore e atleta montano AreaShell e nessun guscio proprio", () => {
  for (const file of [
    "src/components/parent-dashboard/parent-dashboard-shell.tsx",
    "src/components/trainer/trainer-dashboard-club-shell.tsx",
    "src/components/athlete/athlete-area-shell.tsx",
  ]) {
    const s = leggi(file);
    assert.match(s, /from "@\/components\/web\/shell\/AreaShell"/, `${file} monta AreaShell`);
    assert.doesNotMatch(s, /<aside/, `${file} non disegna una barra propria`);
  }
  for (const rimosso of [
    "src/components/parent-dashboard/ParentSidebar.tsx",
    "src/components/trainer/TrainerSidebar.tsx",
    "src/components/athlete/athlete-sidebar.tsx",
  ]) {
    assert.equal(existsSync(rimosso), false, `${rimosso} non esiste piu`);
  }
});

test("la scelta del figlio legge la categoria dall'indice, il ruolo in un elemento suo e lo stato in una pillola", () => {
  const s = leggi("src/app/parent-view/page.tsx");
  assert.match(s, /MembershipRoleBadge/, "il ruolo dell'appartenenza ha il suo elemento");
  assert.match(s, /StatusPill/, "lo stato e una pillola");
  assert.match(s, /DataChip/, "la categoria e un chip di dato");
  assert.doesNotMatch(s, /category_id\s*\}\s*<\/|\{\s*membership\.category_id\s*\}/, "nessun identificativo grezzo a schermo");
  const guscio = leggi("src/components/parent-dashboard/parent-dashboard-shell.tsx");
  assert.match(guscio, /Cambia figlio/, "dall'area con piu figli si torna alla scelta");
});

test("le dashboard di ruolo usano i pezzi del sistema per stati e numeri", () => {
  const attese = {
    "src/components/parent-dashboard/parent-dashboard-pages.tsx": ["KpiCard", "EmptyStateCard", "StatusPill"],
    "src/components/trainer/trainer-dashboard-shared.tsx": ["KpiCard", "Panel", "PanelHeader", "InsetBlock"],
    "src/components/trainer/trainer-dashboard-home-v2-page.tsx": ["PageHeading", "Panel"],
    "src/components/athlete/athlete-area-pages.tsx": ["StatusPill", "EmptyStateCard"],
  };
  for (const [file, pezzi] of Object.entries(attese)) {
    const s = leggi(file);
    for (const pezzo of pezzi) assert.ok(s.includes(pezzo), `${file} usa ${pezzo}`);
    assert.doesNotMatch(s, /from "@\/components\/ui\/badge"/, `${file} non usa Badge con classi proprie`);
  }
});

/* ------------------------------------------------------ programma settimanale */

test("il programma settimanale ha cambiato pelle e non motore", () => {
  const s = leggi("src/components/dashboard/WeeklyTrainingSchedulePanel.tsx");
  for (const pezzo of ["AlertBlock", "EmptyStateCard", "InsetBlock", "Panel", "StatusPill", "IconButton"]) {
    assert.ok(s.includes(pezzo), `il pannello usa ${pezzo}`);
  }
  assert.doesNotMatch(s, /matchConvocationDeadlineDays|Scadenza convocazioni/, "la scadenza delle convocazioni non sta piu qui");
  /* Il motore vive altrove e non e stato toccato: il pannello non genera occorrenze. */
  assert.doesNotMatch(s, /club_events|generateOccurrences|recurrence/i, "il pannello non conosce il motore");
});

test("la scadenza delle convocazioni vive in Impostazioni → Gare e convocazioni, e la pagina Gare legge soltanto", () => {
  const sezioni = leggi("src/components/settings/v2/settings-sections.tsx");
  assert.match(sezioni, /export function MatchesPanel/, "il pannello esiste");
  assert.match(sezioni, /Scadenza convocazioni/, "l'etichetta e quella del mandato");
  const gare = leggi("src/app/matches/page.tsx");
  assert.match(gare, /getMatchConvocationDeadlineDays/, "la pagina Gare legge dall'autorita");
  assert.doesNotMatch(gare, /matchConvocationDeadlineDays:\s*[a-zA-Z]/, "la pagina Gare non scrive la scadenza");
  assert.match(gare, /\/settings\?tab=gare/, "e rimanda a Impostazioni");
});

/* ------------------------------------------------------ persone in prova */

test("il registro presenze porta la sezione «Atleta in prova» e la salva prima delle presenze degli atleti", () => {
  const cassetto = leggi("src/components/training/v2/AttendanceDrawer.tsx");
  assert.match(cassetto, /<TrialAttendanceSection ref=\{trialSection\}/, "la sezione e montata");
  const salvataggio = cassetto.indexOf("await trialSection.current.save()");
  const presenze = cassetto.indexOf("await onSave(");
  assert.ok(salvataggio > 0 && (presenze < 0 || salvataggio < presenze), "prima la sezione di prova, poi le presenze");
  const sezione = leggi("src/components/training/v2/TrialAttendanceSection.tsx");
  assert.match(sezione, /searchTrialAthletes/, "prima si cerca");
  assert.match(sezione, /createTrialAthlete/, "poi, se serve, si crea");
  assert.match(sezione, /trialAthleteId: /, "la presenza porta l'identificativo, non un nome");
  assert.doesNotMatch(sezione, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/, "oggi non e UTC troncato");
});

test("la vista «Atleti in prova» sta nell'area Atleti, con scheda, stati e conversione che mostra i candidati", () => {
  assert.ok(existsSync("src/app/athletes/in-prova/page.tsx"), "la pagina esiste");
  assert.ok(existsSync("src/app/athletes/in-prova/[id]/page.tsx"), "la scheda esiste");
  const menu = leggi("src/app/athletes/page.tsx");
  assert.match(menu, /Atleti in prova/, "il menu dell'area Atleti la apre");
  assert.match(menu, /withClubId\("\/athletes\/in-prova"/, "e porta il club");
  const pannello = leggi("src/components/trials/v2/TrialAthletesPanel.tsx");
  assert.match(pannello, /TRIAL_STATUS|StatusPill/, "lo stato e una pillola");
  const conversione = leggi("src/components/trials/v2/TrialConvertDrawer.tsx");
  assert.match(conversione, /findAthleteCandidates/, "prima i candidati esistenti");
  assert.match(conversione, /athleteId/, "si puo collegare una scheda esistente");
  assert.match(conversione, /create/, "o crearne una nuova");
  const stato = leggi("src/lib/web/status.ts");
  assert.match(stato, /TRIAL_STATUS/, "TRIAL_STATUS nel vocabolario degli stati");
});

test("l'allenatore vede le persone in prova nel perimetro e non ha il comando di conversione", () => {
  const s = leggi("src/components/trainer/trainer-athletes-dashboard-page.tsx");
  assert.match(s, /roleHasPermission\(ruoloAllenatore, "trials\.read"\)/);
  assert.match(s, /canConvert=\{roleHasPermission\(ruoloAllenatore, "trials\.convert"\)\}/, "la conversione dipende dalla chiave, che l'allenatore non ha");
  const catalogo = leggi("src/lib/permissions/catalog.ts");
  const convert = catalogo.slice(catalogo.indexOf('key: "trials.convert"'), catalogo.indexOf('key: "trials.convert"') + 400);
  assert.doesNotMatch(convert, /trainer:\s*true/, "trials.convert non e dell'allenatore");
});

/* ------------------------------------------------------ marchio e tavolozza */

test("nessuna rotta utente e rimasta sulla V1: ogni pagina raggiunge il sistema", () => {
  const pagine = [];
  const walk = (d) => { for (const e of readdirSync(d)) { const p = path.join(d, e); if (statSync(p).isDirectory()) walk(p); else if (e === "page.tsx") pagine.push(p); } };
  walk("src/app");
  const eccezioni = pagine.filter((p) => p.includes(`${path.sep}private${path.sep}`));
  assert.equal(eccezioni.length, 3, "le sole eccezioni sono le tre pagine private");
  const legacy = /\b(bg|text|border)-(slate|gray|zinc)-(50|100|200|300|400|500|600|700|800|900)\b/;
  for (const pagina of pagine) {
    if (eccezioni.includes(pagina)) continue;
    const s = leggi(pagina);
    assert.doesNotMatch(s, legacy, `${pagina} non usa la tavolozza legacy`);
  }
});

test("il vocabolario legacy non rientra nei file utente delle aree e dei gusci", () => {
  const cartelle = [
    "src/components/parent-dashboard",
    "src/components/trainer",
    "src/components/athlete",
    "src/components/auth",
    "src/components/trials",
    "src/components/training/v2",
    "src/components/web/shell",
    "src/components/layout",
  ];
  const legacy = /\b(bg|text|border|from|to|divide)-(slate|gray|zinc|blue|indigo|sky|emerald|green|red|rose|amber|yellow|orange|violet|purple)-(50|100|200|300|400|500|600|700|800|900|950)\b/g;
  const residui = [];
  for (const cartella of cartelle) {
    if (!existsSync(cartella)) continue;
    const walk = (d) => { for (const e of readdirSync(d)) { const p = path.join(d, e); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(e)) { const trovati = leggi(p).match(legacy); if (trovati) residui.push(`${p}: ${[...new Set(trovati)].join(", ")}`); } } };
    walk(cartella);
  }
  assert.deepEqual(residui, [], "nessun colore della tavolozza legacy");
});
