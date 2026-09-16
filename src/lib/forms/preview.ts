/**
 * L'anteprima web di un modulo (ADR-0190 §4): una pagina dell'applicazione,
 * non un PDF, che monta lo stesso renderer del pubblico sulla **bozza**,
 * a larghezza intera e a 375 px, senza scrivere niente.
 */
export const buildFormPreviewPath = (templateId: string) =>
  `/modulistica/moduli/${encodeURIComponent(String(templateId || "").trim())}/anteprima`;
