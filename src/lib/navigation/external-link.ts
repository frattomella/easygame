/**
 * L'apertura di un indirizzo **esterno**, in un posto solo.
 *
 * **Perche non `window.open` sparso.** Due ragioni, e la seconda e di
 * sicurezza.
 *
 * 1. *`noopener` non e facoltativo.* Una scheda aperta senza di esso puo
 *    riscrivere `window.opener.location`: la pagina che l'ha aperta viene
 *    portata altrove mentre chi guarda sta leggendo la scheda nuova. E un
 *    attacco vecchio e banale, e l'unico modo di non dimenticarlo e non
 *    scriverlo ogni volta.
 * 2. *L'indirizzo arriva da una risposta HTTP.* Il link di onboarding lo
 *    restituisce il PSP, e cio che arriva dalla rete non e un indirizzo finche
 *    non lo si e guardato: `javascript:` e `data:` sono schemi che un
 *    `window.open` accetta volentieri. Qui passano solo `http` e `https`.
 *
 * **Perche e distinto da `openClientFileUrl`.** Quello serve ad aprire un
 * **file** che l'applicazione ha in mano — un allegato, un PDF generato — e
 * risolve un problema diverso: i browser bloccano `window.open` su un data
 * URL, e serve un object URL. Questo apre una pagina che sta su un altro
 * dominio. Confonderli farebbe ripetere qui la conversione di la, e li il
 * controllo di schema di qui.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export class UnsafeExternalUrlError extends Error {
  constructor(url: string) {
    super(`Indirizzo esterno non consentito: ${url.slice(0, 60)}`);
    this.name = "UnsafeExternalUrlError";
  }
}

/**
 * Vero se l'indirizzo si puo aprire in una scheda nuova.
 *
 * Modulo puro e provabile: e la parte che vale la pena collaudare, perche e
 * quella che decide se qualcosa che arriva dalla rete diventa navigazione.
 */
export const isSafeExternalUrl = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw) return false;

  try {
    return ALLOWED_PROTOCOLS.has(new URL(raw).protocol);
  } catch {
    /* Un indirizzo relativo non e un indirizzo esterno: non passa di qui. */
    return false;
  }
};

/**
 * Apre un indirizzo esterno in una scheda nuova.
 *
 * Restituisce `false` invece di lanciare quando il browser blocca la scheda —
 * cosa che succede quando l'apertura non discende da un clic — cosi chi chiama
 * puo mostrare il link invece di lasciare l'utente davanti a niente.
 */
export const openExternalUrl = (value: unknown): boolean => {
  const raw = String(value ?? "").trim();

  if (!isSafeExternalUrl(raw)) {
    throw new UnsafeExternalUrlError(raw);
  }

  const opened = window.open(raw, "_blank", "noopener,noreferrer");
  return Boolean(opened);
};
