/**
 * Il catalogo dei trigger: **chiuso, e in codice**.
 *
 * ## Perche il club sceglie e non scrive
 *
 * Un motore che permette di comporre condizioni e azioni sposta la
 * responsabilita di un messaggio sbagliato dal prodotto al club, e non la
 * toglie a nessuno: e il prodotto che manda l'email (§17.6 del planning di
 * Wave 2). Qui il club sceglie **quale** regola accendere, **quando** parte,
 * **a chi** e **con quali parole**. Il fatto su cui si innesca lo decide il
 * prodotto, e per aggiungerne uno serve una riga in questo file — cioe una
 * decisione, non una configurazione.
 *
 * ## Quattro, e non trentaquattro
 *
 * Golee ne ha trentaquattro cablate. Trentaquattro regole in codice sono
 * trentaquattro posti dove cambiare una parola richiede un rilascio, e per una
 * segreteria sono trentaquattro interruttori da capire prima di poterne usare
 * due. Le quattro di V1 sono quelle che una segreteria italiana controlla
 * davvero, e le altre si aprono **per domanda**.
 *
 * Cosa resta deliberatamente fuori, e perche (§4.3 del planning):
 *
 * - **contratto in scadenza** e **adempimento** del lavoro sportivo sono gia
 *   risolti da `sport-work-scheduler.ts` a 7 e 14 giorni: riscriverli qui
 *   sarebbe un refactor con zero guadagno per l'utente su un dominio che tocca
 *   denaro in uscita;
 * - **voucher e presenze** sono *request-driven* per scelta motivata: un giro
 *   notturno che li ricalcolasse toccherebbe periodi gia liquidati.
 *
 * Modulo **puro**: nessun Prisma, nessuna rete, nessun DOM.
 */

import type { DefaultMessageTemplateKey } from "@/lib/messages/defaults";

/**
 * I fatti su cui una regola si puo innescare.
 *
 * Il quinto — `document_expiry` — e arrivato con la Wave 3 e non contraddice
 * il «quattro e non trentaquattro» qui sopra: e stato aperto **per domanda**,
 * che e esattamente il modo dichiarato. Ed e l'unico innesco possibile su una
 * scadenza documentale, perche fino a Wave 3 non esisteva niente su cui
 * innescarsi: `attachments` non aveva ne `valid_from` ne `valid_until`.
 */
export const AUTOMATION_TRIGGER_KINDS = [
  "installment_due",
  "installment_overdue",
  "certificate",
  "event_rsvp",
  "document_expiry",
] as const;

export type AutomationTriggerKind = (typeof AUTOMATION_TRIGGER_KINDS)[number];

/**
 * Da che parte della data si contano gli anticipi.
 *
 * Non e un dettaglio di presentazione: «7 giorni» davanti a una scadenza e
 * **prima**, dietro a una rata insoluta e **dopo**, e il segno sbagliato manda
 * un sollecito a chi ha ancora una settimana di tempo.
 */
export type AutomationOffsetDirection = "before" | "after";

/** Chi legge il messaggio. */
export const AUTOMATION_AUDIENCES = ["family", "club", "both"] as const;
export type AutomationAudience = (typeof AUTOMATION_AUDIENCES)[number];

export const AUTOMATION_AUDIENCE_LABELS: Record<AutomationAudience, string> = {
  family: "Alla famiglia",
  club: "Alla societa",
  both: "Alla famiglia e alla societa",
};

/**
 * Come arriva cio che e destinato **alla societa** (G-58).
 *
 * `digest` non riguarda mai la famiglia: una famiglia riceve il messaggio che
 * la riguarda, non un elenco delle scadenze del club. Vale per il pubblico
 * «societa», ed e il rimedio a trenta email al giorno che nessuno legge.
 */
export const AUTOMATION_DELIVERIES = ["immediate", "digest"] as const;
export type AutomationDelivery = (typeof AUTOMATION_DELIVERIES)[number];

export const AUTOMATION_DELIVERY_LABELS: Record<AutomationDelivery, string> = {
  immediate: "Notifica singola",
  digest: "Riepilogo giornaliero alla societa",
};

export type AutomationTriggerDefinition = {
  kind: AutomationTriggerKind;
  /** L'identificativo del planning: compare nell'audit e nella chiave. */
  id: string;
  label: string;
  /** Cosa si innesca, detto a chi configura la regola. */
  description: string;
  /** Come si legge un anticipo: «7 giorni prima» oppure «7 giorni dopo». */
  direction: AutomationOffsetDirection;
  /** Gli anticipi predefiniti del §4.1 del planning. */
  defaultOffsetDays: number[];
  defaultAudience: AutomationAudience;
  /** Il modello predefinito, dal catalogo condiviso di W2-F. */
  templateKey: DefaultMessageTemplateKey;
  /**
   * Se il messaggio puo portare importi.
   *
   * Un'automazione parla di **una** posizione — una rata di un atleta — quindi
   * il residuo che scrive e vero. E la differenza con la comunicazione
   * massiva, dove lo stesso messaggio rappresenta due figli e un importo solo
   * sarebbe falso per almeno uno dei due.
   */
  allowEconomic: boolean;
  /**
   * Se la regola si restringe a certe **categorie di documento**.
   *
   * Lo dichiara il trigger e non la schermata: «avvisami per i BLSD» e
   * «avvisami per i documenti d'identita» sono due domande diverse, ma «rata in
   * scadenza» non ha categorie e un campo vuoto accanto le suggerirebbe che
   * esistano. Assente vale `false`.
   */
  supportsCategoryFilter?: boolean;
};

/** Al piu tre anticipi per regola (G-04). */
export const MAX_AUTOMATION_OFFSETS = 3;

/**
 * Il massimo anticipo accettato, in giorni.
 *
 * Un anno di preavviso non e una configurazione: e un errore di battitura che
 * costruirebbe una finestra di ricerca inutilmente larga sul giro notturno.
 */
export const MAX_AUTOMATION_OFFSET_DAYS = 120;

/**
 * Quante categorie di documento puo nominare una regola.
 *
 * Non e un limite tecnico: venti categorie in un filtro sono un filtro che non
 * filtra, e chi le ha scritte voleva quasi sempre «tutte» — che si ottiene
 * lasciando il campo vuoto.
 */
export const MAX_AUTOMATION_CATEGORIES = 20;

export const AUTOMATION_TRIGGERS: Readonly<
  Record<AutomationTriggerKind, AutomationTriggerDefinition>
> = {
  installment_due: {
    kind: "installment_due",
    id: "AUT-01",
    label: "Rata in scadenza",
    description:
      "Una rata con un residuo da versare scade fra i giorni indicati.",
    direction: "before",
    defaultOffsetDays: [7, 3],
    defaultAudience: "family",
    templateKey: "installment_due",
    allowEconomic: true,
  },
  installment_overdue: {
    kind: "installment_overdue",
    id: "AUT-02",
    label: "Rata scaduta",
    description:
      "Una rata con un residuo da versare e scaduta da i giorni indicati.",
    direction: "after",
    defaultOffsetDays: [1, 15],
    defaultAudience: "family",
    templateKey: "installment_overdue",
    allowEconomic: true,
  },
  certificate: {
    kind: "certificate",
    id: "AUT-03",
    label: "Certificato medico",
    description:
      "Il certificato medico manca, sta per scadere o e scaduto. Con anticipo 0 il messaggio parte il giorno stesso della scadenza.",
    direction: "before",
    defaultOffsetDays: [30, 7, 0],
    defaultAudience: "both",
    templateKey: "certificate_expiring",
    allowEconomic: false,
  },
  event_rsvp: {
    kind: "event_rsvp",
    id: "AUT-04",
    label: "Richiesta di conferma per l'evento",
    description:
      "Un allenamento che chiede la conferma di partecipazione si avvicina e la famiglia non ha ancora risposto. Le 48 ore del planning sono 2 giorni.",
    direction: "before",
    /* 48 ore = 2 giorni: il giro e notturno, l'unita e il giorno. */
    defaultOffsetDays: [2],
    defaultAudience: "family",
    templateKey: "event_invitation",
    allowEconomic: false,
  },
  document_expiry: {
    kind: "document_expiry",
    id: "AUT-05",
    label: "Documento in scadenza",
    description:
      "Un documento allegato con una scadenza dichiarata sta per scadere. Il certificato medico non passa di qui: lo governa la regola dedicata, e due regole sullo stesso fatto sono due promemoria.",
    direction: "before",
    /* §11.2 del planning di Wave 3: un mese per rinnovare, una settimana per ricordarsene. */
    defaultOffsetDays: [30, 7],
    /*
      **`both` e non `family`**, al contrario delle rate. Un documento scaduto e
      prima di tutto un problema della segreteria — e lei che non puo tesserare
      o convocare — e la famiglia da sola non basta a chiudere il cerchio.
    */
    defaultAudience: "both",
    templateKey: "document_expiring",
    allowEconomic: false,
    supportsCategoryFilter: true,
  },
};

export const AUTOMATION_TRIGGER_LABELS: Record<AutomationTriggerKind, string> =
  Object.fromEntries(
    AUTOMATION_TRIGGER_KINDS.map((kind) => [
      kind,
      AUTOMATION_TRIGGERS[kind].label,
    ]),
  ) as Record<AutomationTriggerKind, string>;

const asText = (value: unknown) => String(value ?? "").trim();

export const isAutomationTriggerKind = (
  value: unknown,
): value is AutomationTriggerKind =>
  (AUTOMATION_TRIGGER_KINDS as readonly string[]).includes(asText(value));

/**
 * La definizione di un trigger, o un errore che dice **quale** nome non
 * esiste.
 *
 * Ignorare un trigger sconosciuto significherebbe salvare una regola che non
 * si innesca mai, e nessuno se ne accorgerebbe finche una famiglia non dice di
 * non aver ricevuto niente.
 */
export const getAutomationTrigger = (
  kind: unknown,
): AutomationTriggerDefinition => {
  if (!isAutomationTriggerKind(kind)) {
    throw new Error(
      `Automazione sconosciuta: ${asText(kind) || "(vuota)"}. I tipi ammessi sono ${AUTOMATION_TRIGGER_KINDS.join(", ")}.`,
    );
  }
  return AUTOMATION_TRIGGERS[kind];
};

/** «7 giorni prima» / «1 giorno dopo» / «il giorno stesso». */
export const describeAutomationOffset = (
  direction: AutomationOffsetDirection,
  days: number,
) => {
  if (days === 0) return "il giorno stesso";
  const unit = days === 1 ? "giorno" : "giorni";
  return `${days} ${unit} ${direction === "before" ? "prima" : "dopo"}`;
};
