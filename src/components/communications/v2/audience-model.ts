import type { AudienceCriterionKind } from "@/lib/audience/criteria";
import {
  audienceCriterionNeedsSelection,
  isEventAudienceKind,
  EVENT_AUDIENCE_WINDOW_DAYS,
  type AudienceOption,
} from "@/components/communications/audience-events";

/**
 * Le regole pure del selettore del pubblico (Web V2): cosa dire quando un
 * criterio non ha niente da offrire, quando una selezione manca, e come si
 * manda un criterio al server. Senza React, provabili senza montare niente.
 */

/** Il testo per un criterio che non ha niente da offrire (le tre frasi della V1). */
export const emptyOptionsMessage = (kind: AudienceCriterionKind): string => {
  if (isEventAudienceKind(kind)) {
    return kind === "event_no_rsvp"
      ? "Nessun evento in programma con la conferma di presenza attiva: accendila sull'evento per poter scrivere a chi non ha risposto."
      : `Nessun evento in programma nei prossimi ${EVENT_AUDIENCE_WINDOW_DAYS} giorni.`;
  }
  return "Nessuna voce disponibile per questo criterio.";
};

/**
 * La verifica che la V1 faceva prima di ogni richiesta: un criterio che
 * pretende una selezione senza niente di selezionato non parte. Torna il
 * messaggio da mostrare, o `null` se si puo procedere.
 *
 * Il controllo guarda **il criterio**, non quante opzioni sono arrivate:
 * legato all'elenco, un criterio con zero opzioni — «Convocati a un evento»
 * senza eventi in programma — passava il controllo e finiva in un errore
 * del server che non spiega cosa fare.
 */
export const audienceSelectionError = (kind: AudienceCriterionKind, selected: readonly string[], options: readonly AudienceOption[]): string | null => {
  if (!audienceCriterionNeedsSelection(kind) || selected.length > 0) return null;
  return options.length === 0 ? "Nessuna voce disponibile per questo criterio: scegline un altro" : "Seleziona almeno una voce per questo criterio";
};

/** I criteri da mandare al server, nella forma che il dominio si aspetta. */
export const audienceCriteriaPayload = (kind: AudienceCriterionKind, selected: readonly string[]) =>
  audienceCriterionNeedsSelection(kind) ? [{ kind, values: [...selected] }] : [{ kind }];
