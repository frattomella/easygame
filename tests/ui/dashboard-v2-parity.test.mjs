import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { isClubDashboardRoute } from "@/components/dashboard/v2/dashboard-routes";
import {
  buildGreetingSummary,
  countWeekendMatches,
  greetingName,
  greetingWord,
} from "@/components/dashboard/v2/dashboard-facts";

/**
 * Parita della Dashboard V2 con l'audit V1
 * (`docs/redesign/audit/wave-b-sport-operations.md` §1).
 *
 * Il redesign cambia forma, non capacita: ogni etichetta, azione ed endpoint
 * che l'audit elenca deve restare nel sorgente V2. Un test statico non prova
 * che funzioni — lo fa il lead a schermo — ma impedisce che una capacita
 * sparisca per distrazione in una ripulitura.
 */
const read = (relative) => readFileSync(path.join(process.cwd(), relative), "utf8");

const V2 = "src/components/dashboard/v2";
const sources = {
  page: read(`${V2}/ClubDashboard.tsx`),
  kpi: read(`${V2}/DashboardKpiBar.tsx`),
  alerts: read(`${V2}/CertificateAlertCards.tsx`),
  trainings: read(`${V2}/TodayTrainingsPanel.tsx`),
  trainingsData: read(`${V2}/today-trainings.ts`),
  rail: read(`${V2}/DayRail.tsx`),
  onboarding: read("src/components/dashboard/onboarding-resume-card.tsx"),
  chrome: read(`${V2}/DashboardChrome.tsx`),
  layout: read("src/app/dashboard/layout.tsx"),
};
const everything = Object.values(sources).join("\n");

test("i dati arrivano dalle stesse funzioni della V1", () => {
  assert.match(sources.page, /loadClubDashboardOverview\(activeClubId\)/);
  assert.match(sources.page, /buildDashboardMetrics\(/);
  assert.match(sources.page, /buildCertificateAlerts\(/);
  assert.match(sources.page, /selectUpcomingMatches\(/);
  assert.match(sources.page, /selectUpcomingAppointments\(/);
  assert.match(sources.page, /selectActiveNotes\(/);
  assert.match(sources.trainingsData, /getClubTrainings\(clubId\)/);
  assert.match(sources.trainingsData, /getClubCategories\(clubId\)/);
  assert.match(sources.trainingsData, /getClubTrainers\(clubId\)/);
  assert.match(sources.trainingsData, /cachedQuery\(`trainings-\$\{clubId\}`/);
  assert.match(sources.trainingsData, /\.from\("training_attendance"\)/, "l'elenco presenze salvate resta a richiesta");
  assert.match(sources.onboarding, /fields: "settings"/);
  assert.match(sources.onboarding, /normalizeOnboardingState\(/);
  assert.equal(/fetch\(/.test(everything), false, "nessun fetch diretto: apiRequest o simplified-db");
});

test("il club si risolve come prima: clubId, organizationId, poi activeClub", () => {
  assert.match(sources.page, /searchParams\.get\("clubId"\) \|\| searchParams\.get\("organizationId"\)/);
  assert.match(sources.page, /localStorage\.getItem\("activeClub"\)/);
  assert.match(sources.page, /new CustomEvent\("club-updated"/, "le altre parti della chrome ascoltano club-updated");
});

test("i link in uscita portano agli stessi obiettivi della V1", () => {
  const targets = [
    ['"/athletes"', sources.kpi],
    ['"/categories"', sources.kpi],
    ['"/medical"', sources.kpi],
    ['"/training"', sources.kpi],
    ['"/matches"', sources.rail],
    ['"/secretariat"', sources.rail],
    ['"/medical?action=new"', sources.alerts],
    ['"/onboarding"', sources.onboarding],
    ["focus: \"attendance\", trainingId: training.id", sources.trainingsData],
    ["params.set(\"clubId\", clubId)", sources.trainingsData],
    ["#sanitari", sources.alerts],
    ["tab=sanitari", sources.alerts],
  ];
  for (const [needle, source] of targets) {
    assert.ok(source.includes(needle), `manca il collegamento ${needle}`);
  }
  assert.match(sources.trainingsData, /formatLocalDateOnly\(training\.date\)/, "il giorno del link presenze e civile, non UTC");
});

test("il promemoria certificati passa dalla stessa porta, un atleta alla volta", () => {
  assert.match(sources.alerts, /"\/api\/medical-certificate-reminders"/);
  assert.match(sources.alerts, /method: "POST"/);
  assert.match(sources.alerts, /athleteId: alert\.athleteId/);
  assert.match(sources.alerts, /certificateId: alert\.certificateId/);
  assert.match(sources.alerts, /organizationId: clubId/);
  assert.match(sources.alerts, /Esiste già un promemoria non letto per questo certificato\./);
  assert.match(sources.alerts, /Nessun nuovo promemoria creato\./);
});

test("le etichette italiane dell'audit ci sono ancora, nella forma V2", () => {
  const labels = [
    "Invia promemoria",
    "Registra certificato",
    "Vedi tutti (",
    "Presenze",
    "Elenco presenze",
    "Nessun dato di presenza disponibile",
    "Nessun allenamento programmato per oggi",
    "Gli allenamenti di altri giorni non compaiono qui.",
    "Nessun avviso sui certificati",
    "Gli avvisi sui certificati in scadenza appariranno qui.",
    "Nessuna gara in programma.",
    "Nessun appuntamento in agenda.",
    "Nessun promemoria attivo.",
    "Promemoria attivo",
    "Vedi tutte",
    "Configura il club in cinque passi",
    "Riprendi la configurazione iniziale",
    "Riprendi",
    "completati · prossimo passo:",
    "Atleti attivi",
    "Categorie attive",
    "Certificati in scadenza",
    "Oggi in palestra",
    "Allenamenti di oggi",
    "Prossime gare",
    "Appuntamenti",
    "Promemoria",
    "Riprova",
  ];
  for (const label of labels) {
    assert.ok(everything.includes(label), `manca l'etichetta «${label}»`);
  }
});

test("lo stato e una parola del sistema, non un colore", () => {
  assert.match(sources.alerts, /CERTIFICATE_STATUS\[alert\.status\]/);
  assert.match(sources.trainings, /STATUS_UNKNOWN/, "presenze non registrate = NON REGISTRATO");
  assert.match(sources.trainings, /ACTIVITY_STATUS\.cancelled/);
  assert.match(sources.trainings, /ACTIVITY_STATUS\.completed/);
  assert.match(sources.trainings, /CALLUP_STATUS\.present/);
  assert.match(sources.trainings, /CALLUP_STATUS\.absent/);
  assert.match(sources.rail, /MatchCertificateWarningBadge/, "convocati con certificato non valido, come in /matches");
});

test("niente di deprecato: gradienti modulo, titoli viola, banner di benvenuto", () => {
  const forbidden = [
    /from-orange-500|from-violet-500|from-lime-500|from-purple-500|from-emerald-500|from-blue-600/,
    /bg-gradient-to-/,
    /backdrop-blur/,
    /Benvenuto nella dashboard/,
    /window\.confirm/,
    /#[0-9a-fA-F]{6}\b/,
  ];
  for (const pattern of forbidden) {
    assert.equal(pattern.test(everything), false, `pattern deprecato trovato: ${pattern}`);
  }
  assert.equal(/![.\s]*["'`]/.test(everything), false, "niente punti esclamativi nelle etichette");
});

test("l'ambiente 2 e della Dashboard e di nessun'altra rotta del gruppo", () => {
  assert.match(sources.chrome, /className="egw-sky-band" aria-hidden/);
  assert.match(sources.chrome, /variant=\{onSky \? "sky" : "light"\}/);
  assert.match(sources.layout, /<DashboardChrome \/>/);
  assert.match(sources.layout, /cn\(dashboardMainClassName, "bg-transparent"\)/, "il main trasparente lascia vedere la banda");
  assert.match(sources.layout, /className="relative flex min-h-0 flex-1 flex-col"/, "la banda si posiziona rispetto a questo contenitore");

  assert.equal(isClubDashboardRoute("/dashboard"), true);
  assert.equal(isClubDashboardRoute("/dashboard/"), true);
  assert.equal(isClubDashboardRoute("/dashboard/8f1c2a3b-legacy-id"), true);
  assert.equal(isClubDashboardRoute("/dashboard/access-management"), false);
  assert.equal(isClubDashboardRoute("/dashboard/access-management/"), false);
  assert.equal(isClubDashboardRoute("/athletes"), false);
  assert.equal(isClubDashboardRoute(null), false);
});

test("la V1 specifica della Dashboard e stata rimossa, e nessuno la importa piu", () => {
  const removed = [
    "NewDashboard",
    "MetricsOverview",
    "CertificationAlerts",
    "UpcomingTrainings",
    "RecentActivity",
    "SetupGuide",
    "AccessCodeGenerator",
  ];
  for (const name of removed) {
    assert.equal(
      existsSync(path.join(process.cwd(), `src/components/dashboard/${name}.tsx`)),
      false,
      `${name}.tsx doveva sparire con la V2`,
    );
  }
  for (const route of ["src/app/dashboard/page.tsx", "src/app/dashboard/[dashboardId]/page.tsx"]) {
    const source = read(route);
    assert.match(source, /<ClubDashboard \/>/);
    for (const name of removed) {
      assert.equal(source.includes(name), false, `${route} importa ancora ${name}`);
    }
  }
});

/* ── i fatti del saluto ──────────────────────────────────────────────────── */

test("il saluto segue l'ora e il nome proprio", () => {
  assert.equal(greetingWord(new Date(2026, 8, 10, 9, 0)), "Buongiorno");
  assert.equal(greetingWord(new Date(2026, 8, 10, 17, 59)), "Buongiorno");
  assert.equal(greetingWord(new Date(2026, 8, 10, 18, 0)), "Buonasera");

  assert.equal(greetingName({ user_metadata: { firstName: "Francesca", lastName: "M" } }), "Francesca");
  assert.equal(greetingName({ user_metadata: { name: "Aldo Izzo" } }), "Aldo");
  assert.equal(greetingName({ email: "segreteria@club.it" }), "segreteria");
  assert.equal(greetingName(null), "");
});

test("le gare del fine settimana sono sabato e domenica a venire", () => {
  const giovedi = new Date(2026, 8, 10); // giovedi 10 settembre 2026
  const matches = [
    { date: new Date(2026, 8, 10) }, // oggi
    { date: new Date(2026, 8, 12) }, // sabato
    { date: new Date(2026, 8, 13) }, // domenica
    { date: new Date(2026, 8, 19) }, // sabato dopo
  ];
  assert.equal(countWeekendMatches(matches, giovedi), 2);

  const domenica = new Date(2026, 8, 13);
  assert.equal(countWeekendMatches(matches, domenica), 1, "di domenica conta solo la domenica stessa");
});

test("la riga di riepilogo e in italiano, con i plurali giusti", () => {
  assert.equal(
    buildGreetingSummary({ trainingsToday: 1, weekendMatches: 2, expiringCertificates: 0 }),
    "1 allenamento oggi · 2 gare nel fine settimana · 0 certificati in scadenza",
  );
  assert.equal(
    buildGreetingSummary({ trainingsToday: 3, weekendMatches: 1, expiringCertificates: 1 }),
    "3 allenamenti oggi · 1 gara nel fine settimana · 1 certificato in scadenza",
  );
});
