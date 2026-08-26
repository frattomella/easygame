/**
 * Gli **stati di una fattura elettronica**, dal documento alla ricevuta dello
 * SdI.
 *
 * **Perche gli stati sono nove e non tre.** Perche sono nove cose diverse che
 * succedono a soggetti diversi, e chi guarda una fattura scartata deve poter
 * distinguere «l'ho preparata male io» da «l'intermediario non e riuscito a
 * consegnarla» da «il destinatario non ha un canale attivo». Comprimerli in
 * «inviata / non inviata» costringerebbe a leggere i log per capire cosa fare.
 *
 * **La regola che questo file rende impossibile violare.** In questo rilascio
 * non e stato scelto un intermediario accreditato: `sent` e tutto cio che
 * segue sono **irraggiungibili**, e la funzione che fa avanzare lo stato lo
 * rifiuta. Marcare «trasmessa allo SdI» una fattura che non e mai transitata
 * dallo SdI farebbe credere a una societa di aver adempiuto, e se ne
 * accorgerebbe da una sanzione. Vedi ADR-0053.
 *
 * Modulo **puro**.
 */

export const EINVOICE_STATES = [
  "draft",
  "generated",
  "ready_to_send",
  "sent",
  "delivered",
  "not_delivered",
  "rejected",
  "failed",
  "cancelled",
] as const;

export type EInvoiceState = (typeof EINVOICE_STATES)[number];

export const isEInvoiceState = (value: unknown): value is EInvoiceState =>
  EINVOICE_STATES.includes(String(value || "") as EInvoiceState);

type EInvoiceStateDefinition = {
  label: string;
  description: string;
  /** Vero se lo stato puo essere raggiunto senza un intermediario reale. */
  reachableWithoutProvider: boolean;
  tone: "neutral" | "info" | "warning" | "success" | "danger";
};

export const EINVOICE_STATE_DEFINITIONS: Record<
  EInvoiceState,
  EInvoiceStateDefinition
> = {
  draft: {
    label: "Bozza",
    description: "La fattura esiste; il tracciato elettronico non e stato preparato.",
    reachableWithoutProvider: true,
    tone: "neutral",
  },
  generated: {
    label: "Tracciato generato",
    description:
      "Il file XML e stato prodotto. Non e stato ne validato del tutto ne inviato.",
    reachableWithoutProvider: true,
    tone: "info",
  },
  ready_to_send: {
    label: "Pronta per la trasmissione",
    description:
      "Il tracciato e completo e formalmente valido. Manca solo un canale verso lo SdI.",
    reachableWithoutProvider: true,
    tone: "info",
  },
  sent: {
    label: "Trasmessa",
    description: "Consegnata all'intermediario, che l'ha inoltrata allo SdI.",
    reachableWithoutProvider: false,
    tone: "info",
  },
  delivered: {
    label: "Consegnata",
    description: "Lo SdI ha consegnato la fattura al destinatario.",
    reachableWithoutProvider: false,
    tone: "success",
  },
  not_delivered: {
    label: "Mancata consegna",
    description:
      "Lo SdI l'ha accettata ma non e riuscito a consegnarla: resta a disposizione del destinatario.",
    reachableWithoutProvider: false,
    tone: "warning",
  },
  rejected: {
    label: "Scartata",
    description:
      "Lo SdI ha rifiutato la fattura. Va corretta e ritrasmessa entro i termini.",
    reachableWithoutProvider: false,
    tone: "danger",
  },
  failed: {
    label: "Errore di trasmissione",
    description:
      "La trasmissione non e riuscita per un problema tecnico. La fattura resta valida.",
    reachableWithoutProvider: false,
    tone: "danger",
  },
  cancelled: {
    label: "Annullata",
    description: "La trasmissione e stata abbandonata: la fattura e stata annullata.",
    reachableWithoutProvider: true,
    tone: "neutral",
  },
};

export const eInvoiceStateLabel = (value: unknown) =>
  EINVOICE_STATE_DEFINITIONS[isEInvoiceState(value) ? value : "draft"].label;

/**
 * Le transizioni ammesse.
 *
 * **Perche una tabella e non degli `if`.** Uno stato che avanza con dei
 * controlli sparsi finisce per avanzare anche dove nessuno aveva previsto:
 * basta un ramo dimenticato. Qui l'insieme delle transizioni possibili si
 * legge tutto in una schermata, e cio che non e scritto non succede.
 */
const ALLOWED_TRANSITIONS: Record<EInvoiceState, EInvoiceState[]> = {
  draft: ["generated", "cancelled"],
  generated: ["ready_to_send", "draft", "cancelled"],
  ready_to_send: ["sent", "generated", "failed", "cancelled"],
  sent: ["delivered", "not_delivered", "rejected", "failed"],
  delivered: [],
  not_delivered: [],
  /* Una fattura scartata si corregge e si ricomincia dal tracciato. */
  rejected: ["draft", "generated"],
  failed: ["ready_to_send", "cancelled"],
  cancelled: [],
};

export type TransitionResult =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * Se una fattura elettronica puo passare da uno stato all'altro.
 *
 * `providerConfigured` non ha un valore predefinito **di proposito**: chi
 * chiama deve dire esplicitamente se un intermediario reale esiste. Un
 * parametro con default `true` sarebbe la porta da cui la trasmissione finta
 * rientrerebbe il giorno in cui qualcuno dimentica di passarlo.
 */
export const canTransition = (
  from: unknown,
  to: unknown,
  options: { providerConfigured: boolean },
): TransitionResult => {
  if (!isEInvoiceState(from) || !isEInvoiceState(to)) {
    return { allowed: false, reason: "Stato non riconosciuto." };
  }

  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    return {
      allowed: false,
      reason: `Da «${EINVOICE_STATE_DEFINITIONS[from].label}» non si passa a «${EINVOICE_STATE_DEFINITIONS[to].label}».`,
    };
  }

  if (
    !options.providerConfigured &&
    !EINVOICE_STATE_DEFINITIONS[to].reachableWithoutProvider
  ) {
    return {
      allowed: false,
      reason:
        "La trasmissione elettronica non e attiva: non e stato configurato un intermediario accreditato. EasyGame prepara il tracciato, non lo invia.",
    };
  }

  return { allowed: true };
};

/** Lo stato piu avanzato raggiungibile senza un intermediario reale. */
export const MAX_STATE_WITHOUT_PROVIDER: EInvoiceState = "ready_to_send";
