/**
 * Una regola di automazione: cosa il club governa, e cosa no.
 *
 * ## Cosa il club decide
 *
 * L'interruttore, **fino a tre anticipi** in giorni (G-04), il pubblico, il
 * testo e come arriva cio che e destinato alla societa. Nient'altro: il fatto
 * su cui la regola si innesca sta nel catalogo chiuso di `catalog.ts`.
 *
 * ## Le tre regole degli anticipi, e perche
 *
 * 1. **Non negativi.** Il verso lo dichiara il trigger (`before` / `after`):
 *    un anticipo negativo su una scadenza significherebbe «dopo», e avere due
 *    modi di dire la stessa cosa vuol dire che un giorno diranno cose diverse.
 * 2. **Senza duplicati.** Due anticipi uguali sono due messaggi identici lo
 *    stesso giorno, e la deduplica del registro ne farebbe passare uno solo:
 *    la configurazione mentirebbe a chi l'ha scritta.
 * 3. **Un anticipo gia trascorso non recupera all'indietro.** La regola scatta
 *    quando la distanza dalla data e **esattamente** l'anticipo, non quando e
 *    minore. Accendere oggi una regola «7 giorni prima» su una rata che scade
 *    fra due giorni non deve produrre il messaggio dei sette giorni: sarebbe un
 *    messaggio in ritardo che dice una cosa falsa.
 *
 *    Il prezzo dichiarato: se il giro notturno **salta un giorno**,
 *    l'occorrenza di quel giorno non si recupera. E il prezzo giusto — il modo
 *    alternativo, cioe far scattare tutto cio che e «gia passato», e
 *    esattamente il comportamento che il punto 3 vieta, e non c'e modo di
 *    distinguere «il cron non ha girato» da «la regola era spenta».
 *
 * Modulo **puro**: nessun Prisma, nessuna rete, nessun DOM. Si prova senza
 * database.
 */

import {
  AUTOMATION_AUDIENCES,
  AUTOMATION_DELIVERIES,
  AUTOMATION_TRIGGER_KINDS,
  MAX_AUTOMATION_OFFSETS,
  MAX_AUTOMATION_OFFSET_DAYS,
  getAutomationTrigger,
  type AutomationAudience,
  type AutomationDelivery,
  type AutomationOffsetDirection,
  type AutomationTriggerKind,
} from "./catalog";
import { DEFAULT_MESSAGE_TEMPLATES } from "@/lib/messages/defaults";
import type { MessageTemplate } from "@/lib/messages/templates";

export type AutomationRule = {
  /**
   * L'identificativo della regola.
   *
   * **E il tipo di trigger**, e non un uuid: in V1 esiste **una** regola per
   * trigger e il club la accende o la spegne. Un identificativo generato
   * renderebbe possibili due regole «rata in scadenza» con anticipi diversi,
   * cioe due messaggi per la stessa scadenza — che e il difetto che la
   * deduplica esiste per impedire, ottenuto dalla configurazione invece che da
   * un errore.
   */
  id: AutomationTriggerKind;
  trigger: AutomationTriggerKind;
  enabled: boolean;
  offsetDays: number[];
  audience: AutomationAudience;
  delivery: AutomationDelivery;
  template: MessageTemplate;
  /** Quando qualcuno l'ha toccata l'ultima volta. `null` se mai. */
  updatedAt: string | null;
};

const asText = (value: unknown) => String(value ?? "").trim();

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

/**
 * L'ordine in cui gli anticipi **scattano**, non l'ordine numerico.
 *
 * Su una scadenza futura parte prima il piu lontano (30, 7, 0); su una rata
 * gia scaduta parte prima il piu vicino (1, 15). Un elenco ordinato per come
 * si legge e un elenco che chi configura riconosce.
 */
const sortOffsets = (values: number[], direction: AutomationOffsetDirection) =>
  [...values].sort((left, right) =>
    direction === "before" ? right - left : left - right,
  );

/**
 * Gli anticipi, validati.
 *
 * Un valore non intero non e un arrotondamento da fare in silenzio: «7,5
 * giorni» su un giro che gira una volta al giorno non ha un significato, e
 * arrotondarlo deciderebbe al posto di chi ha scritto la configurazione.
 */
export const normalizeAutomationOffsets = (
  input: unknown,
  direction: AutomationOffsetDirection,
): number[] => {
  const raw = Array.isArray(input) ? input : [];

  const values: number[] = [];

  for (const entry of raw) {
    const value = Number(entry);

    if (!Number.isInteger(value)) {
      throw new Error(
        `Anticipo non valido: «${asText(entry) || "(vuoto)"}» non e un numero intero di giorni`,
      );
    }
    if (value < 0) {
      throw new Error(
        `Anticipo non valido: ${value}. Il verso lo dichiara l'automazione, i giorni non possono essere negativi`,
      );
    }
    if (value > MAX_AUTOMATION_OFFSET_DAYS) {
      throw new Error(
        `Anticipo troppo grande: ${value} giorni. Il massimo e ${MAX_AUTOMATION_OFFSET_DAYS}`,
      );
    }
    if (values.includes(value)) {
      throw new Error(
        `Anticipo ripetuto: ${value} giorni compare due volte`,
      );
    }

    values.push(value);
  }

  if (values.length === 0) {
    throw new Error("Serve almeno un anticipo: senza, la regola non parte mai");
  }
  if (values.length > MAX_AUTOMATION_OFFSETS) {
    throw new Error(
      `Troppi anticipi: al massimo ${MAX_AUTOMATION_OFFSETS} per automazione`,
    );
  }

  return sortOffsets(values, direction);
};

const normalizeTemplate = (
  input: unknown,
  fallback: MessageTemplate,
): MessageTemplate => {
  const record = asRecord(input);
  const subject = asText(record.subject) || fallback.subject;
  const body = String(record.body ?? "").trim() || fallback.body;

  return { subject, body };
};

/** La regola come nasce il primo giorno, con i valori del §4.1 del planning. */
export const buildDefaultAutomationRule = (
  kind: AutomationTriggerKind,
): AutomationRule => {
  const trigger = getAutomationTrigger(kind);

  return {
    id: kind,
    trigger: kind,
    /*
      **Spenta.** E l'unica funzione del prodotto che manda email a nome di una
      societa senza che nessuno prema un pulsante: accenderla e una decisione
      del club, non un default che si scopre dopo trecento invii.
    */
    enabled: false,
    offsetDays: [...trigger.defaultOffsetDays],
    audience: trigger.defaultAudience,
    delivery: "immediate",
    template: { ...DEFAULT_MESSAGE_TEMPLATES[trigger.templateKey] },
    updatedAt: null,
  };
};

export const buildDefaultAutomationRules = (): AutomationRule[] =>
  AUTOMATION_TRIGGER_KINDS.map((kind) => buildDefaultAutomationRule(kind));

/**
 * Normalizza cio che arriva dalla rete o dall'archivio.
 *
 * Un campo assente **ricade sul valore predefinito**: la configurazione di un
 * club scritta prima che un campo esistesse deve continuare a funzionare, e
 * non deve diventare una regola muta.
 */
export const normalizeAutomationRule = (input: unknown): AutomationRule => {
  const record = asRecord(input);
  const trigger = getAutomationTrigger(record.trigger ?? record.id ?? record.kind);
  const fallback = buildDefaultAutomationRule(trigger.kind);

  const audience = (AUTOMATION_AUDIENCES as readonly string[]).includes(
    asText(record.audience),
  )
    ? (asText(record.audience) as AutomationAudience)
    : fallback.audience;

  const declaredDelivery = (AUTOMATION_DELIVERIES as readonly string[]).includes(
    asText(record.delivery),
  )
    ? (asText(record.delivery) as AutomationDelivery)
    : fallback.delivery;

  return {
    id: trigger.kind,
    trigger: trigger.kind,
    enabled: record.enabled === true,
    offsetDays:
      record.offsetDays === undefined && record.offset_days === undefined
        ? fallback.offsetDays
        : normalizeAutomationOffsets(
            record.offsetDays ?? record.offset_days,
            trigger.direction,
          ),
    audience,
    /*
      Il riepilogo riguarda **solo** il pubblico «societa»: una famiglia riceve
      il messaggio che la riguarda, non l'elenco delle scadenze del club. Una
      regola destinata alla sola famiglia con «riepilogo» selezionato non e un
      errore da rifiutare — e una scelta che non ha effetto — quindi si
      normalizza invece di far fallire il salvataggio.
    */
    delivery: audience === "family" ? "immediate" : declaredDelivery,
    template: normalizeTemplate(record.template, fallback.template),
    updatedAt: asText(record.updatedAt ?? record.updated_at) || null,
  };
};

/**
 * Le quattro regole del club, sempre tutte e quattro.
 *
 * Cio che non e in archivio ricade sul predefinito **spento**: la schermata
 * mostra sempre l'elenco completo, e «non configurata» e «spenta» sono la
 * stessa cosa per chi guarda.
 */
export const normalizeAutomationRules = (input: unknown): AutomationRule[] => {
  const raw = Array.isArray(input) ? input : [];
  const byTrigger = new Map<AutomationTriggerKind, AutomationRule>();

  for (const entry of raw) {
    const rule = normalizeAutomationRule(entry);
    byTrigger.set(rule.trigger, rule);
  }

  return AUTOMATION_TRIGGER_KINDS.map(
    (kind) => byTrigger.get(kind) || buildDefaultAutomationRule(kind),
  );
};

/* ------------------------------------------------------------- le date */

/** Mezzanotte locale: due istanti dello stesso giorno sono lo stesso giorno. */
export const startOfDay = (value: Date) => {
  const copy = new Date(value.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy;
};

/**
 * Giorni interi fra due date, contati sui giorni di calendario.
 *
 * Positivo se `to` e nel futuro. `Math.round` e non `Math.floor` perche fra
 * due mezzanotti locali puo esserci un cambio d'ora: 23 o 25 ore restano un
 * giorno, e senza l'arrotondamento due volte l'anno un promemoria partirebbe
 * con un giorno di scarto.
 */
export const daysBetween = (from: Date, to: Date) =>
  Math.round(
    (startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000,
  );

/**
 * L'anticipo che scatta **oggi**, se ce n'e uno.
 *
 * Corrispondenza **esatta**: e la forma in codice del terzo punto in cima al
 * file. Restituisce `null` quando nessun anticipo corrisponde, che e il caso
 * normale — la maggior parte delle scadenze, in una notte qualunque, non
 * riguarda nessuno.
 */
export const selectFiringOffset = ({
  offsetDays,
  direction,
  daysToDate,
}: {
  offsetDays: readonly number[];
  direction: AutomationOffsetDirection;
  /** Giorni da oggi alla data dell'occorrenza. Negativo se gia passata. */
  daysToDate: number;
}): number | null => {
  const distance = direction === "before" ? daysToDate : -daysToDate;
  if (distance < 0) return null;
  return offsetDays.includes(distance) ? distance : null;
};

/* ------------------------------------------------------- la deduplica */

/**
 * Il separatore dei segmenti, **lo stesso del registro delle consegne**.
 *
 * `buildDedupKey` di `src/lib/server/communication-deliveries.ts` fa
 * esattamente questo, e la chiave costruita qui deve essere byte per byte
 * quella che il registro si aspetta. Non lo si importa perche quel modulo
 * apre il client Prisma e questo file lo legge anche la schermata di
 * configurazione: importarlo trascinerebbe il database dentro il bundle del
 * browser (CLAUDE.md §8).
 *
 * Che le due forme non divergano non e affidato alla buona volonta: un test
 * confronta le due funzioni sugli stessi segmenti.
 */
const KEY_SEPARATOR = ":";

const joinKey = (parts: Array<string | number | null | undefined>) =>
  parts
    .map((part) => asText(part))
    .filter(Boolean)
    .join(KEY_SEPARATOR);

/**
 * La chiave di deduplica di un'occorrenza.
 *
 * **Deterministica e leggibile**: `automation:AUT-01:installment_due:atleta-9:rata-99:7`
 * si capisce mesi dopo leggendo il registro; un hash no.
 *
 * I cinque segmenti sono i cinque fatti che rendono un messaggio *quel*
 * messaggio: quale regola, su quale fatto, per chi, per quale occorrenza, e a
 * quale dei suoi anticipi. Togliendone uno solo, due messaggi legittimi
 * diventerebbero lo stesso: senza `offsetDays` il promemoria dei tre giorni
 * non partirebbe perche quello dei sette e gia partito.
 */
export const buildAutomationDedupKey = ({
  ruleId,
  triggerKind,
  subjectId,
  occurrenceId,
  offsetDays,
}: {
  ruleId: string;
  triggerKind: string;
  subjectId: string;
  occurrenceId: string;
  offsetDays: number;
}) =>
  joinKey([
    "automation",
    ruleId,
    triggerKind,
    subjectId,
    occurrenceId,
    offsetDays,
  ]);

/** La chiave del riepilogo giornaliero: uno per club, per giorno. */
export const buildAutomationDigestDedupKey = (dayKey: string) =>
  joinKey(["automation", "digest", dayKey]);

/** `2026-11-30`: il giorno, in una forma che ordina e si legge. */
export const toDayKey = (value: Date) => {
  const day = startOfDay(value);
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const date = String(day.getDate()).padStart(2, "0");
  return `${day.getFullYear()}-${month}-${date}`;
};
