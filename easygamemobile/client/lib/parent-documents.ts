import type { StatusPillVariant } from "@/components/signature/StatusPill";
import type { FamilyDocumentItem } from "@/services/api";

/**
 * Documenti Parent — solo presentazione. Lo stato (`state`/`stateLabel`/
 * `daysLeft`/`action`) e' interamente derivato server-side
 * (`deriveFamilyDocumentState`, `src/lib/documents/family-dossier.ts`): qui
 * non si ricalcola nulla, si sceglie solo come colorare cio che il server
 * ha gia deciso.
 */

export const DOCUMENT_STATE_TINT: Record<FamilyDocumentItem["state"], string> =
  {
    approved: "#10B981",
    missing: "#94A3B8",
    overdue: "#EF4444",
    under_review: "#2563EB",
    expired: "#EF4444",
    rejected: "#EF4444",
  };

export const DOCUMENT_STATE_VARIANT: Record<
  FamilyDocumentItem["state"],
  StatusPillVariant
> = {
  approved: "success",
  missing: "default",
  overdue: "destructive",
  under_review: "primary",
  expired: "destructive",
  rejected: "destructive",
};

/** Icona del tipo documento — solo i tipi del catalogo canonico (`src/lib/documents/kind-catalog.ts`); qualunque altro valore ricade su un'icona neutra. */
export function resolveDocumentIcon(
  documentKind: string,
): "medkit-outline" | "card-outline" | "document-text-outline" {
  if (
    documentKind === "medical_certificate" ||
    documentKind === "health_card"
  ) {
    return "medkit-outline";
  }
  if (documentKind === "identity_document") {
    return "card-outline";
  }
  return "document-text-outline";
}

/** Le due densita del componente (spec §C4): riga in un elenco, scheda quando serve una nota di requisito da leggere. */
export function resolveDocumentDensity(
  item: Pick<FamilyDocumentItem, "required" | "description">,
): "row" | "card" {
  return item.required && item.description ? "card" : "row";
}
