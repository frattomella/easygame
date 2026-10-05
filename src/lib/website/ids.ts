/**
 * Identificativi degli elementi di un documento (sezioni, colonne, blocchi).
 * UUID quando c'e `crypto.randomUUID` — browser moderni e Node 22 — e un
 * ripiego casuale altrimenti: non sono chiavi di database, servono solo a
 * distinguere due elementi dello stesso documento.
 */
export const newWebsiteId = () =>
  typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
