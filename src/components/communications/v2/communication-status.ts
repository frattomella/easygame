import { ACTIVITY_STATUS, PERSON_STATUS, type StatusSpec } from "@/lib/web/status";

/**
 * Gli stati del dominio comunicazioni che `src/lib/web/status.ts` non
 * conosce ancora. Stessa forma (`{label, weight, hue}`) e stesse regole
 * (guideline 09 §9.4): la parola c'e sempre, il colore non e mai da solo.
 *
 * Vivono qui — e non in `status.ts`, che le fondamenta non permettono di
 * toccare in questa ondata — con la richiesta esplicita al lead di
 * promuoverle: la consegna di un messaggio, lo scaffale di un avviso e
 * l'interruttore di una regola sono lessico del prodotto, non di una pagina.
 */
const spec = (label: string, weight: StatusSpec["weight"], hue: StatusSpec["hue"]): StatusSpec =>
  Object.freeze({ label, weight, hue });

/* ── Consegna di un messaggio (`sent | skipped | failed`) ───────────────── */
export const DELIVERY_STATUS = Object.freeze({
  sent: spec("INVIATO", "solid", "green"),
  skipped: spec("SALTATO", "quiet", "neutral"),
  failed: spec("NON RIUSCITO", "urgent", "red"),
} as const);

export const deliveryStatusSpec = (status: string | null | undefined): StatusSpec => {
  const key = String(status || "").trim().toLowerCase();
  if (key === "sent") return DELIVERY_STATUS.sent;
  if (key === "skipped") return DELIVERY_STATUS.skipped;
  if (key === "failed") return DELIVERY_STATUS.failed;
  return spec("NON REGISTRATO", "quiet", "neutral");
};

/* ── Scaffale di un avviso in bacheca ───────────────────────────────────── */
/**
 * `draft` e `scheduled` hanno gia una parola nel sistema (BOZZA, PROGRAMMATO);
 * «in bacheca» e «scaduto» no. Uno scaduto **non e un problema**: e un avviso
 * che ha fatto il suo lavoro ed e in archivio, per questo e quieto e non
 * rosso come il certificato.
 */
export type AnnouncementShelf = "draft" | "scheduled" | "current" | "expired";

export const SHELF_STATUS: Readonly<Record<AnnouncementShelf, StatusSpec>> = Object.freeze({
  draft: PERSON_STATUS.draft,
  scheduled: ACTIVITY_STATUS.scheduled,
  current: spec("IN BACHECA", "solid", "green"),
  expired: spec("SCADUTO", "quiet", "neutral"),
});

export const SHELF_LABELS: Readonly<Record<AnnouncementShelf, string>> = Object.freeze({
  draft: "Bozze",
  scheduled: "Programmati",
  current: "In bacheca",
  expired: "Scaduti",
});

export const SHELF_ORDER: readonly AnnouncementShelf[] = ["draft", "scheduled", "current", "expired"];

export const shelfStatusSpec = (shelf: string | null | undefined): StatusSpec =>
  SHELF_STATUS[(shelf as AnnouncementShelf) || "draft"] || SHELF_STATUS.draft;

/* ── Interruttore di una regola ─────────────────────────────────────────── */
export const RULE_STATUS = Object.freeze({
  enabled: spec("ACCESA", "solid", "green"),
  disabled: spec("SPENTA", "quiet", "neutral"),
} as const);

export const ruleStatusSpec = (enabled: boolean): StatusSpec => (enabled ? RULE_STATUS.enabled : RULE_STATUS.disabled);
