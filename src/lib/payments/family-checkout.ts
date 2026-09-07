import type { CheckoutReadiness } from "@/lib/payments/connect-account";

/**
 * **Perche il pulsante «Paga ora» e spento, detto alla famiglia.**
 *
 * PP-02 §D. Il pulsante c'era ed era vero — chiama il checkout, che emette un
 * link e lo apre — ma quando non si poteva pagare si limitava a spegnersi, con
 * il motivo nascosto in un `title` del browser: «Nessuna rata da saldare». Su
 * un telefono un `title` non esiste. E se la societa non aveva configurato i
 * pagamenti online il pulsante restava **acceso**, e il motivo arrivava dopo il
 * clic, come errore.
 *
 * Le due cose sono lo stesso difetto: **la ragione era conosciuta solo dopo il
 * gesto**, o non era conosciuta affatto.
 *
 * ---
 *
 * ## Perche il motivo del server non si mostra cosi com'e
 *
 * `describeCheckoutReadiness` produce messaggi scritti per **la societa**: «La
 * societa non ha ancora completato il collegamento del proprio conto di
 * incasso», «L'abbonamento della societa non comprende i pagamenti online».
 * Sono veri e sono utili — a chi puo rimediare. A una famiglia dicono due cose
 * che non le competono: lo stato commerciale del club con EasyGame e cosa deve
 * fare la segreteria.
 *
 * Qui i sei ostacoli del dominio diventano **due fatti** che una famiglia puo
 * usare: o il pagamento online non c'e — e allora si salda in segreteria — o
 * c'e ma adesso non risponde, e allora ha senso riprovare.
 *
 * ## Perche e un modulo puro e non una riga nel cruscotto
 *
 * Perche la stessa domanda se la fanno tre schermate — la Home, Pagamenti e il
 * dettaglio del piano — e una risposta scritta tre volte diverge alla prima
 * modifica. E gia successo con le etichette del certificato.
 */

export type FamilyCheckoutBlocker =
  | "not_configured"
  | "temporarily_unavailable"
  | "nothing_due";

export type FamilyCheckoutState = {
  /** Il pulsante puo essere premuto. */
  available: boolean;
  blocker: FamilyCheckoutBlocker | null;
  /** Cio che la famiglia legge accanto al pulsante. Mai vuoto. */
  message: string;
};

const NON_CONFIGURATO: FamilyCheckoutState = {
  available: false,
  blocker: "not_configured",
  message:
    "Il pagamento online non e attivo per questa societa: la quota si salda in segreteria.",
};

const MOMENTANEAMENTE: FamilyCheckoutState = {
  available: false,
  blocker: "temporarily_unavailable",
  message:
    "Il pagamento online e momentaneamente non disponibile. Riprova piu tardi, oppure salda in segreteria.",
};

/**
 * Lo stato del **canale**: dice se questa societa incassa online, e basta.
 *
 * Non sa niente delle rate, ed e voluto: il canale e una proprieta del club e
 * la rata e una proprieta della famiglia, e tenerle insieme vorrebbe dire
 * ricalcolare il canale a ogni riga del piano.
 */
export const resolveFamilyCheckoutChannel = (
  readiness: Pick<CheckoutReadiness, "canCheckout" | "blocker"> | null,
): FamilyCheckoutState => {
  if (!readiness) return NON_CONFIGURATO;
  if (readiness.canCheckout) {
    return { available: true, blocker: null, message: "" };
  }

  /*
    `account_not_ready` e l'unico ostacolo che passa da solo: il conto e
    collegato e sta finendo le verifiche del fornitore. Gli altri cinque
    richiedono che qualcuno faccia qualcosa, e quel qualcuno non e la famiglia
    — dirle «riprova piu tardi» sarebbe mandarla a riprovare per sempre.
  */
  return readiness.blocker === "account_not_ready"
    ? MOMENTANEAMENTE
    : NON_CONFIGURATO;
};

/**
 * Lo stato del **pulsante**: il canale, piu la domanda «c'e qualcosa da
 * pagare?».
 *
 * Prende il canale gia risolto e non il verdetto del dominio, perche chi lo
 * chiama e la schermata: il verdetto lo ha risolto il server una volta sola, e
 * rifarlo qui vorrebbe dire tradurre avanti e indietro fra due vocabolari — che
 * e il modo in cui due schermate cominciano a dire due frasi diverse per lo
 * stesso fatto.
 *
 * L'ordine non e indifferente. Se non c'e niente da saldare lo si dice per
 * primo, anche quando il canale sarebbe spento: «hai pagato tutto» e una
 * risposta migliore di «questa societa non incassa online» per chi non deve
 * niente.
 */
export const withPayableInstalment = (
  channel: FamilyCheckoutState | null | undefined,
  hasPayableInstalment: boolean,
): FamilyCheckoutState => {
  if (!hasPayableInstalment) {
    return {
      available: false,
      blocker: "nothing_due",
      message: "Non ci sono rate da saldare.",
    };
  }

  /*
    Un payload che non porta il canale — la cache di una sessione aperta prima
    del rilascio — non deve **spegnere** il pulsante: il caso peggiore torna a
    essere quello di prima, cioe l'errore dopo il clic, e non «non si paga
    piu».
  */
  if (!channel) return { available: true, blocker: null, message: "" };

  return channel;
};
