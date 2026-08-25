/**
 * I modelli di documento del club, separati dai residui della prima
 * modulistica.
 *
 * **Perche questo filtro esiste ancora.** Fino alla Modulistica V2 i moduli
 * online e le loro risposte vivevano dentro `clubs.document_templates`,
 * insieme ai modelli di stampa. Quel campo non e stato svuotato — il travaso
 * (`scripts/migrate-forms-v2.mjs`) e una copia, non uno spostamento, cosi il
 * dato di partenza resta finche qualcuno non decide di cancellarlo.
 *
 * Finche resta, chi legge i modelli di documento deve saltare le voci di
 * tipo `online_form` e `online_form_submission`, altrimenti la pagina
 * Modulistica mostra un modulo online travestito da modello di stampa.
 *
 * Il giorno in cui `clubs.document_templates` verra ripulito, questo file
 * sparisce. Vedi [ADR-0039].
 */

const LEGACY_FORM_TYPES = new Set(["online_form", "online_form_submission"]);

export const getDocumentTemplatesFromClub = (value: unknown) =>
  (Array.isArray(value) ? value : []).filter((item) => {
    if (!item || typeof item !== "object") return true;
    const record = item as Record<string, unknown>;
    const type = String(record.type ?? record.kind ?? "").trim();
    return !LEGACY_FORM_TYPES.has(type);
  });
