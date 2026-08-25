import { normalizeAthleteCategoryMemberships } from "@/lib/athlete-category-memberships";
import { athleteMatchesCategory, resolveCategoryLabel } from "@/lib/category-utils";

export type ClothingNumberMode = "none" | "shared_by_kit" | "per_item";
export type ClothingStockMode = "single_unit" | "bulk_quantity" | "both";
export type InventoryUnitStatus =
  | "available"
  | "reserved"
  | "assigned"
  | "delivered"
  | "unavailable"
  | "lost"
  | "damaged";
export type ClothingAssignmentSource = "inventory" | "supplier_order" | "manual";
/**
 * Stato di un articolo assegnato.
 *
 * Gli stati operativi che l'utente vede sono quattro — DA PREPARARE, PRONTO,
 * CONSEGNATO, NON DISPONIBILE — e la mappatura sta in
 * `@/lib/clothing-delivery`. Qui restano tutti gli stati del ciclo, compresi
 * quelli dell'ordine al fornitore, perche il magazzino distingue «da ordinare»
 * da «ordinato» anche quando la segreteria vede solo «da preparare».
 */
export type ClothingAssignmentStatus =
  | "reserved"
  | "assigned"
  | "ready"
  | "delivered"
  | "to_order"
  | "ordered"
  | "in_production"
  | "received"
  | "unavailable"
  | "cancelled";

export type ClothingCatalogItem = {
  id: string;
  name: string;
  type: string;
  description?: string;
  code?: string;
  sizes: string[];
  colors: string[];
  variants: string[];
  compatibleCategoryIds: string[];
  requiresSize: boolean;
  requiresColor: boolean;
  requiresNumber: boolean;
  numberMode: ClothingNumberMode;
  stockMode: ClothingStockMode;
  /**
   * Quale taglia dell'anagrafica proporre per questo articolo. Configurata
   * sull'articolo, con un ripiego sul tipo quando non c'e — vedi
   * `resolveItemSizeSource` in `@/lib/clothing-delivery`.
   */
  sizeSource: ClothingSizeSource;
  active: boolean;
  raw?: any;
};

/** Campo dell'anagrafica taglie da cui un articolo prende la sua. */
export type ClothingSizeSource = "shirt" | "pants" | "shoes" | "none";

export type ClothingKitComponent = {
  itemId: string;
  name?: string;
  required: boolean;
  defaultSizeSource?: string;
  requiresNumberOverride?: boolean | null;
  sharedKitNumber: boolean;
};

export type ClothingKit = {
  id: string;
  name: string;
  description?: string;
  season?: string;
  compatibleCategoryIds: string[];
  numberingGroupId?: string | null;
  numberMode: ClothingNumberMode;
  components: ClothingKitComponent[];
  active: boolean;
  raw?: any;
};

export type InventoryStock = {
  id: string;
  stockType: "single_unit" | "bulk_quantity";
  itemId: string;
  kitId?: string | null;
  size?: string;
  color?: string;
  variant?: string;
  number?: number | null;
  numberingGroupId?: string | null;
  status?: InventoryUnitStatus;
  athleteId?: string | null;
  assignmentId?: string | null;
  quantityAvailable?: number;
  quantityReserved?: number;
  quantityAssigned?: number;
  notes?: string;
  raw?: any;
};

export type NumberingGroup = {
  id: string;
  name: string;
  categoryIds: string[];
  /**
   * Se true il gruppo accoglie anche gli atleti che le sue categorie
   * dichiarano compatibili (vedi `category-compatibility`). Resta false di
   * default: l'eleggibilita non e un'appartenenza e va richiesta.
   */
  includeCompatibleCategories: boolean;
  /**
   * Sedi a cui il gruppo si restringe. Vuoto significa **tutte le sedi**, che
   * e anche il comportamento di ogni gruppo esistente: la numerazione non
   * cambia per un club mono-sede. Serve al club che numera separatamente le
   * squadre di due citta — «Pulcini · Roma» dal 1 al 20, «Pulcini · Aprilia»
   * dal 1 al 20, senza che i due si vedano occupati a vicenda (ADR-0038).
   */
  siteIds: string[];
  season?: string;
  minNumber: number;
  maxNumber: number;
  reservedNumbers: number[];
  assignedNumbers: number[];
  raw?: any;
};

export type JerseyNumberAssignment = {
  id: string;
  athleteId: string;
  groupId: string | null;
  number: number | null;
  assignmentId?: string | null;
  itemId?: string | null;
  kitId?: string | null;
  updatedAt?: string;
  raw?: any;
};

export type ClothingAssignmentItem = {
  id: string;
  itemId: string;
  name: string;
  inventoryStockId?: string | null;
  stockType?: "single_unit" | "bulk_quantity" | null;
  source: ClothingAssignmentSource;
  size?: string;
  color?: string;
  variant?: string;
  number?: number | null;
  numberingGroupId?: string | null;
  quantity: number;
  status: ClothingAssignmentStatus;
  personalization?: string;
  delivered?: boolean;
  deliveredAt?: string | null;
  notes?: string;
};

export type ClothingAssignment = {
  id: string;
  organizationId?: string;
  athleteId: string;
  assigneeId: string;
  assigneeType: "athlete" | "staff" | "member";
  kitId?: string | null;
  kitName?: string | null;
  itemId?: string | null;
  source: ClothingAssignmentSource;
  size?: string;
  color?: string;
  variant?: string;
  number?: number | null;
  numberingGroupId?: string | null;
  status: ClothingAssignmentStatus;
  supplierOrderId?: string | null;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  items: ClothingAssignmentItem[];
  raw?: any;
};

export type ClothingState = {
  items: ClothingCatalogItem[];
  kits: ClothingKit[];
  inventory: InventoryStock[];
  assignments: ClothingAssignment[];
  numberingGroups: NumberingGroup[];
  jerseyAssignments: JerseyNumberAssignment[];
};

export type ClothingAssignmentComponentRequest = {
  itemId: string;
  inventoryStockId?: string | null;
  size?: string;
  color?: string;
  variant?: string;
  number?: number | string | null;
  numberingGroupId?: string | null;
  quantity?: number;
  personalization?: string;
  notes?: string;
};

export type ClothingAssignmentRequest = {
  organizationId?: string;
  athleteId: string;
  kitId?: string | null;
  itemId?: string | null;
  source: ClothingAssignmentSource;
  status?: ClothingAssignmentStatus;
  numberingGroupId?: string | null;
  sharedNumber?: number | string | null;
  components: ClothingAssignmentComponentRequest[];
  notes?: string;
};

const AVAILABLE_STOCK_STATUSES = new Set(["available"]);
const ACTIVE_ASSIGNMENT_STATUSES = new Set([
  "reserved",
  "assigned",
  "ready",
  "unavailable",
  "delivered",
  "to_order",
  "ordered",
  "in_production",
  "received",
]);

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    const candidate = String(value || "").trim();
    if (candidate) {
      return candidate;
    }
  }

  return "";
};

const makeId = (prefix: string) => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const normalizeToken = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const normalizeList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .flatMap((entry) => normalizeList(entry))
          .map((entry) => String(entry || "").trim())
          .filter(Boolean),
      ),
    );
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, any>;
    return [
      firstString(
        record.id,
        record.value,
        record.name,
        record.label,
        record.title,
        record.categoryId,
        record.category_id,
      ),
    ].filter(Boolean);
  }

  return [];
};

const toNumber = (value: unknown, fallback = 0) => {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Elenco di numeri tollerante alle forme in cui puo essere salvato: array di
 * numeri, array di stringhe, stringa separata da virgole.
 *
 * Serviva un normalizzatore dedicato: `normalizeList` tratta solo array,
 * stringhe e oggetti, quindi un `[10, 12]` gia numerico usciva vuoto e i
 * numeri riservati di un gruppo sparivano al ricaricamento della pagina.
 */
const normalizeNumberList = (value: unknown): number[] => {
  const collect = (entry: unknown): number[] => {
    if (Array.isArray(entry)) {
      return entry.flatMap(collect);
    }

    if (typeof entry === "string") {
      // Le parti si convertono qui, senza ricorsione: una stringa che non
      // contiene virgole si ridarebbe a se stessa all'infinito.
      return entry
        .split(",")
        .map((part) => toOptionalNumber(part.trim()))
        .filter((value): value is number => value !== null);
    }

    const parsed = toOptionalNumber(entry);
    return parsed === null ? [] : [parsed];
  };

  return Array.from(new Set(collect(value)));
};

const toOptionalNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const firstNumberValue = (...values: unknown[]) => {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }

  return null;
};

export function getAssignmentNumberLabel(
  assignment: any,
  stock?: any,
  item?: any,
): string {
  const assignmentData =
    assignment?.data && typeof assignment.data === "object" ? assignment.data : {};
  const assignmentRaw =
    assignment?.raw && typeof assignment.raw === "object" ? assignment.raw : {};
  const assignmentRawData =
    assignmentRaw?.data && typeof assignmentRaw.data === "object"
      ? assignmentRaw.data
      : {};
  const stockData = stock?.data && typeof stock.data === "object" ? stock.data : {};
  const stockRaw = stock?.raw && typeof stock.raw === "object" ? stock.raw : {};
  const stockRawData =
    stockRaw?.data && typeof stockRaw.data === "object" ? stockRaw.data : {};
  const itemData = item?.data && typeof item.data === "object" ? item.data : {};
  const itemRaw = item?.raw && typeof item.raw === "object" ? item.raw : {};
  const itemRawData =
    itemRaw?.data && typeof itemRaw.data === "object" ? itemRaw.data : {};

  const value = firstNumberValue(
    assignment?.number,
    assignment?.itemNumber,
    assignment?.shirtNumber,
    assignment?.jerseyNumber,
    assignment?.assignedNumber,
    assignment?.uniformNumber,
    assignment?.numero,
    assignmentData.number,
    assignmentData.numero,
    assignmentRaw.number,
    assignmentRaw.itemNumber,
    assignmentRaw.shirtNumber,
    assignmentRaw.jerseyNumber,
    assignmentRaw.assignedNumber,
    assignmentRaw.uniformNumber,
    assignmentRaw.numero,
    assignmentRawData.number,
    assignmentRawData.numero,
    stock?.number,
    stock?.itemNumber,
    stock?.shirtNumber,
    stock?.jerseyNumber,
    stock?.assignedNumber,
    stock?.uniformNumber,
    stock?.numero,
    stockData.number,
    stockData.numero,
    stockRaw.number,
    stockRaw.itemNumber,
    stockRaw.shirtNumber,
    stockRaw.jerseyNumber,
    stockRaw.assignedNumber,
    stockRaw.uniformNumber,
    stockRaw.numero,
    stockRawData.number,
    stockRawData.numero,
    item?.number,
    item?.itemNumber,
    item?.shirtNumber,
    item?.jerseyNumber,
    item?.assignedNumber,
    item?.uniformNumber,
    item?.numero,
    itemData.number,
    itemData.numero,
    itemRaw.number,
    itemRaw.itemNumber,
    itemRaw.shirtNumber,
    itemRaw.jerseyNumber,
    itemRaw.assignedNumber,
    itemRaw.uniformNumber,
    itemRaw.numero,
    itemRawData.number,
    itemRawData.numero,
  );

  if (value === null) {
    return "Senza numero";
  }

  return String(value);
}

const normalizeNumberMode = (value: unknown, requiresNumber = false) => {
  const token = normalizeToken(value);
  if (["shared_by_kit", "shared", "kit"].includes(token)) {
    return "shared_by_kit" as const;
  }
  if (["per_item", "item", "article"].includes(token)) {
    return "per_item" as const;
  }
  if (["none", "no", "false"].includes(token)) {
    return "none" as const;
  }
  return requiresNumber ? ("per_item" as const) : ("none" as const);
};

const normalizeStockMode = (value: unknown, fallback: ClothingStockMode) => {
  const token = normalizeToken(value);
  if (["single_unit", "unit", "single"].includes(token)) {
    return "single_unit" as const;
  }
  if (["bulk_quantity", "bulk", "quantity"].includes(token)) {
    return "bulk_quantity" as const;
  }
  if (["both", "mixed"].includes(token)) {
    return "both" as const;
  }
  return fallback;
};

const SIZE_SOURCES = new Set(["shirt", "pants", "shoes", "none"]);

/**
 * Legge la configurazione esplicita, senza inventarla. La deduzione dal tipo
 * dell'articolo esiste, ma sta in `clothing-delivery`: qui si normalizza solo
 * cio che l'utente ha scritto, e stringa vuota significa «non configurato».
 */
const normalizeSizeSource = (value: unknown): ClothingSizeSource => {
  const token = normalizeToken(value);
  return SIZE_SOURCES.has(token) ? (token as ClothingSizeSource) : "none";
};

const itemName = (item: any) =>
  firstString(item?.name, item?.title, item?.label, item?.code, "Articolo");

export const normalizeClothingItem = (item: any): ClothingCatalogItem => {
  const requiresNumber = Boolean(
    item?.requiresNumber ?? item?.requires_number ?? item?.numberRequired,
  );
  const id = firstString(item?.id, item?.itemId, item?.productId, item?.code);

  return {
    id: id || makeId("item"),
    name: itemName(item),
    type: firstString(item?.type, item?.category, "articolo"),
    description: firstString(item?.description),
    code: firstString(item?.code, item?.sku),
    sizes: normalizeList(item?.sizes ?? item?.taglie ?? item?.sizeOptions),
    colors: normalizeList(item?.colors ?? item?.colori ?? item?.colorOptions),
    variants: normalizeList(item?.variants ?? item?.varianti),
    compatibleCategoryIds: normalizeList(
      item?.compatibleCategoryIds ??
        item?.compatible_category_ids ??
        item?.categoryIds ??
        item?.categories,
    ),
    requiresSize: Boolean(
      item?.requiresSize ??
        item?.requires_size ??
        normalizeList(item?.sizes ?? item?.taglie).length,
    ),
    requiresColor: Boolean(
      item?.requiresColor ??
        item?.requires_color ??
        normalizeList(item?.colors ?? item?.colori).length,
    ),
    requiresNumber,
    numberMode: normalizeNumberMode(item?.numberMode ?? item?.number_mode, requiresNumber),
    stockMode: normalizeStockMode(
      item?.stockMode ?? item?.stock_mode,
      item?.qty !== undefined ? "bulk_quantity" : "both",
    ),
    sizeSource: normalizeSizeSource(item?.sizeSource ?? item?.size_source),
    active: item?.active === false ? false : true,
    raw: item,
  };
};

const normalizeKitComponent = (
  component: any,
  itemLookup: Map<string, ClothingCatalogItem>,
): ClothingKitComponent | null => {
  if (typeof component === "string") {
    const matched = Array.from(itemLookup.values()).find(
      (item) => normalizeToken(item.name) === normalizeToken(component),
    );
    return {
      itemId: matched?.id || component,
      name: matched?.name || component,
      required: true,
      defaultSizeSource: "athlete",
      requiresNumberOverride: null,
      sharedKitNumber: true,
    };
  }

  if (!component || typeof component !== "object") {
    return null;
  }

  const itemId = firstString(
    component.itemId,
    component.item_id,
    component.productId,
    component.product_id,
    component.id,
    component.name,
  );

  if (!itemId) {
    return null;
  }

  const matched =
    itemLookup.get(itemId) ||
    Array.from(itemLookup.values()).find(
      (item) =>
        normalizeToken(item.name) === normalizeToken(component.name) ||
        normalizeToken(item.code) === normalizeToken(component.code),
    );

  return {
    itemId: matched?.id || itemId,
    name: firstString(component.name, component.title, matched?.name, itemId),
    required: component.required === false ? false : true,
    defaultSizeSource: firstString(component.defaultSizeSource, component.sizeSource, "athlete"),
    requiresNumberOverride:
      component.requiresNumberOverride === undefined
        ? null
        : Boolean(component.requiresNumberOverride),
    sharedKitNumber: component.sharedKitNumber === false ? false : true,
  };
};

export const normalizeClothingKit = (
  kit: any,
  items: ClothingCatalogItem[] = [],
): ClothingKit => {
  const itemLookup = new Map(items.map((item) => [item.id, item]));
  const components = asArray(kit?.components)
    .map((component) => normalizeKitComponent(component, itemLookup))
    .filter(Boolean) as ClothingKitComponent[];
  const requiresNumber = components.some((component) => {
    const item = itemLookup.get(component.itemId);
    return component.requiresNumberOverride ?? item?.requiresNumber ?? false;
  });

  return {
    id: firstString(kit?.id, kit?.kitId) || makeId("kit"),
    name: firstString(kit?.name, kit?.title, "Kit"),
    description: firstString(kit?.description),
    season: firstString(kit?.season),
    compatibleCategoryIds: normalizeList(
      kit?.compatibleCategoryIds ??
        kit?.compatible_category_ids ??
        kit?.categoryIds ??
        kit?.categories,
    ),
    numberingGroupId:
      firstString(kit?.numberingGroupId, kit?.numbering_group_id, kit?.groupId) ||
      null,
    numberMode: normalizeNumberMode(kit?.numberMode ?? kit?.number_mode, requiresNumber),
    components,
    active: kit?.active === false ? false : true,
    raw: kit,
  };
};

export const normalizeInventoryStock = (stock: any): InventoryStock => {
  const itemId = firstString(stock?.itemId, stock?.item_id, stock?.productId);
  const hasBulkQty =
    stock?.stockType === "bulk_quantity" ||
    stock?.type === "bulk_quantity" ||
    stock?.quantityAvailable !== undefined ||
    stock?.quantity_available !== undefined ||
    stock?.qty !== undefined;
  const id =
    firstString(stock?.id, stock?.stockId) ||
    `${hasBulkQty ? "bulk" : "unit"}:${itemId || makeId("stock")}`;

  if (hasBulkQty) {
    const quantityAvailable = Math.max(
      0,
      toNumber(
        stock?.quantityAvailable ?? stock?.quantity_available ?? stock?.qty,
        0,
      ),
    );

    return {
      id,
      stockType: "bulk_quantity",
      itemId,
      size: firstString(stock?.size, stock?.taglia),
      color: firstString(stock?.color, stock?.colore),
      variant: firstString(stock?.variant, stock?.variante),
      quantityAvailable,
      quantityReserved: Math.max(
        0,
        toNumber(stock?.quantityReserved ?? stock?.quantity_reserved, 0),
      ),
      quantityAssigned: Math.max(
        0,
        toNumber(stock?.quantityAssigned ?? stock?.quantity_assigned, 0),
      ),
      notes: firstString(stock?.notes, stock?.note),
      raw: stock,
    };
  }

  return {
    id,
    stockType: "single_unit",
    itemId,
    kitId: firstString(stock?.kitId, stock?.kit_id) || null,
    size: firstString(stock?.size, stock?.taglia),
    color: firstString(stock?.color, stock?.colore),
    variant: firstString(stock?.variant, stock?.variante),
    number: toOptionalNumber(
      firstNumberValue(
        stock?.number,
        stock?.itemNumber,
        stock?.shirtNumber,
        stock?.jerseyNumber,
        stock?.assignedNumber,
        stock?.uniformNumber,
        stock?.numero,
        stock?.data?.number,
        stock?.data?.numero,
      ),
    ),
    numberingGroupId:
      firstString(stock?.numberingGroupId, stock?.numbering_group_id, stock?.groupId) ||
      null,
    status:
      (firstString(stock?.status, "available") as InventoryUnitStatus) ||
      "available",
    athleteId: firstString(stock?.athleteId, stock?.athlete_id) || null,
    assignmentId:
      firstString(stock?.assignmentId, stock?.assignment_id) || null,
    notes: firstString(stock?.notes, stock?.note),
    raw: stock,
  };
};

export const normalizeNumberingGroup = (group: any): NumberingGroup => ({
  id: firstString(group?.id, group?.groupId) || makeId("group"),
  name: firstString(group?.name, group?.title, "Gruppo numerazione"),
  categoryIds: normalizeList(group?.categoryIds ?? group?.categories),
  includeCompatibleCategories: Boolean(
    group?.includeCompatibleCategories ??
      group?.include_compatible_categories ??
      group?.includeCompatible,
  ),
  siteIds: normalizeList(group?.siteIds ?? group?.site_ids ?? group?.sites),
  season: firstString(group?.season),
  minNumber: toNumber(group?.minNumber ?? group?.min_number, 0),
  maxNumber: toNumber(group?.maxNumber ?? group?.max_number, 99),
  reservedNumbers: normalizeNumberList(
    group?.reservedNumbers ?? group?.reserved_numbers,
  ),
  assignedNumbers: normalizeNumberList(
    group?.assignedNumbers ?? group?.assigned_numbers,
  ),
  raw: group,
});

export const normalizeJerseyNumberAssignment = (
  assignment: any,
): JerseyNumberAssignment => ({
  id:
    firstString(assignment?.id) ||
    [
      "jersey",
      firstString(assignment?.athleteId, assignment?.athlete_id),
      firstString(assignment?.groupId, assignment?.group_id, "global"),
      firstString(assignment?.itemId, assignment?.item_id, "kit"),
    ].join(":"),
  athleteId: firstString(assignment?.athleteId, assignment?.athlete_id),
  groupId: firstString(assignment?.groupId, assignment?.group_id) || null,
  number: toOptionalNumber(
    firstNumberValue(
      assignment?.number,
      assignment?.itemNumber,
      assignment?.shirtNumber,
      assignment?.jerseyNumber,
      assignment?.assignedNumber,
      assignment?.uniformNumber,
      assignment?.numero,
      assignment?.data?.number,
      assignment?.data?.numero,
    ),
  ),
  assignmentId:
    firstString(assignment?.assignmentId, assignment?.assignment_id) || null,
  itemId: firstString(assignment?.itemId, assignment?.item_id) || null,
  kitId: firstString(assignment?.kitId, assignment?.kit_id) || null,
  updatedAt: firstString(assignment?.updatedAt, assignment?.updated_at),
  raw: assignment,
});

export const normalizeClothingAssignment = (
  assignment: any,
  items: ClothingCatalogItem[] = [],
): ClothingAssignment => {
  const itemLookup = new Map(items.map((item) => [item.id, item]));
  const sourceItems =
    Array.isArray(assignment?.items) && assignment.items.length > 0
      ? assignment.items
      : Array.isArray(assignment?.components)
        ? assignment.components
        : [];
  const createdAt = firstString(
    assignment?.createdAt,
    assignment?.created_at,
    assignment?.date,
    new Date().toISOString(),
  );
  const status = normalizeAssignmentStatus(assignment?.status);
  const source =
    normalizeToken(assignment?.source) === "supplier_order"
      ? "supplier_order"
      : normalizeToken(assignment?.source) === "inventory"
        ? "inventory"
        : "manual";
  const assignmentId = firstString(assignment?.id) || makeId("assignment");
  const normalizedItems = sourceItems
    .map((entry: any, index: number) => {
      const rawName =
        entry && typeof entry === "object" ? entry.name || entry.title : entry;
      const itemId = firstString(
        entry?.itemId,
        entry?.item_id,
        entry?.productId,
        entry?.product_id,
        entry?.id,
        rawName,
      );
      const matched =
        itemLookup.get(itemId) ||
        Array.from(itemLookup.values()).find(
          (item) => normalizeToken(item.name) === normalizeToken(rawName),
        );
      const itemStatus = normalizeAssignmentStatus(entry?.status || status);

      return {
        id: firstString(entry?.id, `${assignmentId}:item:${index}`),
        itemId: matched?.id || itemId,
        name: firstString(rawName, matched?.name, itemId, "Articolo"),
        inventoryStockId:
          firstString(entry?.inventoryStockId, entry?.inventory_stock_id, entry?.stockId) ||
          null,
        stockType: entry?.stockType || entry?.stock_type || null,
        source,
        size: firstString(entry?.size, entry?.taglia),
        color: firstString(entry?.color, entry?.colore),
        variant: firstString(entry?.variant, entry?.variante),
        number: toOptionalNumber(
          firstNumberValue(
            entry?.number,
            entry?.itemNumber,
            entry?.shirtNumber,
            entry?.jerseyNumber,
            entry?.assignedNumber,
            entry?.uniformNumber,
            entry?.numero,
            entry?.data?.number,
            entry?.data?.numero,
          ),
        ),
        numberingGroupId:
          firstString(entry?.numberingGroupId, entry?.numbering_group_id, entry?.groupId) ||
          null,
        quantity: Math.max(1, toNumber(entry?.quantity, 1)),
        status: itemStatus,
        personalization: firstString(entry?.personalization),
        delivered: Boolean(
          entry?.delivered ||
            itemStatus === "delivered" ||
            itemStatus === "received",
        ),
        deliveredAt: firstString(entry?.deliveredAt, entry?.delivered_at) || null,
        notes: firstString(entry?.notes, entry?.note),
      } satisfies ClothingAssignmentItem;
    })
    .filter((item: ClothingAssignmentItem) => item.itemId || item.name);

  return {
    id: assignmentId,
    organizationId: firstString(assignment?.organizationId, assignment?.organization_id),
    athleteId: firstString(assignment?.athleteId, assignment?.assigneeId),
    assigneeId: firstString(assignment?.assigneeId, assignment?.athleteId),
    assigneeType: (assignment?.assigneeType as "athlete" | "staff" | "member") ||
      (assignment?.athleteId ? "athlete" : "member"),
    kitId: firstString(assignment?.kitId, assignment?.kit_id) || null,
    kitName: firstString(assignment?.kitName, assignment?.kit_name) || null,
    itemId: firstString(assignment?.itemId, assignment?.item_id) || null,
    source,
    size: firstString(assignment?.size),
    color: firstString(assignment?.color),
    variant: firstString(assignment?.variant),
    number: toOptionalNumber(
      firstNumberValue(
        assignment?.number,
        assignment?.itemNumber,
        assignment?.shirtNumber,
        assignment?.jerseyNumber,
        assignment?.assignedNumber,
        assignment?.uniformNumber,
        assignment?.numero,
        assignment?.data?.number,
        assignment?.data?.numero,
      ),
    ),
    numberingGroupId:
      firstString(assignment?.numberingGroupId, assignment?.numbering_group_id, assignment?.groupId) ||
      null,
    status,
    supplierOrderId:
      firstString(assignment?.supplierOrderId, assignment?.supplier_order_id) ||
      null,
    notes: firstString(assignment?.notes, assignment?.note),
    createdAt,
    updatedAt: firstString(assignment?.updatedAt, assignment?.updated_at),
    items: normalizedItems,
    raw: assignment,
  };
};

export const normalizeAssignmentStatus = (
  value: unknown,
): ClothingAssignmentStatus => {
  const token = normalizeToken(value);
  if (
    [
      "reserved",
      "assigned",
      "ready",
      "delivered",
      "to_order",
      "ordered",
      "in_production",
      "received",
      "unavailable",
      "cancelled",
    ].includes(token)
  ) {
    return token as ClothingAssignmentStatus;
  }
  if (["completed", "complete", "consegnato"].includes(token)) {
    return "delivered";
  }
  if (["pronto", "ready_to_deliver", "prepared"].includes(token)) {
    return "ready";
  }
  if (["not_available", "out_of_stock", "non_disponibile"].includes(token)) {
    return "unavailable";
  }
  return "assigned";
};

export const normalizeClubClothingState = ({
  products,
  kits,
  inventory,
  assignments,
  jerseyGroups,
  jerseyAssignments,
}: {
  products?: any[];
  kits?: any[];
  inventory?: any[];
  assignments?: any[];
  jerseyGroups?: any[];
  jerseyAssignments?: any[];
}): ClothingState => {
  const items = asArray(products).map(normalizeClothingItem);
  const normalizedKits = asArray(kits).map((kit) =>
    normalizeClothingKit(kit, items),
  );

  return {
    items,
    kits: normalizedKits,
    inventory: asArray(inventory).map(normalizeInventoryStock),
    assignments: asArray(assignments).map((assignment) =>
      normalizeClothingAssignment(assignment, items),
    ),
    numberingGroups: asArray(jerseyGroups).map(normalizeNumberingGroup),
    jerseyAssignments: asArray(jerseyAssignments).map(
      normalizeJerseyNumberAssignment,
    ),
  };
};

export const serializeClothingItem = (item: ClothingCatalogItem) => ({
  ...item.raw,
  id: item.id,
  name: item.name,
  title: item.name,
  type: item.type,
  sizeSource: item.sizeSource,
  description: item.description || "",
  code: item.code || "",
  sizes: item.sizes,
  colors: item.colors,
  variants: item.variants,
  compatibleCategoryIds: item.compatibleCategoryIds,
  requiresSize: item.requiresSize,
  requiresColor: item.requiresColor,
  requiresNumber: item.requiresNumber,
  numberMode: item.numberMode,
  stockMode: item.stockMode,
  active: item.active,
});

export const serializeClothingKit = (kit: ClothingKit) => ({
  ...kit.raw,
  id: kit.id,
  name: kit.name,
  description: kit.description || "",
  season: kit.season || "",
  compatibleCategoryIds: kit.compatibleCategoryIds,
  numberingGroupId: kit.numberingGroupId || null,
  numberMode: kit.numberMode,
  components: kit.components,
  active: kit.active,
});

export const serializeInventoryStock = (stock: InventoryStock) => ({
  ...stock.raw,
  id: stock.id,
  stockType: stock.stockType,
  itemId: stock.itemId,
  productId: stock.itemId,
  kitId: stock.kitId || null,
  size: stock.size || "",
  color: stock.color || "",
  variant: stock.variant || "",
  number: stock.number ?? null,
  numberingGroupId: stock.numberingGroupId || null,
  status: stock.status || "available",
  athleteId: stock.athleteId || null,
  assignmentId: stock.assignmentId || null,
  quantityAvailable: Math.max(0, toNumber(stock.quantityAvailable, 0)),
  quantityReserved: Math.max(0, toNumber(stock.quantityReserved, 0)),
  quantityAssigned: Math.max(0, toNumber(stock.quantityAssigned, 0)),
  qty:
    stock.stockType === "bulk_quantity"
      ? Math.max(0, toNumber(stock.quantityAvailable, 0))
      : undefined,
  notes: stock.notes || "",
});

export const serializeNumberingGroup = (group: NumberingGroup) => ({
  ...group.raw,
  id: group.id,
  name: group.name,
  categories: group.categoryIds,
  categoryIds: group.categoryIds,
  includeCompatibleCategories: group.includeCompatibleCategories,
  siteIds: group.siteIds,
  season: group.season || "",
  minNumber: group.minNumber,
  maxNumber: group.maxNumber,
  reservedNumbers: group.reservedNumbers,
  assignedNumbers: group.assignedNumbers,
});

export const serializeJerseyNumberAssignment = (
  assignment: JerseyNumberAssignment,
) => ({
  ...assignment.raw,
  id: assignment.id,
  athleteId: assignment.athleteId,
  groupId: assignment.groupId,
  number: assignment.number,
  assignmentId: assignment.assignmentId || null,
  itemId: assignment.itemId || null,
  kitId: assignment.kitId || null,
  updatedAt: assignment.updatedAt || new Date().toISOString(),
});

export const serializeClothingAssignment = (assignment: ClothingAssignment) => ({
  ...assignment.raw,
  id: assignment.id,
  organizationId: assignment.organizationId,
  athleteId: assignment.athleteId,
  assigneeId: assignment.assigneeId || assignment.athleteId,
  assigneeType: assignment.assigneeType || "athlete",
  kitId: assignment.kitId || null,
  kitName: assignment.kitName || null,
  itemId: assignment.itemId || null,
  source: assignment.source,
  size: assignment.size || "",
  color: assignment.color || "",
  variant: assignment.variant || "",
  number: assignment.number ?? null,
  numberingGroupId: assignment.numberingGroupId || null,
  status: assignment.status,
  supplierOrderId: assignment.supplierOrderId || null,
  notes: assignment.notes || "",
  createdAt: assignment.createdAt,
  updatedAt: assignment.updatedAt || new Date().toISOString(),
  items: assignment.items,
});

export const getAthleteClothingProfile = (athlete: any) => {
  const data = athlete?.data && typeof athlete.data === "object" ? athlete.data : {};
  const clothingSizes =
    data.clothingSizes && typeof data.clothingSizes === "object"
      ? data.clothingSizes
      : {};
  const memberships = normalizeAthleteCategoryMemberships(athlete);
  const categoryIds = new Set<string>();

  memberships.forEach((membership) => {
    if (membership.categoryId) categoryIds.add(membership.categoryId);
    if (membership.categoryName) categoryIds.add(membership.categoryName);
  });

  [
    athlete?.category_id,
    athlete?.category_name,
    data.category,
    data.categoryName,
    data.category_id,
    data.categoryId,
  ].forEach((value) => {
    const normalized = firstString(value);
    if (normalized) categoryIds.add(normalized);
  });

  return {
    athleteId: firstString(athlete?.id, athlete?.athleteId, athlete?.athlete_id),
    categoryIds: Array.from(categoryIds),
    categoryLabels: Array.from(categoryIds),
    sizes: {
      profile: firstString(clothingSizes.profile),
      shirtSize: firstString(
        clothingSizes.shirtSize,
        data.shirtSize,
        data.size,
      ),
      pantsSize: firstString(clothingSizes.pantsSize, data.shortsSize),
      shoeSize: firstString(clothingSizes.shoeSize, data.shoeSize),
      tracksuitSize: firstString(
        clothingSizes.tracksuitSize,
        data.tracksuitSize,
      ),
    },
  };
};

const categoryCompatible = (
  compatibleCategoryIds: string[],
  athlete: any,
  categories: Array<{ id?: string | null; name?: string | null }> = [],
) => {
  if (!compatibleCategoryIds.length) {
    return true;
  }

  return compatibleCategoryIds.some((categoryId) =>
    athleteMatchesCategory(athlete, {
      id: categoryId,
      name: resolveCategoryLabel(categoryId, categories),
    }),
  );
};

export const getCompatibleClothingItemsForAthlete = ({
  athlete,
  items,
  categories = [],
}: {
  athlete: any;
  items: ClothingCatalogItem[];
  categories?: Array<{ id?: string | null; name?: string | null }>;
}) =>
  items
    .filter((item) => item.active)
    .map((item) => {
      const compatible = categoryCompatible(
        item.compatibleCategoryIds,
        athlete,
        categories,
      );
      return {
        item,
        compatible,
        reason: compatible ? "" : "Categoria non compatibile",
      };
    });

export const getCompatibleKitsForAthlete = ({
  athlete,
  kits,
  categories = [],
}: {
  athlete: any;
  kits: ClothingKit[];
  categories?: Array<{ id?: string | null; name?: string | null }>;
}) =>
  kits
    .filter((kit) => kit.active)
    .map((kit) => {
      const compatible = categoryCompatible(
        kit.compatibleCategoryIds,
        athlete,
        categories,
      );
      return {
        kit,
        compatible,
        reason: compatible ? "" : "Categoria non compatibile",
      };
    });

const valueCompatible = (candidate: unknown, expected?: string) =>
  !expected || !candidate || normalizeToken(candidate) === normalizeToken(expected);

export const getCompatibleInventoryForAthlete = ({
  athlete,
  item,
  inventory,
  size,
  color,
  variant,
  categories = [],
}: {
  athlete: any;
  item: ClothingCatalogItem;
  inventory: InventoryStock[];
  size?: string;
  color?: string;
  variant?: string;
  categories?: Array<{ id?: string | null; name?: string | null }>;
}) => {
  const itemCompatible = categoryCompatible(
    item.compatibleCategoryIds,
    athlete,
    categories,
  );

  if (!itemCompatible) {
    return [];
  }

  return inventory.filter((stock) => {
    if (stock.itemId !== item.id) return false;
    if (!valueCompatible(stock.size, size)) return false;
    if (!valueCompatible(stock.color, color)) return false;
    if (!valueCompatible(stock.variant, variant)) return false;
    if (stock.stockType === "single_unit") {
      return AVAILABLE_STOCK_STATUSES.has(stock.status || "available");
    }
    return Math.max(0, toNumber(stock.quantityAvailable, 0)) > 0;
  });
};

const numberRecordsFromAssignments = (
  assignments: ClothingAssignment[],
): JerseyNumberAssignment[] =>
  assignments
    .filter((assignment) => ACTIVE_ASSIGNMENT_STATUSES.has(assignment.status))
    .flatMap((assignment) =>
      assignment.items
        .filter((item) => item.number !== null && item.number !== undefined)
        .map((item) => ({
          id: `${assignment.id}:${item.id}:number`,
          athleteId: assignment.athleteId,
          groupId: item.numberingGroupId || assignment.numberingGroupId || null,
          number: item.number ?? null,
          assignmentId: assignment.id,
          itemId: item.itemId,
          kitId: assignment.kitId || null,
        })),
    );

export const canAssignNumber = ({
  athleteId,
  groupId,
  number,
  state,
  ignoreAssignmentId,
  requiresNumber = true,
}: {
  athleteId: string;
  groupId?: string | null;
  number?: number | string | null;
  state: ClothingState;
  ignoreAssignmentId?: string | null;
  requiresNumber?: boolean;
}) => {
  if (!requiresNumber) {
    return { ok: true, reason: "" };
  }

  const parsedNumber = toOptionalNumber(number);
  if (!groupId) {
    return { ok: false, reason: "Seleziona un gruppo numerazione" };
  }
  if (parsedNumber === null) {
    return { ok: false, reason: "Seleziona un numero" };
  }

  const group = state.numberingGroups.find((entry) => entry.id === groupId);
  if (group) {
    if (parsedNumber < group.minNumber || parsedNumber > group.maxNumber) {
      return {
        ok: false,
        reason: `Numero fuori intervallo ${group.minNumber}-${group.maxNumber}`,
      };
    }
  }

  const records = [
    ...state.jerseyAssignments,
    ...numberRecordsFromAssignments(state.assignments),
  ];
  const occupied = records.find(
    (record) =>
      record.groupId === groupId &&
      record.number === parsedNumber &&
      record.athleteId !== athleteId &&
      record.assignmentId !== ignoreAssignmentId,
  );

  if (occupied) {
    return {
      ok: false,
      reason: "Numero già assegnato a un altro atleta nello stesso gruppo",
      occupiedByAthleteId: occupied.athleteId,
    };
  }

  return { ok: true, reason: "" };
};

export const getAvailableNumbersForGroup = ({
  groupId,
  state,
  athleteId,
  ignoreAssignmentId,
}: {
  groupId?: string | null;
  state: ClothingState;
  athleteId?: string;
  ignoreAssignmentId?: string | null;
}) => {
  if (!groupId) {
    return [];
  }

  const group = state.numberingGroups.find((entry) => entry.id === groupId);
  const min = group?.minNumber ?? 0;
  const max = group?.maxNumber ?? 99;

  return Array.from({ length: Math.max(0, max - min + 1) }, (_, index) => {
    const number = min + index;
    const result = canAssignNumber({
      athleteId: athleteId || "",
      groupId,
      number,
      state,
      ignoreAssignmentId,
    });
    return {
      number,
      available: result.ok,
      reason: result.reason,
      occupiedByAthleteId: (result as any).occupiedByAthleteId || null,
    };
  });
};

const applyInventoryReservation = ({
  stock,
  assignmentId,
  athleteId,
  status,
}: {
  stock: InventoryStock;
  assignmentId: string;
  athleteId: string;
  status: ClothingAssignmentStatus;
}): InventoryStock => {
  if (stock.stockType === "single_unit") {
    if (!AVAILABLE_STOCK_STATUSES.has(stock.status || "available")) {
      throw new Error("Unità di magazzino non disponibile");
    }

    return {
      ...stock,
      status:
        status === "delivered"
          ? "delivered"
          : status === "assigned"
            ? "assigned"
            : "reserved",
      athleteId,
      assignmentId,
    };
  }

  const available = Math.max(0, toNumber(stock.quantityAvailable, 0));
  if (available <= 0) {
    throw new Error("Quantità non disponibile");
  }

  return {
    ...stock,
    quantityAvailable: available - 1,
    quantityReserved:
      status === "reserved"
        ? Math.max(0, toNumber(stock.quantityReserved, 0)) + 1
        : Math.max(0, toNumber(stock.quantityReserved, 0)),
    quantityAssigned:
      status === "assigned" || status === "delivered"
        ? Math.max(0, toNumber(stock.quantityAssigned, 0)) + 1
        : Math.max(0, toNumber(stock.quantityAssigned, 0)),
    assignmentId,
  };
};

export const createClothingAssignment = ({
  request,
  state,
}: {
  request: ClothingAssignmentRequest;
  state: ClothingState;
}) => {
  const athleteId = firstString(request.athleteId);
  if (!athleteId) {
    throw new Error("Atleta obbligatorio");
  }

  const source = request.source || "inventory";
  const status =
    source === "supplier_order"
      ? "to_order"
      : normalizeAssignmentStatus(request.status || "reserved");
  const kit = request.kitId
    ? state.kits.find((entry) => entry.id === request.kitId)
    : null;
  const itemLookup = new Map(state.items.map((item) => [item.id, item]));
  const assignmentId = makeId("assignment");
  const now = new Date().toISOString();
  const nextInventory = state.inventory.map((stock) => ({ ...stock }));
  const nextJerseyAssignments = state.jerseyAssignments.map((entry) => ({
    ...entry,
  }));

  const submittedComponents = Array.isArray(request.components)
    ? request.components
    : [];
  const requestComponents =
    submittedComponents.length > 0
      ? submittedComponents
      : request.itemId
        ? [{ itemId: request.itemId }]
        : [];

  if (!requestComponents.length) {
    throw new Error("Seleziona almeno un articolo");
  }

  const sharedNumber = toOptionalNumber(request.sharedNumber);
  const assignmentItems = requestComponents.map((component, index) => {
    const item = itemLookup.get(component.itemId);
    if (!item) {
      throw new Error("Articolo non trovato");
    }

    const kitComponent = kit?.components.find(
      (entry) => entry.itemId === item.id,
    );
    const requiresNumber =
      kitComponent?.requiresNumberOverride ?? item.requiresNumber;
    const groupId =
      firstString(
        component.numberingGroupId,
        request.numberingGroupId,
        kit?.numberingGroupId,
      ) || null;
    const number =
      kit?.numberMode === "shared_by_kit" && kitComponent?.sharedKitNumber !== false
        ? sharedNumber
        : toOptionalNumber(component.number);

    if (requiresNumber) {
      const result = canAssignNumber({
        athleteId,
        groupId,
        number,
        state,
        requiresNumber,
      });
      if (!result.ok) {
        throw new Error(result.reason);
      }
    }

    let stockType: "single_unit" | "bulk_quantity" | null = null;
    let inventoryStockId = component.inventoryStockId || null;
    let stockNumber: number | null = null;

    if (source === "inventory") {
      const stockIndex = nextInventory.findIndex(
        (entry) => entry.id === component.inventoryStockId,
      );
      if (stockIndex === -1) {
        throw new Error(`Magazzino non disponibile per ${item.name}`);
      }
      const stock = nextInventory[stockIndex];
      if (stock.itemId !== item.id) {
        throw new Error("Stock non compatibile con articolo");
      }
      nextInventory[stockIndex] = applyInventoryReservation({
        stock,
        assignmentId,
        athleteId,
        status,
      });
      stockType = stock.stockType;
      inventoryStockId = stock.id;
      stockNumber = stock.number ?? null;
    }

    const effectiveNumber = source === "inventory" ? stockNumber ?? number : number;
    if (requiresNumber && groupId && effectiveNumber !== null) {
      const jerseyIndex = nextJerseyAssignments.findIndex(
        (entry) => entry.athleteId === athleteId && entry.groupId === groupId,
      );
      const jerseyEntry = {
        id:
          nextJerseyAssignments[jerseyIndex]?.id ||
          `jersey:${athleteId}:${groupId}`,
        athleteId,
        groupId,
        number: effectiveNumber,
        assignmentId,
        itemId: item.id,
        kitId: kit?.id || null,
        updatedAt: now,
      };
      if (jerseyIndex >= 0) {
        nextJerseyAssignments[jerseyIndex] = jerseyEntry;
      } else {
        nextJerseyAssignments.push(jerseyEntry);
      }
    }

    return {
      id: `${assignmentId}:item:${index}`,
      itemId: item.id,
      name: item.name,
      inventoryStockId,
      stockType,
      source,
      size: firstString(component.size),
      color: firstString(component.color),
      variant: firstString(component.variant),
      number: effectiveNumber,
      numberingGroupId: groupId,
      quantity: Math.max(1, toNumber(component.quantity, 1)),
      status,
      personalization: firstString(component.personalization),
      delivered: status === "delivered",
      deliveredAt: status === "delivered" ? now : null,
      notes: firstString(component.notes),
    } satisfies ClothingAssignmentItem;
  });

  const assignment: ClothingAssignment = {
    id: assignmentId,
    organizationId: request.organizationId,
    athleteId,
    assigneeId: athleteId,
    assigneeType: "athlete",
    kitId: kit?.id || null,
    kitName: kit?.name || null,
    itemId: request.itemId || (assignmentItems.length === 1 ? assignmentItems[0].itemId : null),
    source,
    size: assignmentItems[0]?.size || "",
    color: assignmentItems[0]?.color || "",
    variant: assignmentItems[0]?.variant || "",
    number: assignmentItems[0]?.number ?? null,
    numberingGroupId:
      assignmentItems[0]?.numberingGroupId || request.numberingGroupId || null,
    status,
    supplierOrderId:
      source === "supplier_order" ? `supplier:${assignmentId}` : null,
    notes: firstString(request.notes),
    createdAt: now,
    updatedAt: now,
    items: assignmentItems,
  };

  return {
    assignment,
    inventory: nextInventory,
    assignments: [...state.assignments, assignment],
    jerseyAssignments: nextJerseyAssignments,
  };
};

export const updateClothingAssignmentStatus = ({
  assignmentId,
  nextStatus,
  state,
}: {
  assignmentId: string;
  nextStatus: ClothingAssignmentStatus;
  state: ClothingState;
}) => {
  const now = new Date().toISOString();
  const assignment = state.assignments.find((entry) => entry.id === assignmentId);
  if (!assignment) {
    throw new Error("Assegnazione non trovata");
  }

  const nextInventory = state.inventory.map((stock) => ({ ...stock }));
  const releaseStock =
    nextStatus === "cancelled" && assignment.status !== "delivered";

  if (releaseStock) {
    assignment.items.forEach((item) => {
      if (!item.inventoryStockId) return;
      const stockIndex = nextInventory.findIndex(
        (stock) => stock.id === item.inventoryStockId,
      );
      if (stockIndex === -1) return;

      const stock = nextInventory[stockIndex];
      if (stock.stockType === "single_unit") {
        nextInventory[stockIndex] = {
          ...stock,
          status: "available",
          athleteId: null,
          assignmentId: null,
        };
        return;
      }

      const quantity = Math.max(1, toNumber(item.quantity, 1));
      nextInventory[stockIndex] = {
        ...stock,
        quantityAvailable: Math.max(0, toNumber(stock.quantityAvailable, 0)) + quantity,
        quantityReserved:
          assignment.status === "reserved"
            ? Math.max(0, toNumber(stock.quantityReserved, 0) - quantity)
            : Math.max(0, toNumber(stock.quantityReserved, 0)),
        quantityAssigned:
          assignment.status === "assigned"
            ? Math.max(0, toNumber(stock.quantityAssigned, 0) - quantity)
            : Math.max(0, toNumber(stock.quantityAssigned, 0)),
        assignmentId: null,
      };
    });
  }

  const moveReservedToAssigned =
    nextStatus === "assigned" || nextStatus === "delivered";
  if (moveReservedToAssigned && assignment.status === "reserved") {
    assignment.items.forEach((item) => {
      if (!item.inventoryStockId) return;
      const stockIndex = nextInventory.findIndex(
        (stock) => stock.id === item.inventoryStockId,
      );
      if (stockIndex === -1) return;
      const stock = nextInventory[stockIndex];
      if (stock.stockType === "single_unit") {
        nextInventory[stockIndex] = {
          ...stock,
          status: nextStatus === "delivered" ? "delivered" : "assigned",
        };
        return;
      }
      const quantity = Math.max(1, toNumber(item.quantity, 1));
      nextInventory[stockIndex] = {
        ...stock,
        quantityReserved: Math.max(0, toNumber(stock.quantityReserved, 0) - quantity),
        quantityAssigned: Math.max(0, toNumber(stock.quantityAssigned, 0)) + quantity,
      };
    });
  }

  const nextAssignments = state.assignments.map((entry) =>
    entry.id === assignmentId
      ? {
          ...entry,
          status: nextStatus,
          updatedAt: now,
          items: entry.items.map((item) => ({
            ...item,
            status: nextStatus,
            delivered:
              nextStatus === "delivered" ? true : item.delivered,
            deliveredAt:
              nextStatus === "delivered" ? now : item.deliveredAt,
          })),
        }
      : entry,
  );

  return {
    assignments: nextAssignments,
    inventory: nextInventory,
  };
};

export const supplierOrderStatuses: ClothingAssignmentStatus[] = [
  "to_order",
  "ordered",
  "in_production",
  "received",
  "delivered",
  "cancelled",
];

export const assignmentStatusLabels: Record<ClothingAssignmentStatus, string> = {
  reserved: "Riservato",
  assigned: "Assegnato",
  ready: "Pronto",
  delivered: "Consegnato",
  to_order: "Da ordinare",
  ordered: "Ordinato",
  in_production: "In produzione",
  received: "Ricevuto",
  unavailable: "Non disponibile",
  cancelled: "Annullato",
};

export const inventoryStatusLabels: Record<InventoryUnitStatus, string> = {
  available: "Disponibile",
  reserved: "Riservato",
  assigned: "Assegnato",
  delivered: "Consegnato",
  unavailable: "Non disponibile",
  lost: "Smarrito",
  damaged: "Danneggiato",
};
