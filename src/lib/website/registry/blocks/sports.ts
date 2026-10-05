import { z } from "zod";
import { defineBlock } from "../types";
import { COLUMN_OPTIONS, bool, choice, int, link, media, ref, stringList, text } from "../fields";

/**
 * **Blocchi sportivi** (ADR-0200 §8, §11).
 *
 * Nessuno di questi blocchi scrive un dato: leggono gare, squadre, rose e
 * persone dal gestionale attraverso una sorgente dati. Un risultato inserito
 * in EasyGame arriva al sito senza che nessuno lo ricopi; un dato che EasyGame
 * non ha non compare — mai una cifra inventata per riempire un riquadro.
 *
 * `"context"` vuol dire «quello della pagina»: il blocco rosa dentro il
 * modello della pagina squadra mostra la squadra dell'indirizzo.
 */

const LIST_STYLE = {
  responsive: ["paddingTop", "paddingBottom", "gap", "align"] as const,
  static: ["animation", "radius"] as const,
  defaults: { paddingTop: "none", paddingBottom: "sm", gap: "md", align: "left" } as const,
};

const VENUE_OPTIONS = [
  { value: "all", label: "Tutte" },
  { value: "home", label: "In casa" },
  { value: "away", label: "In trasferta" },
] as const;

const ctaShape = () =>
  z.unknown().transform((value) => {
    const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const label = typeof record.label === "string" ? record.label.trim().slice(0, 40) : "";
    return { label, link: link().parse(record.link) };
  });

const emptyMessage = (fallback: string) => text(200, fallback);

/* ------------------------------------------------------------------ gare */

export const nextMatchBlock = defineBlock({
  type: "next-match",
  category: "match",
  label: "Prossima gara",
  description: "La prossima gara in calendario, con squadre, data, luogo e competizione.",
  icon: "calendar-clock",
  version: 1,
  schema: z.object({
    title: text(100, "Prossima gara"),
    teamId: ref(true),
    competitionId: ref(false),
    venue: choice(["all", "home", "away"] as const, "all"),
    layout: choice(["card", "banner", "compact"] as const, "card"),
    showLogos: bool(true),
    showVenue: bool(true),
    showDate: bool(true),
    showTime: bool(true),
    showCompetition: bool(true),
    showCountdown: bool(false),
    cta: ctaShape(),
    emptyMessage: emptyMessage("Nessuna gara in programma."),
  }),
  defaults: {
    title: "Prossima gara",
    teamId: null,
    competitionId: null,
    venue: "all",
    layout: "card",
    showLogos: true,
    showVenue: true,
    showDate: true,
    showTime: true,
    showCompetition: true,
    showCountdown: false,
    cta: { label: "", link: { kind: "none" } },
    emptyMessage: "Nessuna gara in programma.",
  },
  controls: [
    { type: "text", key: "title", label: "Titolo", max: 100 },
    { type: "team", key: "teamId", label: "Squadra", allowContext: true, allowAll: true, group: "data" },
    { type: "competition", key: "competitionId", label: "Competizione", group: "data" },
    { type: "segmented", key: "venue", label: "Gare", group: "data", options: VENUE_OPTIONS },
    { type: "segmented", key: "layout", label: "Forma", group: "display", options: [
      { value: "card", label: "Riquadro" },
      { value: "banner", label: "Fascia" },
      { value: "compact", label: "Compatta" },
    ] },
    { type: "toggle", key: "showLogos", label: "Loghi", group: "display" },
    { type: "toggle", key: "showDate", label: "Data", group: "display" },
    { type: "toggle", key: "showTime", label: "Orario", group: "display" },
    { type: "toggle", key: "showVenue", label: "Luogo", group: "display" },
    { type: "toggle", key: "showCompetition", label: "Competizione", group: "display" },
    { type: "toggle", key: "showCountdown", label: "Conto alla rovescia", group: "display" },
    { type: "cta", key: "cta", label: "Bottone" },
    { type: "text", key: "emptyMessage", label: "Messaggio se non ci sono gare", max: 200 },
  ],
  style: LIST_STYLE,
  datasource: {
    key: "NEXT_MATCH",
    config: (p) => ({ teamId: p.teamId, competitionId: p.competitionId, venue: p.venue }),
  },
  keywords: ["partita", "gara", "calendario"],
});

export const matchHeroBlock = defineBlock({
  type: "match-hero",
  category: "match",
  label: "Gara in copertina",
  description: "La prossima gara a tutta larghezza: le due squadre, data, ora, palazzetto.",
  icon: "swords",
  version: 1,
  schema: z.object({
    eyebrow: text(60, "Prossima gara"),
    teamId: ref(true),
    competitionId: ref(false),
    venue: choice(["all", "home", "away"] as const, "all"),
    background: media(),
    overlay: int(0, 85, 60),
    showCountdown: bool(true),
    cta: ctaShape(),
    emptyMessage: emptyMessage("Il calendario e in aggiornamento."),
  }),
  defaults: {
    eyebrow: "Prossima gara",
    teamId: null,
    competitionId: null,
    venue: "all",
    background: null,
    overlay: 60,
    showCountdown: true,
    cta: { label: "", link: { kind: "none" } },
    emptyMessage: "Il calendario e in aggiornamento.",
  },
  controls: [
    { type: "text", key: "eyebrow", label: "Occhiello", max: 60 },
    { type: "team", key: "teamId", label: "Squadra", allowContext: true, allowAll: true, group: "data" },
    { type: "competition", key: "competitionId", label: "Competizione", group: "data" },
    { type: "segmented", key: "venue", label: "Gare", group: "data", options: VENUE_OPTIONS },
    { type: "media", key: "background", label: "Immagine di fondo" },
    { type: "number", key: "overlay", label: "Oscuramento", min: 0, max: 85, step: 5, unit: "%", group: "display" },
    { type: "toggle", key: "showCountdown", label: "Conto alla rovescia", group: "display" },
    { type: "cta", key: "cta", label: "Bottone" },
    { type: "text", key: "emptyMessage", label: "Messaggio se non ci sono gare", max: 200 },
  ],
  style: { responsive: ["paddingTop", "paddingBottom"], static: ["animation"], defaults: { paddingTop: "lg", paddingBottom: "lg" } },
  datasource: {
    key: "NEXT_MATCH",
    config: (p) => ({ teamId: p.teamId, competitionId: p.competitionId, venue: p.venue }),
  },
  keywords: ["partita", "copertina", "vs"],
});

const matchListShape = {
  title: text(100),
  teamId: ref(true),
  competitionId: ref(false),
  venue: choice(["all", "home", "away"] as const, "all"),
  limit: int(1, 50, 6),
  layout: choice(["list", "cards", "table"] as const, "list"),
  showVenue: bool(true),
  showCompetition: bool(true),
  showPeriods: bool(false),
  emptyMessage: emptyMessage("Nessuna gara da mostrare."),
};

const matchListControls = (withPeriods: boolean) =>
  [
    { type: "text", key: "title", label: "Titolo", max: 100 },
    { type: "team", key: "teamId", label: "Squadra", allowContext: true, allowAll: true, group: "data" },
    { type: "competition", key: "competitionId", label: "Competizione", group: "data" },
    { type: "segmented", key: "venue", label: "Gare", group: "data", options: VENUE_OPTIONS },
    { type: "number", key: "limit", label: "Quante", min: 1, max: 50, group: "data" },
    { type: "segmented", key: "layout", label: "Forma", group: "display", options: [
      { value: "list", label: "Elenco" },
      { value: "cards", label: "Riquadri" },
      { value: "table", label: "Tabella" },
    ] },
    { type: "toggle", key: "showVenue", label: "Luogo", group: "display" },
    { type: "toggle", key: "showCompetition", label: "Competizione", group: "display" },
    ...(withPeriods ? [{ type: "toggle", key: "showPeriods", label: "Parziali", group: "display" } as const] : []),
    { type: "text", key: "emptyMessage", label: "Messaggio se vuoto", max: 200 },
  ] as const;

export const matchListBlock = defineBlock({
  type: "match-list",
  category: "match",
  label: "Calendario gare",
  description: "Le gare di una squadra o del club: prossime, passate o tutte, raggruppate per mese.",
  icon: "calendar-days",
  version: 1,
  schema: z.object({
    ...matchListShape,
    seasonId: ref(false, "active"),
    when: choice(["upcoming", "past", "all"] as const, "all"),
    groupByMonth: bool(true),
    limit: int(1, 100, 30),
  }),
  defaults: {
    title: "Calendario",
    teamId: null,
    competitionId: null,
    venue: "all",
    limit: 30,
    layout: "list",
    showVenue: true,
    showCompetition: true,
    showPeriods: false,
    emptyMessage: "Il calendario e in aggiornamento.",
    seasonId: "active",
    when: "all",
    groupByMonth: true,
  },
  controls: [
    ...matchListControls(true),
    { type: "season", key: "seasonId", label: "Stagione", group: "data" },
    { type: "segmented", key: "when", label: "Periodo", group: "data", options: [
      { value: "upcoming", label: "Prossime" },
      { value: "past", label: "Passate" },
      { value: "all", label: "Tutte" },
    ] },
    { type: "toggle", key: "groupByMonth", label: "Raggruppa per mese", group: "display" },
  ],
  style: LIST_STYLE,
  datasource: {
    key: "MATCH_LIST",
    config: (p) => ({ teamId: p.teamId, competitionId: p.competitionId, seasonId: p.seasonId, venue: p.venue, when: p.when, limit: p.limit }),
  },
  keywords: ["calendario", "partite"],
});

export const upcomingMatchesBlock = defineBlock({
  type: "upcoming-matches",
  category: "match",
  label: "Prossime gare",
  description: "Le prossime gare in calendario.",
  icon: "calendar-arrow-up",
  version: 1,
  schema: z.object(matchListShape),
  defaults: {
    title: "Prossime gare",
    teamId: null,
    competitionId: null,
    venue: "all",
    limit: 5,
    layout: "list",
    showVenue: true,
    showCompetition: true,
    showPeriods: false,
    emptyMessage: "Nessuna gara in programma.",
  },
  controls: matchListControls(false),
  style: LIST_STYLE,
  datasource: {
    key: "UPCOMING_MATCHES",
    config: (p) => ({ teamId: p.teamId, competitionId: p.competitionId, venue: p.venue, limit: p.limit }),
  },
});

export const recentResultsBlock = defineBlock({
  type: "recent-results",
  category: "match",
  label: "Ultimi risultati",
  description: "I risultati delle ultime gare giocate, aggiornati appena il gestionale li registra.",
  icon: "list-checks",
  version: 1,
  schema: z.object(matchListShape),
  defaults: {
    title: "Ultimi risultati",
    teamId: null,
    competitionId: null,
    venue: "all",
    limit: 5,
    layout: "list",
    showVenue: false,
    showCompetition: true,
    showPeriods: false,
    emptyMessage: "Nessun risultato ancora registrato.",
  },
  controls: matchListControls(true),
  style: LIST_STYLE,
  datasource: {
    key: "RECENT_RESULTS",
    config: (p) => ({ teamId: p.teamId, competitionId: p.competitionId, venue: p.venue, limit: p.limit }),
  },
  keywords: ["risultati", "punteggi"],
});

export const lastMatchBlock = defineBlock({
  type: "last-match",
  category: "match",
  label: "Ultima gara",
  description: "Il risultato dell'ultima gara, con i parziali se registrati.",
  icon: "flag",
  version: 1,
  schema: z.object({
    title: text(100, "Ultima gara"),
    teamId: ref(true),
    competitionId: ref(false),
    layout: choice(["card", "banner"] as const, "card"),
    showPeriods: bool(true),
    showVenue: bool(true),
    showRecap: bool(true),
    emptyMessage: emptyMessage("Nessun risultato ancora registrato."),
  }),
  defaults: {
    title: "Ultima gara",
    teamId: null,
    competitionId: null,
    layout: "card",
    showPeriods: true,
    showVenue: true,
    showRecap: true,
    emptyMessage: "Nessun risultato ancora registrato.",
  },
  controls: [
    { type: "text", key: "title", label: "Titolo", max: 100 },
    { type: "team", key: "teamId", label: "Squadra", allowContext: true, allowAll: true, group: "data" },
    { type: "competition", key: "competitionId", label: "Competizione", group: "data" },
    { type: "segmented", key: "layout", label: "Forma", group: "display", options: [
      { value: "card", label: "Riquadro" },
      { value: "banner", label: "Fascia" },
    ] },
    { type: "toggle", key: "showPeriods", label: "Parziali", group: "display" },
    { type: "toggle", key: "showVenue", label: "Luogo", group: "display" },
    { type: "toggle", key: "showRecap", label: "Collegamento al resoconto", group: "display" },
    { type: "text", key: "emptyMessage", label: "Messaggio se vuoto", max: 200 },
  ],
  style: LIST_STYLE,
  datasource: {
    key: "RECENT_RESULTS",
    config: (p) => ({ teamId: p.teamId, competitionId: p.competitionId, venue: "all", limit: 1 }),
  },
});

export const matchDetailBlock = defineBlock({
  type: "match-detail",
  category: "match",
  label: "Dettaglio gara",
  description: "Tutto cio che il gestionale sa di una gara: risultato, parziali, luogo, convocati, statistiche.",
  icon: "clipboard-list",
  version: 1,
  schema: z.object({
    matchId: ref(true, "context"),
    showPeriods: bool(true),
    showVenue: bool(true),
    showRoster: bool(true),
    showStats: bool(true),
    gallery: z.unknown().transform((value) => (Array.isArray(value) ? value.slice(0, 40) : [])),
    recapText: text(4000),
  }),
  defaults: { matchId: "context", showPeriods: true, showVenue: true, showRoster: true, showStats: true, gallery: [], recapText: "" },
  controls: [
    { type: "text", key: "matchId", label: "Gara", help: "Nella pagina di dettaglio gara resta «context»: la gara e quella dell'indirizzo.", group: "data" },
    { type: "toggle", key: "showPeriods", label: "Parziali", group: "display" },
    { type: "toggle", key: "showVenue", label: "Luogo", group: "display" },
    { type: "toggle", key: "showRoster", label: "Convocati pubblicati", group: "display" },
    { type: "toggle", key: "showStats", label: "Statistiche registrate", group: "display" },
  ],
  style: LIST_STYLE,
  datasource: { key: "MATCH_DETAIL", config: (p) => ({ matchId: p.matchId }) },
  allowedPageKinds: ["match_detail", "standard"],
});

export const standingsBlock = defineBlock({
  type: "standings",
  category: "match",
  label: "Classifica",
  description: "La classifica che il club registra per una competizione. Nessuna classifica inventata.",
  icon: "list-ordered",
  version: 1,
  schema: z.object({
    title: text(100, "Classifica"),
    competitionId: ref(true),
    highlightClub: bool(true),
    compact: bool(false),
    emptyMessage: emptyMessage("La classifica non e ancora disponibile."),
  }),
  defaults: { title: "Classifica", competitionId: null, highlightClub: true, compact: false, emptyMessage: "La classifica non e ancora disponibile." },
  controls: [
    { type: "text", key: "title", label: "Titolo", max: 100 },
    { type: "competition", key: "competitionId", label: "Competizione", allowContext: true, group: "data" },
    { type: "toggle", key: "highlightClub", label: "Evidenzia il club", group: "display" },
    { type: "toggle", key: "compact", label: "Solo punti e gare", group: "display" },
    { type: "text", key: "emptyMessage", label: "Messaggio se non disponibile", max: 200 },
  ],
  style: LIST_STYLE,
  datasource: { key: "STANDINGS", config: (p) => ({ competitionId: p.competitionId ?? "context" }) },
  keywords: ["classifica", "campionato"],
});

export const eventsListBlock = defineBlock({
  type: "events-list",
  category: "match",
  label: "Prossimi eventi",
  description: "Gli eventi del calendario del club: gare e, se il club lo sceglie, allenamenti aperti.",
  icon: "calendar-range",
  version: 1,
  schema: z.object({
    title: text(100, "Prossimi eventi"),
    teamId: ref(true),
    includeTrainings: bool(false),
    limit: int(1, 50, 6),
    layout: choice(["list", "cards"] as const, "list"),
    emptyMessage: emptyMessage("Nessun evento in programma."),
  }),
  defaults: { title: "Prossimi eventi", teamId: null, includeTrainings: false, limit: 6, layout: "list", emptyMessage: "Nessun evento in programma." },
  controls: [
    { type: "text", key: "title", label: "Titolo", max: 100 },
    { type: "team", key: "teamId", label: "Squadra", allowContext: true, allowAll: true, group: "data" },
    { type: "toggle", key: "includeTrainings", label: "Includi gli allenamenti", group: "data", help: "Mostra solo giorno, ora, luogo e squadra: nessun nome di atleta." },
    { type: "number", key: "limit", label: "Quanti", min: 1, max: 50, group: "data" },
    { type: "segmented", key: "layout", label: "Forma", group: "display", options: [
      { value: "list", label: "Elenco" },
      { value: "cards", label: "Riquadri" },
    ] },
    { type: "text", key: "emptyMessage", label: "Messaggio se vuoto", max: 200 },
  ],
  style: LIST_STYLE,
  datasource: {
    key: "EVENTS",
    config: (p) => ({ teamId: p.teamId, kinds: p.includeTrainings ? ["match", "training"] : ["match"], limit: p.limit }),
  },
});

export const eventDetailBlock = defineBlock({
  type: "event-detail",
  category: "match",
  label: "Dettaglio evento",
  description: "La scheda di un evento del calendario: data, ora, luogo, squadra.",
  icon: "calendar-check",
  version: 1,
  schema: z.object({ eventId: ref(true, "context"), showMap: bool(false) }),
  defaults: { eventId: "context", showMap: false },
  controls: [{ type: "toggle", key: "showMap", label: "Mappa del luogo", group: "display" }],
  style: LIST_STYLE,
  datasource: { key: "EVENT_DETAIL", config: (p) => ({ eventId: p.eventId }) },
  allowedPageKinds: ["event_detail"],
});

/* --------------------------------------------------------------- squadre */

export const teamListBlock = defineBlock({
  type: "team-list",
  category: "team",
  label: "Le nostre squadre",
  description: "Le squadre della stagione, ognuna con la sua pagina.",
  icon: "shield",
  version: 1,
  schema: z.object({
    title: text(100, "Le nostre squadre"),
    seasonId: ref(false, "active"),
    columns: choice(["2", "3", "4"] as const, "3"),
    layout: choice(["cards", "list"] as const, "cards"),
    showPhoto: bool(true),
    emptyMessage: emptyMessage("Le squadre della stagione arriveranno presto."),
  }),
  defaults: { title: "Le nostre squadre", seasonId: "active", columns: "3", layout: "cards", showPhoto: true, emptyMessage: "Le squadre della stagione arriveranno presto." },
  controls: [
    { type: "text", key: "title", label: "Titolo", max: 100 },
    { type: "season", key: "seasonId", label: "Stagione", group: "data" },
    { type: "segmented", key: "layout", label: "Forma", group: "display", options: [
      { value: "cards", label: "Riquadri" },
      { value: "list", label: "Elenco" },
    ] },
    { type: "segmented", key: "columns", label: "Colonne", group: "display", options: COLUMN_OPTIONS.slice(1), when: { key: "layout", equals: "cards" } },
    { type: "toggle", key: "showPhoto", label: "Foto di squadra", group: "display" },
    { type: "text", key: "emptyMessage", label: "Messaggio se vuoto", max: 200 },
  ],
  style: LIST_STYLE,
  datasource: { key: "TEAMS", config: (p) => ({ seasonId: p.seasonId }) },
  keywords: ["squadre", "categorie"],
});

export const teamHeroBlock = defineBlock({
  type: "team-hero",
  category: "team",
  label: "Copertina squadra",
  description: "Il nome della squadra, la stagione e la foto di squadra.",
  icon: "shield-half",
  version: 1,
  schema: z.object({
    teamId: ref(true, "context"),
    background: media(),
    overlay: int(0, 85, 50),
    showSeason: bool(true),
    showCategory: bool(true),
  }),
  defaults: { teamId: "context", background: null, overlay: 50, showSeason: true, showCategory: true },
  controls: [
    { type: "team", key: "teamId", label: "Squadra", allowContext: true, group: "data" },
    { type: "media", key: "background", label: "Immagine di fondo", help: "Vuota: la foto della squadra." },
    { type: "number", key: "overlay", label: "Oscuramento", min: 0, max: 85, step: 5, unit: "%", group: "display" },
    { type: "toggle", key: "showSeason", label: "Stagione", group: "display" },
    { type: "toggle", key: "showCategory", label: "Categoria", group: "display" },
  ],
  style: { responsive: ["paddingTop", "paddingBottom", "align"], static: ["animation"], defaults: { paddingTop: "lg", paddingBottom: "lg", align: "left" } },
  datasource: { key: "TEAM", config: (p) => ({ teamId: p.teamId }) },
});

export const teamInfoBlock = defineBlock({
  type: "team-info",
  category: "team",
  label: "Scheda squadra",
  description: "Descrizione, categoria, stagione e numero di atleti pubblicati.",
  icon: "info",
  version: 1,
  schema: z.object({ teamId: ref(true, "context"), extraText: text(2000), showCount: bool(true) }),
  defaults: { teamId: "context", extraText: "", showCount: true },
  controls: [
    { type: "team", key: "teamId", label: "Squadra", allowContext: true, group: "data" },
    { type: "textarea", key: "extraText", label: "Testo aggiuntivo", max: 2000, rows: 4 },
    { type: "toggle", key: "showCount", label: "Numero di giocatori", group: "display" },
  ],
  style: LIST_STYLE,
  datasource: { key: "TEAM", config: (p) => ({ teamId: p.teamId }) },
});

const rosterShape = {
  title: text(100, "La rosa"),
  teamId: ref(true, "context"),
  seasonId: ref(false, "active"),
  sort: choice(["number", "name", "role"] as const, "number"),
  limit: int(1, 80, 40),
  columns: choice(["2", "3", "4"] as const, "4"),
  variant: choice(["card", "compact", "overlay"] as const, "card"),
  showPhoto: bool(true),
  showNumber: bool(true),
  showRole: bool(true),
  statKeys: stringList(4, 30),
  emptyMessage: emptyMessage("La rosa sara pubblicata a breve."),
};

const rosterControls = [
  { type: "text", key: "title", label: "Titolo", max: 100 },
  { type: "team", key: "teamId", label: "Squadra", allowContext: true, group: "data" },
  { type: "season", key: "seasonId", label: "Stagione", group: "data" },
  { type: "segmented", key: "sort", label: "Ordine", group: "data", options: [
    { value: "number", label: "Numero" },
    { value: "name", label: "Nome" },
    { value: "role", label: "Ruolo" },
  ] },
  { type: "number", key: "limit", label: "Massimo", min: 1, max: 80, group: "data" },
  { type: "segmented", key: "variant", label: "Scheda", group: "display", options: [
    { value: "card", label: "Card" },
    { value: "compact", label: "Compatta" },
    { value: "overlay", label: "Sovrapposta" },
  ] },
  { type: "segmented", key: "columns", label: "Colonne", group: "display", options: COLUMN_OPTIONS.slice(1) },
  { type: "toggle", key: "showPhoto", label: "Foto", group: "display" },
  { type: "toggle", key: "showNumber", label: "Numero di maglia", group: "display" },
  { type: "toggle", key: "showRole", label: "Ruolo", group: "display" },
  { type: "stat-keys", key: "statKeys", label: "Statistiche", group: "display" },
  { type: "text", key: "emptyMessage", label: "Messaggio se vuota", max: 200 },
] as const;

export const teamRosterBlock = defineBlock({
  type: "team-roster",
  category: "team",
  label: "Rosa della squadra",
  description: "I giocatori pubblicati della squadra, automaticamente dal gestionale.",
  icon: "users",
  version: 1,
  schema: z.object(rosterShape),
  defaults: { title: "La rosa", teamId: "context", seasonId: "active", sort: "number", limit: 40, columns: "4", variant: "card", showPhoto: true, showNumber: true, showRole: true, statKeys: [], emptyMessage: "La rosa sara pubblicata a breve." },
  controls: rosterControls,
  style: LIST_STYLE,
  datasource: { key: "TEAM_ROSTER", config: (p) => ({ teamId: p.teamId, seasonId: p.seasonId, sort: p.sort, limit: p.limit }) },
  keywords: ["roster", "rosa", "giocatori"],
});

export const playerGridBlock = defineBlock({
  type: "player-grid",
  category: "player",
  label: "Griglia giocatori",
  description: "I giocatori pubblicati di una squadra scelta, con foto, numero, ruolo e statistiche.",
  icon: "layout-grid",
  version: 1,
  schema: z.object({ ...rosterShape, teamId: ref(true) }),
  defaults: { title: "I giocatori", teamId: null, seasonId: "active", sort: "number", limit: 40, columns: "4", variant: "card", showPhoto: true, showNumber: true, showRole: true, statKeys: [], emptyMessage: "Nessun giocatore pubblicato." },
  controls: rosterControls,
  style: LIST_STYLE,
  datasource: { key: "TEAM_ROSTER", config: (p) => ({ teamId: p.teamId, seasonId: p.seasonId, sort: p.sort, limit: p.limit }) },
});

export const rosterCarouselBlock = defineBlock({
  type: "roster-carousel",
  category: "player",
  label: "Carosello giocatori",
  description: "La rosa in un carosello scorrevole.",
  icon: "gallery-horizontal-end",
  version: 1,
  schema: z.object({ ...rosterShape, variant: choice(["card", "overlay"] as const, "overlay") }),
  defaults: { title: "La rosa", teamId: "context", seasonId: "active", sort: "number", limit: 24, columns: "4", variant: "overlay", showPhoto: true, showNumber: true, showRole: true, statKeys: [], emptyMessage: "La rosa sara pubblicata a breve." },
  controls: rosterControls.filter((c) => c.key !== "columns"),
  style: LIST_STYLE,
  datasource: { key: "TEAM_ROSTER", config: (p) => ({ teamId: p.teamId, seasonId: p.seasonId, sort: p.sort, limit: p.limit }) },
});

export const teamScheduleBlock = defineBlock({
  type: "team-schedule",
  category: "team",
  label: "Calendario squadra",
  description: "Le prossime gare della squadra.",
  icon: "calendar",
  version: 1,
  schema: z.object({ ...matchListShape, teamId: ref(true, "context") }),
  defaults: { title: "Prossime gare", teamId: "context", competitionId: null, venue: "all", limit: 6, layout: "list", showVenue: true, showCompetition: true, showPeriods: false, emptyMessage: "Nessuna gara in programma." },
  controls: matchListControls(false),
  style: LIST_STYLE,
  datasource: { key: "UPCOMING_MATCHES", config: (p) => ({ teamId: p.teamId, competitionId: p.competitionId, venue: p.venue, limit: p.limit }) },
});

export const teamResultsBlock = defineBlock({
  type: "team-results",
  category: "team",
  label: "Risultati squadra",
  description: "Gli ultimi risultati della squadra.",
  icon: "list-checks",
  version: 1,
  schema: z.object({ ...matchListShape, teamId: ref(true, "context") }),
  defaults: { title: "Ultimi risultati", teamId: "context", competitionId: null, venue: "all", limit: 6, layout: "list", showVenue: false, showCompetition: true, showPeriods: false, emptyMessage: "Nessun risultato ancora registrato." },
  controls: matchListControls(true),
  style: LIST_STYLE,
  datasource: { key: "RECENT_RESULTS", config: (p) => ({ teamId: p.teamId, competitionId: p.competitionId, venue: p.venue, limit: p.limit }) },
});

export const teamStaffBlock = defineBlock({
  type: "team-staff",
  category: "team",
  label: "Staff della squadra",
  description: "Allenatori e staff pubblicati della squadra.",
  icon: "user-cog",
  version: 1,
  schema: z.object({
    title: text(100, "Lo staff"),
    teamId: ref(true, "context"),
    seasonId: ref(false, "active"),
    showPhoto: bool(true),
    columns: choice(["2", "3", "4"] as const, "4"),
    emptyMessage: emptyMessage(""),
  }),
  defaults: { title: "Lo staff", teamId: "context", seasonId: "active", showPhoto: true, columns: "4", emptyMessage: "" },
  controls: [
    { type: "text", key: "title", label: "Titolo", max: 100 },
    { type: "team", key: "teamId", label: "Squadra", allowContext: true, group: "data" },
    { type: "season", key: "seasonId", label: "Stagione", group: "data" },
    { type: "segmented", key: "columns", label: "Colonne", group: "display", options: COLUMN_OPTIONS.slice(1) },
    { type: "toggle", key: "showPhoto", label: "Foto", group: "display" },
    { type: "text", key: "emptyMessage", label: "Messaggio se vuoto", max: 200 },
  ],
  style: LIST_STYLE,
  datasource: { key: "TEAM_STAFF", config: (p) => ({ teamId: p.teamId, seasonId: p.seasonId }) },
});

export const teamStatsBlock = defineBlock({
  type: "team-stats",
  category: "team",
  label: "Numeri della squadra",
  description: "Vinte, perse, punti fatti e subiti: calcolati solo dai risultati definitivi registrati.",
  icon: "bar-chart-3",
  version: 1,
  schema: z.object({
    title: text(100, "La stagione in numeri"),
    teamId: ref(true, "context"),
    seasonId: ref(false, "active"),
    showPoints: bool(true),
    emptyMessage: emptyMessage("Nessun risultato ancora registrato."),
  }),
  defaults: { title: "La stagione in numeri", teamId: "context", seasonId: "active", showPoints: true, emptyMessage: "Nessun risultato ancora registrato." },
  controls: [
    { type: "text", key: "title", label: "Titolo", max: 100 },
    { type: "team", key: "teamId", label: "Squadra", allowContext: true, group: "data" },
    { type: "season", key: "seasonId", label: "Stagione", group: "data" },
    { type: "toggle", key: "showPoints", label: "Punti fatti e subiti", group: "display" },
    { type: "text", key: "emptyMessage", label: "Messaggio se vuoto", max: 200 },
  ],
  style: LIST_STYLE,
  datasource: { key: "TEAM_STATS", config: (p) => ({ teamId: p.teamId, seasonId: p.seasonId }) },
  keywords: ["statistiche", "stagione"],
});

/* -------------------------------------------------------------- giocatori */

export const playerCardBlock = defineBlock({
  type: "player-card",
  category: "player",
  label: "Scheda giocatore",
  description: "Un giocatore pubblicato: foto, nome, numero, ruolo, squadra, statistiche.",
  icon: "id-card",
  version: 1,
  schema: z.object({
    personId: ref(true, "context"),
    variant: choice(["compact", "card", "large", "overlay"] as const, "card"),
    showPhoto: bool(true),
    showNumber: bool(true),
    showRole: bool(true),
    showTeam: bool(true),
    showHeight: bool(true),
    showBirthYear: bool(true),
    showBio: bool(true),
    statKeys: stringList(6, 30),
  }),
  defaults: { personId: "context", variant: "card", showPhoto: true, showNumber: true, showRole: true, showTeam: true, showHeight: true, showBirthYear: true, showBio: true, statKeys: [] },
  controls: [
    { type: "person", key: "personId", label: "Giocatore", personKind: "athlete", allowContext: true, group: "data" },
    { type: "segmented", key: "variant", label: "Forma", group: "display", options: [
      { value: "compact", label: "Compatta" },
      { value: "card", label: "Card" },
      { value: "large", label: "Grande" },
      { value: "overlay", label: "Sovrapposta" },
    ] },
    { type: "toggle", key: "showPhoto", label: "Foto", group: "display" },
    { type: "toggle", key: "showNumber", label: "Numero", group: "display" },
    { type: "toggle", key: "showRole", label: "Ruolo", group: "display" },
    { type: "toggle", key: "showTeam", label: "Squadra", group: "display" },
    { type: "toggle", key: "showHeight", label: "Altezza", group: "display" },
    { type: "toggle", key: "showBirthYear", label: "Anno di nascita", group: "display", help: "Mai per i minori, qualunque cosa dica questa casella." },
    { type: "toggle", key: "showBio", label: "Biografia", group: "display" },
    { type: "stat-keys", key: "statKeys", label: "Statistiche", group: "display" },
  ],
  style: LIST_STYLE,
  datasource: { key: "PLAYER", config: (p) => ({ personId: p.personId }) },
  keywords: ["giocatore", "atleta", "player"],
});

export const playerSpotlightBlock = defineBlock({
  type: "player-spotlight",
  category: "player",
  label: "Giocatore in evidenza",
  description: "Un giocatore in primo piano con foto grande, testo e statistiche.",
  icon: "sparkles",
  version: 1,
  schema: z.object({
    eyebrow: text(60, "Giocatore in evidenza"),
    personId: ref(true),
    text: text(800),
    imageSide: choice(["left", "right"] as const, "left"),
    statKeys: stringList(4, 30),
    cta: ctaShape(),
  }),
  defaults: { eyebrow: "Giocatore in evidenza", personId: null, text: "", imageSide: "left", statKeys: [], cta: { label: "", link: { kind: "none" } } },
  controls: [
    { type: "text", key: "eyebrow", label: "Occhiello", max: 60 },
    { type: "person", key: "personId", label: "Giocatore", personKind: "athlete", allowContext: true, group: "data" },
    { type: "textarea", key: "text", label: "Testo", max: 800, rows: 4 },
    { type: "segmented", key: "imageSide", label: "Foto", group: "display", options: [
      { value: "left", label: "A sinistra" },
      { value: "right", label: "A destra" },
    ] },
    { type: "stat-keys", key: "statKeys", label: "Statistiche", group: "display" },
    { type: "cta", key: "cta", label: "Bottone" },
  ],
  style: LIST_STYLE,
  datasource: { key: "PLAYER", config: (p) => ({ personId: p.personId }) },
});

export const playerStatsBlock = defineBlock({
  type: "player-stats",
  category: "player",
  label: "Statistiche giocatore",
  description: "Le statistiche registrate per un giocatore nella stagione.",
  icon: "chart-column",
  version: 1,
  schema: z.object({
    title: text(100, "Statistiche"),
    personId: ref(true, "context"),
    seasonId: ref(false, "active"),
    statKeys: stringList(8, 30),
    emptyMessage: emptyMessage("Nessuna statistica registrata."),
  }),
  defaults: { title: "Statistiche", personId: "context", seasonId: "active", statKeys: [], emptyMessage: "Nessuna statistica registrata." },
  controls: [
    { type: "text", key: "title", label: "Titolo", max: 100 },
    { type: "person", key: "personId", label: "Giocatore", personKind: "athlete", allowContext: true, group: "data" },
    { type: "season", key: "seasonId", label: "Stagione", group: "data" },
    { type: "stat-keys", key: "statKeys", label: "Statistiche", group: "display" },
    { type: "text", key: "emptyMessage", label: "Messaggio se vuoto", max: 200 },
  ],
  style: LIST_STYLE,
  datasource: { key: "PLAYER_STATS", config: (p) => ({ personId: p.personId, seasonId: p.seasonId }) },
});

export const staffBlock = defineBlock({
  type: "staff",
  category: "player",
  label: "Staff e dirigenti",
  description: "Allenatori, dirigenti e staff pubblicati.",
  icon: "briefcase",
  version: 1,
  schema: z.object({
    title: text(100, "Staff e dirigenza"),
    teamId: ref(true),
    kind: choice(["all", "trainer", "staff"] as const, "all"),
    columns: choice(["2", "3", "4"] as const, "4"),
    layout: choice(["cards", "list"] as const, "cards"),
    showPhoto: bool(true),
    showRole: bool(true),
    emptyMessage: emptyMessage(""),
  }),
  defaults: { title: "Staff e dirigenza", teamId: null, kind: "all", columns: "4", layout: "cards", showPhoto: true, showRole: true, emptyMessage: "" },
  controls: [
    { type: "text", key: "title", label: "Titolo", max: 100 },
    { type: "team", key: "teamId", label: "Squadra", allowContext: true, allowAll: true, group: "data" },
    { type: "segmented", key: "kind", label: "Chi", group: "data", options: [
      { value: "all", label: "Tutti" },
      { value: "trainer", label: "Allenatori" },
      { value: "staff", label: "Staff e dirigenti" },
    ] },
    { type: "segmented", key: "layout", label: "Forma", group: "display", options: [
      { value: "cards", label: "Riquadri" },
      { value: "list", label: "Elenco" },
    ] },
    { type: "segmented", key: "columns", label: "Colonne", group: "display", options: COLUMN_OPTIONS.slice(1), when: { key: "layout", equals: "cards" } },
    { type: "toggle", key: "showPhoto", label: "Foto", group: "display" },
    { type: "toggle", key: "showRole", label: "Ruolo", group: "display" },
    { type: "text", key: "emptyMessage", label: "Messaggio se vuoto", max: 200 },
  ],
  style: LIST_STYLE,
  datasource: { key: "STAFF", config: (p) => ({ teamId: p.teamId, kind: p.kind }) },
  keywords: ["allenatori", "dirigenti", "organigramma"],
});

export const SPORTS_BLOCKS = [
  nextMatchBlock,
  matchHeroBlock,
  matchListBlock,
  upcomingMatchesBlock,
  recentResultsBlock,
  lastMatchBlock,
  matchDetailBlock,
  standingsBlock,
  eventsListBlock,
  eventDetailBlock,
  teamListBlock,
  teamHeroBlock,
  teamInfoBlock,
  teamRosterBlock,
  teamScheduleBlock,
  teamResultsBlock,
  teamStaffBlock,
  teamStatsBlock,
  playerCardBlock,
  playerGridBlock,
  playerSpotlightBlock,
  playerStatsBlock,
  rosterCarouselBlock,
  staffBlock,
] as const;
