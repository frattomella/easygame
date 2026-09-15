import {
  DEFAULT_TRAINER_DASHBOARD_PERMISSIONS,
  type TrainerActionPermissionKey,
  type TrainerDashboardPermissions,
  type TrainerNavigationPermissionKey,
  type TrainerWidgetPermissionKey,
} from "@/lib/trainer-dashboard-permissions";

/**
 * Il modello puro della pagina «Permessi allenatore» (Web V2, Wave E): le tre
 * liste di leve con etichetta e descrizione, i tre preset e le funzioni di
 * confronto. Le chiavi e i default vivono in
 * `src/lib/trainer-dashboard-permissions.ts`; qui c'e solo cio che la
 * schermata dice di ognuna.
 */
export type PermissionOption<K extends string> = { key: K; label: string; description: string };

export const NAV_OPTIONS: Array<PermissionOption<TrainerNavigationPermissionKey>> = [
  {
    key: "home",
    label: "Home dashboard",
    description: "Pagina iniziale trainer con panoramica, sintesi e scorciatoie.",
  },
  {
    key: "trainings",
    label: "Pagina allenamenti",
    description: "Mostra la sezione dedicata agli allenamenti delle categorie assegnate.",
  },
  {
    key: "matches",
    label: "Pagina gare",
    description: "Mostra il calendario gare filtrato sul trainer.",
  },
  {
    key: "athletes",
    label: "Pagina atleti",
    description: "Mostra il roster degli atleti appartenenti alle categorie collegate.",
  },
  {
    key: "categories",
    label: "Pagina categorie",
    description: "Mostra l’overview delle categorie assegnate al trainer.",
  },
  /*
    **Le quattro leve nascoste** (Wave 6).

    `board`, `documents`, `appointments` e `compensation` esistono in
    `trainer-dashboard-permissions.ts`, la barra laterale ci appende la voce di
    menu e la schermata corrispondente risponde con `SectionBlockedState`
    quando valgono `false`: hanno quindi **effetto reale**, ed erano governabili
    solo scrivendo a mano `settings.trainerDashboardPermissions`. Una leva che
    agisce e che il club non puo muovere e una leva nascosta, cioe l'esatto
    contrario di cio che questa pagina promette.

    `notifications` era la quinta, e non era esponibile: la sua schermata si
    difendeva con `permissions.navigation.home` invece che con la propria
    chiave. La schermata adesso legge la propria chiave, e la leva e intera.
  */
  {
    key: "board",
    label: "Pagina bacheca",
    description: "Mostra gli avvisi del club e le note della segreteria indirizzati al trainer.",
  },
  {
    key: "appointments",
    label: "Pagina appuntamenti",
    description: "Mostra gli appuntamenti assegnati al trainer e le azioni per confermarli o riprogrammarli.",
  },
  {
    key: "documents",
    label: "Pagina documenti",
    description: "Mostra i documenti del trainer e le scadenze dei certificati del suo gruppo.",
  },
  {
    key: "compensation",
    label: "Pagina «I miei compensi»",
    description: "Mostra al trainer il proprio rapporto, il piano concordato e le rate. Solo i suoi.",
  },
  {
    key: "notifications",
    label: "Pagina notifiche",
    description: "Mostra al trainer gli avvisi operativi: presenze da registrare e convocazioni da chiudere.",
  },
];

export const WIDGET_OPTIONS: Array<PermissionOption<TrainerWidgetPermissionKey>> = [
  {
    key: "summary",
    label: "Card riepilogo",
    description: "Attiva i numeri rapidi su categorie, atleti, allenamenti e gare.",
  },
  {
    key: "upcomingTrainings",
    label: "Prossimi allenamenti",
    description: "Mostra il blocco con i prossimi allenamenti nella home trainer.",
  },
  {
    key: "upcomingMatches",
    label: "Prossime gare",
    description: "Mostra il blocco con le prossime gare nella home trainer.",
  },
  {
    key: "assignedAthletes",
    label: "Roster in evidenza",
    description: "Mostra un’anteprima degli atleti assegnati nella home trainer.",
  },
  {
    key: "assignedCategories",
    label: "Categorie in evidenza",
    description: "Mostra nella home l’elenco delle categorie collegate al trainer.",
  },
];

export const ACTION_OPTIONS: Array<PermissionOption<TrainerActionPermissionKey>> = [
  {
    key: "viewTrainingDetails",
    label: "Dettagli allenamento",
    description: "Consente di vedere luogo, categoria e metadati completi degli allenamenti.",
  },
  {
    key: "manageAttendance",
    label: "Gestione presenze",
    description: "Abilita le funzioni operative relative alle presenze allenamento.",
  },
  {
    /*
      **La chiave non cambia nome, l'etichetta si** (PP-03 §11).

      `manageTrainingStatus` governava annullamento e ripristino; adesso ne
      governa quattro verbi. Il **nome della chiave** resta quello perche vive
      dentro `clubs.settings.trainerDashboardPermissions`: rinominarlo
      azzererebbe la scelta gia fatta da ogni club che l'ha spenta.
    */
    key: "manageTrainingStatus",
    label: "Calendario di allenamenti e gare",
    description:
      "Consente di creare, spostare, annullare e ripristinare gli eventi delle squadre assegnate. Il perimetro resta quello del ruolo: su una categoria non assegnata il server rifiuta comunque.",
  },
  {
    key: "viewMatchDetails",
    label: "Dettagli gara",
    description: "Consente di vedere luogo, avversario e dettagli completi delle gare.",
  },
  {
    key: "manageConvocations",
    label: "Gestione convocazioni",
    description: "Abilita le funzioni operative relative a convocazioni e gestione gara.",
  },
  {
    key: "viewAthleteDetails",
    label: "Scheda atleta estesa",
    description: "Mostra dati anagrafici e informazioni base nella pagina atleti trainer.",
  },
  {
    key: "viewAthleteTechnicalSheet",
    label: "Scheda tecnica atleta",
    description: "Abilita l’apertura della scheda completa dell’atleta dalla dashboard trainer.",
  },
  {
    key: "viewAthleteContacts",
    label: "Contatti atleta",
    description: "Mostra recapiti e contatti disponibili del roster collegato.",
  },
  {
    key: "viewMedicalStatus",
    label: "Stato medico",
    description: "Mostra la scadenza del certificato e gli indicatori sanitari sintetici.",
  },
  {
    key: "viewEnrollmentAndPayments",
    label: "Iscrizione e pagamenti",
    description: "Mostra nella scheda atleta le sezioni relative a iscrizione, piano e pagamenti.",
  },
];

export type PermissionGroupId = keyof TrainerDashboardPermissions;

export const PERMISSION_GROUPS: Array<{ id: PermissionGroupId; title: string; description: string; options: ReadonlyArray<PermissionOption<string>> }> = [
  { id: "navigation", title: "Navigazione", description: "Le pagine dell'area allenatore che compaiono nel menu.", options: NAV_OPTIONS },
  { id: "widgets", title: "Widget della home", description: "I blocchi che la home dell'allenatore mostra.", options: WIDGET_OPTIONS },
  { id: "actions", title: "Azioni e dati", description: "Cosa l'allenatore può fare e quali dati vede sulle proprie squadre.", options: ACTION_OPTIONS },
];

/* ── Preset ─────────────────────────────────────────────────────────────── */

export const READ_ONLY_PRESET: TrainerDashboardPermissions = {
  navigation: { ...DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.navigation },
  widgets: { ...DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.widgets },
  actions: {
    viewTrainingDetails: true,
    manageAttendance: false,
    manageTrainingStatus: false,
    viewMatchDetails: true,
    manageConvocations: false,
    viewAthleteDetails: true,
    viewAthleteTechnicalSheet: true,
    viewAthleteContacts: false,
    viewMedicalStatus: false,
    viewEnrollmentAndPayments: false,
  },
};

export const CONTROLLED_PRESET: TrainerDashboardPermissions = {
  navigation: { ...DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.navigation },
  widgets: { ...DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.widgets },
  actions: {
    viewTrainingDetails: true,
    manageAttendance: true,
    manageTrainingStatus: true,
    viewMatchDetails: true,
    manageConvocations: true,
    viewAthleteDetails: true,
    viewAthleteTechnicalSheet: true,
    viewAthleteContacts: false,
    viewMedicalStatus: true,
    viewEnrollmentAndPayments: false,
  },
};

export const FULL_PRESET: TrainerDashboardPermissions = {
  navigation: { ...DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.navigation },
  widgets: { ...DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.widgets },
  actions: { ...DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.actions },
};

export const PRESETS: Array<{ id: string; label: string; description: string; value: TrainerDashboardPermissions }> = [
  { id: "read-only", label: "Sola consultazione", description: "Vede allenamenti, gare e schede: non registra presenze né convoca.", value: READ_ONLY_PRESET },
  { id: "controlled", label: "Operatività controllata", description: "Presenze, calendario e convocazioni; niente contatti né pagamenti.", value: CONTROLLED_PRESET },
  { id: "full", label: "Accesso completo", description: "Tutte le leve accese, come il default del club.", value: FULL_PRESET },
];

/** Una copia indipendente, cosi un preset applicato non resta legato all'oggetto costante. */
export const clonePermissions = (source: TrainerDashboardPermissions): TrainerDashboardPermissions => ({
  navigation: { ...source.navigation },
  widgets: { ...source.widgets },
  actions: { ...source.actions },
});

export const permissionsEqual = (a: TrainerDashboardPermissions, b: TrainerDashboardPermissions): boolean =>
  (["navigation", "widgets", "actions"] as const).every((group) => {
    const left = a[group] as Record<string, boolean>;
    const right = b[group] as Record<string, boolean>;
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return Array.from(keys).every((key) => Boolean(left[key]) === Boolean(right[key]));
  });

export const countEnabled = (group: Record<string, boolean>): number => Object.values(group).filter(Boolean).length;

export const setPermission = (current: TrainerDashboardPermissions, group: PermissionGroupId, key: string, checked: boolean): TrainerDashboardPermissions => ({
  ...current,
  [group]: { ...current[group], [key]: checked },
});

/** Il preset che coincide con lo stato corrente, se uno coincide (per dirlo a parole nell'intestazione). */
export const matchingPreset = (current: TrainerDashboardPermissions) => PRESETS.find((preset) => permissionsEqual(preset.value, current)) || null;
