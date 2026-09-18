/**
 * **Il club con due stagioni** — la fixture obbligatoria per ogni test
 * sensibile alla stagione (ADR-0198 §0).
 *
 * Il pilota lavora su una **seconda** stagione, creata dopo la prima e
 * attivata: molti difetti non compaiono con una stagione sola e nascono
 * appena la seconda esiste — categorie omonime in due annate, voci del
 * programma riportate, assegnazioni dell'anno scorso. Un test che gira su un
 * club con una stagione sola non li vede.
 *
 * A = precedente (1 lug 2026 → 30 giu 2027), B = nuova e **attiva** (1 set
 * 2026 → 31 ago 2027): **sovrapposte**, come sul pilota. Ogni categoria
 * esiste in tutte e due le annate con lo stesso nome e un id diverso; i
 * gruppi operativi seguono la categoria; l'allenatore e del club e nella A
 * segue una squadra, nella B nessuna.
 *
 * Restituisce le righe nella forma di `createFakePrisma` e gli
 * identificativi, perche un test dica «cat-b-u15» e non lo ricalcoli.
 */

export const MS_CLUB = "aaaaaaaa-6c00-4000-8000-0000000001a8";
export const MS_DIREZIONE = "11111111-6c00-4000-8000-000000000bbb";
export const MS_SEASON_A = "season-2026-2027";
export const MS_SEASON_B = "season-2026-09-01-2027-08-31-ms2b";
export const MS_SITE = "site-ms-1";

export const MS_SEASONS = [
  { id: MS_SEASON_A, label: "2026/2027", startDate: "2026-07-01", endDate: "2027-06-30", status: "archived", createdAt: "2026-08-21T13:45:36.564Z" },
  { id: MS_SEASON_B, label: "2026/27", startDate: "2026-09-01", endDate: "2027-08-31", status: "active", createdAt: "2026-09-16T18:11:42.035Z" },
];

/** Le categorie: stesso nome nelle due annate, id diversi, B riportata dalla A. */
export const MS_CATEGORIES = [
  { id: "cat-a-u15", name: "Under 15 Eccellenza", seasonId: MS_SEASON_A, siteId: MS_SITE },
  { id: "cat-a-u17", name: "Under 17 Regionale", seasonId: MS_SEASON_A, siteId: MS_SITE },
  { id: "cat-a-aquilotti", name: "Aquilotti", seasonId: MS_SEASON_A, siteId: MS_SITE },
  { id: "cat-b-u15", name: "Under 15 Eccellenza", seasonId: MS_SEASON_B, siteId: MS_SITE, rolloverSourceId: "cat-a-u15" },
  { id: "cat-b-u17", name: "Under 17 Regionale", seasonId: MS_SEASON_B, siteId: MS_SITE, rolloverSourceId: "cat-a-u17" },
  { id: "cat-b-aquilotti", name: "Aquilotti", seasonId: MS_SEASON_B, siteId: MS_SITE, rolloverSourceId: "cat-a-aquilotti" },
];

export const MS_GROUPS = [
  { id: "grp-a-aquilotti", categoryId: "cat-a-aquilotti", siteId: MS_SITE, seasonId: MS_SEASON_A },
  { id: "grp-b-aquilotti", categoryId: "cat-b-aquilotti", siteId: MS_SITE, seasonId: MS_SEASON_B, rolloverSourceId: "grp-a-aquilotti" },
];

/** L'allenatore: nella A segue gli Aquilotti, nella B nessuno (il riporto delle assegnazioni e spento per scelta). */
export const MS_TRAINER = { id: "trainer-bianchi", name: "Coach Bianchi", categories: ["cat-a-aquilotti"] };
export const MS_TRAINER_2 = { id: "trainer-verdi", name: "Coach Verdi", categories: [] };

export const MS_STRUCTURE = { id: "structure-1", name: "Palazzetto", siteId: MS_SITE, fields: [{ id: "field-1", name: "Campo" }] };

const GIORNI = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì"];

/**
 * 40 voci come quelle del pilota: 8 al giorno dal lunedi al venerdi, alternate
 * fra due categorie. `trainerIds` e `seasonId` sono parametri perche il
 * test dica cosa porta la voce.
 */
export const fortyWeeklyRules = ({ seasonId = MS_SEASON_B, trainerIds = [MS_TRAINER.id], categoryIds = ["cat-b-u15", "cat-b-u17"] } = {}) =>
  Array.from({ length: 40 }, (_, i) => ({
    id: `voce-${i + 1}`,
    ...(seasonId ? { seasonId } : {}),
    day: GIORNI[i % 5],
    startTime: `${String(8 + Math.floor(i / 5)).padStart(2, "0")}:00`,
    endTime: `${String(9 + Math.floor(i / 5)).padStart(2, "0")}:00`,
    categoryId: categoryIds[i % categoryIds.length],
    structureId: MS_STRUCTURE.id,
    locationId: MS_STRUCTURE.fields[0].id,
    trainerIds,
    active: true,
  }));

/** Una singola voce, per i test che ne vogliono una con parametri chiari. */
export const weeklyRule = (overrides = {}) => ({
  id: "voce-aquilotti-lun",
  seasonId: MS_SEASON_B,
  day: "Lunedì",
  startTime: "18:00",
  endTime: "19:30",
  categoryId: "cat-b-aquilotti",
  structureId: MS_STRUCTURE.id,
  locationId: MS_STRUCTURE.fields[0].id,
  trainerIds: [],
  active: true,
  ...overrides,
});

/**
 * Il seed per `createFakePrisma`. `club` accetta sovrascritture della riga
 * del club (es. `weekly_schedule`, `trainers`); il resto sono le tabelle
 * vuote che il dominio legge.
 */
export const seedMultiSeasonClub = (club = {}, tables = {}) => ({
  user: [{ id: MS_DIREZIONE, email: "direzione@club.it" }],
  club: [
    {
      id: MS_CLUB,
      slug: "club-due-stagioni",
      name: "Club due stagioni",
      creator_id: MS_DIREZIONE,
      categories: MS_CATEGORIES,
      category_groups: MS_GROUPS,
      club_sites: [{ id: MS_SITE, name: "Sede centrale" }],
      trainers: [MS_TRAINER, MS_TRAINER_2],
      staff_members: [],
      structures: [MS_STRUCTURE],
      trainings: [],
      matches: [],
      weekly_schedule: [],
      settings: { seasons: MS_SEASONS, activeSeasonId: MS_SEASON_B },
      ...club,
    },
  ],
  athlete: [],
  athleteCategoryMembership: [],
  clubResourceItem: [],
  clubEvent: [],
  clubEventParticipant: [],
  trialAthlete: [],
  trialAttendance: [],
  auditLog: [],
  notification: [],
  ...tables,
});

/** Giovedi 17 settembre 2026, 09:25 di Roma (07:25Z): l'istante del pilota. */
export const MS_NOW = new Date("2026-09-17T07:25:00.000Z");
