/**
 * **Dove si torna dopo il checkout**, e perche non e un indirizzo nuovo.
 *
 * **Il difetto che questo modulo chiude.** L'indirizzo di ritorno veniva
 * costruito da zero — `${origin}/athletes/${athleteId}?pagamento=verifica` — e
 * la scheda di un atleta non si apre senza `?clubId=…`: al ritorno dal
 * pagamento la pagina rispondeva «ID del club mancante. Torna alla lista
 * atleti.» Cioe la famiglia pagava davvero, il denaro arrivava davvero, e la
 * prima cosa che vedeva era un errore. Trovato a runtime nel collaudo E-13,
 * subito dopo un pagamento riuscito in sandbox.
 *
 * **La regola, e perche e questa.** Non si costruisce un indirizzo: si
 * **riprende quello da cui si e partiti** e gli si aggiunge il segno che un
 * pagamento e in volo. Un indirizzo ricostruito porta solo cio che chi lo
 * scrive si e ricordato di mettere, e la scheda di un atleta vuole gia due
 * parametri — il club e la linguetta aperta. Ripartire da dove si era li
 * conserva tutti, compresi quelli che verranno aggiunti dopo e di cui questo
 * modulo non sapra mai niente.
 *
 * **Cosa il segno non fa.** Non registra niente e non dichiara niente: il
 * pagamento lo conferma l'evento firmato del provider, e «in verifica» lo
 * ricorda `sessionStorage` perche il browser puo non tornare affatto
 * (ADR-0045). Resta perche un indirizzo che dice cosa e appena successo e
 * leggibile da chi assiste una segreteria al telefono.
 *
 * Modulo **puro**: nessuna finestra, nessuna rete. Chi chiama passa
 * l'indirizzo corrente.
 */

/** L'esito che il provider ci rimanda addosso: si e pagato, o si e rinunciato. */
export type CheckoutOutcome = "verifica" | "annullato";

/**
 * L'indirizzo corrente con in piu il segno del pagamento.
 *
 * Restituisce `null` quando l'indirizzo di partenza non e utilizzabile — non
 * un indirizzo, oppure con uno schema che non si naviga. Chi chiama deve
 * poter decidere cosa fare invece di mandare al provider un `successUrl` che
 * il provider rifiuterebbe.
 */
export const buildCheckoutReturnUrl = (
  currentHref: unknown,
  outcome: CheckoutOutcome,
): string | null => {
  const raw = String(currentHref ?? "").trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  /*
    Stripe accetta come indirizzo di ritorno solo `http`/`https`, ed e giusto
    che sia cosi: qui si ferma un `javascript:` prima che diventi il posto in
    cui il provider rimanda chi ha appena pagato.
  */
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  /*
    `set` e non `append`: tornando una seconda volta sulla stessa pagina il
    segno si sostituisce invece di accumularsi.
  */
  url.searchParams.set("pagamento", outcome);

  return url.toString();
};
