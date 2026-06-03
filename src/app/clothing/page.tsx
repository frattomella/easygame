"use client";

import React, { useEffect, useMemo, useState } from "react";
import Header from "@/components/dashboard/Header";
import Sidebar from "@/components/dashboard/Sidebar";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/use-toast";
import { apiRequest } from "@/lib/api/client";
import {
  assignmentStatusLabels,
  canAssignNumber,
  getAthleteClothingProfile,
  getAvailableNumbersForGroup,
  getCompatibleClothingItemsForAthlete,
  getCompatibleInventoryForAthlete,
  getCompatibleKitsForAthlete,
  inventoryStatusLabels,
  normalizeClubClothingState,
  serializeClothingAssignment,
  serializeClothingItem,
  serializeClothingKit,
  serializeInventoryStock,
  serializeJerseyNumberAssignment,
  serializeNumberingGroup,
  supplierOrderStatuses,
  updateClothingAssignmentStatus,
  type ClothingAssignment,
  type ClothingAssignmentComponentRequest,
  type ClothingAssignmentSource,
  type ClothingAssignmentStatus,
  type ClothingCatalogItem,
  type ClothingKit,
  type ClothingKitComponent,
  type ClothingNumberMode,
  type ClothingStockMode,
  type ClothingState,
  type InventoryStock,
  type InventoryUnitStatus,
  type NumberingGroup,
} from "@/lib/clothing-inventory-utils";
import {
  compareAthletesByLastName,
  getAthleteDisplayName,
} from "@/lib/athlete-name-utils";
import { buildClubCategoryOptions } from "@/lib/category-utils";
import {
  AlertCircle,
  Boxes,
  PackagePlus,
  Plus,
  Shirt,
  Truck,
} from "lucide-react";

type ItemForm = {
  id?: string;
  name: string;
  type: string;
  description: string;
  code: string;
  sizes: string;
  colors: string;
  variants: string;
  compatibleCategoryIds: string[];
  requiresSize: boolean;
  requiresColor: boolean;
  requiresNumber: boolean;
  numberMode: ClothingNumberMode;
  stockMode: ClothingStockMode;
};

type KitForm = {
  id?: string;
  name: string;
  description: string;
  season: string;
  compatibleCategoryIds: string[];
  numberingGroupId: string;
  numberMode: ClothingNumberMode;
  components: ClothingKitComponent[];
};

type StockForm = {
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

type AssignmentForm = {
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

const emptyItemForm: ItemForm = {
  name: "",
  type: "articolo",
  description: "",
  code: "",
  sizes: "",
  colors: "",
  variants: "",
  compatibleCategoryIds: [],
  requiresSize: true,
  requiresColor: false,
  requiresNumber: false,
  numberMode: "none",
  stockMode: "both",
};

const emptyKitForm: KitForm = {
  name: "",
  description: "",
  season: "",
  compatibleCategoryIds: [],
  numberingGroupId: "",
  numberMode: "shared_by_kit",
  components: [],
};

const emptyStockForm: StockForm = {
  stockType: "single_unit",
  itemId: "",
  size: "",
  color: "",
  variant: "",
  number: "",
  numberingGroupId: "",
  status: "available",
  quantityAvailable: "1",
  notes: "",
};

const emptyAssignmentForm: AssignmentForm = {
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
};

const splitCsv = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const newId = (prefix: string) =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}`;

const formatDate = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("it-IT");
};

const statusBadgeClass = (status: string) => {
  if (status === "delivered" || status === "received") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "to_order" || status === "ordered" || status === "in_production") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (status === "cancelled" || status === "damaged" || status === "lost") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  return "border-blue-200 bg-blue-50 text-blue-700";
};

const athleteLabel = (athlete: any) => getAthleteDisplayName(athlete) || athlete?.id;

const getAthleteCategoryLabel = (athlete: any) =>
  athlete?.category_name ||
  athlete?.data?.categoryName ||
  athlete?.data?.category ||
  athlete?.category ||
  "Senza categoria";

const stockLabel = (stock: InventoryStock) => {
  const details = [stock.size, stock.color, stock.variant]
    .filter(Boolean)
    .join(" / ");
  if (stock.stockType === "single_unit") {
    return `${details || "Unità"}${stock.number !== null && stock.number !== undefined ? ` - n.${stock.number}` : ""}`;
  }
  return `${details || "Quantità"} - disp. ${stock.quantityAvailable || 0}`;
};

function MetricCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
          {icon}
        </div>
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <p className="text-2xl font-semibold text-slate-950">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ClothingPage() {
  const { activeClub, user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<ClothingState>(() =>
    normalizeClubClothingState({}),
  );
  const [athletes, setAthletes] = useState<any[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [kitDialogOpen, setKitDialogOpen] = useState(false);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm);
  const [kitForm, setKitForm] = useState<KitForm>(emptyKitForm);
  const [stockForm, setStockForm] = useState<StockForm>(emptyStockForm);
  const [assignmentForm, setAssignmentForm] =
    useState<AssignmentForm>(emptyAssignmentForm);
  const [groupForm, setGroupForm] = useState<NumberingGroup>({
    id: "",
    name: "",
    categoryIds: [],
    season: "",
    minNumber: 0,
    maxNumber: 99,
    reservedNumbers: [],
    assignedNumbers: [],
  });
  const [inventoryFilter, setInventoryFilter] = useState("all");
  const [assignmentSearch, setAssignmentSearch] = useState("");

  const loadData = React.useCallback(async () => {
    if (!activeClub?.id || !user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { getClubData, getClubAthletes } = await import("@/lib/simplified-db");
      const [
        products,
        kits,
        inventory,
        assignments,
        groups,
        jerseyAssignments,
        categories,
        clubAthletes,
      ] = await Promise.all([
        getClubData(activeClub.id, "clothing_products"),
        getClubData(activeClub.id, "clothing_kits"),
        getClubData(activeClub.id, "clothing_inventory"),
        getClubData(activeClub.id, "kit_assignments"),
        getClubData(activeClub.id, "jersey_groups"),
        getClubData(activeClub.id, "jersey_assignments"),
        getClubData(activeClub.id, "categories"),
        getClubAthletes(activeClub.id),
      ]);

      const sortedAthletes = Array.isArray(clubAthletes)
        ? [...clubAthletes].sort(compareAthletesByLastName)
        : [];
      setAthletes(sortedAthletes);
      setCategoryOptions(
        buildClubCategoryOptions({
          clubCategories: categories,
          athletes: sortedAthletes,
        }),
      );
      setState(
        normalizeClubClothingState({
          products,
          kits,
          inventory,
          assignments,
          jerseyGroups: groups,
          jerseyAssignments,
        }),
      );
    } catch (error: any) {
      toast({
        title: "Errore",
        description: error?.message || "Impossibile caricare abbigliamento",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [activeClub?.id, toast, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const athletesById = useMemo(
    () => new Map(athletes.map((athlete) => [String(athlete.id), athlete])),
    [athletes],
  );

  const itemById = useMemo(
    () => new Map(state.items.map((item) => [item.id, item])),
    [state.items],
  );

  const selectedAssignmentAthlete = athletesById.get(assignmentForm.athleteId);
  const compatibleKitOptions = useMemo(() => {
    if (!selectedAssignmentAthlete) {
      return state.kits
        .filter((kit) => kit.active)
        .map((kit) => ({ kit, compatible: true, reason: "" }));
    }

    return getCompatibleKitsForAthlete({
      athlete: selectedAssignmentAthlete,
      kits: state.kits,
      categories: categoryOptions,
    });
  }, [categoryOptions, selectedAssignmentAthlete, state.kits]);
  const compatibleItemOptions = useMemo(() => {
    if (!selectedAssignmentAthlete) {
      return state.items
        .filter((item) => item.active)
        .map((item) => ({ item, compatible: true, reason: "" }));
    }

    return getCompatibleClothingItemsForAthlete({
      athlete: selectedAssignmentAthlete,
      items: state.items,
      categories: categoryOptions,
    });
  }, [categoryOptions, selectedAssignmentAthlete, state.items]);
  const selectedAssignmentKit = state.kits.find(
    (kit) => kit.id === assignmentForm.kitId,
  );
  const selectedAssignmentItem = state.items.find(
    (item) => item.id === assignmentForm.itemId,
  );
  const assignmentTargetComponents = useMemo(() => {
    if (assignmentForm.targetType === "kit" && selectedAssignmentKit) {
      return selectedAssignmentKit.components
        .map((component) => itemById.get(component.itemId))
        .filter(Boolean) as ClothingCatalogItem[];
    }

    return selectedAssignmentItem ? [selectedAssignmentItem] : [];
  }, [
    assignmentForm.targetType,
    itemById,
    selectedAssignmentItem,
    selectedAssignmentKit,
  ]);

  const filteredAssignments = useMemo(() => {
    const query = assignmentSearch.trim().toLowerCase();
    return state.assignments
      .filter((assignment) => assignment.assigneeType === "athlete")
      .filter((assignment) => {
        if (!query) return true;
        const athlete = athletesById.get(assignment.athleteId);
        return [
          athleteLabel(athlete),
          getAthleteCategoryLabel(athlete),
          assignment.kitName,
          assignment.items.map((item) => item.name).join(" "),
          assignment.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [assignmentSearch, athletesById, state.assignments]);

  const supplierAssignments = useMemo(
    () =>
      state.assignments
        .filter(
          (assignment) =>
            assignment.source === "supplier_order" ||
            supplierOrderStatuses.includes(assignment.status),
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [state.assignments],
  );

  const saveClubJson = async (field: string, value: any[]) => {
    if (!activeClub?.id) throw new Error("Club non trovato");
    const { updateClubData } = await import("@/lib/simplified-db");
    await updateClubData(activeClub.id, field, value);
  };

  const saveItem = async () => {
    try {
      if (!itemForm.name.trim()) throw new Error("Nome articolo obbligatorio");
      const nextItem = {
        id: itemForm.id || newId("item"),
        name: itemForm.name.trim(),
        type: itemForm.type.trim() || "articolo",
        description: itemForm.description.trim(),
        code: itemForm.code.trim(),
        sizes: splitCsv(itemForm.sizes),
        colors: splitCsv(itemForm.colors),
        variants: splitCsv(itemForm.variants),
        compatibleCategoryIds: itemForm.compatibleCategoryIds,
        requiresSize: itemForm.requiresSize,
        requiresColor: itemForm.requiresColor,
        requiresNumber: itemForm.requiresNumber,
        numberMode: itemForm.requiresNumber ? itemForm.numberMode : "none",
        stockMode: itemForm.stockMode,
        active: true,
      } as ClothingCatalogItem;
      const next = itemForm.id
        ? state.items.map((item) => (item.id === itemForm.id ? nextItem : item))
        : [...state.items, nextItem];
      await saveClubJson("clothing_products", next.map(serializeClothingItem));
      setState((current) => ({ ...current, items: next }));
      setItemDialogOpen(false);
      setItemForm(emptyItemForm);
      toast({ title: "Salvato", description: "Articolo aggiornato." });
    } catch (error: any) {
      toast({
        title: "Errore",
        description: error?.message || "Impossibile salvare articolo",
        variant: "destructive",
      });
    }
  };

  const saveKit = async () => {
    try {
      if (!kitForm.name.trim()) throw new Error("Nome kit obbligatorio");
      if (!kitForm.components.length)
        throw new Error("Seleziona almeno un componente");
      const nextKit: ClothingKit = {
        id: kitForm.id || newId("kit"),
        name: kitForm.name.trim(),
        description: kitForm.description.trim(),
        season: kitForm.season.trim(),
        compatibleCategoryIds: kitForm.compatibleCategoryIds,
        numberingGroupId: kitForm.numberingGroupId || null,
        numberMode: kitForm.numberMode,
        components: kitForm.components,
        active: true,
      };
      const next = kitForm.id
        ? state.kits.map((kit) => (kit.id === kitForm.id ? nextKit : kit))
        : [...state.kits, nextKit];
      await saveClubJson("clothing_kits", next.map(serializeClothingKit));
      setState((current) => ({ ...current, kits: next }));
      setKitDialogOpen(false);
      setKitForm(emptyKitForm);
      toast({ title: "Salvato", description: "Kit aggiornato." });
    } catch (error: any) {
      toast({
        title: "Errore",
        description: error?.message || "Impossibile salvare kit",
        variant: "destructive",
      });
    }
  };

  const saveStock = async () => {
    try {
      if (!stockForm.itemId) throw new Error("Seleziona un articolo");
      const existing = stockForm.id
        ? state.inventory.find((stock) => stock.id === stockForm.id)
        : null;
      const nextStock: InventoryStock = {
        id: stockForm.id || newId(stockForm.stockType === "single_unit" ? "unit" : "bulk"),
        stockType: stockForm.stockType,
        itemId: stockForm.itemId,
        size: stockForm.size.trim(),
        color: stockForm.color.trim(),
        variant: stockForm.variant.trim(),
        number:
          stockForm.stockType === "single_unit" && stockForm.number !== ""
            ? Number(stockForm.number)
            : null,
        numberingGroupId: stockForm.numberingGroupId || null,
        status:
          stockForm.stockType === "single_unit" ? stockForm.status : "available",
        quantityAvailable:
          stockForm.stockType === "bulk_quantity"
            ? Math.max(0, Number(stockForm.quantityAvailable || 0))
            : 0,
        quantityReserved: existing?.quantityReserved || 0,
        quantityAssigned: existing?.quantityAssigned || 0,
        athleteId: existing?.athleteId || null,
        assignmentId: existing?.assignmentId || null,
        notes: stockForm.notes.trim(),
      };
      const next = stockForm.id
        ? state.inventory.map((stock) =>
            stock.id === stockForm.id ? nextStock : stock,
          )
        : [...state.inventory, nextStock];
      await saveClubJson("clothing_inventory", next.map(serializeInventoryStock));
      setState((current) => ({ ...current, inventory: next }));
      setStockDialogOpen(false);
      setStockForm(emptyStockForm);
      toast({ title: "Salvato", description: "Magazzino aggiornato." });
    } catch (error: any) {
      toast({
        title: "Errore",
        description: error?.message || "Impossibile salvare stock",
        variant: "destructive",
      });
    }
  };

  const saveGroup = async () => {
    try {
      if (!groupForm.name.trim()) throw new Error("Nome gruppo obbligatorio");
      if (groupForm.minNumber > groupForm.maxNumber)
        throw new Error("Intervallo numeri non valido");
      const nextGroup: NumberingGroup = {
        ...groupForm,
        id: groupForm.id || newId("group"),
        name: groupForm.name.trim(),
        categoryIds: groupForm.categoryIds,
        minNumber: Number(groupForm.minNumber),
        maxNumber: Number(groupForm.maxNumber),
      };
      const next = groupForm.id
        ? state.numberingGroups.map((group) =>
            group.id === groupForm.id ? nextGroup : group,
          )
        : [...state.numberingGroups, nextGroup];
      await saveClubJson("jersey_groups", next.map(serializeNumberingGroup));
      setState((current) => ({ ...current, numberingGroups: next }));
      setGroupDialogOpen(false);
      setGroupForm({
        id: "",
        name: "",
        categoryIds: [],
        season: "",
        minNumber: 0,
        maxNumber: 99,
        reservedNumbers: [],
        assignedNumbers: [],
      });
      toast({ title: "Salvato", description: "Gruppo numerazione aggiornato." });
    } catch (error: any) {
      toast({
        title: "Errore",
        description: error?.message || "Impossibile salvare gruppo",
        variant: "destructive",
      });
    }
  };

  const setComponentDraft = (
    itemId: string,
    updates: Partial<ClothingAssignmentComponentRequest>,
  ) => {
    setAssignmentForm((current) => ({
      ...current,
      components: {
        ...current.components,
        [itemId]: {
          itemId,
          ...(current.components[itemId] || {}),
          ...updates,
        },
      },
    }));
  };

  const createAssignment = async () => {
    try {
      if (!activeClub?.id) throw new Error("Club non trovato");
      const components = assignmentTargetComponents.map((item) => ({
        itemId: item.id,
        ...(assignmentForm.components[item.id] || {}),
      }));

      if (!assignmentForm.athleteId) throw new Error("Seleziona un atleta");
      if (!components.length) throw new Error("Seleziona kit o articolo");

      const response = await apiRequest<{
        assignment: any;
        inventory: any[];
        assignments: any[];
        jerseyAssignments: any[];
      }>("/api/clothing/assignments", {
        method: "POST",
        body: {
          organizationId: activeClub.id,
          athleteId: assignmentForm.athleteId,
          kitId:
            assignmentForm.targetType === "kit" ? assignmentForm.kitId : null,
          itemId:
            assignmentForm.targetType === "item" ? assignmentForm.itemId : null,
          source: assignmentForm.source,
          status: assignmentForm.status,
          numberingGroupId: assignmentForm.numberingGroupId || null,
          sharedNumber: assignmentForm.sharedNumber || null,
          components,
          notes: assignmentForm.notes,
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
      setAssignmentDialogOpen(false);
      setAssignmentForm(emptyAssignmentForm);
      toast({
        title: "Assegnazione creata",
        description: "Stock, numeri e ordini aggiornati.",
      });
    } catch (error: any) {
      toast({
        title: "Errore",
        description: error?.message || "Impossibile creare assegnazione",
        variant: "destructive",
      });
    }
  };

  const updateAssignmentStatus = async (
    assignment: ClothingAssignment,
    nextStatus: ClothingAssignmentStatus,
  ) => {
    try {
      const result = updateClothingAssignmentStatus({
        assignmentId: assignment.id,
        nextStatus,
        state,
      });
      await saveClubJson(
        "kit_assignments",
        result.assignments.map(serializeClothingAssignment),
      );
      await saveClubJson(
        "clothing_inventory",
        result.inventory.map(serializeInventoryStock),
      );
      setState((current) => ({
        ...current,
        assignments: result.assignments,
        inventory: result.inventory,
      }));
      toast({ title: "Aggiornato", description: "Stato ordine aggiornato." });
    } catch (error: any) {
      toast({
        title: "Errore",
        description: error?.message || "Impossibile aggiornare stato",
        variant: "destructive",
      });
    }
  };

  const inventorySummary = useMemo(() => {
    const singleAvailable = state.inventory.filter(
      (stock) =>
        stock.stockType === "single_unit" && stock.status === "available",
    ).length;
    const bulkAvailable = state.inventory.reduce(
      (total, stock) => total + (stock.quantityAvailable || 0),
      0,
    );
    return { singleAvailable, bulkAvailable };
  }, [state.inventory]);

  const renderCategoryCheckboxes = (
    values: string[],
    onChange: (next: string[]) => void,
  ) => (
    <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
      {categoryOptions.length ? (
        categoryOptions.map((category) => {
          const checked = values.includes(category.id);
          return (
            <label key={category.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onChange(
                    checked
                      ? values.filter((value) => value !== category.id)
                      : [...values, category.id],
                  )
                }
              />
              {category.name}
            </label>
          );
        })
      ) : (
        <p className="text-sm text-muted-foreground">
          Nessuna categoria configurata.
        </p>
      )}
    </div>
  );

  const renderAssignmentComponent = (item: ClothingCatalogItem) => {
    const draft = assignmentForm.components[item.id] || { itemId: item.id };
    const athlete = selectedAssignmentAthlete;
    const compatibleInventory = athlete
      ? getCompatibleInventoryForAthlete({
          athlete,
          item,
          inventory: state.inventory,
          size: draft.size,
          color: draft.color,
          variant: draft.variant,
          categories: categoryOptions,
        })
      : [];
    const groupId =
      String(draft.numberingGroupId || assignmentForm.numberingGroupId || "");
    const numbers =
      item.requiresNumber && groupId
        ? getAvailableNumbersForGroup({
            groupId,
            state,
            athleteId: assignmentForm.athleteId,
          })
        : [];
    const numberCheck =
      item.requiresNumber && groupId && (draft.number || assignmentForm.sharedNumber)
        ? canAssignNumber({
            athleteId: assignmentForm.athleteId,
            groupId,
            number:
              selectedAssignmentKit?.numberMode === "shared_by_kit"
                ? assignmentForm.sharedNumber
                : draft.number,
            state,
          })
        : { ok: true, reason: "" };

    return (
      <div key={item.id} className="rounded-lg border bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium text-slate-900">{item.name}</p>
            <p className="text-xs text-slate-500">
              {item.requiresNumber ? "Numero richiesto" : "Senza numero"}
            </p>
          </div>
          {!numberCheck.ok ? (
            <Badge className="border-red-200 bg-red-50 text-red-700">
              {numberCheck.reason}
            </Badge>
          ) : null}
        </div>

        {assignmentForm.source === "inventory" ? (
          <div>
            <Label>Stock compatibile</Label>
            <Select
              value={String(draft.inventoryStockId || "")}
              onValueChange={(value) => {
                const stock = compatibleInventory.find(
                  (entry) => entry.id === value,
                );
                setComponentDraft(item.id, {
                  inventoryStockId: value,
                  size: stock?.size || draft.size || "",
                  color: stock?.color || draft.color || "",
                  variant: stock?.variant || draft.variant || "",
                  number: stock?.number ?? draft.number ?? null,
                  numberingGroupId:
                    stock?.numberingGroupId ||
                    draft.numberingGroupId ||
                    assignmentForm.numberingGroupId ||
                    "",
                });
              }}
            >
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Seleziona stock disponibile" />
              </SelectTrigger>
              <SelectContent>
                {compatibleInventory.map((stock) => (
                  <SelectItem key={stock.id} value={stock.id}>
                    {stockLabel(stock)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!compatibleInventory.length ? (
              <p className="mt-2 text-xs text-amber-700">
                Nessuno stock disponibile compatibile. Usa “Da ordinare” per
                creare una richiesta fornitore.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <Label>Taglia</Label>
              <Select
                value={String(draft.size || "")}
                onValueChange={(value) => setComponentDraft(item.id, { size: value })}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Taglia" />
                </SelectTrigger>
                <SelectContent>
                  {(item.sizes.length ? item.sizes : ["Unica"]).map((size) => (
                    <SelectItem key={size} value={size}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Colore</Label>
              <Select
                value={String(draft.color || "")}
                onValueChange={(value) => setComponentDraft(item.id, { color: value })}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Colore" />
                </SelectTrigger>
                <SelectContent>
                  {(item.colors.length ? item.colors : ["Standard"]).map((color) => (
                    <SelectItem key={color} value={color}>
                      {color}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Variante</Label>
              <Select
                value={String(draft.variant || "")}
                onValueChange={(value) =>
                  setComponentDraft(item.id, { variant: value })
                }
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Variante" />
                </SelectTrigger>
                <SelectContent>
                  {(item.variants.length ? item.variants : ["Standard"]).map(
                    (variant) => (
                      <SelectItem key={variant} value={variant}>
                        {variant}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            {item.requiresNumber &&
            selectedAssignmentKit?.numberMode !== "shared_by_kit" ? (
              <div>
                <Label>Numero</Label>
                <Select
                  value={draft.number === undefined ? "" : String(draft.number)}
                  onValueChange={(value) =>
                    setComponentDraft(item.id, { number: value })
                  }
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Numero" />
                  </SelectTrigger>
                  <SelectContent>
                    {numbers.map((option) => {
                      const occupiedBy = option.occupiedByAthleteId
                        ? athletesById.get(option.occupiedByAthleteId)
                        : null;
                      return (
                        <SelectItem
                          key={option.number}
                          value={String(option.number)}
                          disabled={!option.available}
                        >
                          {option.number}
                          {!option.available
                            ? ` occupato${
                                occupiedBy ? ` da ${athleteLabel(occupiedBy)}` : ""
                              }`
                            : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Abbigliamento" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-3xl font-bold leading-tight tracking-tight text-transparent md:text-4xl">
                  Abbigliamento e magazzino
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
                  Gestisci kit, unità fisiche, quantità generiche, numeri e
                  richieste al fornitore.
                </p>
              </div>
              <Dialog
                open={assignmentDialogOpen}
                onOpenChange={setAssignmentDialogOpen}
              >
                <DialogTrigger asChild>
                  <Button
                    onClick={() => setAssignmentForm(emptyAssignmentForm)}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Nuova assegnazione
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Nuova assegnazione</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label>Atleta</Label>
                        <Select
                          value={assignmentForm.athleteId}
                          onValueChange={(value) =>
                            setAssignmentForm((current) => ({
                              ...current,
                              athleteId: value,
                              kitId: "",
                              itemId: "",
                              sharedNumber: "",
                              components: {},
                            }))
                          }
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue placeholder="Seleziona atleta" />
                          </SelectTrigger>
                          <SelectContent>
                            {athletes.map((athlete) => (
                              <SelectItem key={athlete.id} value={athlete.id}>
                                {athleteLabel(athlete)} -{" "}
                                {getAthleteCategoryLabel(athlete)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedAssignmentAthlete ? (
                          <p className="mt-2 text-xs text-slate-500">
                            Taglie suggerite:{" "}
                            {Object.values(
                              getAthleteClothingProfile(selectedAssignmentAthlete).sizes,
                            )
                              .filter(Boolean)
                              .join(" / ") || "nessuna taglia salvata"}
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <Label>Origine</Label>
                        <Select
                          value={assignmentForm.source}
                          onValueChange={(value) =>
                            setAssignmentForm((current) => ({
                              ...current,
                              source: value as ClothingAssignmentSource,
                              status:
                                value === "supplier_order"
                                  ? "to_order"
                                  : current.status,
                            }))
                          }
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inventory">Da magazzino</SelectItem>
                            <SelectItem value="supplier_order">
                              Da ordinare/personalizzare
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <Label>Tipo</Label>
                        <Select
                          value={assignmentForm.targetType}
                          onValueChange={(value) =>
                            setAssignmentForm((current) => ({
                              ...current,
                              targetType: value as "kit" | "item",
                              kitId: "",
                              itemId: "",
                              components: {},
                            }))
                          }
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="kit">Kit completo</SelectItem>
                            <SelectItem value="item">Singolo articolo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {assignmentForm.targetType === "kit" ? (
                        <div>
                          <Label>Kit</Label>
                          <Select
                            value={assignmentForm.kitId}
                            onValueChange={(value) =>
                              setAssignmentForm((current) => {
                                const kit = state.kits.find((entry) => entry.id === value);
                                return {
                                  ...current,
                                  kitId: value,
                                  numberingGroupId:
                                    kit?.numberingGroupId ||
                                    current.numberingGroupId,
                                  components: {},
                                };
                              })
                            }
                          >
                            <SelectTrigger className="mt-2">
                              <SelectValue placeholder="Seleziona kit" />
                            </SelectTrigger>
                            <SelectContent>
                              {compatibleKitOptions.map(({ kit, compatible, reason }) => (
                                <SelectItem
                                  key={kit.id}
                                  value={kit.id}
                                  disabled={!compatible}
                                >
                                  {kit.name}
                                  {!compatible ? ` - ${reason}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div>
                          <Label>Articolo</Label>
                          <Select
                            value={assignmentForm.itemId}
                            onValueChange={(value) =>
                              setAssignmentForm((current) => ({
                                ...current,
                                itemId: value,
                                components: {},
                              }))
                            }
                          >
                            <SelectTrigger className="mt-2">
                              <SelectValue placeholder="Seleziona articolo" />
                            </SelectTrigger>
                            <SelectContent>
                              {compatibleItemOptions.map(({ item, compatible, reason }) => (
                                <SelectItem
                                  key={item.id}
                                  value={item.id}
                                  disabled={!compatible}
                                >
                                  {item.name}
                                  {!compatible ? ` - ${reason}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div>
                        <Label>Stato iniziale</Label>
                        <Select
                          value={assignmentForm.status}
                          disabled={assignmentForm.source === "supplier_order"}
                          onValueChange={(value) =>
                            setAssignmentForm((current) => ({
                              ...current,
                              status: value as ClothingAssignmentStatus,
                            }))
                          }
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="reserved">Riservato</SelectItem>
                            <SelectItem value="assigned">Assegnato</SelectItem>
                            <SelectItem value="delivered">Consegnato</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <Label>Gruppo numerazione</Label>
                        <Select
                          value={assignmentForm.numberingGroupId}
                          onValueChange={(value) =>
                            setAssignmentForm((current) => ({
                              ...current,
                              numberingGroupId: value,
                            }))
                          }
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue placeholder="Seleziona gruppo" />
                          </SelectTrigger>
                          <SelectContent>
                            {state.numberingGroups.map((group) => (
                              <SelectItem key={group.id} value={group.id}>
                                {group.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {selectedAssignmentKit?.numberMode === "shared_by_kit" ? (
                        <div>
                          <Label>Numero condiviso kit</Label>
                          <Select
                            value={assignmentForm.sharedNumber}
                            onValueChange={(value) =>
                              setAssignmentForm((current) => ({
                                ...current,
                                sharedNumber: value,
                              }))
                            }
                          >
                            <SelectTrigger className="mt-2">
                              <SelectValue placeholder="Numero" />
                            </SelectTrigger>
                            <SelectContent>
                              {getAvailableNumbersForGroup({
                                groupId: assignmentForm.numberingGroupId,
                                state,
                                athleteId: assignmentForm.athleteId,
                              }).map((option) => {
                                const occupiedBy = option.occupiedByAthleteId
                                  ? athletesById.get(option.occupiedByAthleteId)
                                  : null;
                                return (
                                  <SelectItem
                                    key={option.number}
                                    value={String(option.number)}
                                    disabled={!option.available}
                                  >
                                    {option.number}
                                    {!option.available
                                      ? ` occupato${
                                          occupiedBy
                                            ? ` da ${athleteLabel(occupiedBy)}`
                                            : ""
                                        }`
                                      : ""}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                      <div>
                        <Label>Note</Label>
                        <Input
                          className="mt-2"
                          value={assignmentForm.notes}
                          onChange={(event) =>
                            setAssignmentForm((current) => ({
                              ...current,
                              notes: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <PackagePlus className="h-4 w-4" />
                        Componenti
                      </div>
                      {assignmentTargetComponents.length ? (
                        assignmentTargetComponents.map(renderAssignmentComponent)
                      ) : (
                        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">
                          Seleziona un kit o un articolo.
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border bg-slate-50 p-4 text-sm">
                      <p className="font-medium">Riepilogo</p>
                      <p className="mt-1 text-slate-600">
                        {selectedAssignmentAthlete
                          ? athleteLabel(selectedAssignmentAthlete)
                          : "Nessun atleta"}{" "}
                        -{" "}
                        {selectedAssignmentKit?.name ||
                          selectedAssignmentItem?.name ||
                          "nessun articolo"}{" "}
                        -{" "}
                        {assignmentForm.source === "inventory"
                          ? "da magazzino"
                          : "da ordinare"}
                      </p>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setAssignmentDialogOpen(false)}
                      >
                        Annulla
                      </Button>
                      <Button
                        onClick={createAssignment}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        Conferma assegnazione
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <MetricCard
                title="Articoli"
                value={state.items.length}
                icon={<Shirt className="h-5 w-5" />}
              />
              <MetricCard
                title="Unità disponibili"
                value={inventorySummary.singleAvailable}
                icon={<Boxes className="h-5 w-5" />}
              />
              <MetricCard
                title="Quantità disponibili"
                value={inventorySummary.bulkAvailable}
                icon={<PackagePlus className="h-5 w-5" />}
              />
              <MetricCard
                title="Ordini fornitore"
                value={supplierAssignments.length}
                icon={<Truck className="h-5 w-5" />}
              />
            </div>

            <Tabs defaultValue="assegnazioni" className="space-y-6">
              <TabsList className="grid w-full grid-cols-2 lg:grid-cols-5">
                <TabsTrigger value="assegnazioni">Assegnazioni</TabsTrigger>
                <TabsTrigger value="magazzino">Magazzino</TabsTrigger>
                <TabsTrigger value="catalogo">Kit e articoli</TabsTrigger>
                <TabsTrigger value="numerazioni">Numerazioni</TabsTrigger>
                <TabsTrigger value="ordini">Ordini fornitore</TabsTrigger>
              </TabsList>

              <TabsContent value="assegnazioni" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <CardTitle>Assegnazioni</CardTitle>
                        <CardDescription>
                          Kit e articoli assegnati, riservati o da ordinare.
                        </CardDescription>
                      </div>
                      <Input
                        className="md:w-80"
                        placeholder="Cerca atleta, categoria, articolo..."
                        value={assignmentSearch}
                        onChange={(event) => setAssignmentSearch(event.target.value)}
                      />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full min-w-[920px] text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Data</th>
                            <th className="px-3 py-2">Atleta</th>
                            <th className="px-3 py-2">Categoria</th>
                            <th className="px-3 py-2">Kit/Articoli</th>
                            <th className="px-3 py-2">Origine</th>
                            <th className="px-3 py-2">Stato</th>
                            <th className="px-3 py-2">Numeri</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {filteredAssignments.length ? (
                            filteredAssignments.map((assignment) => {
                              const athlete = athletesById.get(assignment.athleteId);
                              return (
                                <tr key={assignment.id}>
                                  <td className="px-3 py-3">
                                    {formatDate(assignment.createdAt)}
                                  </td>
                                  <td className="px-3 py-3 font-medium">
                                    {athleteLabel(athlete)}
                                  </td>
                                  <td className="px-3 py-3">
                                    {getAthleteCategoryLabel(athlete)}
                                  </td>
                                  <td className="px-3 py-3">
                                    <div className="font-medium">
                                      {assignment.kitName || "Articoli"}
                                    </div>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {assignment.items.map((item) => (
                                        <Badge key={item.id} variant="secondary">
                                          {item.name}
                                        </Badge>
                                      ))}
                                    </div>
                                  </td>
                                  <td className="px-3 py-3">
                                    {assignment.source === "inventory"
                                      ? "Magazzino"
                                      : assignment.source === "supplier_order"
                                        ? "Fornitore"
                                        : "Manuale"}
                                  </td>
                                  <td className="px-3 py-3">
                                    <Badge
                                      variant="outline"
                                      className={statusBadgeClass(assignment.status)}
                                    >
                                      {assignmentStatusLabels[assignment.status]}
                                    </Badge>
                                  </td>
                                  <td className="px-3 py-3">
                                    {assignment.items
                                      .filter((item) => item.number !== null)
                                      .map((item) => `n.${item.number}`)
                                      .join(", ") || "-"}
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td
                                colSpan={7}
                                className="px-3 py-8 text-center text-slate-500"
                              >
                                Nessuna assegnazione reale salvata.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="magazzino" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <CardTitle>Magazzino</CardTitle>
                        <CardDescription>
                          Unità fisiche numerate e quantità generiche.
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Select
                          value={inventoryFilter}
                          onValueChange={setInventoryFilter}
                        >
                          <SelectTrigger className="w-44 bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Tutto</SelectItem>
                            <SelectItem value="single_unit">Unità singole</SelectItem>
                            <SelectItem value="bulk_quantity">Quantità</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setStockForm({
                              ...emptyStockForm,
                              stockType: "single_unit",
                            });
                            setStockDialogOpen(true);
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" /> Unità
                        </Button>
                        <Button
                          onClick={() => {
                            setStockForm({
                              ...emptyStockForm,
                              stockType: "bulk_quantity",
                            });
                            setStockDialogOpen(true);
                          }}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <Plus className="mr-2 h-4 w-4" /> Quantità
                        </Button>
                        <Dialog
                          open={stockDialogOpen}
                          onOpenChange={setStockDialogOpen}
                        >
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>
                                {stockForm.id ? "Modifica magazzino" : "Aggiungi magazzino"}
                              </DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4">
                              <div>
                                <Label>Tipo magazzino</Label>
                                <Select
                                  value={stockForm.stockType}
                                  onValueChange={(value) =>
                                    setStockForm((current) => ({
                                      ...current,
                                      stockType: value as "single_unit" | "bulk_quantity",
                                    }))
                                  }
                                >
                                  <SelectTrigger className="mt-2">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="single_unit">
                                      Unità singola
                                    </SelectItem>
                                    <SelectItem value="bulk_quantity">
                                      Quantità generica
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label>Articolo</Label>
                                <Select
                                  value={stockForm.itemId}
                                  onValueChange={(value) =>
                                    setStockForm((current) => ({
                                      ...current,
                                      itemId: value,
                                    }))
                                  }
                                >
                                  <SelectTrigger className="mt-2">
                                    <SelectValue placeholder="Seleziona articolo" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {state.items.map((item) => (
                                      <SelectItem key={item.id} value={item.id}>
                                        {item.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="grid gap-3 md:grid-cols-3">
                                <Input
                                  placeholder="Taglia"
                                  value={stockForm.size}
                                  onChange={(event) =>
                                    setStockForm((current) => ({
                                      ...current,
                                      size: event.target.value,
                                    }))
                                  }
                                />
                                <Input
                                  placeholder="Colore"
                                  value={stockForm.color}
                                  onChange={(event) =>
                                    setStockForm((current) => ({
                                      ...current,
                                      color: event.target.value,
                                    }))
                                  }
                                />
                                <Input
                                  placeholder="Variante"
                                  value={stockForm.variant}
                                  onChange={(event) =>
                                    setStockForm((current) => ({
                                      ...current,
                                      variant: event.target.value,
                                    }))
                                  }
                                />
                              </div>
                              {stockForm.stockType === "single_unit" ? (
                                <div className="grid gap-3 md:grid-cols-3">
                                  <Input
                                    type="number"
                                    placeholder="Numero"
                                    value={stockForm.number}
                                    onChange={(event) =>
                                      setStockForm((current) => ({
                                        ...current,
                                        number: event.target.value,
                                      }))
                                    }
                                  />
                                  <Select
                                    value={stockForm.numberingGroupId}
                                    onValueChange={(value) =>
                                      setStockForm((current) => ({
                                        ...current,
                                        numberingGroupId: value,
                                      }))
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Gruppo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {state.numberingGroups.map((group) => (
                                        <SelectItem key={group.id} value={group.id}>
                                          {group.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Select
                                    value={stockForm.status}
                                    onValueChange={(value) =>
                                      setStockForm((current) => ({
                                        ...current,
                                        status: value as InventoryUnitStatus,
                                      }))
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(inventoryStatusLabels).map(
                                        ([value, label]) => (
                                          <SelectItem key={value} value={value}>
                                            {label}
                                          </SelectItem>
                                        ),
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>
                              ) : (
                                <Input
                                  type="number"
                                  min="0"
                                  placeholder="Quantità disponibile"
                                  value={stockForm.quantityAvailable}
                                  onChange={(event) =>
                                    setStockForm((current) => ({
                                      ...current,
                                      quantityAvailable: event.target.value,
                                    }))
                                  }
                                />
                              )}
                              <Textarea
                                placeholder="Note"
                                value={stockForm.notes}
                                onChange={(event) =>
                                  setStockForm((current) => ({
                                    ...current,
                                    notes: event.target.value,
                                  }))
                                }
                              />
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  onClick={() => setStockDialogOpen(false)}
                                >
                                  Annulla
                                </Button>
                                <Button onClick={saveStock}>Salva</Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {state.inventory
                        .filter(
                          (stock) =>
                            inventoryFilter === "all" ||
                            stock.stockType === inventoryFilter,
                        )
                        .map((stock) => {
                          const item = itemById.get(stock.itemId);
                          return (
                            <div
                              key={stock.id}
                              className="rounded-lg border bg-white p-4"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-medium">
                                    {item?.name || stock.itemId}
                                  </p>
                                  <p className="text-sm text-slate-500">
                                    {stockLabel(stock)}
                                  </p>
                                </div>
                                <Badge
                                  variant="outline"
                                  className={statusBadgeClass(stock.status || "available")}
                                >
                                  {stock.stockType === "bulk_quantity"
                                    ? "Quantità"
                                    : inventoryStatusLabels[
                                        stock.status || "available"
                                      ]}
                                </Badge>
                              </div>
                              <p className="mt-3 text-xs text-slate-500">
                                {stock.notes || "Nessuna nota"}
                              </p>
                              <div className="mt-4 flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={
                                    stock.stockType === "single_unit"
                                      ? stock.status !== "available"
                                      : (stock.quantityAvailable || 0) <= 0
                                  }
                                  onClick={() => {
                                    setAssignmentForm({
                                      ...emptyAssignmentForm,
                                      targetType: "item",
                                      itemId: stock.itemId,
                                      source: "inventory",
                                      status: "reserved",
                                      numberingGroupId:
                                        stock.numberingGroupId || "",
                                      components: {
                                        [stock.itemId]: {
                                          itemId: stock.itemId,
                                          inventoryStockId: stock.id,
                                          size: stock.size || "",
                                          color: stock.color || "",
                                          variant: stock.variant || "",
                                          number: stock.number ?? null,
                                          numberingGroupId:
                                            stock.numberingGroupId || "",
                                        },
                                      },
                                    });
                                    setAssignmentDialogOpen(true);
                                  }}
                                >
                                  Assegna
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setStockForm({
                                      id: stock.id,
                                      stockType: stock.stockType,
                                      itemId: stock.itemId,
                                      size: stock.size || "",
                                      color: stock.color || "",
                                      variant: stock.variant || "",
                                      number:
                                        stock.number === null ||
                                        stock.number === undefined
                                          ? ""
                                          : String(stock.number),
                                      numberingGroupId:
                                        stock.numberingGroupId || "",
                                      status: stock.status || "available",
                                      quantityAvailable: String(
                                        stock.quantityAvailable || 0,
                                      ),
                                      notes: stock.notes || "",
                                    });
                                    setStockDialogOpen(true);
                                  }}
                                >
                                  Modifica
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      {!state.inventory.length ? (
                        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">
                          Nessun magazzino registrato.
                        </div>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="catalogo" className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>Articoli</CardTitle>
                          <CardDescription>
                            Catalogo configurabile con taglie, colori e numeri.
                          </CardDescription>
                        </div>
                        <Dialog
                          open={itemDialogOpen}
                          onOpenChange={setItemDialogOpen}
                        >
                          <DialogTrigger asChild>
                            <Button onClick={() => setItemForm(emptyItemForm)}>
                              <Plus className="mr-2 h-4 w-4" /> Articolo
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Articolo</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <Input
                                placeholder="Nome"
                                value={itemForm.name}
                                onChange={(event) =>
                                  setItemForm((current) => ({
                                    ...current,
                                    name: event.target.value,
                                  }))
                                }
                              />
                              <div className="grid gap-3 md:grid-cols-2">
                                <Input
                                  placeholder="Tipo"
                                  value={itemForm.type}
                                  onChange={(event) =>
                                    setItemForm((current) => ({
                                      ...current,
                                      type: event.target.value,
                                    }))
                                  }
                                />
                                <Input
                                  placeholder="Codice"
                                  value={itemForm.code}
                                  onChange={(event) =>
                                    setItemForm((current) => ({
                                      ...current,
                                      code: event.target.value,
                                    }))
                                  }
                                />
                              </div>
                              <Textarea
                                placeholder="Descrizione"
                                value={itemForm.description}
                                onChange={(event) =>
                                  setItemForm((current) => ({
                                    ...current,
                                    description: event.target.value,
                                  }))
                                }
                              />
                              <Input
                                placeholder="Taglie separate da virgola"
                                value={itemForm.sizes}
                                onChange={(event) =>
                                  setItemForm((current) => ({
                                    ...current,
                                    sizes: event.target.value,
                                  }))
                                }
                              />
                              <Input
                                placeholder="Colori separati da virgola"
                                value={itemForm.colors}
                                onChange={(event) =>
                                  setItemForm((current) => ({
                                    ...current,
                                    colors: event.target.value,
                                  }))
                                }
                              />
                              <Input
                                placeholder="Varianti separate da virgola"
                                value={itemForm.variants}
                                onChange={(event) =>
                                  setItemForm((current) => ({
                                    ...current,
                                    variants: event.target.value,
                                  }))
                                }
                              />
                              <div>
                                <Label>Categorie compatibili</Label>
                                <div className="mt-2">
                                  {renderCategoryCheckboxes(
                                    itemForm.compatibleCategoryIds,
                                    (next) =>
                                      setItemForm((current) => ({
                                        ...current,
                                        compatibleCategoryIds: next,
                                      })),
                                  )}
                                </div>
                              </div>
                              <div className="grid gap-3 md:grid-cols-3">
                                <label className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={itemForm.requiresSize}
                                    onChange={(event) =>
                                      setItemForm((current) => ({
                                        ...current,
                                        requiresSize: event.target.checked,
                                      }))
                                    }
                                  />
                                  Richiede taglia
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={itemForm.requiresColor}
                                    onChange={(event) =>
                                      setItemForm((current) => ({
                                        ...current,
                                        requiresColor: event.target.checked,
                                      }))
                                    }
                                  />
                                  Richiede colore
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={itemForm.requiresNumber}
                                    onChange={(event) =>
                                      setItemForm((current) => ({
                                        ...current,
                                        requiresNumber: event.target.checked,
                                        numberMode: event.target.checked
                                          ? "per_item"
                                          : "none",
                                      }))
                                    }
                                  />
                                  Richiede numero
                                </label>
                              </div>
                              <div className="grid gap-3 md:grid-cols-2">
                                <Select
                                  value={itemForm.numberMode}
                                  onValueChange={(value) =>
                                    setItemForm((current) => ({
                                      ...current,
                                      numberMode: value as ClothingNumberMode,
                                      requiresNumber: value !== "none",
                                    }))
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">Nessun numero</SelectItem>
                                    <SelectItem value="shared_by_kit">
                                      Condiviso nel kit
                                    </SelectItem>
                                    <SelectItem value="per_item">
                                      Numero per articolo
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                <Select
                                  value={itemForm.stockMode}
                                  onValueChange={(value) =>
                                    setItemForm((current) => ({
                                      ...current,
                                      stockMode: value as ClothingStockMode,
                                    }))
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="single_unit">
                                      Unità singola
                                    </SelectItem>
                                    <SelectItem value="bulk_quantity">
                                      Quantità generica
                                    </SelectItem>
                                    <SelectItem value="both">Entrambi</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  onClick={() => setItemDialogOpen(false)}
                                >
                                  Annulla
                                </Button>
                                <Button onClick={saveItem}>Salva</Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {state.items.map((item) => (
                        <div key={item.id} className="rounded-lg border p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium">{item.name}</p>
                              <p className="text-sm text-slate-500">
                                {item.type} {item.code ? `- ${item.code}` : ""}
                              </p>
                            </div>
                            <Badge variant="outline">{item.stockMode}</Badge>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1">
                            {item.sizes.map((size) => (
                              <Badge key={size} variant="secondary">
                                {size}
                              </Badge>
                            ))}
                            {item.requiresNumber ? (
                              <Badge className="border-blue-200 bg-blue-50 text-blue-700">
                                numero
                              </Badge>
                            ) : null}
                          </div>
                          <div className="mt-4 flex justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setItemForm({
                                  id: item.id,
                                  name: item.name,
                                  type: item.type,
                                  description: item.description || "",
                                  code: item.code || "",
                                  sizes: item.sizes.join(", "),
                                  colors: item.colors.join(", "),
                                  variants: item.variants.join(", "),
                                  compatibleCategoryIds:
                                    item.compatibleCategoryIds,
                                  requiresSize: item.requiresSize,
                                  requiresColor: item.requiresColor,
                                  requiresNumber: item.requiresNumber,
                                  numberMode: item.numberMode,
                                  stockMode: item.stockMode,
                                });
                                setItemDialogOpen(true);
                              }}
                            >
                              Modifica
                            </Button>
                          </div>
                        </div>
                      ))}
                      {!state.items.length ? (
                        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">
                          Nessun articolo configurato.
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>Kit</CardTitle>
                          <CardDescription>
                            Kit composti da più componenti.
                          </CardDescription>
                        </div>
                        <Dialog open={kitDialogOpen} onOpenChange={setKitDialogOpen}>
                          <DialogTrigger asChild>
                            <Button onClick={() => setKitForm(emptyKitForm)}>
                              <Plus className="mr-2 h-4 w-4" /> Kit
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Kit</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <Input
                                placeholder="Nome kit"
                                value={kitForm.name}
                                onChange={(event) =>
                                  setKitForm((current) => ({
                                    ...current,
                                    name: event.target.value,
                                  }))
                                }
                              />
                              <Textarea
                                placeholder="Descrizione"
                                value={kitForm.description}
                                onChange={(event) =>
                                  setKitForm((current) => ({
                                    ...current,
                                    description: event.target.value,
                                  }))
                                }
                              />
                              <div className="grid gap-3 md:grid-cols-2">
                                <Input
                                  placeholder="Stagione"
                                  value={kitForm.season}
                                  onChange={(event) =>
                                    setKitForm((current) => ({
                                      ...current,
                                      season: event.target.value,
                                    }))
                                  }
                                />
                                <Select
                                  value={kitForm.numberMode}
                                  onValueChange={(value) =>
                                    setKitForm((current) => ({
                                      ...current,
                                      numberMode: value as ClothingNumberMode,
                                    }))
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">Nessun numero</SelectItem>
                                    <SelectItem value="shared_by_kit">
                                      Numero condiviso
                                    </SelectItem>
                                    <SelectItem value="per_item">
                                      Numero per articolo
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <Select
                                value={kitForm.numberingGroupId}
                                onValueChange={(value) =>
                                  setKitForm((current) => ({
                                    ...current,
                                    numberingGroupId: value,
                                  }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Gruppo numerazione" />
                                </SelectTrigger>
                                <SelectContent>
                                  {state.numberingGroups.map((group) => (
                                    <SelectItem key={group.id} value={group.id}>
                                      {group.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <div>
                                <Label>Categorie compatibili</Label>
                                <div className="mt-2">
                                  {renderCategoryCheckboxes(
                                    kitForm.compatibleCategoryIds,
                                    (next) =>
                                      setKitForm((current) => ({
                                        ...current,
                                        compatibleCategoryIds: next,
                                      })),
                                  )}
                                </div>
                              </div>
                              <div>
                                <Label>Componenti</Label>
                                <div className="mt-2 space-y-2 rounded-md border p-3">
                                  {state.items.map((item) => {
                                    const existing = kitForm.components.find(
                                      (component) => component.itemId === item.id,
                                    );
                                    return (
                                      <label
                                        key={item.id}
                                        className="flex items-center justify-between gap-3 text-sm"
                                      >
                                        <span className="flex items-center gap-2">
                                          <input
                                            type="checkbox"
                                            checked={Boolean(existing)}
                                            onChange={() =>
                                              setKitForm((current) => ({
                                                ...current,
                                                components: existing
                                                  ? current.components.filter(
                                                      (component) =>
                                                        component.itemId !== item.id,
                                                    )
                                                  : [
                                                      ...current.components,
                                                      {
                                                        itemId: item.id,
                                                        name: item.name,
                                                        required: true,
                                                        defaultSizeSource:
                                                          "athlete",
                                                        requiresNumberOverride:
                                                          null,
                                                        sharedKitNumber: true,
                                                      },
                                                    ],
                                              }))
                                            }
                                          />
                                          {item.name}
                                        </span>
                                        {existing ? (
                                          <Badge variant="secondary">
                                            incluso
                                          </Badge>
                                        ) : null}
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  onClick={() => setKitDialogOpen(false)}
                                >
                                  Annulla
                                </Button>
                                <Button onClick={saveKit}>Salva</Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {state.kits.map((kit) => (
                        <div key={kit.id} className="rounded-lg border p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium">{kit.name}</p>
                              <p className="text-sm text-slate-500">
                                {kit.description || "Nessuna descrizione"}
                              </p>
                            </div>
                            <Badge variant="outline">
                              {kit.numberMode === "shared_by_kit"
                                ? "numero condiviso"
                                : kit.numberMode === "per_item"
                                  ? "numero per articolo"
                                  : "senza numero"}
                            </Badge>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1">
                            {kit.components.map((component) => (
                              <Badge key={component.itemId} variant="secondary">
                                {component.name ||
                                  itemById.get(component.itemId)?.name ||
                                component.itemId}
                              </Badge>
                            ))}
                          </div>
                          <div className="mt-4 flex justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setKitForm({
                                  id: kit.id,
                                  name: kit.name,
                                  description: kit.description || "",
                                  season: kit.season || "",
                                  compatibleCategoryIds:
                                    kit.compatibleCategoryIds,
                                  numberingGroupId:
                                    kit.numberingGroupId || "",
                                  numberMode: kit.numberMode,
                                  components: kit.components,
                                });
                                setKitDialogOpen(true);
                              }}
                            >
                              Modifica
                            </Button>
                          </div>
                        </div>
                      ))}
                      {!state.kits.length ? (
                        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">
                          Nessun kit configurato.
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="numerazioni" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Gruppi numerazione</CardTitle>
                        <CardDescription>
                          I numeri sono unici solo dentro il gruppo.
                        </CardDescription>
                      </div>
                      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
                        <DialogTrigger asChild>
                          <Button
                            onClick={() =>
                              setGroupForm({
                                id: "",
                                name: "",
                                categoryIds: [],
                                season: "",
                                minNumber: 0,
                                maxNumber: 99,
                                reservedNumbers: [],
                                assignedNumbers: [],
                              })
                            }
                          >
                            <Plus className="mr-2 h-4 w-4" /> Gruppo
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Gruppo numerazione</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <Input
                              placeholder="Nome gruppo"
                              value={groupForm.name}
                              onChange={(event) =>
                                setGroupForm((current) => ({
                                  ...current,
                                  name: event.target.value,
                                }))
                              }
                            />
                            <Input
                              placeholder="Stagione"
                              value={groupForm.season || ""}
                              onChange={(event) =>
                                setGroupForm((current) => ({
                                  ...current,
                                  season: event.target.value,
                                }))
                              }
                            />
                            <div className="grid gap-3 md:grid-cols-2">
                              <Input
                                type="number"
                                value={groupForm.minNumber}
                                onChange={(event) =>
                                  setGroupForm((current) => ({
                                    ...current,
                                    minNumber: Number(event.target.value),
                                  }))
                                }
                              />
                              <Input
                                type="number"
                                value={groupForm.maxNumber}
                                onChange={(event) =>
                                  setGroupForm((current) => ({
                                    ...current,
                                    maxNumber: Number(event.target.value),
                                  }))
                                }
                              />
                            </div>
                            {renderCategoryCheckboxes(
                              groupForm.categoryIds,
                              (next) =>
                                setGroupForm((current) => ({
                                  ...current,
                                  categoryIds: next,
                                })),
                            )}
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                onClick={() => setGroupDialogOpen(false)}
                              >
                                Annulla
                              </Button>
                              <Button onClick={saveGroup}>Salva</Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-2">
                    {state.numberingGroups.map((group) => {
                      const used = state.jerseyAssignments.filter(
                        (entry) =>
                          entry.groupId === group.id && entry.number !== null,
                      );
                      return (
                        <div key={group.id} className="rounded-lg border p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium">{group.name}</p>
                              <p className="text-sm text-slate-500">
                                {group.minNumber}-{group.maxNumber}
                                {group.season ? ` - ${group.season}` : ""}
                              </p>
                            </div>
                            <Badge variant="outline">{used.length} numeri</Badge>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1">
                            {group.categoryIds.map((categoryId) => (
                              <Badge key={categoryId} variant="secondary">
                                {categoryOptions.find((cat) => cat.id === categoryId)
                                  ?.name || categoryId}
                              </Badge>
                            ))}
                          </div>
                          <div className="mt-4 flex justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setGroupForm(group);
                                setGroupDialogOpen(true);
                              }}
                            >
                              Modifica
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    {!state.numberingGroups.length ? (
                      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-slate-500">
                        Nessun gruppo numerazione configurato.
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="ordini" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Ordini fornitore</CardTitle>
                    <CardDescription>
                      Richieste da produrre o personalizzare, derivate dalle
                      assegnazioni da ordinare.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full min-w-[980px] text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Atleta</th>
                            <th className="px-3 py-2">Categoria</th>
                            <th className="px-3 py-2">Articoli</th>
                            <th className="px-3 py-2">Taglie</th>
                            <th className="px-3 py-2">Numeri</th>
                            <th className="px-3 py-2">Stato</th>
                            <th className="px-3 py-2">Aggiorna</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {supplierAssignments.length ? (
                            supplierAssignments.map((assignment) => {
                              const athlete = athletesById.get(assignment.athleteId);
                              return (
                                <tr key={assignment.id}>
                                  <td className="px-3 py-3 font-medium">
                                    {athleteLabel(athlete)}
                                  </td>
                                  <td className="px-3 py-3">
                                    {getAthleteCategoryLabel(athlete)}
                                  </td>
                                  <td className="px-3 py-3">
                                    {assignment.items
                                      .map((item) => item.name)
                                      .join(", ")}
                                  </td>
                                  <td className="px-3 py-3">
                                    {assignment.items
                                      .map((item) => item.size)
                                      .filter(Boolean)
                                      .join(", ") || "-"}
                                  </td>
                                  <td className="px-3 py-3">
                                    {assignment.items
                                      .map((item) =>
                                        item.number !== null &&
                                        item.number !== undefined
                                          ? `n.${item.number}`
                                          : "",
                                      )
                                      .filter(Boolean)
                                      .join(", ") || "-"}
                                  </td>
                                  <td className="px-3 py-3">
                                    <Badge
                                      variant="outline"
                                      className={statusBadgeClass(assignment.status)}
                                    >
                                      {assignmentStatusLabels[assignment.status]}
                                    </Badge>
                                  </td>
                                  <td className="px-3 py-3">
                                    <Select
                                      value={assignment.status}
                                      onValueChange={(value) =>
                                        updateAssignmentStatus(
                                          assignment,
                                          value as ClothingAssignmentStatus,
                                        )
                                      }
                                    >
                                      <SelectTrigger className="w-44">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {supplierOrderStatuses.map((status) => (
                                          <SelectItem key={status} value={status}>
                                            {assignmentStatusLabels[status]}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td
                                colSpan={7}
                                className="px-3 py-8 text-center text-slate-500"
                              >
                                Nessun ordine fornitore reale.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {loading ? (
              <div className="fixed inset-x-0 bottom-4 mx-auto flex w-fit items-center gap-2 rounded-full border bg-white px-4 py-2 text-sm shadow">
                <AlertCircle className="h-4 w-4 text-blue-600" />
                Caricamento magazzino...
              </div>
            ) : null}
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}
