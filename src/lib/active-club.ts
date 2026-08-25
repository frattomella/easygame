/**
 * Da dove viene l'id del club attivo, lato client.
 *
 * **Il difetto che questo modulo chiude** (Blocco 7, punto 4). Quasi tutte le
 * pagine risolvono il club provando tre sorgenti in ordine: il parametro
 * `?clubId=` nell'URL, il club attivo della sessione, e infine
 * `localStorage`. Ognuna di quelle pagine ha la sua copia di quel codice, con
 * piccole differenze.
 *
 * La pagina di caricamento dei contratti dell'allenatore leggeva **solo** il
 * parametro nell'URL, e la scheda allenatore la apriva senza passarlo: il
 * risultato era «ID del club non trovato» ogni volta che si provava ad
 * aggiungere un contratto. Non era un problema di dati mancanti: era una
 * pagina che cercava il club in un posto solo.
 *
 * Qui c'e una funzione sola, senza React, usabile anche fuori da un
 * componente. Non sostituisce `useAuth().activeClub` — che resta la fonte
 * autorevole quando c'e — ma le da i due ripieghi che il resto
 * dell'applicazione usa gia.
 */

const parseStoredClubId = (raw: string | null): string => {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    const id = String(parsed?.id || "").trim();
    return id && id !== "null" && id !== "undefined" ? id : "";
  } catch {
    return "";
  }
};

/**
 * L'id del club attivo, o stringa vuota.
 *
 * `preferred` e cio che chi chiama sa gia — tipicamente
 * `activeClub?.id` — e vince su tutto tranne che sull'URL, perche un link
 * esplicito a un club deve poter aprire quel club.
 */
export const resolveActiveClubId = (preferred?: string | null): string => {
  const isUsable = (value?: string | null) => {
    const id = String(value || "").trim();
    return id && id !== "null" && id !== "undefined" ? id : "";
  };

  if (typeof window === "undefined") {
    return isUsable(preferred);
  }

  const fromUrl = isUsable(
    new URLSearchParams(window.location.search).get("clubId"),
  );
  if (fromUrl) return fromUrl;

  const fromPreferred = isUsable(preferred);
  if (fromPreferred) return fromPreferred;

  const fromStorage = parseStoredClubId(
    window.localStorage.getItem("activeClub"),
  );
  if (fromStorage) return fromStorage;

  // Chiave per utente: c'e quando lo stesso browser ha piu account.
  const userId = window.localStorage.getItem("userId");
  if (userId) {
    return parseStoredClubId(
      window.localStorage.getItem(`activeClub_${userId}`),
    );
  }

  return "";
};
