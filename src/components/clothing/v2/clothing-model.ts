import { getPrimaryAthleteCategoryMembership } from "@/lib/athlete-category-memberships";
import {
  assignmentStatusLabels,
  getAssignmentNumberLabel,
  supplierOrderStatuses,
  type ClothingAssignment,
  type ClothingAssignmentComponentRequest,
  type ClothingAssignmentSource,
  type ClothingAssignmentStatus,
  type ClothingCatalogItem,
  type ClothingKitComponent,
  type ClothingNumberMode,
  type ClothingSizeSource,
  type ClothingStockMode,
  type InventoryStock,
  type InventoryUnitStatus,
  type NumberingGroup,
} from "@/lib/clothing-inventory-utils";
import type { SupplierOrderPdfRow } from "@/lib/clothing-supplier-order-pdf";
import type { ClothingItemState, KitDeliveryState } from "@/lib/clothing-delivery";
import { getAthleteDisplayName } from "@/lib/athlete-name-utils";
import { formatLocalDateOnly } from "@/lib/date-only";
import { parseDateInput } from "@/lib/web/format";
import { MONEY_STATUS, PERSON_STATUS, type StatusSpec } from "@/lib/web/status";

/**
 * Il modello di pagina di `/clothing` (Web V2): tipi dei moduli, valori
 * iniziali, etichette e le poche derivazioni che la V1 teneva dentro
 * `page.tsx`. Niente scritture: la logica dati resta nella pagina, che
 * chiama `simplified-db` e `POST /api/clothing/assignments` come prima.
 */

/* ── Aree della pagina (le sei schede della V1, ora in `?area=`) ────────── */
export type ClothingArea = "kit" | "articoli" | "magazzino" | "assegnazioni" | "ordini" | "numerazioni";

export const CLOTHING_AREAS: ReadonlyArray<{ value: ClothingArea; label: string }> = [
  { value: "kit", label: "Kit" },
  { value: "articoli", label: "Articoli" },
  { value: "magazzino", label: "Magazzino" },
  { value: "assegnazioni", label: "Assegnazioni" },
  { value: "ordini", label: "Ordini fornitore" },
  { value: "numerazioni", label: "Numerazioni" },
];

export const isClothingArea = (value: unknown): value is ClothingArea =>
  CLOTHING_AREAS.some((area) => area.value === value);

/* ── Stati: specifiche locali finche `lib/web/status.ts` non le porta ───── */
const spec = (label: string, weight: StatusSpec["weight"], hue: StatusSpec["hue"]): StatusSpec =>
  Object.freeze({ label, weight, hue });

/** Catalogo e kit: «Attivo» / «Non attivo» della V1. */
export const CATALOG_STATUS = Object.freeze({
  active: PERSON_STATUS.active,
  inactive: spec("NON ATTIVO", "quiet", "neutral"),
});

/** Le dieci parole di `assignmentStatusLabels`, nel peso del sistema. */
export const ASSIGNMENT_STATUS: Record<ClothingAssignmentStatus, StatusSpec> = Object.freeze({
  reserved: spec("RISERVATO", "outline", "blue"),
  assigned: spec("ASSEGNATO", "solid", "blue"),
  ready: spec("PRONTO", "outline", "green"),
  delivered: spec("CONSEGNATO", "solid", "green"),
  to_order: spec("DA ORDINARE", "solid", "amber"),
  ordered: spec("ORDINATO", "outline", "amber"),
  in_production: spec("IN PRODUZIONE", "outline", "amber"),
  received: spec("RICEVUTO", "outline", "green"),
  unavailable: spec("NON DISPONIBILE", "outline", "amber"),
  cancelled: MONEY_STATUS.cancelled,
});

/** Lo stato **derivato** del kit (`KIT_DELIVERY_STATE_LABELS`). */
export const KIT_DELIVERY_STATUS: Record<KitDeliveryState, StatusSpec> = Object.freeze({
  to_prepare: spec("DA PREPARARE", "quiet", "neutral"),
  partial: spec("PARZIALE", "solid", "amber"),
  completed: spec("COMPLETATO", "solid", "green"),
});

/** I quattro stati operativi di un articolo assegnato (`CLOTHING_ITEM_STATE_LABELS`). */
export const ITEM_STATE_STATUS: Record<ClothingItemState, StatusSpec> = Object.freeze({
  to_prepare: spec("DA PREPARARE", "quiet", "neutral"),
  ready: spec("PRONTO", "outline", "green"),
  delivered: spec("CONSEGNATO", "solid", "green"),
  unavailable: spec("NON DISPONIBILE", "outline", "amber"),
});

/** Le sette parole di `inventoryStatusLabels` per un'unita singola. */
export const INVENTORY_STATUS: Record<InventoryUnitStatus, StatusSpec> = Object.freeze({
  available: spec("DISPONIBILE", "solid", "green"),
  reserved: spec("RISERVATO", "outline", "blue"),
  assigned: spec("ASSEGNATO", "solid", "blue"),
  delivered: spec("CONSEGNATO", "quiet", "neutral"),
  unavailable: spec("NON DISPONIBILE", "outline", "amber"),
  lost: spec("SMARRITO", "urgent", "red"),
  damaged: spec("DANNEGGIATO", "urgent", "red"),
});

/** Una riga di quantita generica non ha uno stato: la V1 scriveva «Quantita». */
export const BULK_STOCK_STATUS: StatusSpec = spec("QUANTITÀ", "quiet", "neutral");

export const inventoryStatusSpec = (stock: Pick<InventoryStock, "stockType" | "status">): StatusSpec =>
  stock.stockType === "bulk_quantity" ? BULK_STOCK_STATUS : INVENTORY_STATUS[stock.status || "available"] || INVENTORY_STATUS.available;

/* ── Etichette ─────────────────────────────────────────────────────────── */
export const NUMBER_MODE_LABELS: Record<ClothingNumberMode, string> = {
  none: "Senza numero",
  shared_by_kit: "Numero condiviso",
  per_item: "Numero per articolo",
};

export const STOCK_MODE_LABELS: Record<ClothingStockMode, string> = {
  single_unit: "Unità singola",
  bulk_quantity: "Quantità generica",
  both: "Entrambi",
};

export const SIZE_SOURCE_LABELS: Record<ClothingSizeSource, string> = {
  none: "Deduci dal tipo",
  shirt: "Taglia maglia",
  pants: "Taglia pantaloni",
  shoes: "Numero di scarpe",
  tracksuit: "Taglia tuta",
};

export const STOCK_TYPE_LABELS: Record<InventoryStock["stockType"], string> = {
  single_unit: "Unità singola",
  bulk_quantity: "Quantità",
};

export const SOURCE_LABELS: Record<ClothingAssignmentSource, string> = {
  inventory: "Magazzino",
  supplier_order: "Fornitore",
  manual: "Manuale",
};

/** Gli stati che si scelgono a mano su un'assegnazione (V1 `assignmentActionStatuses`). */
export const ASSIGNMENT_ACTION_STATUSES: ClothingAssignmentStatus[] = ["reserved", "assigned", "delivered", "cancelled"];

export const assignmentStatusLabel = (status: ClothingAssignmentStatus) => assignmentStatusLabels[status] || status;

/* ── Moduli ─────────────────────────────────────────────────────────────── */
export type ItemForm = {
  id?: string;
  name: string;
  type: string;
  description: string;
  code: string;
  sizes: string;
  colors: string;
  variants: string;
  requiresSize: boolean;
  requiresColor: boolean;
  requiresNumber: boolean;
  numberMode: ClothingNumberMode;
  stockMode: ClothingStockMode;
  sizeSource: ClothingSizeSource;
};

export type KitForm = {
  id?: string;
  name: string;
  description: string;
  numberingGroupId: string;
  numberMode: ClothingNumberMode;
  components: ClothingKitComponent[];
};

export type StockForm = {
  id?: string;
  stockType: "single_unit" | "bulk_quantity";
  itemId: string;
  size: string;
  color: string;
  variant: string;
  number: string;
  numberingGroupId: string;
  status: InventoryUnitStatus;
  quantityAvailable: string;
  notes: string;
};

export type AssignmentForm = {
  athleteId: string;
  targetType: "kit" | "item";
  kitId: string;
  itemId: string;
  source: ClothingAssignmentSource;
  status: ClothingAssignmentStatus;
  numberingGroupId: string;
  sharedNumber: string;
  components: Record<string, ClothingAssignmentComponentRequest>;
  notes: string;
};

export type AssignmentEditForm = {
  athleteId: string;
  status: ClothingAssignmentStatus;
  createdAt: string;
  notes: string;
};

export const emptyItemForm = (): ItemForm => ({
  name: "",
  type: "articolo",
  description: "",
  code: "",
  sizes: "",
  colors: "",
  variants: "",
  requiresSize: true,
  requiresColor: false,
  requiresNumber: false,
  numberMode: "none",
  stockMode: "both",
  sizeSource: "none",
});

export const itemFormFrom = (item: ClothingCatalogItem): ItemForm => ({
  id: item.id,
  name: item.name,
  type: item.type,
  description: item.description || "",
  code: item.code || "",
  sizes: item.sizes.join(", "),
  colors: item.colors.join(", "),
  variants: item.variants.join(", "),
  requiresSize: item.requiresSize,
  requiresColor: item.requiresColor,
  requiresNumber: item.requiresNumber,
  numberMode: item.numberMode,
  stockMode: item.stockMode,
  sizeSource: item.sizeSource,
});

export const emptyKitForm = (): KitForm => ({
  name: "",
  description: "",
  numberingGroupId: "",
  numberMode: "shared_by_kit",
  components: [],
});

export const emptyStockForm = (stockType: StockForm["stockType"] = "single_unit"): StockForm => ({
  stockType,
  itemId: "",
  size: "",
  color: "",
  variant: "",
  number: "",
  numberingGroupId: "",
  status: "available",
  quantityAvailable: "1",
  notes: "",
});

export const stockFormFrom = (stock: InventoryStock): StockForm => ({
  id: stock.id,
  stockType: stock.stockType,
  itemId: stock.itemId,
  size: stock.size || "",
  color: stock.color || "",
  variant: stock.variant || "",
  number: stock.number === null || stock.number === undefined ? "" : String(stock.number),
  numberingGroupId: stock.numberingGroupId || "",
  status: stock.status || "available",
  quantityAvailable: String(stock.quantityAvailable || 0),
  notes: stock.notes || "",
});

export const emptyAssignmentForm = (): AssignmentForm => ({
  athleteId: "",
  targetType: "kit",
  kitId: "",
  itemId: "",
  source: "inventory",
  status: "reserved",
  numberingGroupId: "",
  sharedNumber: "",
  components: {},
  notes: "",
});

/** «Assegna» dal magazzino: l'articolo e lo stock sono gia scelti, l'atleta no. */
export const assignmentFormFromStock = (stock: InventoryStock): AssignmentForm => ({
  ...emptyAssignmentForm(),
  targetType: "item",
  itemId: stock.itemId,
  source: "inventory",
  status: "reserved",
  numberingGroupId: stock.numberingGroupId || "",
  components: {
    [stock.itemId]: {
      itemId: stock.itemId,
      inventoryStockId: stock.id,
      size: stock.size || "",
      color: stock.color || "",
      variant: stock.variant || "",
      number: stock.number ?? null,
      numberingGroupId: stock.numberingGroupId || "",
    },
  },
});

/**
 * Gruppo numerazione vuoto (la V1 lo teneva in un'unica costante perche era
 * ripetuto tre volte). `reservedNumbers` e `assignedNumbers` non si editano.
 */
export const emptyNumberingGroup = (): NumberingGroup => ({
  id: "",
  name: "",
  categoryIds: [],
  includeCompatibleCategories: false,
  siteIds: [],
  season: "",
  minNumber: 0,
  maxNumber: 99,
  reservedNumbers: [],
  assignedNumbers: [],
});

export const assignmentEditFormFrom = (assignment: ClothingAssignment): AssignmentEditForm => ({
  athleteId: assignment.athleteId,
  status: assignment.status,
  createdAt: dateInputValue(assignment.createdAt),
  notes: assignment.notes || "",
});

/* ── Helper ─────────────────────────────────────────────────────────────── */
export const splitCsv = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export const newId = (prefix: string) =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${prefix}-${Date.now()}`;

/** La data di un campo `date` letta nel giorno **locale**, non in UTC (la V1 usava `toISOString`). */
export const dateInputValue = (value?: string | null) => {
  const date = parseDateInput(value);
  return date ? formatLocalDateOnly(date) : "";
};

export const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
};

export const athleteLabel = (athlete: any) => getAthleteDisplayName(athlete) || String(athlete?.id || "");

/**
 * **La categoria di un atleta si legge dalle appartenenze, non dalla colonna**
 * (ADR-0185). `athletes.category_name` e una cache che dopo una rinomina dice
 * ancora il nome vecchio («Pulcini - S. Cosma»): con il catalogo in mano la
 * primaria risolve al nome corrente. Senza catalogo resta la lettura di prima.
 */
export const getAthleteCategoryLabel = (
  athlete: any,
  categories: readonly { id?: string | null; name?: string | null }[] = [],
  /** L'indice canonico della pagina (ADR-0185): «Pulcini · Scauri» dove serve. */
  categoryLabel?: (reference: { categoryId: string; categoryName: string }) => string,
) => {
  const primaria = getPrimaryAthleteCategoryMembership(athlete, categories);
  if (primaria && categoryLabel) {
    return categoryLabel({ categoryId: primaria.categoryId, categoryName: primaria.categoryName });
  }
  return (
    primaria?.categoryName ||
    athlete?.category_name ||
    athlete?.data?.categoryName ||
    athlete?.data?.category ||
    athlete?.category ||
    "Senza categoria"
  );
};

/** L'identificativo della categoria primaria: la chiave con cui si filtra, mai l'etichetta. */
export const getAthletePrimaryCategoryId = (
  athlete: any,
  categories: readonly { id?: string | null; name?: string | null }[] = [],
) => getPrimaryAthleteCategoryMembership(athlete, categories)?.categoryId || "";

export const stockLabel = (stock: InventoryStock) => {
  const details = [stock.size, stock.color, stock.variant].filter(Boolean).join(" / ");
  if (stock.stockType === "single_unit") {
    return `${details || "Unità"}${stock.number !== null && stock.number !== undefined ? ` · n. ${stock.number}` : ""}`;
  }
  return `${details || "Quantità"} · disp. ${stock.quantityAvailable || 0}`;
};

/** Se lo stock si puo ancora assegnare (V1: pulsante «Assegna» disabilitato). */
export const isStockAssignable = (stock: InventoryStock) =>
  stock.stockType === "single_unit" ? (stock.status || "available") === "available" : (stock.quantityAvailable || 0) > 0;

export const supplierLabel = (
  assignment: ClothingAssignment,
  assignmentItem: ClothingAssignment["items"][number],
  catalogItem?: ClothingCatalogItem,
) =>
  firstText(
    (assignmentItem as any).supplier,
    (assignmentItem as any).supplierName,
    (assignmentItem as any).fornitore,
    (assignmentItem as any).data?.supplier,
    (assignmentItem as any).data?.fornitore,
    assignment.raw?.supplier,
    assignment.raw?.supplierName,
    assignment.raw?.fornitore,
    assignment.raw?.data?.supplier,
    assignment.raw?.data?.fornitore,
    catalogItem?.raw?.supplier,
    catalogItem?.raw?.supplierName,
    catalogItem?.raw?.fornitore,
    catalogItem?.raw?.data?.supplier,
    catalogItem?.raw?.data?.fornitore,
    "Non indicato",
  );

/** Le etichette dei numeri di un'assegnazione, una per articolo (o una sola senza articoli). */
export const assignmentNumberLabels = (assignment: ClothingAssignment, stockById: Map<string, InventoryStock>) =>
  assignment.items.length
    ? assignment.items.map((item) => ({
        id: item.id,
        label: getAssignmentNumberLabel(assignment, item.inventoryStockId ? stockById.get(item.inventoryStockId) : undefined, item),
      }))
    : [{ id: assignment.id, label: getAssignmentNumberLabel(assignment) }];

/* ── Ordini fornitore: una riga per articolo ────────────────────────────── */
export type SupplierOrderRow = SupplierOrderPdfRow & {
  assignment: ClothingAssignment;
  assignmentItem: ClothingAssignment["items"][number];
};

export const isSupplierAssignment = (assignment: ClothingAssignment) =>
  assignment.source === "supplier_order" || supplierOrderStatuses.includes(assignment.status);

export const buildSupplierOrderRows = ({
  assignments,
  athletesById,
  itemById,
  stockById,
}: {
  assignments: ClothingAssignment[];
  athletesById: Map<string, any>;
  itemById: Map<string, ClothingCatalogItem>;
  stockById: Map<string, InventoryStock>;
}): SupplierOrderRow[] =>
  assignments.flatMap((assignment) => {
    const athlete = athletesById.get(assignment.athleteId);
    const athleteName = athleteLabel(athlete);
    const categoryName = getAthleteCategoryLabel(athlete);

    return assignment.items.map((assignmentItem, index) => {
      const stock = assignmentItem.inventoryStockId ? stockById.get(assignmentItem.inventoryStockId) : undefined;
      const catalogItem = itemById.get(assignmentItem.itemId);

      return {
        id: `${assignment.id}:${assignmentItem.id || index}`,
        assignment,
        assignmentItem,
        itemName: assignmentItem.name || catalogItem?.name || assignment.kitName || "Articolo",
        itemType: catalogItem?.type || assignmentItem.stockType || "-",
        size: assignmentItem.size || assignment.size || "",
        color: assignmentItem.color || assignment.color || "",
        variant: assignmentItem.variant || assignment.variant || "",
        numberLabel: getAssignmentNumberLabel(assignment, stock, assignmentItem),
        quantity: Math.max(1, Number(assignmentItem.quantity || 1)),
        supplier: supplierLabel(assignment, assignmentItem, catalogItem),
        notes: firstText(assignmentItem.notes, assignment.notes),
        status: assignmentStatusLabels[assignmentItem.status] || assignmentStatusLabels[assignment.status],
        athleteName,
        categoryName,
      };
    });
  });
