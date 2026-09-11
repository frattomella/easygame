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

/**
 * I quattro livelli del design v3 (`IA e Home` §5, "Status hierarchy") per
 * gli stati del fascicolo: **quiet** per cio che e in regola (approvato),
 * **outline** per cio che aspetta il club (in verifica), **solid** per cio
 * che aspetta la famiglia (richiesto, mancante ma obbligatorio, rifiutato),
 * **urgent** per cio che ha una scadenza superata (scaduto, in ritardo). Un
 * documento facoltativo non ancora caricato resta neutro: non chiede nulla.
 */
export function resolveDocumentStatusTier(
  item: Pick<FamilyDocumentItem, "state" | "required">,
): {
  tier: "quiet" | "outline" | "solid" | "urgent";
  tone: "success" | "info" | "warning" | "danger" | "neutral";
} {
  switch (item.state) {
    case "approved":
      return { tier: "quiet", tone: "success" };
    case "under_review":
      return { tier: "outline", tone: "info" };
    case "overdue":
    case "expired":
      return { tier: "urgent", tone: "danger" };
    case "rejected":
      return { tier: "solid", tone: "danger" };
    case "missing":
    default:
      return item.required
        ? { tier: "solid", tone: "warning" }
        : { tier: "quiet", tone: "neutral" };
  }
}
