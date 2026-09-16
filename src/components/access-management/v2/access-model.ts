import { getAccessRoleLabel, normalizeAccessRole } from "@/lib/access-roles";
import type { PermissionDomain, PermissionEntry } from "@/lib/permissions/catalog";
import type { AccessScopeEntry } from "@/lib/roles/access-scope";
import { PERSON_STATUS, type StatusSpec } from "@/lib/web/status";

/**
 * Il modello puro della pagina «Ruoli e accessi» (Web V2, Wave E).
 *
 * Contiene i tipi che la rotta `GET /api/v1/club-roles/assignments` restituisce,
 * le costanti di testo che la V1 teneva dentro `page.tsx` (etichette dei
 * domini, perimetro del ruolo base, i due modelli del §24) e le funzioni di
 * lettura che la griglia e i cassetti condividono. Nessuna regola di ruolo
 * vive qui: le regole stanno in `src/lib/access-roles.ts` e
 * `src/lib/roles/*`, e questo file le **legge** soltanto.
 */

export type RuoloDiClub = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  base_role: string;
  base_role_label: string;
  is_active: boolean;
  permissions: string[];
  permission_labels: { key: string; label: string }[];
  contains_direction_keys: boolean;
  assigned_count: number;
};

export type Assegnazione = {
  membership_id: string;
  user_id: string;
  email: string;
  name: string;
  role: string;
  role_label: string;
  is_owner: boolean;
  is_primary?: boolean;
  custom_role_id: string | null;
  custom_role_name: string | null;
  permissions: string[];
  scopes: AccessScopeEntry[];
  granted_at?: string | null;
};

export type OpzioniPerimetro = {
  site: { id: string; label: string }[];
  category: { id: string; label: string }[];
};

export type LetturaAccessi = {
  assignments: Assegnazione[];
  roles: RuoloDiClub[];
  scope_options: OpzioniPerimetro;
};

export type Bozza = {
  id: string | null;
  name: string;
  description: string;
  baseRole: string;
  permissions: string[];
};

export const BOZZA_VUOTA: Bozza = {
  id: null,
  name: "",
  description: "",
  baseRole: "collaborator",
  permissions: [],
};

export const ETICHETTE_DOMINIO: Record<PermissionDomain, string> = {
  accounting: "Contabilità",
  accounts: "Accessi delle persone",
  appointments: "Appuntamenti",
  audit: "Registro delle operazioni",
  communications: "Comunicazioni",
  consents: "Consensi",
  data_subject: "Dati personali di una persona",
  documents: "Documenti e modelli",
  events: "Allenamenti e gare",
  forms: "Moduli online",
  funding: "Contributi e voucher",
  health: "Dato sanitario",
  members: "Libro soci",
  seasons: "Stagioni sportive",
  sport_work: "Lavoro sportivo",
  training_automation: "Generazione allenamenti",
  trials: "Persone in prova",
};

/**
 * **Cosa il ruolo base porta oltre le caselle, detto per intero.**
 *
 * Le caselle governano le chiavi del catalogo. Tutto cio che passa da
 * `normalizeAccessRole` — la matrice per risorsa, i percorsi riservati alla
 * direzione, la configurazione societaria — risponde invece al **ruolo base**:
 * l'invariante «mai piu del ruolo base» regge, ma per una base ampia come
 * `club_manager` la personalizzazione tocca una parte sola del potere.
 * Questo testo esiste perche chi crea un ruolo lo sappia **prima**, e va
 * tenuto vero.
 */
export const PERIMETRO_DEL_RUOLO_BASE: Record<string, string> = {
  club_manager:
    "Tutte le risorse del club, comprese quelle riservate: conti correnti, metodi di pagamento, anagrafica societaria, lavoro sportivo. E i percorsi riservati alla direzione: configurazione, stagioni, comunicazioni, onboarding. Non si tolgono con una casella: per restringere davvero, parti da un ruolo base più stretto.",
  collaborator:
    "Atleti, categorie, iscrizioni, pagamenti, magazzino e anagrafiche. Restano fuori conti correnti, metodi di pagamento, anagrafica societaria e lavoro sportivo; la cancellazione di rate e documenti fiscali è riservata alla direzione.",
  staff:
    "Come il collaboratore: atleti, categorie, iscrizioni, pagamenti, magazzino e anagrafiche, senza le risorse riservate alla direzione.",
  trainer:
    "Sola lettura sulle anagrafiche della propria squadra; in scrittura solo appello, allenamenti e notifiche. Il perimetro sui gruppi operativi resta quello dell'allenatore.",
};

export const perimetroDelRuoloBase = (baseRole: string | null | undefined): string =>
  PERIMETRO_DEL_RUOLO_BASE[normalizeAccessRole(baseRole) || "collaborator"] || "—";

/**
 * I due ruoli che il mandato chiede per nome (§24), come **punto di partenza**
 * e non come riga di codice cablata: si aprono nell'editor, si cambiano, e
 * quello che viene salvato e una riga di `club_roles` come tutte le altre.
 *
 * «Segreteria» non porta `sport_work.read_own` — i compensi restano fuori — ne
 * nessuna chiave di configurazione contabile, che non esiste come chiave e
 * resta quindi governata dal ruolo base. «Direttore Sportivo» non porta niente
 * di documentale ne di economico.
 */
export const PRESET: { titolo: string; descrizione: string; bozza: Bozza }[] = [
  {
    titolo: "Segreteria",
    descrizione: "Atleti, documenti, iscrizioni, appuntamenti e consensi. Niente compensi, niente proprietà.",
    bozza: {
      id: null,
      name: "Segreteria",
      description: "Anagrafiche, fascicolo documentale, appuntamenti e consensi delle famiglie.",
      baseRole: "collaborator",
      permissions: [
        "documents.templates.read",
        "documents.generate",
        "documents.generated.read",
        "documents.generated.advance",
        "documents.request",
        "documents.review",
        "documents.read_dossier",
        "appointments.read",
        "appointments.read_own",
        "appointments.manage",
        "consents.decide_for_others",
        "consents.records.read",
        "members.register.read",
        "clinical.status_read",
        "accounts.athlete.manage",
      ],
    },
  },
  {
    titolo: "Direttore Sportivo",
    descrizione: "Atleti, allenatori, eventi, gare e programmazione. Niente pagamenti, niente contabilità.",
    bozza: {
      id: null,
      name: "Direttore Sportivo",
      description: "Programmazione sportiva: calendario, convocazioni, appello e risposte delle famiglie.",
      baseRole: "staff",
      permissions: [
        "events.read",
        "events.manage",
        "events.convoke",
        "events.attendance",
        "rsvp.read",
        "clinical.status_read",
        "appointments.read_own",
      ],
    },
  },
];

/** I quattro ruoli standard che si possono assegnare da questa schermata (come in V1). */
export const RUOLI_STANDARD_ASSEGNABILI = ["club_manager", "collaborator", "staff", "trainer"] as const;

export const bozzaDaRuolo = (ruolo: RuoloDiClub): Bozza => ({
  id: ruolo.id,
  name: ruolo.name,
  description: ruolo.description || "",
  baseRole: ruolo.base_role,
  permissions: [...ruolo.permissions],
});

/** Raggruppa le chiavi concedibili per dominio, nell'ordine in cui il catalogo le elenca. */
export const raggruppaPerDominio = (voci: readonly PermissionEntry[]): Array<[PermissionDomain, PermissionEntry[]]> => {
  const gruppi = new Map<PermissionDomain, PermissionEntry[]>();
  for (const voce of voci) {
    const elenco = gruppi.get(voce.domain) || [];
    gruppi.set(voce.domain, [...elenco, voce]);
  }
  return Array.from(gruppi.entries());
};

export type ErroreBozza = { id: string; label: string };

/**
 * La sola regola client della bozza: il nome. Tutto il resto — base ammessa,
 * chiavi dentro la base, unicità del nome — lo decide il server
 * (`validateCustomRoleDraft`), e il suo messaggio arriva in un toast come in V1.
 */
export const validaBozza = (bozza: Bozza, idPrefix: string): ErroreBozza[] =>
  bozza.name.trim() ? [] : [{ id: `${idPrefix}-name`, label: "Nome del ruolo" }];

export const corpoBozza = (bozza: Bozza) => ({
  name: bozza.name,
  description: bozza.description,
  base_role: bozza.baseRole,
  permissions: bozza.permissions,
});

/** Lo stato di un ruolo di club: la parola del sistema, non un badge rosso. */
export const statoRuolo = (ruolo: Pick<RuoloDiClub, "is_active">): StatusSpec =>
  ruolo.is_active ? PERSON_STATUS.active : PERSON_STATUS.inactive;

export const nomeAssegnazione = (persona: Pick<Assegnazione, "name" | "email">): string => persona.name || persona.email;

export const etichettaVoceDiPerimetro = (voce: AccessScopeEntry, opzioni: OpzioniPerimetro): string => {
  const elenco = voce.kind === "site" ? opzioni.site : opzioni.category;
  const label = elenco.find((candidata) => candidata.id === voce.value)?.label || voce.value;
  return `${voce.kind === "site" ? "Sede" : "Categoria"}: ${label}`;
};

/** «Tutto il club» quando il perimetro e vuoto: zero righe non sono zero accessi (ADR-0103). */
export const etichettePerimetro = (persona: Pick<Assegnazione, "scopes">, opzioni: OpzioniPerimetro): string[] =>
  persona.scopes.length ? persona.scopes.map((voce) => etichettaVoceDiPerimetro(voce, opzioni)) : ["Tutto il club"];

export const perimetroRistretto = (persona: Pick<Assegnazione, "scopes">): boolean => persona.scopes.length > 0;

/** Il valore da mandare al server e l'etichetta da mostrare per un ruolo assegnabile. */
export const opzioniRuoloAssegnabile = (ruoli: readonly RuoloDiClub[]) => [
  ...RUOLI_STANDARD_ASSEGNABILI.map((canonico) => ({ value: canonico, label: getAccessRoleLabel(canonico), description: "Ruolo standard" })),
  ...ruoli.filter((voce) => voce.is_active).map((voce) => ({ value: voce.slug, label: voce.name, description: `Ruolo del club · da ${voce.base_role_label}` })),
];

export const commutaVoceDiPerimetro = (scopes: readonly AccessScopeEntry[], kind: AccessScopeEntry["kind"], value: string): AccessScopeEntry[] =>
  scopes.some((voce) => voce.kind === kind && voce.value === value)
    ? scopes.filter((voce) => !(voce.kind === kind && voce.value === value))
    : [...scopes, { kind, value }];

/** Le voci di un asse del perimetro, come elenco di identificativi (per il `MultiSelect`). */
export const valoriDiAsse = (scopes: readonly AccessScopeEntry[], kind: AccessScopeEntry["kind"]): string[] =>
  scopes.filter((voce) => voce.kind === kind).map((voce) => voce.value);

/** Sostituisce un asse intero del perimetro con i valori scelti, lasciando l'altro com'e. */
export const sostituisciAsse = (scopes: readonly AccessScopeEntry[], kind: AccessScopeEntry["kind"], values: readonly string[]): AccessScopeEntry[] => [
  ...scopes.filter((voce) => voce.kind !== kind),
  ...values.map((value) => ({ kind, value })),
];
