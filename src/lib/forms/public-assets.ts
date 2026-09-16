/**
 * Quale allegato la rotta pubblica delle immagini di contenuto puo servire
 * (ADR-0190 §2, ADR-0191): **solo** un allegato del modulo dello slug, della
 * categoria del contenuto, che sia un'immagine. Una funzione pura, cosi la
 * regola si prova senza il database e la rotta la applica senza riscriverla.
 */

export const FORM_CONTENT_ASSET_CATEGORY = "contenuto-modulo";

export const isPublicFormContentAsset = (
  meta: { organizationId: string; ownerType: string; ownerId: string; category: string; mimeType: string },
  match: { organizationId: string; templateId: string },
) =>
  meta.organizationId === match.organizationId &&
  meta.ownerType === "form" &&
  meta.ownerId === match.templateId &&
  meta.category === FORM_CONTENT_ASSET_CATEGORY &&
  String(meta.mimeType || "").toLowerCase().startsWith("image/");
