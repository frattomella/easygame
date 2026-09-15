"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import Header from "@/components/dashboard/Header";
import Sidebar from "@/components/dashboard/Sidebar";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { HeaderStat, PageHeader } from "@/components/web/page/PageHeader";
import { AlertBlock } from "@/components/web/page/Alerts";
import { Button } from "@/components/web/primitives/Button";
import { SegmentedControl } from "@/components/web/primitives/Controls";
import { apiRequest } from "@/lib/api/client";
import { canAccessClubResource } from "@/lib/access-roles";
import {
  getAthleteClothingProfile,
  normalizeClubClothingState,
  serializeClothingAssignment,
  serializeClothingItem,
  serializeClothingKit,
  serializeInventoryStock,
  serializeJerseyNumberAssignment,
  serializeNumberingGroup,
  updateClothingAssignmentStatus,
  type ClothingAssignment,
  type ClothingAssignmentStatus,
  type ClothingCatalogItem,
  type ClothingKit,
  type ClothingState,
  type InventoryStock,
  type InventoryUnitStatus,
  type NumberingGroup,
} from "@/lib/clothing-inventory-utils";
import { printSupplierOrderPdf } from "@/lib/clothing-supplier-order-pdf";
import { proposeSizeForItem } from "@/lib/clothing-delivery";
import { getJerseyGroupSummaries } from "@/lib/jersey-numbering-utils";
import { compareAthletesByLastName } from "@/lib/athlete-name-utils";
import { sortByName } from "@/lib/sorting";
import { buildClubCategoryOptions, type NormalizedCategoryOption } from "@/lib/category-utils";
import { buildCategoryGroups, normalizeClubSites, type CategoryGroup, type ClubSite } from "@/lib/club-sites";
import { buildCategoryDisplayIndex } from "@/lib/categories/display";
import { formatInteger, MISSING } from "@/lib/web/format";
import { ItemDrawer } from "@/components/clothing/v2/item-drawer";
import { KitDrawer } from "@/components/clothing/v2/kit-drawer";
import { StockDrawer } from "@/components/clothing/v2/stock-drawer";
import { GroupDrawer } from "@/components/clothing/v2/group-drawer";
import { AssignmentDrawer, type AssignmentSubmit } from "@/components/clothing/v2/assignment-drawer";
import { AssignmentEditDrawer, AssignmentStatusDrawer } from "@/components/clothing/v2/assignment-edit-drawer";
import { KitDeliveryDrawer } from "@/components/clothing/v2/kit-delivery-drawer";
import { DeleteAssignmentDialog } from "@/components/clothing/v2/delete-assignment-dialog";
import { ItemsGrid, KitsGrid } from "@/components/clothing/v2/catalog-grids";
import { InventoryGrid } from "@/components/clothing/v2/inventory-grid";
import { AssignmentsGrid } from "@/components/clothing/v2/assignments-grid";
import { SupplierOrdersGrid, type SupplierExportScope } from "@/components/clothing/v2/supplier-orders-grid";
import { NumberingArea } from "@/components/clothing/v2/numbering-area";
import {
  CLOTHING_AREAS,
  assignmentEditFormFrom,
  assignmentFormFromStock,
  athleteLabel,
  buildSupplierOrderRows,
  emptyAssignmentForm,
  emptyItemForm,
  emptyKitForm,
  emptyNumberingGroup,
  emptyStockForm,
  isClothingArea,
  isSupplierAssignment,
  itemFormFrom,
  newId,
  splitCsv,
  stockFormFrom,
  type AssignmentEditForm,
  type AssignmentForm,
  type ClothingArea,
  type ItemForm,
  type KitForm,
  type StockForm,
  type SupplierOrderRow,
} from "@/components/clothing/v2/clothing-model";

/**
 * `/clothing` — Abbigliamento e magazzino (Web V2).
 *
 * Le sei schede della V1 sono sei **aree** (`?area=kit|articoli|magazzino|
 * assegnazioni|ordini|numerazioni`), ognuna con la sua griglia e la sua
 * azione primaria; i dialoghi sono cassetti, l'unico modale e la conferma
 * dell'eliminazione di un'assegnazione. La logica dati e quella della V1:
 * nove letture da `simplified-db`, scritture per colonna con
 * `updateClubData`, e la creazione di un'assegnazione da
 * `POST /api/clothing/assignments`.
 *
 * I permessi sono gli stessi che il server applica alle sei risorse
 * (`canAccessClubResource`): a chi non puo scrivere le azioni sono
 * **assenti**, non disabilitate. La V1 non aveva nessun predicato client.
 */
const EMPTY_ITEM = emptyItemForm();
const EMPTY_KIT = emptyKitForm();
const EMPTY_STOCK = emptyStockForm();
const EMPTY_GROUP = emptyNumberingGroup();
const EMPTY_ASSIGNMENT = emptyAssignmentForm();
const EMPTY_ASSIGNMENT_EDIT: AssignmentEditForm = { athleteId: "", status: "assigned", createdAt: "", notes: "" };

export default function ClothingPage() {
  const { activeClub, user, userRole } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const pathname = usePathname() || "/clothing";
  const rawSearchParams = useSearchParams();
  const searchParams = React.useMemo(() => rawSearchParams ?? new URLSearchParams(), [rawSearchParams]);
  const role = activeClub?.role || userRole;

  /* ── Permessi: le stesse risorse che il server controlla ────────────── */
  const canManageCatalog = canAccessClubResource(role, "clothing_products", "update") && canAccessClubResource(role, "clothing_kits", "update");
  const canManageInventory = canAccessClubResource(role, "clothing_inventory", "update");
  const canManageAssignments = canAccessClubResource(role, "kit_assignments", "create") && canAccessClubResource(role, "kit_assignments", "update");
  const canManageNumbering = canAccessClubResource(role, "jersey_groups", "update") && canAccessClubResource(role, "jersey_assignments", "update");

  /* ── Dati ───────────────────────────────────────────────────────────── */
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [state, setState] = React.useState<ClothingState>(() => normalizeClubClothingState({}));
  const [athletes, setAthletes] = React.useState<any[]>([]);
  const [sites, setSites] = React.useState<ClubSite[]>([]);
  const [categoryOptions, setCategoryOptions] = React.useState<NormalizedCategoryOption[]>([]);
  const [categoryGroups, setCategoryGroups] = React.useState<CategoryGroup[]>([]);
  /** Come si scrive una categoria in questa pagina (ADR-0185): la sede solo dove il nome ne nomina due. */
  const categoryDisplay = React.useMemo(
    () => buildCategoryDisplayIndex({ categories: categoryOptions, groups: categoryGroups, sites }),
    [categoryOptions, categoryGroups, sites],
  );

  const loadData = React.useCallback(async () => {
    if (!activeClub?.id || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { getClubData, getClubAthletes } = await import("@/lib/simplified-db");
      const [products, kits, inventory, assignments, groups, jerseyAssignments, categories, clubSites, clubAthletes, rawCategoryGroups] = await Promise.all([
        getClubData(activeClub.id, "clothing_products"),
        getClubData(activeClub.id, "clothing_kits"),
        getClubData(activeClub.id, "clothing_inventory"),
        getClubData(activeClub.id, "kit_assignments"),
        getClubData(activeClub.id, "jersey_groups"),
        getClubData(activeClub.id, "jersey_assignments"),
        getClubData(activeClub.id, "categories"),
        getClubData(activeClub.id, "club_sites"),
        getClubAthletes(activeClub.id),
        getClubData(activeClub.id, "category_groups"),
      ]);
      const sortedAthletes = Array.isArray(clubAthletes) ? [...clubAthletes].sort(compareAthletesByLastName) : [];
      setAthletes(sortedAthletes);
      setSites(normalizeClubSites(clubSites));
      const options = buildClubCategoryOptions({ clubCategories: categories, athletes: sortedAthletes });
      setCategoryOptions(options);
      setCategoryGroups(buildCategoryGroups({ categories: options, sites: normalizeClubSites(clubSites), groups: rawCategoryGroups }));
      setState(normalizeClubClothingState({ products, kits, inventory, assignments, jerseyGroups: groups, jerseyAssignments }));
      setLoadError(null);
    } catch (error: any) {
      setLoadError(error?.message || "Impossibile caricare abbigliamento");
    } finally {
      setLoading(false);
    }
  }, [activeClub?.id, user]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  /* ── Area attiva e indirizzo ────────────────────────────────────────── */
  const [area, setArea] = React.useState<ClothingArea>(() => {
    const requested = searchParams.get("area");
    return isClothingArea(requested) ? requested : "kit";
  });

  const selectArea = React.useCallback(
    (next: ClothingArea) => {
      setArea(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === "kit") params.delete("area");
      else params.set("area", next);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  React.useEffect(() => {
    const requested = searchParams.get("area");
    if (isClothingArea(requested) && requested !== area) setArea(requested);
    // L'indirizzo guida l'area; `area` cambia per il clic e non deve rieseguire l'effetto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /* ── Indici e derivazioni ───────────────────────────────────────────── */
  const athletesById = React.useMemo(() => new Map(athletes.map((athlete) => [String(athlete.id), athlete])), [athletes]);
  const itemById = React.useMemo(() => new Map(state.items.map((item) => [item.id, item])), [state.items]);
  const stockById = React.useMemo(() => new Map(state.inventory.map((stock) => [stock.id, stock])), [state.inventory]);
  const groupsById = React.useMemo(() => new Map(state.numberingGroups.map((group) => [group.id, group])), [state.numberingGroups]);
  const sortedCatalogItems = React.useMemo(() => sortByName(state.items, (item) => item.name), [state.items]);
  const sortedKits = React.useMemo(() => sortByName(state.kits, (kit) => kit.name), [state.kits]);
  const sortedNumberingGroups = React.useMemo(() => sortByName(state.numberingGroups, (group) => group.name), [state.numberingGroups]);

  const athleteAssignments = React.useMemo(
    () => state.assignments.filter((assignment) => assignment.assigneeType === "athlete"),
    [state.assignments],
  );
  const supplierAssignments = React.useMemo(() => state.assignments.filter(isSupplierAssignment), [state.assignments]);
  const supplierOrderRows = React.useMemo(
    () => buildSupplierOrderRows({ assignments: supplierAssignments, athletesById, itemById, stockById }),
    [athletesById, itemById, stockById, supplierAssignments],
  );

  const jerseyGroupSummaries = React.useMemo(
    () => getJerseyGroupSummaries({ groups: sortedNumberingGroups, state, athletes, categories: categoryOptions }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [athletes, categoryOptions, sortedNumberingGroups, state.assignments, state.jerseyAssignments],
  );

  const inventorySummary = React.useMemo(
    () => ({
      singleAvailable: state.inventory.filter((stock) => stock.stockType === "single_unit" && stock.status === "available").length,
      bulkAvailable: state.inventory.reduce((total, stock) => total + (stock.quantityAvailable || 0), 0),
    }),
    [state.inventory],
  );

  /* ── Cassetti e dialoghi ────────────────────────────────────────────── */
  const [itemDraft, setItemDraft] = React.useState<ItemForm | null>(null);
  const [kitDraft, setKitDraft] = React.useState<KitForm | null>(null);
  const [stockDraft, setStockDraft] = React.useState<StockForm | null>(null);
  const [groupDraft, setGroupDraft] = React.useState<NumberingGroup | null>(null);
  const [assignmentDraft, setAssignmentDraft] = React.useState<AssignmentForm | null>(null);
  const [editingAssignment, setEditingAssignment] = React.useState<ClothingAssignment | null>(null);
  const [statusAssignment, setStatusAssignment] = React.useState<ClothingAssignment | null>(null);
  const [deliveryAssignmentId, setDeliveryAssignmentId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<ClothingAssignment | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  const editingAssignmentForm = React.useMemo(() => (editingAssignment ? assignmentEditFormFrom(editingAssignment) : EMPTY_ASSIGNMENT_EDIT), [editingAssignment]);
  const deliveryAssignment = React.useMemo(
    () => (deliveryAssignmentId ? state.assignments.find((entry) => entry.id === deliveryAssignmentId) || null : null),
    [deliveryAssignmentId, state.assignments],
  );

  /**
   * Le taglie previste dall'anagrafica per il kit che si sta consegnando:
   * mostrano l'override («assegnata L, anagrafica M») senza che nessuna delle
   * due riscriva l'altra.
   */
  const deliveryProposedSizes = React.useMemo(() => {
    if (!deliveryAssignment) return {} as Record<string, string>;
    const athlete = athletesById.get(deliveryAssignment.athleteId);
    if (!athlete) return {} as Record<string, string>;
    const sizes = getAthleteClothingProfile(athlete).sizes;
    const proposals: Record<string, string> = {};
    deliveryAssignment.items.forEach((item) => {
      const catalogItem = itemById.get(item.itemId);
      if (!catalogItem) return;
      const proposed = proposeSizeForItem({ sizes, item: catalogItem });
      if (proposed) proposals[item.itemId] = proposed;
    });
    return proposals;
  }, [deliveryAssignment, athletesById, itemById]);

  /* `?action=new` (azioni rapide): apre «Nuova assegnazione». */
  React.useEffect(() => {
    if (searchParams.get("action") !== "new" || !canManageAssignments) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("action");
    setAssignmentDraft(emptyAssignmentForm());
    const query = params.toString();
    const frame = window.requestAnimationFrame(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [canManageAssignments, pathname, router, searchParams]);

  /* ── Scritture (stesse colonne, stesse funzioni della V1) ───────────── */
  const saveClubJson = async (field: string, value: any[]) => {
    if (!activeClub?.id) throw new Error("Club non trovato");
    const { updateClubData } = await import("@/lib/simplified-db");
    await updateClubData(activeClub.id, field, value);
  };

  const failure = (error: unknown, fallback: string) => {
    showToast("error", error instanceof Error && error.message ? error.message : fallback);
    return false;
  };

  const saveItem = async (form: ItemForm) => {
    try {
      if (!form.name.trim()) throw new Error("Nome articolo obbligatorio");
      const nextItem = {
        id: form.id || newId("item"),
        name: form.name.trim(),
        type: form.type.trim() || "articolo",
        description: form.description.trim(),
        code: form.code.trim(),
        sizes: splitCsv(form.sizes),
        colors: splitCsv(form.colors),
        variants: splitCsv(form.variants),
        requiresSize: form.requiresSize,
        requiresColor: form.requiresColor,
        requiresNumber: form.requiresNumber,
        numberMode: form.requiresNumber ? form.numberMode : "none",
        stockMode: form.stockMode,
        sizeSource: form.sizeSource,
        active: true,
      } as ClothingCatalogItem;
      const next = form.id ? state.items.map((item) => (item.id === form.id ? nextItem : item)) : [...state.items, nextItem];
      await saveClubJson("clothing_products", next.map(serializeClothingItem));
      setState((current) => ({ ...current, items: next }));
      showToast("success", "Articolo aggiornato.");
      return true;
    } catch (error) {
      return failure(error, "Impossibile salvare articolo");
    }
  };

  const saveKit = async (form: KitForm) => {
    try {
      if (!form.name.trim()) throw new Error("Nome kit obbligatorio");
      if (!form.components.length) throw new Error("Seleziona almeno un componente");
      const nextKit: ClothingKit = {
        id: form.id || newId("kit"),
        name: form.name.trim(),
        description: form.description.trim(),
        numberingGroupId: form.numberingGroupId || null,
        numberMode: form.numberMode,
        components: form.components,
        active: true,
      };
      const next = form.id ? state.kits.map((kit) => (kit.id === form.id ? nextKit : kit)) : [...state.kits, nextKit];
      await saveClubJson("clothing_kits", next.map(serializeClothingKit));
      setState((current) => ({ ...current, kits: next }));
      showToast("success", "Kit aggiornato.");
      return true;
    } catch (error) {
      return failure(error, "Impossibile salvare kit");
    }
  };

  const saveStock = async (form: StockForm) => {
    try {
      if (!form.itemId) throw new Error("Seleziona un articolo");
      const existing = form.id ? state.inventory.find((stock) => stock.id === form.id) : null;
      const nextStock: InventoryStock = {
        id: form.id || newId(form.stockType === "single_unit" ? "unit" : "bulk"),
        stockType: form.stockType,
        itemId: form.itemId,
        size: form.size.trim(),
        color: form.color.trim(),
        variant: form.variant.trim(),
        number: form.stockType === "single_unit" && form.number !== "" ? Number(form.number) : null,
        numberingGroupId: form.numberingGroupId || null,
        status: form.stockType === "single_unit" ? form.status : ("available" as InventoryUnitStatus),
        quantityAvailable: form.stockType === "bulk_quantity" ? Math.max(0, Number(form.quantityAvailable || 0)) : 0,
        quantityReserved: existing?.quantityReserved || 0,
        quantityAssigned: existing?.quantityAssigned || 0,
        athleteId: existing?.athleteId || null,
        assignmentId: existing?.assignmentId || null,
        notes: form.notes.trim(),
      };
      const next = form.id ? state.inventory.map((stock) => (stock.id === form.id ? nextStock : stock)) : [...state.inventory, nextStock];
      await saveClubJson("clothing_inventory", next.map(serializeInventoryStock));
      setState((current) => ({ ...current, inventory: next }));
      showToast("success", "Magazzino aggiornato.");
      return true;
    } catch (error) {
      return failure(error, "Impossibile salvare stock");
    }
  };

  const saveGroup = async (form: NumberingGroup) => {
    try {
      if (!form.name.trim()) throw new Error("Nome gruppo obbligatorio");
      if (form.minNumber > form.maxNumber) throw new Error("Intervallo numeri non valido");
      const nextGroup: NumberingGroup = {
        ...form,
        id: form.id || newId("group"),
        name: form.name.trim(),
        categoryIds: form.categoryIds,
        minNumber: Number(form.minNumber),
        maxNumber: Number(form.maxNumber),
      };
      const next = form.id ? state.numberingGroups.map((group) => (group.id === form.id ? nextGroup : group)) : [...state.numberingGroups, nextGroup];
      await saveClubJson("jersey_groups", next.map(serializeNumberingGroup));
      setState((current) => ({ ...current, numberingGroups: next }));
      showToast("success", "Gruppo numerazione aggiornato.");
      return true;
    } catch (error) {
      return failure(error, "Impossibile salvare gruppo");
    }
  };

  const createAssignment = async ({ form, components }: AssignmentSubmit) => {
    try {
      if (!activeClub?.id) throw new Error("Club non trovato");
      if (!form.athleteId) throw new Error("Seleziona un atleta");
      if (!components.length) throw new Error("Seleziona kit o articolo");

      const response = await apiRequest<{ assignment: any; inventory: any[]; assignments: any[]; jerseyAssignments: any[] }>("/api/clothing/assignments", {
        method: "POST",
        body: {
          organizationId: activeClub.id,
          athleteId: form.athleteId,
          kitId: form.targetType === "kit" ? form.kitId : null,
          itemId: form.targetType === "item" ? form.itemId : null,
          source: form.source,
          status: form.status,
          numberingGroupId: form.numberingGroupId || null,
          sharedNumber: form.sharedNumber || null,
          components,
          notes: form.notes,
        },
      });
      if (response.error) throw new Error(response.error.message);

      setState((current) =>
        normalizeClubClothingState({
          products: current.items.map(serializeClothingItem),
          kits: current.kits.map(serializeClothingKit),
          inventory: response.data?.inventory || [],
          assignments: response.data?.assignments || [],
          jerseyGroups: current.numberingGroups.map(serializeNumberingGroup),
          jerseyAssignments: response.data?.jerseyAssignments || [],
        }),
      );
      showToast("success", "Assegnazione creata: stock, numeri e ordini aggiornati.");
      return true;
    } catch (error) {
      return failure(error, "Impossibile creare assegnazione");
    }
  };

  /**
   * Registra le consegne di un kit.
   *
   * Non passa da `updateClothingAssignmentStatus`: quella funzione muove il
   * magazzino e riscrive **tutti** gli articoli con lo stesso stato, che e
   * esattamente cio che le consegne parziali devono smettere di fare. Qui si
   * salva solo il fatto registrato dalla segreteria; lo stato del kit e gia
   * derivato da `setAssignmentItemState`.
   */
  const saveKitDeliveries = async (updated: ClothingAssignment) => {
    try {
      const nextAssignments = state.assignments.map((entry) => (entry.id === updated.id ? updated : entry));
      await saveClubJson("kit_assignments", nextAssignments.map(serializeClothingAssignment));
      setState((current) => ({ ...current, assignments: nextAssignments }));
      showToast("success", "Consegne aggiornate: lo stato del kit è stato ricalcolato dagli articoli.");
      return true;
    } catch (error) {
      return failure(error, "Impossibile salvare le consegne");
    }
  };

  const updateAssignmentStatus = async (assignment: ClothingAssignment, nextStatus: ClothingAssignmentStatus) => {
    try {
      const result = updateClothingAssignmentStatus({ assignmentId: assignment.id, nextStatus, state });
      await saveClubJson("kit_assignments", result.assignments.map(serializeClothingAssignment));
      await saveClubJson("clothing_inventory", result.inventory.map(serializeInventoryStock));
      setState((current) => ({ ...current, assignments: result.assignments, inventory: result.inventory }));
      showToast("success", "Stato aggiornato.");
      return true;
    } catch (error) {
      return failure(error, "Impossibile aggiornare stato");
    }
  };

  const saveAssignmentEdit = async (form: AssignmentEditForm) => {
    try {
      if (!editingAssignment) throw new Error("Assegnazione non trovata");
      if (!form.athleteId) throw new Error("Seleziona un atleta");
      const assignment = state.assignments.find((entry) => entry.id === editingAssignment.id);
      if (!assignment) throw new Error("Assegnazione non trovata");

      const statusResult =
        assignment.status !== form.status
          ? updateClothingAssignmentStatus({ assignmentId: assignment.id, nextStatus: form.status, state })
          : { assignments: state.assignments, inventory: state.inventory };
      const now = new Date().toISOString();
      const nextCreatedAt = form.createdAt ? new Date(`${form.createdAt}T12:00:00.000Z`).toISOString() : assignment.createdAt;
      const linkedStockIds = new Set(assignment.items.map((item) => item.inventoryStockId).filter(Boolean) as string[]);
      const nextAssignments = statusResult.assignments.map((entry) =>
        entry.id === assignment.id
          ? {
              ...entry,
              athleteId: form.athleteId,
              assigneeId: form.athleteId,
              status: form.status,
              notes: form.notes.trim(),
              createdAt: nextCreatedAt,
              updatedAt: now,
              items: entry.items.map((item) => ({ ...item, status: form.status })),
            }
          : entry,
      );
      const nextInventory = statusResult.inventory.map((stock) =>
        stock.assignmentId === assignment.id || linkedStockIds.has(stock.id)
          ? { ...stock, athleteId: stock.stockType === "single_unit" ? form.athleteId : stock.athleteId }
          : stock,
      );
      const nextJerseyAssignments = state.jerseyAssignments.map((entry) =>
        entry.assignmentId === assignment.id ? { ...entry, athleteId: form.athleteId, updatedAt: now } : entry,
      );

      await saveClubJson("kit_assignments", nextAssignments.map(serializeClothingAssignment));
      await saveClubJson("clothing_inventory", nextInventory.map(serializeInventoryStock));
      await saveClubJson("jersey_assignments", nextJerseyAssignments.map(serializeJerseyNumberAssignment));
      setState((current) => ({ ...current, assignments: nextAssignments, inventory: nextInventory, jerseyAssignments: nextJerseyAssignments }));
      showToast("success", "Assegnazione aggiornata.");
      return true;
    } catch (error) {
      return failure(error, "Impossibile aggiornare assegnazione");
    }
  };

  const confirmDeleteAssignment = async () => {
    const assignment = deleting;
    if (!assignment) return;
    setDeleteBusy(true);
    try {
      const linkedStockIds = new Set(assignment.items.map((item) => item.inventoryStockId).filter(Boolean) as string[]);
      const quantityByStockId = assignment.items.reduce<Record<string, number>>((totals, item) => {
        if (!item.inventoryStockId) return totals;
        return { ...totals, [item.inventoryStockId]: (totals[item.inventoryStockId] || 0) + Math.max(1, Number(item.quantity || 1)) };
      }, {});
      const nextInventory = state.inventory.map((stock) => {
        const linked = stock.assignmentId === assignment.id || linkedStockIds.has(stock.id);
        if (!linked) return stock;
        if (stock.stockType === "single_unit") {
          return { ...stock, status: "available" as InventoryUnitStatus, athleteId: null, assignmentId: null };
        }
        const quantity = Math.max(1, quantityByStockId[stock.id] || 1);
        return {
          ...stock,
          quantityAvailable: Math.max(0, Number(stock.quantityAvailable || 0)) + quantity,
          quantityReserved: Math.max(0, Number(stock.quantityReserved || 0) - quantity),
          quantityAssigned: Math.max(0, Number(stock.quantityAssigned || 0) - quantity),
          assignmentId: null,
        };
      });
      const nextAssignments = state.assignments.filter((entry) => entry.id !== assignment.id);
      const nextJerseyAssignments = state.jerseyAssignments.filter((entry) => entry.assignmentId !== assignment.id);

      await saveClubJson("kit_assignments", nextAssignments.map(serializeClothingAssignment));
      await saveClubJson("clothing_inventory", nextInventory.map(serializeInventoryStock));
      await saveClubJson("jersey_assignments", nextJerseyAssignments.map(serializeJerseyNumberAssignment));
      setState((current) => ({ ...current, assignments: nextAssignments, inventory: nextInventory, jerseyAssignments: nextJerseyAssignments }));
      showToast("success", "Assegnazione rimossa.");
      setDeleting(null);
    } catch (error) {
      failure(error, "Impossibile eliminare assegnazione");
    } finally {
      setDeleteBusy(false);
    }
  };

  const saveManualJerseyNumber = async ({ athleteId, groupId, value }: { athleteId: string; groupId: string; value: string | number | null }) => {
    try {
      const rawValue = String(value ?? "").trim();
      const nextNumber = rawValue === "" ? null : Number(rawValue);
      const group = state.numberingGroups.find((entry) => entry.id === groupId);
      if (!group) throw new Error("Gruppo numerazione non trovato");
      if (nextNumber !== null && (!Number.isInteger(nextNumber) || nextNumber < group.minNumber || nextNumber > group.maxNumber)) {
        throw new Error(`Numero fuori intervallo ${group.minNumber}-${group.maxNumber}`);
      }
      const directAssignments = state.jerseyAssignments.filter((entry) => !(entry.athleteId === athleteId && entry.groupId === groupId && !entry.assignmentId));
      const nextJerseyAssignments =
        nextNumber === null
          ? directAssignments
          : [...directAssignments, { id: `jersey:${athleteId}:${groupId}`, athleteId, groupId, number: nextNumber, updatedAt: new Date().toISOString() }];
      await saveClubJson("jersey_assignments", nextJerseyAssignments.map(serializeJerseyNumberAssignment));
      setState((current) => ({ ...current, jerseyAssignments: nextJerseyAssignments }));
      showToast("success", nextNumber === null ? "Numero rimosso." : "Numero salvato.");
    } catch (error) {
      failure(error, "Impossibile aggiornare numero");
    }
  };

  const assignRandomJerseyNumber = async (groupId: string, athleteId: string) => {
    const summary = jerseyGroupSummaries.find((entry) => entry.group.id === groupId);
    const availableNumbers = summary?.availableNumbers || [];
    if (!availableNumbers.length) {
      showToast("error", "Nessun numero disponibile: tutti i numeri del gruppo sono già utilizzati o riservati.");
      return;
    }
    const number = availableNumbers[Math.floor(Math.random() * availableNumbers.length)];
    await saveManualJerseyNumber({ athleteId, groupId, value: number });
  };

  const exportSupplierRows = React.useCallback(
    (rows: SupplierOrderRow[], scopeLabel: SupplierExportScope, supplierFilter: string | null) => {
      if (!rows.length) {
        showToast("error", "Non ci sono righe da esportare.");
        return;
      }
      const success = printSupplierOrderPdf({
        clubName: (activeClub as any)?.name || "EasyGame",
        clubLogoUrl: (activeClub as any)?.logo_url || (activeClub as any)?.logoUrl || null,
        rows,
        supplierLabel: supplierFilter || undefined,
        scopeLabel,
      });
      if (!success) {
        showToast("error", "Consenti i popup per generare la stampa PDF.");
        return;
      }
      showToast("success", "PDF pronto: si apre la finestra di stampa dell'ordine fornitore.");
    },
    [activeClub, showToast],
  );

  /* ── Intestazione: azioni per area ──────────────────────────────────── */
  const openNewAssignment = () => setAssignmentDraft(emptyAssignmentForm());
  const newAssignmentButton = (variant: "primary" | "secondary") =>
    canManageAssignments ? (
      <Button key="new-assignment" variant={variant} icon={<Plus />} onClick={openNewAssignment}>
        Nuova assegnazione
      </Button>
    ) : null;

  const headerActions =
    area === "kit" ? (
      <>
        {canManageCatalog ? (
          <Button variant="primary" icon={<Plus />} onClick={() => setKitDraft(emptyKitForm())}>
            Nuovo kit
          </Button>
        ) : null}
        {newAssignmentButton("secondary")}
      </>
    ) : area === "articoli" ? (
      <>
        {canManageCatalog ? (
          <Button variant="primary" icon={<Plus />} onClick={() => setItemDraft(emptyItemForm())}>
            Nuovo articolo
          </Button>
        ) : null}
        {newAssignmentButton("secondary")}
      </>
    ) : area === "magazzino" ? (
      <>
        {canManageInventory ? (
          <>
            <Button variant="primary" icon={<Plus />} onClick={() => setStockDraft(emptyStockForm("bulk_quantity"))}>
              Aggiungi quantità
            </Button>
            <Button variant="secondary" icon={<Plus />} onClick={() => setStockDraft(emptyStockForm("single_unit"))}>
              Aggiungi unità
            </Button>
          </>
        ) : null}
        {newAssignmentButton("secondary")}
      </>
    ) : area === "numerazioni" ? (
      <>
        {canManageNumbering ? (
          <Button variant="primary" icon={<Plus />} onClick={() => setGroupDraft(emptyNumberingGroup())}>
            Nuovo gruppo
          </Button>
        ) : null}
        {newAssignmentButton("secondary")}
      </>
    ) : (
      newAssignmentButton("primary")
    );

  const stat = (value: number) => (loading ? MISSING : formatInteger(value));

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Abbigliamento" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader
              eyebrow="Materiale"
              title="Abbigliamento e magazzino"
              description="Gestisci kit, unità fisiche, quantità generiche, numeri e richieste al fornitore."
              stats={
                <>
                  <HeaderStat value={stat(state.items.length)} label="articoli" onClick={() => selectArea("articoli")} />
                  <HeaderStat value={stat(inventorySummary.singleAvailable)} label="unità disponibili" tone="green" onClick={() => selectArea("magazzino")} />
                  <HeaderStat value={stat(inventorySummary.bulkAvailable)} label="quantità disponibili" tone="green" onClick={() => selectArea("magazzino")} />
                  <HeaderStat
                    value={stat(supplierAssignments.length)}
                    label="ordini fornitore"
                    tone={supplierAssignments.length ? "amber" : "ink"}
                    onClick={() => selectArea("ordini")}
                  />
                </>
              }
              actions={headerActions}
            >
              <SegmentedControl<ClothingArea>
                aria-label="Aree dell'abbigliamento"
                value={area}
                onChange={selectArea}
                options={CLOTHING_AREAS}
                className="max-w-full overflow-x-auto"
              />
            </PageHeader>

            {loadError ? (
              <AlertBlock
                severity="danger"
                title="Non è stato possibile caricare l'abbigliamento."
                className="mb-[18px]"
                actions={
                  <Button variant="secondary" size="sm" onClick={() => void loadData()}>
                    Riprova
                  </Button>
                }
              >
                {loadError}
              </AlertBlock>
            ) : null}

            {area === "kit" ? (
              <KitsGrid
                kits={sortedKits}
                itemById={itemById}
                groupsById={groupsById}
                canManage={canManageCatalog}
                loading={loading}
                onEdit={(kit) => setKitDraft({ id: kit.id, name: kit.name, description: kit.description || "", numberingGroupId: kit.numberingGroupId || "", numberMode: kit.numberMode, components: kit.components })}
                onCreate={() => setKitDraft(emptyKitForm())}
              />
            ) : null}

            {area === "articoli" ? (
              <ItemsGrid items={sortedCatalogItems} canManage={canManageCatalog} loading={loading} onEdit={(item) => setItemDraft(itemFormFrom(item))} onCreate={() => setItemDraft(emptyItemForm())} />
            ) : null}

            {area === "magazzino" ? (
              <InventoryGrid
                inventory={state.inventory}
                itemById={itemById}
                athletesById={athletesById}
                canManage={canManageInventory}
                canAssign={canManageAssignments}
                loading={loading}
                onAssign={(stock) => setAssignmentDraft(assignmentFormFromStock(stock))}
                onEdit={(stock) => setStockDraft(stockFormFrom(stock))}
                onCreate={() => setStockDraft(emptyStockForm("bulk_quantity"))}
              />
            ) : null}

            {area === "assegnazioni" ? (
              <AssignmentsGrid
                assignments={athleteAssignments}
                athletesById={athletesById}
                categories={categoryOptions}
                categoryLabel={(reference) => categoryDisplay.label(reference)}
                stockById={stockById}
                canManage={canManageAssignments}
                loading={loading}
                onDeliveries={(assignment) => setDeliveryAssignmentId(assignment.id)}
                onEdit={setEditingAssignment}
                onChangeStatus={setStatusAssignment}
                onDelete={setDeleting}
                onCreate={openNewAssignment}
              />
            ) : null}

            {area === "ordini" ? <SupplierOrdersGrid rows={supplierOrderRows} loading={loading} onExport={exportSupplierRows} /> : null}

            {area === "numerazioni" ? (
              <NumberingArea
                summaries={jerseyGroupSummaries}
                categoryOptions={categoryOptions}
                categoryLabel={(categoryId) => categoryDisplay.label(categoryId)}
                canManage={canManageNumbering}
                loading={loading}
                onEditGroup={(group) => setGroupDraft(group)}
                onCreateGroup={() => setGroupDraft(emptyNumberingGroup())}
                onSaveManualNumber={saveManualJerseyNumber}
                onAssignRandom={assignRandomJerseyNumber}
              />
            ) : null}
          </DashboardPageContainer>
        </main>
      </div>

      <ItemDrawer open={Boolean(itemDraft)} onOpenChange={(open) => !open && setItemDraft(null)} initial={itemDraft || EMPTY_ITEM} onSave={saveItem} />
      <KitDrawer open={Boolean(kitDraft)} onOpenChange={(open) => !open && setKitDraft(null)} initial={kitDraft || EMPTY_KIT} items={sortedCatalogItems} groups={sortedNumberingGroups} onSave={saveKit} />
      <StockDrawer open={Boolean(stockDraft)} onOpenChange={(open) => !open && setStockDraft(null)} initial={stockDraft || EMPTY_STOCK} items={sortedCatalogItems} groups={sortedNumberingGroups} onSave={saveStock} />
      <GroupDrawer open={Boolean(groupDraft)} onOpenChange={(open) => !open && setGroupDraft(null)} initial={groupDraft || EMPTY_GROUP} categoryOptions={categoryOptions} categoryLabel={(categoryId) => categoryDisplay.label(categoryId)} sites={sites} onSave={saveGroup} />
      <AssignmentDrawer open={Boolean(assignmentDraft)} onOpenChange={(open) => !open && setAssignmentDraft(null)} initial={assignmentDraft || EMPTY_ASSIGNMENT} athletes={athletes} categories={categoryOptions} categoryLabel={(reference) => categoryDisplay.label(reference)} state={state} onSubmit={createAssignment} />
      <AssignmentEditDrawer open={Boolean(editingAssignment)} onOpenChange={(open) => !open && setEditingAssignment(null)} initial={editingAssignmentForm} athletes={athletes} categories={categoryOptions} categoryLabel={(reference) => categoryDisplay.label(reference)} onSave={saveAssignmentEdit} />
      <AssignmentStatusDrawer
        open={Boolean(statusAssignment)}
        onOpenChange={(open) => !open && setStatusAssignment(null)}
        assignment={statusAssignment}
        athleteName={statusAssignment ? athleteLabel(athletesById.get(statusAssignment.athleteId)) : ""}
        onConfirm={updateAssignmentStatus}
      />
      <KitDeliveryDrawer
        open={Boolean(deliveryAssignment)}
        onOpenChange={(open) => !open && setDeliveryAssignmentId(null)}
        assignment={deliveryAssignment}
        athleteName={deliveryAssignment ? athleteLabel(athletesById.get(deliveryAssignment.athleteId)) : ""}
        proposedSizeByItemId={deliveryProposedSizes}
        onSave={saveKitDeliveries}
      />
      <DeleteAssignmentDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && !deleteBusy && setDeleting(null)}
        athleteName={deleting ? athleteLabel(athletesById.get(deleting.athleteId)) : ""}
        kitName={deleting?.kitName || "Articoli"}
        linkedStockCount={deleting ? new Set(deleting.items.map((item) => item.inventoryStockId).filter(Boolean)).size : 0}
        onConfirm={confirmDeleteAssignment}
        loading={deleteBusy}
      />
    </div>
  );
}
