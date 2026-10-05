/**
 * **Il trasporto del sito pubblico** (ADR-0200 §22).
 *
 * Il gestionale parla con le API attraverso `src/lib/api/client.ts`, che
 * aggiunge club attivo, ruolo, stagione e il logout centralizzato: niente di
 * questo esiste per un visitatore del sito di un club. Il sito ha quindi un
 * trasporto suo, minuscolo, con un'unica destinazione per funzione — sempre
 * sullo stesso dominio del club, sempre senza credenziali.
 */

export type PublicResult = { ok: true } | { ok: false; message: string };

const postJson = async (path: string, body: unknown): Promise<PublicResult> => {
  try {
    const response = await fetch(path, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, message: String(payload?.error?.message || "Invio non riuscito") };
    return { ok: true };
  } catch {
    return { ok: false, message: "Connessione non riuscita: riprova fra poco" };
  }
};

export const sendWebsiteInquiry = (payload: Record<string, unknown>) => postJson("/api/public/website/inquiries", payload);
