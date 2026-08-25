import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  PARENT_TOKEN_EXPIRY_HOURS,
  createParentAccessToken,
  formatParentAccessToken,
  getGuardianAccessStatus,
  getGuardianDisplayName,
  getGuardianTokenTiming,
  normalizeGuardianRows,
} from "../../src/lib/athlete-guardians.ts";

import {
  buildAthleteKitBuilderComponents,
  calculateAgeFromBirthDate,
  coerceBooleanField,
  createEmptyMedicalVisit,
  createEmptyRegistration,
  getTodayDateString,
  normalizeClubFederations,
} from "../../src/lib/athlete-profile-fields.ts";

import {
  ATHLETE_PROFILE_TABS,
  resolveAthleteProfileTab,
} from "../../src/lib/athlete-profile-tabs.ts";

/**
 * Scomposizione della scheda atleta (WP-19, Blocco 8).
 *
 * `src/app/athletes/[id]/page.tsx` superava le 8.700 righe, e le regole di
 * dominio ci vivevano in mezzo: quando scade un token genitore, che eta ha un
 * atleta, cosa conta come «si» in un campo booleano. Nessuna era verificata,
 * perche verificarle voleva dire montare una pagina da 340 kB.
 *
 * Il refactor **non cambia comportamento**, e questi test sono cio che lo
 * rende un'affermazione invece di una speranza: esercitano il codice
 * estratto, con i casi che la pagina incontra davvero.
 */

/* ------------------------------------------------------ token del genitore */

test("un token e leggibile al telefono: niente caratteri ambigui", () => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const token = createParentAccessToken();
    assert.match(token, /^PAR[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{9}$/);
    assert.equal(/[IO01]/.test(token.slice(3)), false, `${token} contiene un carattere ambiguo`);
  }
});

test("un token si formatta a gruppi di quattro", () => {
  assert.equal(formatParentAccessToken("PARAB12CD34"), "PARA-B12C-D34");
  assert.equal(formatParentAccessToken("para-b12c-d34"), "PARA-B12C-D34");
  assert.equal(formatParentAccessToken("  parab12cd34  "), "PARA-B12C-D34");
  assert.equal(formatParentAccessToken(""), "-");
  assert.equal(formatParentAccessToken(null), "-");
});

/* ------------------------------------------------------- stato dell'accesso */

const NOW = Date.parse("2026-08-25T12:00:00.000Z");
const ore = (count) => new Date(NOW + count * 3600_000).toISOString();

test("un account collegato vince su qualunque stato del token", () => {
  const status = getGuardianAccessStatus(
    {
      linkedUserId: "user-1",
      parentAccessTokenStatus: "expired",
      parentAccessTokenExpiresAt: ore(-100),
    },
    NOW,
  );

  assert.equal(
    status.state,
    "linked",
    "il token e il mezzo per collegarsi: una volta collegati non conta piu",
  );
});

test("un token revocato non e un token scaduto", () => {
  assert.equal(
    getGuardianAccessStatus({ parentAccessTokenStatus: "revoked" }, NOW).state,
    "not-linked",
  );
  assert.equal(
    getGuardianAccessStatus({ accessTokenStatus: "disconnected" }, NOW).state,
    "not-linked",
  );
});

test("un token scaduto si riconosce dalla data, non solo dallo stato", () => {
  const status = getGuardianAccessStatus(
    { parentAccessTokenValue: "PARABC", parentAccessTokenExpiresAt: ore(-1) },
    NOW,
  );
  assert.equal(status.state, "token-expired");
});

test("un token ancora valido e attivo", () => {
  const status = getGuardianAccessStatus(
    { parentAccessTokenValue: "PARABC", parentAccessTokenExpiresAt: ore(24) },
    NOW,
  );
  assert.equal(status.state, "token-active");
});

test("senza token e senza account non si e collegati", () => {
  assert.equal(getGuardianAccessStatus({}, NOW).state, "not-linked");
});

test("le tre grafie dello stesso campo valgono uguale", () => {
  for (const key of [
    "parentAccessTokenValue",
    "parent_access_token_value",
    "accessTokenValue",
  ]) {
    assert.equal(
      getGuardianAccessStatus({ [key]: "PARABC" }, NOW).state,
      "token-active",
      `${key} deve essere riconosciuto`,
    );
  }

  for (const key of ["linkedUserId", "linked_user_id"]) {
    assert.equal(getGuardianAccessStatus({ [key]: "u1" }, NOW).state, "linked");
  }
});

/* ------------------------------------------------------ tempo che rimane */

test("il tempo rimanente si legge in ore e minuti", () => {
  const timing = getGuardianTokenTiming(
    {
      parentAccessTokenGeneratedAt: ore(-2),
      parentAccessTokenExpiresAt: ore(1.5),
    },
    NOW,
  );

  assert.equal(timing.label, "1h 30m rimanenti");
  assert.equal(timing.isExpired, false);
  assert.ok(timing.progress > 0 && timing.progress < 100);
});

test("senza data di generazione la barra usa le 72 ore di default", () => {
  const timing = getGuardianTokenTiming(
    { parentAccessTokenExpiresAt: ore(PARENT_TOKEN_EXPIRY_HOURS) },
    NOW,
  );

  assert.equal(
    Math.round(timing.progress),
    100,
    "un token appena creato non deve apparire gia consumato",
  );
});

test("un token scaduto lo dice, e la barra e a zero", () => {
  const timing = getGuardianTokenTiming(
    { parentAccessTokenExpiresAt: ore(-5) },
    NOW,
  );

  assert.equal(timing.label, "Token scaduto");
  assert.equal(timing.progress, 0);
  assert.equal(timing.isExpired, true);
});

test("senza scadenza non si inventa un conto alla rovescia", () => {
  const timing = getGuardianTokenTiming({}, NOW);
  assert.equal(timing.label, "Scadenza non disponibile");
  assert.equal(timing.isExpired, false);
});

/* --------------------------------------------------------------- genitori */

test("il nome di un genitore non e mai vuoto", () => {
  assert.equal(getGuardianDisplayName({ name: "Mario", surname: "Rossi" }), "Mario Rossi");
  assert.equal(getGuardianDisplayName({ surname: "Rossi" }), "Rossi");
  assert.equal(getGuardianDisplayName({ email: "m@esempio.it" }), "m@esempio.it");
  assert.equal(getGuardianDisplayName({}), "Genitore/Tutore");
});

test("gli id delle righe sono stabili fra due montaggi", () => {
  const guardians = [{ name: "Mario", email: "M.Rossi@Esempio.IT" }, { name: "Anna" }];

  const first = normalizeGuardianRows(guardians, "seme");
  const second = normalizeGuardianRows(guardians, "seme");

  assert.deepEqual(
    first.map((row) => row.id),
    second.map((row) => row.id),
    "un id instabile fa perdere il fuoco al campo che si sta scrivendo",
  );
  assert.equal(first[0].id, "guardian-0-m-rossi-esempio-it");
});

test("un id gia presente non viene sostituito", () => {
  const [row] = normalizeGuardianRows([{ id: "fisso", name: "Mario" }]);
  assert.equal(row.id, "fisso");
});

/* -------------------------------------------------------- campi del form */

test("l'eta e quella compiuta, non la differenza fra gli anni", () => {
  const oggi = new Date("2026-08-25T00:00:00.000Z");

  assert.equal(calculateAgeFromBirthDate("2010-08-25", oggi), 16, "compleanno oggi");
  assert.equal(calculateAgeFromBirthDate("2010-08-26", oggi), 15, "compleanno domani");
  assert.equal(calculateAgeFromBirthDate("2010-12-31", oggi), 15, "nato a dicembre");
  assert.equal(calculateAgeFromBirthDate("", oggi), 0);
  assert.equal(calculateAgeFromBirthDate("non-una-data", oggi), 0);
});

test("un «si» vale in tutte le forme in cui e stato salvato", () => {
  for (const value of [true, "true", "1", "yes", "si", "sì", "SI", " Active ", "enabled"]) {
    assert.equal(coerceBooleanField(value), true, `${String(value)} deve valere vero`);
  }

  for (const value of [false, "false", "0", "no", "", null, undefined, "boh"]) {
    assert.equal(coerceBooleanField(value), false, `${String(value)} deve valere falso`);
  }
});

test("le federazioni si leggono da entrambi i percorsi, senza duplicati", () => {
  assert.deepEqual(
    normalizeClubFederations({ federations: ["FIP", { name: "FIPAV" }, "  FIP  "] }),
    ["FIP", "FIPAV"],
  );
  assert.deepEqual(
    normalizeClubFederations({ settings: { federations: [{ title: "CSI" }] } }),
    ["CSI"],
  );
  assert.deepEqual(normalizeClubFederations({}), []);
});

test("i form si aprono sempre nello stesso stato", () => {
  const visita = createEmptyMedicalVisit();
  assert.equal(visita.type, "Agonistica");
  assert.equal(visita.paidBy, "atleta");
  assert.equal(visita.file, null);

  const tesseramento = createEmptyRegistration();
  assert.equal(tesseramento.status, "In corso");
  assert.equal(tesseramento.number, "", "il numero di tessera non e obbligatorio");
});

test("la data di oggi e in ISO, senza ora", () => {
  assert.equal(getTodayDateString(new Date("2026-08-25T22:30:00.000Z")), "2026-08-25");
});

test("i componenti del kit arrivano selezionati e da consegnare", () => {
  const components = buildAthleteKitBuilderComponents(["Maglia", "Pantaloncini"]);

  assert.equal(components.length, 2);
  assert.equal(components[0].name, "Maglia");
  assert.equal(components[0].selected, true);
  assert.equal(components[0].deliveryStatus, "pending");
  assert.notEqual(components[0].id, components[1].id, "gli id devono essere distinti");
});

/* ------------------------------------------------------------- le sezioni */

test("le sette sezioni della scheda sono dichiarate in un posto solo", () => {
  assert.deepEqual(
    ATHLETE_PROFILE_TABS.map((tab) => tab.value),
    [
      "generale",
      "contatti",
      "sanitari",
      "pagamenti",
      "abbigliamento",
      "documenti",
      "analitiche",
    ],
  );
});

test("la sezione richiesta si accetta solo se esiste", () => {
  assert.equal(resolveAthleteProfileTab("documenti"), "documenti");
  assert.equal(resolveAthleteProfileTab("DOCUMENTI"), "documenti");
  assert.equal(resolveAthleteProfileTab("inesistente"), "generale");
  assert.equal(resolveAthleteProfileTab(null), "generale");
});

/* --------------------------------------------- la pagina non deve ricrescere */

/**
 * Il numero non e un obiettivo estetico: e un limite superiore che dichiara
 * «da qui non si aggiunge, si estrae». Chi aggiunge una funzione alla scheda
 * atleta e supera la soglia deve prima portare fuori una sezione — che e
 * esattamente cio che WP-19 chiede.
 */
test("la scheda atleta non torna a crescere", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src", "app", "athletes", "[id]", "page.tsx"),
    "utf8",
  );
  const lines = source.split(/\r?\n/).length;

  assert.ok(
    lines <= 8500,
    `athletes/[id]/page.tsx ha ${lines} righe: estrai una sezione prima di aggiungerne`,
  );
});
