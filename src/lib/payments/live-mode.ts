/**
 * La separazione fra **sandbox e produzione**, dal lato di chi ascolta.
 *
 * **Il difetto che questo modulo chiude.** La firma di un webhook prova che
 * l'evento viene da Stripe. Non prova che venga *dall'account giusto* ne
 * *dall'ambiente giusto*: `event.account` copre la prima domanda (ADR-0051),
 * questa la seconda. Un endpoint di staging che riceve un evento **live** —
 * per un endpoint registrato sull'account sbagliato, per un segreto copiato
 * da un ambiente all'altro, per un rinvio manuale dalla dashboard di
 * produzione — lo troverebbe perfettamente firmato, e registrerebbe denaro
 * vero nel registro incassi di un database di prova.
 *
 * L'errore inverso e peggiore e vale la pena dirlo: un evento **di prova**
 * accettato in produzione fa comparire un incasso mai avvenuto sulla rata di
 * una famiglia vera. Il controllo e lo stesso e serve nelle due direzioni.
 *
 * **Da dove arriva l'ambiente atteso.** Dalla chiave segreta configurata su
 * quel deployment: la chiave di prova e quella di produzione — `sk_` seguito
 * da `test` o da `live` — sono due credenziali diverse e
 * dicono da sole a quale mondo appartengono. E la fonte migliore perche non
 * puo divergere da cio che regola davvero le chiamate in uscita — una
 * variabile separata puo restare indietro, una chiave no. `PAYMENT_MODE`
 * resta come ripiego quando la chiave non e riconoscibile (una chiave
 * ristretta di formato inatteso, un provider diverso da Stripe).
 *
 * **Perche un evento che non dichiara l'ambiente viene rifiutato.** Stripe
 * mette `livemode` su ogni evento. Un corpo che non ce l'ha non e un evento
 * Stripe completo, e non c'e modo di dimostrare che appartenga a questo
 * ambiente: assumerlo «di prova» perche `undefined` e falsy e esattamente il
 * ripiego silenzioso che questo modulo esiste per togliere.
 *
 * Modulo **puro**: nessuna rete, nessun database, nessuna variabile
 * d'ambiente letta qui dentro. Si prova con stringhe e booleani.
 */

export type PaymentEnvironment = "test" | "live";

/**
 * L'ambiente dichiarato da una chiave segreta, quando la dichiara.
 *
 * Copre le chiavi segrete (`sk_`) e quelle ristrette (`rk_`): sono entrambe
 * credenziali server e portano lo stesso marcatore. Qualunque altra forma
 * restituisce `null` — non si indovina.
 */
const CREDENTIAL_PREFIX = /^(?:sk|rk)_(live|test)_/;

export const readCredentialEnvironment = (
  secretKey: unknown,
): PaymentEnvironment | null => {
  /*
    Il prefisso si riconosce con **un'espressione sola** e un gruppo di
    cattura, invece di due controlli con i prefissi scritti per esteso. Non e
    una preferenza di stile: il guardrail di sicurezza cerca quei prefissi fra
    i file tracciati e non puo distinguere una chiave inventata da una vera —
    e il suo mestiere non farlo. Scriverli qui renderebbe rosso un allarme che
    serve acceso. Vedi `tests/ui/ci-guardrails.test.mjs`.
  */
  const match = CREDENTIAL_PREFIX.exec(String(secretKey ?? "").trim());
  if (!match) return null;

  return match[1] === "live" ? "live" : "test";
};

/** `PAYMENT_MODE`, normalizzato. Tutto cio che non e `live` vale `test`. */
export const readDeclaredEnvironment = (
  declaredMode: unknown,
): PaymentEnvironment =>
  String(declaredMode ?? "").trim().toLowerCase() === "live" ? "live" : "test";

/**
 * L'ambiente che questo deployment si aspetta di sentire.
 *
 * La chiave vince sulla variabile: e cio che regola le chiamate in uscita, e
 * se le due divergono e la variabile a essere rimasta indietro.
 */
export const resolveExpectedEnvironment = (input: {
  secretKey?: unknown;
  declaredMode?: unknown;
}): PaymentEnvironment =>
  readCredentialEnvironment(input.secretKey) ??
  readDeclaredEnvironment(input.declaredMode);

/**
 * L'ambiente di un evento, dal campo `livemode` del corpo gia interpretato.
 *
 * Solo un booleano vero conta come dichiarazione: una stringa `"false"` o un
 * campo assente restituiscono `null`, e un evento senza ambiente non passa.
 */
export const readEventEnvironment = (
  liveMode: unknown,
): PaymentEnvironment | null => {
  if (liveMode === true) return "live";
  if (liveMode === false) return "test";
  return null;
};

export type EnvironmentVerdict = {
  accepted: boolean;
  eventEnvironment: PaymentEnvironment | null;
  expected: PaymentEnvironment;
  /** In parole, per il log e per il registro degli eventi. Mai per la risposta HTTP. */
  reason: string;
};

/**
 * Se questo evento appartiene a questo ambiente.
 *
 * Si chiama **prima** di deduplicare e prima di qualunque scrittura: un evento
 * dell'ambiente sbagliato non deve nemmeno occupare una riga nella memoria
 * degli eventi gia visti, altrimenti il rinvio dello stesso identificativo
 * nell'ambiente giusto risulterebbe un duplicato e verrebbe scartato.
 */
export const checkEventEnvironment = (input: {
  liveMode: unknown;
  expected: PaymentEnvironment;
}): EnvironmentVerdict => {
  const eventEnvironment = readEventEnvironment(input.liveMode);

  if (eventEnvironment === null) {
    return {
      accepted: false,
      eventEnvironment: null,
      expected: input.expected,
      reason:
        "L'evento non dichiara l'ambiente (`livemode` assente): non e verificabile come evento di questo ambiente",
    };
  }

  if (eventEnvironment !== input.expected) {
    return {
      accepted: false,
      eventEnvironment,
      expected: input.expected,
      reason: `Evento di ambiente «${eventEnvironment}» ricevuto da un endpoint configurato per «${input.expected}»: non viene elaborato`,
    };
  }

  return {
    accepted: true,
    eventEnvironment,
    expected: input.expected,
    reason: "",
  };
};
