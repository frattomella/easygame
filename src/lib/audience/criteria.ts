/**
 * I criteri con cui si sceglie **a chi** parla il gestionale.
 *
 * **Perche un'enum chiusa e non un filtro libero.** Un criterio non e una
 * query che l'utente compone: e una domanda che il prodotto sa fare. Un
 * linguaggio di filtri libero sposterebbe sulla segreteria la responsabilita
 * di un messaggio mandato alle persone sbagliate, senza toglierla a nessuno —
 * e il prodotto che manda l'email. Un criterio nuovo si dichiara qui, e
 * dichiararlo e una decisione di prodotto.
 *
 * **Perche i criteri economici sono marcati.** «Manda a chi non ha pagato» non
 * mostra nessun importo a schermo, eppure **produce l'elenco delle famiglie in
 * arretrato**, che e un dato economico a tutti gli effetti. Se il permesso
 * proteggesse solo la pagina dei movimenti, un allenatore otterrebbe lo stesso
 * elenco passando dal motore del pubblico. La porta da chiudere e il criterio.
 *
 * Modulo **puro**: nessun Prisma, nessuna rete, nessun DOM.
 */

export const AUDIENCE_CRITERION_KINDS = [
  "all_families",
  "category_ids",
  "group_ids",
  "site_ids",
  "athlete_ids",
  "overdue_payments",
  "certificate_missing_or_expiring",
  "no_account",
  /*
    **I due criteri che l'evento come riga rende esprimibili** (ADR-0098).

    «Scrivi ai convocati» e «scrivi a chi non ha risposto» erano domande che il
    prodotto non sapeva fare: la convocazione era un campo dentro il payload
    della gara, in dieci grafie diverse, e la risposta della famiglia non aveva
    un evento a cui appoggiarsi. Non era un criterio mancante: era un criterio
    **inesprimibile**.

    Restano due criteri e non uno perche rispondono a due domande diverse, e la
    seconda e quella che si va a cercare la sera prima: «chi devo chiamare».
  */
  "event_convocated",
  "event_no_rsvp",
] as const;

export type AudienceCriterionKind = (typeof AUDIENCE_CRITERION_KINDS)[number];

export type AudienceCriterion =
  | { kind: "all_families" }
  | { kind: "category_ids"; values: string[] }
  | { kind: "group_ids"; values: string[] }
  | { kind: "site_ids"; values: string[] }
  | { kind: "athlete_ids"; values: string[] }
  | { kind: "overdue_payments" }
  | { kind: "certificate_missing_or_expiring"; withinDays?: number }
  | { kind: "no_account" }
  | { kind: "event_convocated"; values: string[] }
  | { kind: "event_no_rsvp"; values: string[] };

export const AUDIENCE_CRITERION_LABELS: Record<AudienceCriterionKind, string> = {
  all_families: "Tutte le famiglie",
  category_ids: "Per categoria",
  group_ids: "Per gruppo operativo",
  site_ids: "Per sede",
  athlete_ids: "Atleti selezionati",
  overdue_payments: "Con quote da versare",
  certificate_missing_or_expiring: "Certificato mancante o in scadenza",
  no_account: "Senza account collegato",
  event_convocated: "Convocati a un evento",
  event_no_rsvp: "Senza risposta a un evento",
};

/**
 * I criteri che rivelano la posizione economica di una famiglia.
 *
 * E un insieme e non una proprieta del singolo criterio perche la domanda che
 * si pone al momento del controllo e «questa selezione dice qualcosa sui soldi
 * di qualcuno?», e la risposta deve poter essere data guardando un posto solo.
 */
export const ECONOMIC_AUDIENCE_CRITERIA: ReadonlySet<AudienceCriterionKind> =
  new Set<AudienceCriterionKind>(["overdue_payments"]);

/** Giorni di preavviso predefiniti sul certificato, quando nessuno li dichiara. */
export const DEFAULT_CERTIFICATE_WITHIN_DAYS = 30;

const asText = (value: unknown) => String(value ?? "").trim();

const asIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((entry) => asText(entry)).filter(Boolean)),
  );
};

const isCriterionKind = (value: unknown): value is AudienceCriterionKind =>
  AUDIENCE_CRITERION_KINDS.includes(asText(value) as AudienceCriterionKind);

/**
 * Normalizza cio che arriva dalla rete in criteri che il risolutore conosce.
 *
 * **Un criterio sconosciuto non viene ignorato: fa fallire.** Ignorarlo
 * allargherebbe il pubblico in silenzio — chi ha chiesto «solo l'Under 14» si
 * ritroverebbe a scrivere a tutto il club — ed e il modo piu semplice per
 * mandare un messaggio alle persone sbagliate.
 *
 * **Un criterio a elenco vuoto fa fallire allo stesso modo.** «Per categoria,
 * nessuna categoria» non e un pubblico vuoto: e una selezione che qualcuno
 * credeva di aver fatto.
 */
export const normalizeAudienceCriteria = (
  input: unknown,
): AudienceCriterion[] => {
  const raw = Array.isArray(input) ? input : [];

  if (raw.length === 0) {
    throw new Error("Nessun criterio: non si manda un messaggio a nessuno");
  }

  const criteria: AudienceCriterion[] = [];
  const seen = new Set<AudienceCriterionKind>();

  for (const entry of raw) {
    const kind = asText((entry as any)?.kind);

    if (!isCriterionKind(kind)) {
      throw new Error(`Criterio di pubblico sconosciuto: ${kind || "(vuoto)"}`);
    }

    if (seen.has(kind)) {
      throw new Error(
        `Criterio ripetuto: ${AUDIENCE_CRITERION_LABELS[kind]} compare due volte`,
      );
    }
    seen.add(kind);

    switch (kind) {
      case "category_ids":
      case "group_ids":
      case "site_ids":
      case "athlete_ids":
      case "event_convocated":
      case "event_no_rsvp": {
        const values = asIdList((entry as any)?.values);
        if (values.length === 0) {
          throw new Error(
            `${AUDIENCE_CRITERION_LABELS[kind]}: nessun elemento selezionato`,
          );
        }
        criteria.push({ kind, values } as AudienceCriterion);
        break;
      }
      case "certificate_missing_or_expiring": {
        const declared = Number((entry as any)?.withinDays);
        const withinDays =
          Number.isFinite(declared) && declared >= 0
            ? Math.round(declared)
            : DEFAULT_CERTIFICATE_WITHIN_DAYS;
        criteria.push({ kind, withinDays });
        break;
      }
      default:
        criteria.push({ kind } as AudienceCriterion);
    }
  }

  /*
    «Tutte le famiglie» insieme a un filtro e una contraddizione, non una
    somma: chi la scrive intende una delle due cose e non sa quale otterra.
  */
  if (seen.has("all_families") && seen.size > 1) {
    throw new Error(
      "«Tutte le famiglie» non si combina con altri criteri: o tutte, o una selezione",
    );
  }

  return criteria;
};

/** Vero se la selezione rivela la posizione economica di qualcuno. */
export const criteriaRevealEconomicData = (
  criteria: readonly AudienceCriterion[],
) => criteria.some((criterion) => ECONOMIC_AUDIENCE_CRITERIA.has(criterion.kind));

/**
 * Una descrizione in italiano della selezione, per l'anteprima e per l'audit.
 *
 * Serve a rispondere mesi dopo alla domanda «a chi era stato mandato?» senza
 * dover ricostruire l'insieme dei destinatari, che nel frattempo e cambiato.
 */
export const describeAudienceCriteria = (
  criteria: readonly AudienceCriterion[],
): string => {
  if (criteria.length === 0) return "Nessun criterio";

  return criteria
    .map((criterion) => {
      const label = AUDIENCE_CRITERION_LABELS[criterion.kind];
      if ("values" in criterion) {
        return `${label} (${criterion.values.length})`;
      }
      if (criterion.kind === "certificate_missing_or_expiring") {
        return `${label} entro ${criterion.withinDays ?? DEFAULT_CERTIFICATE_WITHIN_DAYS} giorni`;
      }
      return label;
    })
    .join(" + ");
};
