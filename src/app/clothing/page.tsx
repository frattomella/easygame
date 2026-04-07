"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/use-toast";
import {
  Plus,
  Edit,
  Trash2,
  Shirt,
  ChevronDown,
  ChevronUp,
  Pencil,
} from "lucide-react";

function formatDate(dateString?: string) {
  if (!dateString) return "-";
  try {
    return new Date(dateString).toLocaleDateString("it-IT");
  } catch (e) {
    return "-";
  }
}

type Product = {
  id: string;
  title: string;
  description?: string;
  code: string;
};

type InventoryRow = {
  productId: string;
  qty: number;
};

const normalizeKitComponentName = (component: any) => {
  if (typeof component === "string") {
    return component.trim();
  }

  if (component && typeof component === "object") {
    return String(
      component.name ||
        component.title ||
        component.component ||
        component.label ||
        "",
    ).trim();
  }

  return "";
};

const normalizeKitComponents = (components: any) =>
  Array.isArray(components)
    ? components
        .map((component) => normalizeKitComponentName(component))
        .filter(Boolean)
    : [];

const normalizeKitRecord = (kit: any) => ({
  ...kit,
  components: normalizeKitComponents(kit?.components),
});

export default function ClothingPage() {
  const { activeClub, user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);

  // Kits
  const [clothingKits, setClothingKits] = useState<any[]>([]);
  const [kitAssignments, setKitAssignments] = useState<any[]>([]);

  // People
  const [athletes, setAthletes] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);

  // Categories registry
  const [registeredCategories, setRegisteredCategories] = useState<string[]>(
    [],
  );

  // Products + inventory
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);

  // Kit dialog
  const [isKitDialogOpen, setIsKitDialogOpen] = useState(false);
  const [editingKit, setEditingKit] = useState<any>(null);
  const [newKit, setNewKit] = useState<any>({
    name: "",
    description: "",
    price: 0,
    components: [],
  });

  // Assignment dialog
  const [isAssignmentDialogOpen, setIsAssignmentDialogOpen] = useState(false);
  const [newAssignment, setNewAssignment] = useState<any>({
    assigneeId: "",
    assigneeType: "athlete", // athlete | staff
    assignmentType: "kit", // kit | components
    kitId: "",
    components: [],
    notes: "",
  });

  // Product add
  const [newProduct, setNewProduct] = useState<any>({
    title: "",
    description: "",
    code: "",
  });
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);

  const [isMissingOpen, setIsMissingOpen] = useState(true);
  const [isDeliveredOpen, setIsDeliveredOpen] = useState(true);
  const [jerseyGroups, setJerseyGroups] = useState<
    { id: string; name: string; categories: string[] }[]
  >([]);
  const [jerseyAssignments, setJerseyAssignments] = useState<
    {
      athleteId: string;
      groupId: string | null;
      number: number | null;
      updatedAt: string;
    }[]
  >([]);
  const [jerseyGroupFilterId, setJerseyGroupFilterId] = useState<string | null>(
    null,
  );
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<
    string | null
  >(null);
  const dupWarnRef = useRef<Record<string, number>>({});
  const [shortcutGroupId, setShortcutGroupId] = useState<string | null>(null);
  const [groupDraft, setGroupDraft] = useState<{
    name: string;
    categories: string[];
  }>({
    name: "",
    categories: [],
  });

  useEffect(() => {
    const load = async () => {
      if (!activeClub?.id || !user) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const { getClubData, getClubAthletes, getClubStaff } = await import(
          "@/lib/simplified-db"
        );

        // kits + assignments
        const kitsData = await getClubData(activeClub.id, "clothing_kits");
        const assignmentsData = await getClubData(
          activeClub.id,
          "kit_assignments",
        );

        setClothingKits(
          Array.isArray(kitsData) ? kitsData.map(normalizeKitRecord) : [],
        );
        setKitAssignments(
          Array.isArray(assignmentsData) ? assignmentsData : [],
        );

        // products + inventory
        const productsData = await getClubData(
          activeClub.id,
          "clothing_products",
        );
        const inventoryData = await getClubData(
          activeClub.id,
          "clothing_inventory",
        );
        setProducts(Array.isArray(productsData) ? productsData : []);
        setInventory(Array.isArray(inventoryData) ? inventoryData : []);

        // jersey numbers
        const jerseyGroupsData = await getClubData(
          activeClub.id,
          "jersey_groups",
        );
        setJerseyGroups(
          Array.isArray(jerseyGroupsData) ? jerseyGroupsData : [],
        );
        const jerseyAssignmentsData = await getClubData(
          activeClub.id,
          "jersey_assignments",
        );
        setJerseyAssignments(
          Array.isArray(jerseyAssignmentsData) ? jerseyAssignmentsData : [],
        );

        // people
        try {
          const ath = await getClubAthletes(activeClub.id);
          setAthletes(Array.isArray(ath) ? ath : []);
        } catch (e) {
          setAthletes([]);
        }
        try {
          const st = await getClubStaff(activeClub.id);
          setStaff(Array.isArray(st) ? st : []);
        } catch (e) {
          setStaff([]);
        }
      } catch (e: any) {
        toast({
          title: "Errore",
          description: e?.message || "Impossibile caricare",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activeClub?.id, user]);

  const peopleOptions = useMemo(() => {
    const a = athletes.map((x: any) => ({
      id: x.id,
      type: "athlete",
      label: `${x.name || ""} ${x.surname || ""}`.trim() || x.id,
    }));
    const s = staff.map((x: any) => ({
      id: x.id,
      type: "staff",
      label: `${x.name || ""} ${x.surname || ""}`.trim() || x.id,
    }));
    return [...a, ...s].sort((p, q) => p.label.localeCompare(q.label));
  }, [athletes, staff]);

  const normalizeAssignments = (arr: any[]) => {
    return (arr || []).map((a: any) => {
      const assigneeId = a.assigneeId || a.athleteId || a.memberId || "";
      const assigneeType =
        a.assigneeType ||
        (a.athleteId ? "athlete" : a.staffId ? "staff" : "member");
      const createdAt =
        a.createdAt || a.date || a.created_at || new Date().toISOString();
      const items =
        Array.isArray(a.items) && a.items.length
          ? a.items
          : (Array.isArray(a.components) ? a.components : []).map((c: any) => ({
              name: typeof c === "string" ? c : c?.name || "",
              delivered:
                a.status === "delivered" || a.status === "completed" || false,
              deliveredAt: a.deliveredAt || null,
            }));
      return { ...a, assigneeId, assigneeType, createdAt, items };
    });
  };

  const effectiveAssignment = useMemo(() => {
    const byAthlete = new Map<
      string,
      { groupId: string | null; number: number | null }
    >();
    for (const a of athletes) {
      const athleteId = a.id;
      const category = a?.data?.category || "Senza Categoria";
      const existing =
        jerseyAssignments.find((x: any) => x.athleteId === athleteId) || null;
      const defaultGroup =
        jerseyGroups.find((g: any) =>
          (g.categories || []).includes(category),
        ) || null;
      const groupId = existing?.groupId ?? defaultGroup?.id ?? null;
      const rawNumber = existing?.number ?? a?.data?.jerseyNumber ?? null;
      const number =
        rawNumber === null || rawNumber === undefined || rawNumber === ""
          ? null
          : Number(rawNumber);
      byAthlete.set(athleteId, {
        groupId,
        number: Number.isNaN(number as any) ? null : (number as any),
      });
    }
    return byAthlete;
  }, [athletes, jerseyAssignments, jerseyGroups]);

  const athletesForNumbers = useMemo(() => {
    if (!jerseyGroupFilterId) return athletes;
    const group = jerseyGroups.find((g: any) => g.id === jerseyGroupFilterId);
    if (!group) return athletes;
    const cats = Array.isArray(group.categories) ? group.categories : [];
    return athletes.filter((a: any) => {
      const athleteId = a.id;
      const category = a?.data?.category || "Senza Categoria";
      const assigned = effectiveAssignment.get(athleteId);
      if (assigned?.groupId === group.id) return true;
      return cats.includes(category);
    });
  }, [athletes, jerseyGroups, jerseyGroupFilterId, effectiveAssignment]);

  const duplicateNumberMap = useMemo(() => {
    const counts = new Map<string, number>();
    for (const [, v] of Array.from(effectiveAssignment.entries())) {
      if (!v.groupId || v.number === null || Number.isNaN(v.number)) continue;
      const key = `${v.groupId}:${v.number}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [effectiveAssignment]);

  const normalizedAssignments = useMemo(
    () => normalizeAssignments(kitAssignments),
    [kitAssignments],
  );

  const inventoryQtyByTitle = useMemo(() => {
    const byId = new Map<string, number>();
    inventory.forEach((r) => byId.set(r.productId, Number(r.qty || 0)));
    const byTitle = new Map<string, number>();
    products.forEach((p) =>
      byTitle.set(p.title.trim().toLowerCase(), byId.get(p.id) || 0),
    );
    return { byId, byTitle };
  }, [products, inventory]);

  const missingRows = useMemo(() => {
    const rows: any[] = [];
    normalizedAssignments.forEach((a: any) => {
      (a.items || []).forEach((it: any, idx: number) => {
        if (it.delivered) return;
        const titleKey = String(it.name || "")
          .trim()
          .toLowerCase();
        const qty = inventoryQtyByTitle.byTitle.get(titleKey) ?? 0;
        rows.push({
          assignmentId: a.id,
          assigneeId: a.assigneeId,
          assigneeType: a.assigneeType,
          kitName:
            a.kitName ||
            (a.assignmentType === "components" ? "Componenti" : "-"),
          componentName: it.name,
          hasStock: qty > 0,
          createdAt: a.createdAt,
          notes: a.notes || "",
          itemIndex: idx,
        });
      });
    });
    return rows.sort((x, y) =>
      String(y.createdAt).localeCompare(String(x.createdAt)),
    );
  }, [normalizedAssignments, inventoryQtyByTitle]);

  const deliveredRows = useMemo(() => {
    const rows: any[] = [];
    normalizedAssignments.forEach((a: any) => {
      (a.items || []).forEach((it: any) => {
        if (!it.delivered) return;
        rows.push({
          assignmentId: a.id,
          assigneeId: a.assigneeId,
          assigneeType: a.assigneeType,
          kitName:
            a.kitName ||
            (a.assignmentType === "components" ? "Componenti" : "-"),
          componentName: it.name,
          deliveredAt:
            it.deliveredAt || a.updatedAt || a.updated_at || a.createdAt,
          notes: a.notes || "",
        });
      });
    });
    return rows.sort((x, y) =>
      String(y.deliveredAt).localeCompare(String(x.deliveredAt)),
    );
  }, [normalizedAssignments]);

  const getPersonLabel = (id: string) =>
    peopleOptions.find((p) => p.id === id)?.label || id;

  const resetKitForm = () => {
    setEditingKit(null);
    setNewKit({ name: "", description: "", price: 0, components: [] });
  };

  const toggleKitComponent = (productTitle: string) => {
    const title = String(productTitle || "").trim();
    if (!title) return;
    const current = normalizeKitComponents(newKit.components);
    const exists = current.some((x: string) => x === title);
    const next = exists
      ? current.filter((x: string) => x !== title)
      : [...current, title];
    setNewKit({ ...newKit, components: next });
  };

  const saveKit = async () => {
    try {
      if (!activeClub?.id) throw new Error("Club non trovato");
      const { addClubData, updateClubDataItem } = await import(
        "@/lib/simplified-db"
      );

      const payload = {
        ...newKit,
        id:
          editingKit?.id ||
          (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now())),
        components: normalizeKitComponents(newKit.components),
      };

      if (editingKit) {
        await updateClubDataItem(
          activeClub.id,
          "clothing_kits",
          payload.id,
          payload,
        );
        setClothingKits((prev) =>
          prev.map((k) => (k.id === payload.id ? payload : k)),
        );
      } else {
        await addClubData(activeClub.id, "clothing_kits", payload);
        setClothingKits((prev) => [...prev, payload]);
      }

      setIsKitDialogOpen(false);
      resetKitForm();
      toast({ title: "Salvato", description: "Kit aggiornato." });
    } catch (e: any) {
      toast({
        title: "Errore",
        description: e?.message || "Impossibile salvare",
        variant: "destructive",
      });
    }
  };

  const deleteKit = async (kitId: string) => {
    try {
      if (!activeClub?.id) throw new Error("Club non trovato");
      const { deleteClubDataItem } = await import("@/lib/simplified-db");
      await deleteClubDataItem(activeClub.id, "clothing_kits", kitId);
      setClothingKits((prev) => prev.filter((k) => k.id !== kitId));
      toast({ title: "Eliminato", description: "Kit rimosso." });
    } catch (e: any) {
      toast({
        title: "Errore",
        description: e?.message || "Impossibile eliminare",
        variant: "destructive",
      });
    }
  };

  const resetAssignmentForm = () => {
    setNewAssignment({
      assigneeId: "",
      assigneeType: "athlete",
      assignmentType: "kit",
      kitId: "",
      components: [],
      notes: "",
    });
  };

  const createAssignment = async () => {
    try {
      if (!activeClub?.id) throw new Error("Club non trovato");
      const { addClubData } = await import("@/lib/simplified-db");

      const kit = clothingKits.find((k) => k.id === newAssignment.kitId);
      const components =
        newAssignment.assignmentType === "kit"
          ? normalizeKitComponents(kit?.components)
          : normalizeKitComponents(newAssignment.components);

      const assignment = {
        id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()),
        assigneeId: newAssignment.assigneeId,
        assigneeType: newAssignment.assigneeType,
        kitId:
          newAssignment.assignmentType === "kit" ? newAssignment.kitId : null,
        kitName: kit?.name || null,
        assignmentType: newAssignment.assignmentType,
        notes: newAssignment.notes || "",
        createdAt: new Date().toISOString(),
        items: (components || []).map((c: any) => ({
          name: typeof c === "string" ? c : c?.name || "",
          delivered: false,
          deliveredAt: null,
        })),
      };

      await addClubData(activeClub.id, "kit_assignments", assignment);
      setKitAssignments((prev) => [...prev, assignment]);

      setIsAssignmentDialogOpen(false);
      resetAssignmentForm();
      toast({
        title: "Assegnazione creata",
        description: "Registrata correttamente.",
      });
    } catch (e: any) {
      toast({
        title: "Errore",
        description: e?.message || "Impossibile creare",
        variant: "destructive",
      });
    }
  };

  const addProduct = async () => {
    try {
      if (!activeClub?.id) throw new Error("Club non trovato");
      const { addClubData } = await import("@/lib/simplified-db");
      if (!newProduct.title || !newProduct.code)
        throw new Error("Titolo e codice prodotto sono obbligatori");

      const p: Product = {
        id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()),
        title: newProduct.title,
        description: newProduct.description || "",
        code: newProduct.code,
      };

      await addClubData(activeClub.id, "clothing_products", p);
      setProducts((prev) => [...prev, p]);
      setNewProduct({ title: "", description: "", code: "" });
      setIsProductDialogOpen(false);
      toast({
        title: "Prodotto aggiunto",
        description: "Registrato correttamente.",
      });
    } catch (e: any) {
      toast({
        title: "Errore",
        description: e?.message || "Impossibile aggiungere",
        variant: "destructive",
      });
    }
  };

  const updateInventoryQty = async (productId: string, delta: number) => {
    try {
      if (!activeClub?.id) throw new Error("Club non trovato");
      const { updateClubData } = await import("@/lib/simplified-db");

      const next = [...inventory];
      const idx = next.findIndex((r) => r.productId === productId);
      if (idx >= 0)
        next[idx] = {
          ...next[idx],
          qty: Math.max(0, (next[idx].qty || 0) + delta),
        };
      else next.push({ productId, qty: Math.max(0, delta) });

      await updateClubData(activeClub.id, "clothing_inventory", next);
      setInventory(next);
    } catch (e: any) {
      toast({
        title: "Errore",
        description: e?.message || "Impossibile aggiornare magazzino",
        variant: "destructive",
      });
    }
  };

  const upsertJerseyNumber = async (params: {
    athlete: any;
    athleteId: string;
    groupId: string | null;
    nextNumber: number | null;
  }) => {
    try {
      if (!activeClub?.id) throw new Error("Club non trovato");

      const { athlete, athleteId, groupId, nextNumber } = params;

      if (
        nextNumber !== null &&
        (Number.isNaN(nextNumber) || nextNumber < 0 || nextNumber > 99)
      ) {
        return;
      }

      const shouldWarnDuplicate =
        nextNumber !== null &&
        groupId &&
        jerseyAssignments.some(
          (x) =>
            x.athleteId !== athleteId &&
            x.groupId === groupId &&
            x.number === nextNumber,
        );

      const { updateClubData, updateAthlete } = await import(
        "@/lib/simplified-db"
      );
      const now = new Date().toISOString();
      const next = [...jerseyAssignments];
      const idx = next.findIndex((x) => x.athleteId === athleteId);

      const entry = {
        athleteId,
        groupId: groupId ?? null,
        number: nextNumber,
        updatedAt: now,
      };

      if (idx >= 0) next[idx] = entry;
      else next.push(entry);

      await updateClubData(activeClub.id, "jersey_assignments", next);
      setJerseyAssignments(next);

      if (shouldWarnDuplicate && groupId && nextNumber !== null) {
        const key = `${groupId}:${nextNumber}`;
        const now = Date.now();
        const last = dupWarnRef.current[key] || 0;
        dupWarnRef.current[key] = now;
        // avoid toast spam while typing
        if (now - last > 1200) {
          setTimeout(() => {
            toast({
              title: "Attenzione: doppione",
              description:
                "Hai inserito un numero già presente nello stesso gruppo.",
            });
          }, 1000);
        }
      }

      // sync on athlete data (best-effort)
      try {
        await updateAthlete(athleteId, {
          data: {
            ...(athlete?.data || {}),
            jerseyNumber: nextNumber,
          },
        });
      } catch (e) {
        // ignore: still stored on club
      }
    } catch (e: any) {
      toast({
        title: "Errore",
        description: e?.message || "Impossibile aggiornare",
        variant: "destructive",
      });
    }
  };

  const assignRandomJerseyNumber = async (params: {
    athlete: any;
    athleteId: string;
    groupId: string;
  }) => {
    const { athlete, athleteId, groupId } = params;

    // Numbers in use in this group (excluding current athlete)
    const used = new Set<number>();
    jerseyAssignments
      .filter(
        (x) =>
          x.groupId === groupId &&
          x.athleteId !== athleteId &&
          x.number !== null,
      )
      .forEach((x) => {
        if (typeof x.number === "number") used.add(x.number);
      });

    const available: number[] = [];
    for (let n = 0; n <= 99; n++) {
      if (!used.has(n)) available.push(n);
    }

    if (!available.length) {
      toast({
        title: "Nessun numero disponibile",
        description:
          "Nel gruppo selezionato sono già occupati tutti i numeri 0-99.",
        variant: "destructive",
      });
      return;
    }

    const picked = available[Math.floor(Math.random() * available.length)];
    await upsertJerseyNumber({
      athlete,
      athleteId,
      groupId,
      nextNumber: picked,
    });
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Abbigliamento" />

        <div className="flex-1 overflow-y-auto p-6">
          <Tabs defaultValue="assegnazioni" className="space-y-6">
            <TabsList className="grid grid-cols-3 w-full max-w-[640px]">
              <TabsTrigger
                value="assegnazioni"
                className="flex items-center gap-2"
              >
                <Shirt className="h-4 w-4" /> Assegnazioni
              </TabsTrigger>
              <TabsTrigger
                value="magazzino"
                className="flex items-center gap-2"
              >
                Magazzino
              </TabsTrigger>
              <TabsTrigger value="numeri">Numeri di gioco</TabsTrigger>
            </TabsList>

            <TabsContent value="assegnazioni" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Kit Abbigliamento</CardTitle>
                      <CardDescription>
                        Crea e gestisci i kit del club
                      </CardDescription>
                    </div>
                    <Dialog
                      open={isKitDialogOpen}
                      onOpenChange={setIsKitDialogOpen}
                    >
                      <>
                        <DialogTrigger asChild>
                          <Button
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={resetKitForm}
                          >
                            <Plus className="h-4 w-4 mr-2" /> Nuovo kit
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>
                              {editingKit ? "Modifica kit" : "Nuovo kit"}
                            </DialogTitle>
                          </DialogHeader>

                          <div className="space-y-4 py-2">
                            <div>
                              <Label>Nome</Label>
                              <Input
                                className="mt-2"
                                value={newKit.name}
                                onChange={(e) =>
                                  setNewKit({ ...newKit, name: e.target.value })
                                }
                              />
                            </div>
                            <div>
                              <Label>Descrizione</Label>
                              <Textarea
                                className="mt-2"
                                value={newKit.description}
                                onChange={(e) =>
                                  setNewKit({
                                    ...newKit,
                                    description: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <Label>Componenti del kit</Label>
                              <div className="mt-2 rounded-md border p-3 max-h-64 overflow-y-auto">
                                {products.length ? (
                                  <div className="space-y-2">
                                    {products
                                      .slice()
                                      .sort((a, b) =>
                                        a.title.localeCompare(b.title),
                                      )
                                      .map((p) => {
                                        const checked = (
                                          newKit.components || []
                                        ).some(
                                          (x: any) =>
                                            String(x).trim().toLowerCase() ===
                                            p.title.trim().toLowerCase(),
                                        );
                                        return (
                                          <label
                                            key={p.id}
                                            className="flex items-center gap-2 text-sm cursor-pointer"
                                          >
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              onChange={() =>
                                                toggleKitComponent(p.title)
                                              }
                                            />
                                            <span>{p.title}</span>
                                            <span className="text-xs text-muted-foreground">
                                              ({p.code})
                                            </span>
                                          </label>
                                        );
                                      })}
                                  </div>
                                ) : (
                                  <div className="text-sm text-muted-foreground">
                                    Nessun prodotto in magazzino. Crea prima i
                                    prodotti nella tab “Magazzino”.
                                  </div>
                                )}
                              </div>
                              <div className="mt-2 text-xs text-muted-foreground">
                                Mostra solo i prodotti registrati nel magazzino
                                del club.
                              </div>
                            </div>

                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                onClick={() => setIsKitDialogOpen(false)}
                              >
                                Annulla
                              </Button>
                              <Button
                                className="bg-blue-600 hover:bg-blue-700"
                                onClick={saveKit}
                                disabled={!newKit.name}
                              >
                                Salva
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </>
                    </Dialog>
                  </div>
                </CardHeader>

                <CardContent>
                  {loading ? (
                    <div className="text-muted-foreground">Caricamento...</div>
                  ) : clothingKits.length ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {clothingKits.map((kit) => (
                        <div key={kit.id} className="p-4 border rounded-lg">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="font-medium">{kit.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {kit.description}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setEditingKit(kit);
                                  setNewKit({
                                    name: kit.name || "",
                                    description: kit.description || "",
                                    price: kit.price || 0,
                                    components: normalizeKitComponents(
                                      kit.components,
                                    ),
                                  });
                                  setIsKitDialogOpen(true);
                                }}
                              >
                                <Edit className="h-4 w-4 text-blue-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteKit(kit.id)}
                              >
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-3">
                            {normalizeKitComponents(kit.components)
                              .slice(0, 6)
                              .map((c: string, i: number) => (
                                <Badge
                                  key={i}
                                  variant="secondary"
                                  className="text-xs"
                                >
                                  {c}
                                </Badge>
                              ))}
                            {normalizeKitComponents(kit.components).length > 6 && (
                              <Badge variant="secondary" className="text-xs">
                                +{normalizeKitComponents(kit.components).length - 6}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      Nessun kit presente
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle>Consegne mancanti</CardTitle>
                      <CardDescription>
                        Mostra solo articoli non ancora consegnati
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsMissingOpen((v) => !v)}
                        aria-label={isMissingOpen ? "Chiudi" : "Apri"}
                      >
                        {isMissingOpen ? (
                          <ChevronUp className="h-5 w-5" />
                        ) : (
                          <ChevronDown className="h-5 w-5" />
                        )}
                      </Button>

                      <Dialog
                        open={isAssignmentDialogOpen}
                        onOpenChange={setIsAssignmentDialogOpen}
                      >
                        <>
                          <DialogTrigger asChild>
                            <Button
                              className="bg-blue-600 hover:bg-blue-700"
                              onClick={resetAssignmentForm}
                            >
                              <Plus className="h-4 w-4 mr-2" /> Nuova
                              assegnazione
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Nuova assegnazione</DialogTitle>
                            </DialogHeader>

                            <div className="space-y-4 py-2">
                              <div>
                                <Label>Tesserato</Label>
                                <Select
                                  value={newAssignment.assigneeId}
                                  onValueChange={(val) => {
                                    const p = peopleOptions.find(
                                      (x) => x.id === val,
                                    );
                                    setNewAssignment({
                                      ...newAssignment,
                                      assigneeId: val,
                                      assigneeType:
                                        p?.type === "staff"
                                          ? "staff"
                                          : "athlete",
                                    });
                                  }}
                                >
                                  <SelectTrigger className="mt-2">
                                    <SelectValue placeholder="Seleziona tesserato" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {peopleOptions.map((p) => (
                                      <SelectItem key={p.id} value={p.id}>
                                        {p.label}{" "}
                                        {p.type === "staff" ? "(Staff)" : ""}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div>
                                <Label>Tipo assegnazione</Label>
                                <div className="flex gap-4 mt-2">
                                  <div className="flex items-center space-x-2">
                                    <input
                                      type="radio"
                                      id="a-kit"
                                      name="atype"
                                      value="kit"
                                      checked={
                                        newAssignment.assignmentType === "kit"
                                      }
                                      onChange={(e) =>
                                        setNewAssignment({
                                          ...newAssignment,
                                          assignmentType: e.target.value,
                                        })
                                      }
                                    />
                                    <Label htmlFor="a-kit">Kit completo</Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <input
                                      type="radio"
                                      id="a-comp"
                                      name="atype"
                                      value="components"
                                      checked={
                                        newAssignment.assignmentType ===
                                        "components"
                                      }
                                      onChange={(e) =>
                                        setNewAssignment({
                                          ...newAssignment,
                                          assignmentType: e.target.value,
                                        })
                                      }
                                    />
                                    <Label htmlFor="a-comp">
                                      Componenti singoli
                                    </Label>
                                  </div>
                                </div>
                              </div>

                              {newAssignment.assignmentType === "kit" ? (
                                <div>
                                  <Label>Seleziona kit</Label>
                                  <Select
                                    value={newAssignment.kitId}
                                    onValueChange={(val) =>
                                      setNewAssignment({
                                        ...newAssignment,
                                        kitId: val,
                                      })
                                    }
                                  >
                                    <SelectTrigger className="mt-2">
                                      <SelectValue placeholder="Seleziona kit" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {clothingKits.map((k) => (
                                        <SelectItem key={k.id} value={k.id}>
                                          {k.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              ) : (
                                <div>
                                  <Label>
                                    Componenti (separati da virgola)
                                  </Label>
                                  <Input
                                    className="mt-2"
                                    value={(
                                      newAssignment.components || []
                                    ).join(", ")}
                                    onChange={(e) =>
                                      setNewAssignment({
                                        ...newAssignment,
                                        components: e.target.value
                                          .split(",")
                                          .map((s) => s.trim())
                                          .filter(Boolean),
                                      })
                                    }
                                  />
                                </div>
                              )}

                              <div>
                                <Label>Note</Label>
                                <Textarea
                                  className="mt-2"
                                  value={newAssignment.notes}
                                  onChange={(e) =>
                                    setNewAssignment({
                                      ...newAssignment,
                                      notes: e.target.value,
                                    })
                                  }
                                />
                              </div>

                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  onClick={() =>
                                    setIsAssignmentDialogOpen(false)
                                  }
                                >
                                  Annulla
                                </Button>
                                <Button
                                  className="bg-blue-600 hover:bg-blue-700"
                                  onClick={createAssignment}
                                  disabled={
                                    !newAssignment.assigneeId ||
                                    (newAssignment.assignmentType === "kit"
                                      ? !newAssignment.kitId
                                      : !(newAssignment.components || [])
                                          .length)
                                  }
                                >
                                  Conferma
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </>
                      </Dialog>
                    </div>
                  </div>
                </CardHeader>

                {isMissingOpen && (
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr className="border-b">
                            <th className="text-left p-2">Data</th>
                            <th className="text-left p-2">Tesserato</th>
                            <th className="text-left p-2">Kit/Prodotto</th>
                            <th className="text-left p-2">Articolo</th>
                            <th className="text-left p-2">Magazzino</th>
                            <th className="text-left p-2">Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {missingRows.length ? (
                            missingRows.map((r, i) => (
                              <tr
                                key={`${r.assignmentId}-${r.itemIndex}-${i}`}
                                className="border-b"
                              >
                                <td className="p-2">
                                  {formatDate(r.createdAt)}
                                </td>
                                <td className="p-2">
                                  {getPersonLabel(r.assigneeId)}
                                </td>
                                <td className="p-2">{r.kitName}</td>
                                <td className="p-2">{r.componentName}</td>
                                <td className="p-2">
                                  <span
                                    className={`inline-block h-3 w-3 rounded-full ${r.hasStock ? "bg-green-500" : "bg-red-500"}`}
                                  />
                                </td>
                                <td className="p-2">{r.notes || "-"}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td
                                colSpan={6}
                                className="p-4 text-center text-muted-foreground"
                              >
                                Nessuna consegna mancante
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                )}
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle>Riepilogo consegne effettuate</CardTitle>
                      <CardDescription>
                        Storico di tutte le consegne registrate
                      </CardDescription>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsDeliveredOpen((v) => !v)}
                      aria-label={isDeliveredOpen ? "Chiudi" : "Apri"}
                    >
                      {isDeliveredOpen ? (
                        <ChevronUp className="h-5 w-5" />
                      ) : (
                        <ChevronDown className="h-5 w-5" />
                      )}
                    </Button>
                  </div>
                </CardHeader>

                {isDeliveredOpen && (
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr className="border-b">
                            <th className="text-left p-2">Data consegna</th>
                            <th className="text-left p-2">Tesserato</th>
                            <th className="text-left p-2">Kit/Prodotto</th>
                            <th className="text-left p-2">Articolo</th>
                            <th className="text-left p-2">Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deliveredRows.length ? (
                            deliveredRows.map((r, i) => (
                              <tr
                                key={`${r.assignmentId}-${i}`}
                                className="border-b"
                              >
                                <td className="p-2">
                                  {formatDate(r.deliveredAt)}
                                </td>
                                <td className="p-2">
                                  {getPersonLabel(r.assigneeId)}
                                </td>
                                <td className="p-2">{r.kitName}</td>
                                <td className="p-2">{r.componentName}</td>
                                <td className="p-2">{r.notes || "-"}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td
                                colSpan={5}
                                className="p-4 text-center text-muted-foreground"
                              >
                                Nessuna consegna registrata
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                )}
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Scorciatoie</CardTitle>
                  <CardDescription>
                    Azioni rapide sul gruppo selezionato.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="w-full sm:w-[320px]">
                      <Label>Gruppo</Label>
                      <Select
                        value={shortcutGroupId || "none"}
                        onValueChange={(v) =>
                          setShortcutGroupId(v === "none" ? null : v)
                        }
                      >
                        <SelectTrigger className="mt-2 h-9">
                          <SelectValue placeholder="Seleziona gruppo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Seleziona gruppo</SelectItem>
                          {jerseyGroups.map((g) => (
                            <SelectItem key={g.id} value={g.id}>
                              {g.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-wrap gap-2 sm:mt-7">
                      <Button
                        variant="outline"
                        disabled={!shortcutGroupId}
                        onClick={async () => {
                          try {
                            if (!activeClub?.id)
                              throw new Error("Club non trovato");
                            if (!shortcutGroupId) return;

                            const { updateClubData, updateAthlete } =
                              await import("@/lib/simplified-db");

                            // collect athletes that are effectively in the selected group
                            const inGroup = athletes.filter((a: any) => {
                              const v = effectiveAssignment.get(a.id);
                              return v?.groupId === shortcutGroupId;
                            });

                            // numbers already used in the group
                            const used = new Set<number>();
                            for (const a of inGroup) {
                              const v = effectiveAssignment.get(a.id);
                              if (
                                v?.number !== null &&
                                typeof v?.number === "number"
                              ) {
                                used.add(v.number);
                              }
                            }

                            const next = [...jerseyAssignments];
                            const now = new Date().toISOString();

                            const available: number[] = [];
                            for (let n = 0; n <= 99; n++)
                              if (!used.has(n)) available.push(n);

                            // assign to athletes without number
                            for (const a of inGroup) {
                              const athleteId = a.id;
                              const v = effectiveAssignment.get(athleteId);
                              if (!v || v.number !== null) continue;
                              if (!available.length) break;

                              const pickIndex = Math.floor(
                                Math.random() * available.length,
                              );
                              const picked = available.splice(pickIndex, 1)[0];

                              const idx = next.findIndex(
                                (x) => x.athleteId === athleteId,
                              );
                              const entry = {
                                athleteId,
                                groupId: shortcutGroupId,
                                number: picked,
                                updatedAt: now,
                              };

                              if (idx >= 0) next[idx] = entry;
                              else next.push(entry);

                              // best-effort sync on athlete data
                              try {
                                await updateAthlete(athleteId, {
                                  data: {
                                    ...(a?.data || {}),
                                    jerseyNumber: picked,
                                  },
                                });
                              } catch {}
                            }

                            await updateClubData(
                              activeClub.id,
                              "jersey_assignments",
                              next,
                            );
                            setJerseyAssignments(next);

                            toast({
                              title: "Numeri assegnati",
                              description:
                                "Assegnazione casuale completata (senza doppioni).",
                            });
                          } catch (e: any) {
                            toast({
                              title: "Errore",
                              description:
                                e?.message || "Operazione non riuscita",
                              variant: "destructive",
                            });
                          }
                        }}
                      >
                        Random (no doppioni)
                      </Button>

                      <Button
                        variant="outline"
                        disabled={!shortcutGroupId}
                        onClick={async () => {
                          try {
                            if (!activeClub?.id)
                              throw new Error("Club non trovato");
                            if (!shortcutGroupId) return;

                            const { updateClubData, updateAthlete } =
                              await import("@/lib/simplified-db");

                            const next = jerseyAssignments.map((x) =>
                              x.groupId === shortcutGroupId
                                ? {
                                    ...x,
                                    number: null,
                                    updatedAt: new Date().toISOString(),
                                  }
                                : x,
                            );

                            await updateClubData(
                              activeClub.id,
                              "jersey_assignments",
                              next,
                            );
                            setJerseyAssignments(next);

                            // best-effort: also clear jerseyNumber on athletes in that group
                            const inGroup = athletes.filter((a: any) => {
                              const v = effectiveAssignment.get(a.id);
                              return v?.groupId === shortcutGroupId;
                            });
                            await Promise.all(
                              inGroup.map((a: any) =>
                                updateAthlete(a.id, {
                                  data: {
                                    ...(a?.data || {}),
                                    jerseyNumber: null,
                                  },
                                }).catch(() => null),
                              ),
                            );

                            toast({
                              title: "Numeri rimossi",
                              description:
                                "Tutti i numeri del gruppo selezionato sono stati rimossi.",
                            });
                          } catch (e: any) {
                            toast({
                              title: "Errore",
                              description:
                                e?.message || "Operazione non riuscita",
                              variant: "destructive",
                            });
                          }
                        }}
                      >
                        Rimuovi tutti i numeri
                      </Button>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Suggerimento: puoi usare questi pulsanti dopo aver definito
                    i gruppi e collegato gli atleti al gruppo corretto.
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="magazzino" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Prodotti</CardTitle>
                  <CardDescription>
                    Aggiungi articoli e gestisci le quantità
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-end">
                    <Dialog
                      open={isProductDialogOpen}
                      onOpenChange={setIsProductDialogOpen}
                    >
                      <>
                        <DialogTrigger asChild>
                          <Button className="bg-blue-600 hover:bg-blue-700">
                            <Plus className="h-4 w-4 mr-2" /> Nuovo prodotto
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Nuovo prodotto</DialogTitle>
                          </DialogHeader>

                          <div className="grid grid-cols-1 gap-4 py-2">
                            <div>
                              <Label>Titolo</Label>
                              <Input
                                className="mt-2"
                                value={newProduct.title}
                                onChange={(e) =>
                                  setNewProduct({
                                    ...newProduct,
                                    title: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <Label>Codice prodotto</Label>
                              <Input
                                className="mt-2"
                                value={newProduct.code}
                                onChange={(e) =>
                                  setNewProduct({
                                    ...newProduct,
                                    code: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <Label>Descrizione</Label>
                              <Input
                                className="mt-2"
                                value={newProduct.description}
                                onChange={(e) =>
                                  setNewProduct({
                                    ...newProduct,
                                    description: e.target.value,
                                  })
                                }
                              />
                            </div>
                          </div>

                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              onClick={() => setIsProductDialogOpen(false)}
                            >
                              Annulla
                            </Button>
                            <Button
                              className="bg-blue-600 hover:bg-blue-700"
                              onClick={addProduct}
                            >
                              Salva
                            </Button>
                          </div>
                        </DialogContent>
                      </>
                    </Dialog>
                  </div>

                  <div className="mt-6 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr className="border-b">
                          <th className="text-left p-2">Titolo</th>
                          <th className="text-left p-2">Codice</th>
                          <th className="text-left p-2">Quantità</th>
                          <th className="text-left p-2">Azioni</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.length ? (
                          products.map((p) => {
                            const qty =
                              inventory.find((r) => r.productId === p.id)
                                ?.qty || 0;
                            return (
                              <tr key={p.id} className="border-b">
                                <td className="p-2">{p.title}</td>
                                <td className="p-2">{p.code}</td>
                                <td className="p-2">{qty}</td>
                                <td className="p-2">
                                  <div className="flex gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        updateInventoryQty(p.id, -1)
                                      }
                                    >
                                      -1
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        updateInventoryQty(p.id, 1)
                                      }
                                    >
                                      +1
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        updateInventoryQty(p.id, 5)
                                      }
                                    >
                                      +5
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td
                              colSpan={4}
                              className="p-4 text-center text-muted-foreground"
                            >
                              Nessun prodotto presente
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="numeri" className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle>Gruppi</CardTitle>
                      <CardDescription>
                        Crea gruppi che collegano più categorie:
                        all&apos;interno di ogni gruppo puoi gestire le
                        assegnazioni dei numeri (eventuali doppioni vengono
                        segnalati).
                      </CardDescription>
                    </div>
                    <Dialog
                      open={isGroupDialogOpen}
                      onOpenChange={setIsGroupDialogOpen}
                    >
                      <>
                        <DialogTrigger asChild>
                          <Button
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={() => {
                              setEditingGroupId(null);
                              setGroupDraft({ name: "", categories: [] });
                            }}
                          >
                            <Plus className="h-4 w-4 mr-2" /> Nuovo gruppo
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-xl">
                          <DialogHeader>
                            <DialogTitle>
                              {editingGroupId
                                ? "Modifica gruppo"
                                : "Nuovo gruppo"}
                            </DialogTitle>
                          </DialogHeader>

                          <div className="space-y-4">
                            <div>
                              <Label>Nome gruppo</Label>
                              <Input
                                value={groupDraft.name}
                                onChange={(e) =>
                                  setGroupDraft((d) => ({
                                    ...d,
                                    name: e.target.value,
                                  }))
                                }
                                placeholder="Es. Under17 + Under19"
                              />
                            </div>

                            <div>
                              <Label>Categorie incluse</Label>
                              <div className="mt-2 max-h-64 overflow-y-auto rounded-md border p-3 space-y-2">
                                {(registeredCategories.length
                                  ? registeredCategories
                                  : Array.from(
                                      new Set(
                                        athletes
                                          .map(
                                            (a: any) =>
                                              a?.data?.category ||
                                              "Senza Categoria",
                                          )
                                          .filter(Boolean),
                                      ),
                                    )
                                )
                                  .slice()
                                  .sort()
                                  .map((cat) => {
                                    const checked =
                                      groupDraft.categories.includes(cat);
                                    return (
                                      <label
                                        key={cat}
                                        className="flex items-center gap-2 text-sm cursor-pointer"
                                      >
                                        <input
                                          type="checkbox"
                                          className="h-4 w-4"
                                          checked={checked}
                                          onChange={() =>
                                            setGroupDraft((d) => ({
                                              ...d,
                                              categories: checked
                                                ? d.categories.filter(
                                                    (x) => x !== cat,
                                                  )
                                                : [...d.categories, cat],
                                            }))
                                          }
                                        />
                                        <span>{cat}</span>
                                      </label>
                                    );
                                  })}
                                {!athletes?.length && (
                                  <div className="text-sm text-muted-foreground">
                                    Nessuna categoria trovata (aggiungi prima
                                    degli atleti)
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex justify-end gap-2 mt-4">
                            <Button
                              variant="outline"
                              onClick={() => setIsGroupDialogOpen(false)}
                            >
                              Annulla
                            </Button>
                            <Button
                              onClick={async () => {
                                try {
                                  if (!activeClub?.id)
                                    throw new Error("Club non trovato");
                                  if (!groupDraft.name.trim())
                                    throw new Error("Inserisci un nome gruppo");
                                  if (groupDraft.categories.length < 1)
                                    throw new Error(
                                      "Seleziona almeno una categoria",
                                    );

                                  const { updateClubData } = await import(
                                    "@/lib/simplified-db"
                                  );
                                  const now = new Date().toISOString();
                                  const next = [...jerseyGroups];

                                  if (editingGroupId) {
                                    const idx = next.findIndex(
                                      (g) => g.id === editingGroupId,
                                    );
                                    if (idx >= 0)
                                      next[idx] = {
                                        ...next[idx],
                                        name: groupDraft.name.trim(),
                                        categories: Array.from(
                                          new Set(groupDraft.categories),
                                        ),
                                      };
                                  } else {
                                    next.push({
                                      id: crypto?.randomUUID
                                        ? crypto.randomUUID()
                                        : String(Date.now()),
                                      name: groupDraft.name.trim(),
                                      categories: Array.from(
                                        new Set(groupDraft.categories),
                                      ),
                                    });
                                  }

                                  await updateClubData(
                                    activeClub.id,
                                    "jersey_groups",
                                    next,
                                  );
                                  setJerseyGroups(next);
                                  setIsGroupDialogOpen(false);
                                  setEditingGroupId(null);
                                  toast({
                                    title: "Salvato",
                                    description: "Gruppo aggiornato",
                                  });
                                } catch (e: any) {
                                  toast({
                                    title: "Errore",
                                    description:
                                      e?.message || "Impossibile salvare",
                                    variant: "destructive",
                                  });
                                }
                              }}
                            >
                              {editingGroupId ? "Aggiorna" : "Salva"}
                            </Button>
                          </div>
                        </DialogContent>
                      </>
                    </Dialog>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {jerseyGroups.length ? (
                    <div className="space-y-3">
                      {jerseyGroups.map((g) => (
                        <div
                          key={g.id}
                          className="rounded-md border p-3 flex items-start justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="font-medium">{g.name}</div>
                            <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-1">
                              {g.categories?.map((c: string) => (
                                <Badge
                                  key={c}
                                  variant="secondary"
                                  className="text-xs"
                                >
                                  {c}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setConfirmDeleteGroupId(null);
                                setEditingGroupId(g.id);
                                setGroupDraft({
                                  name: g.name,
                                  categories: g.categories || [],
                                });
                                setIsGroupDialogOpen(true);
                              }}
                              aria-label="Modifica gruppo"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {confirmDeleteGroupId === g.id ? (
                              <>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={async () => {
                                    try {
                                      if (!activeClub?.id)
                                        throw new Error("Club non trovato");
                                      const { updateClubData } = await import(
                                        "@/lib/simplified-db"
                                      );
                                      const nextGroups = jerseyGroups.filter(
                                        (x) => x.id !== g.id,
                                      );
                                      const nextAssignments =
                                        jerseyAssignments.map((a) =>
                                          a.groupId === g.id
                                            ? { ...a, groupId: null }
                                            : a,
                                        );
                                      await updateClubData(
                                        activeClub.id,
                                        "jersey_groups",
                                        nextGroups,
                                      );
                                      await updateClubData(
                                        activeClub.id,
                                        "jersey_assignments",
                                        nextAssignments,
                                      );
                                      setJerseyGroups(nextGroups);
                                      setJerseyAssignments(nextAssignments);
                                      setConfirmDeleteGroupId(null);
                                      toast({
                                        title: "Eliminato",
                                        description: "Gruppo rimosso",
                                      });
                                    } catch (e: any) {
                                      toast({
                                        title: "Errore",
                                        description:
                                          e?.message || "Impossibile eliminare",
                                        variant: "destructive",
                                      });
                                    }
                                  }}
                                >
                                  Conferma
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setConfirmDeleteGroupId(null)}
                                >
                                  Annulla
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setConfirmDeleteGroupId(g.id)}
                                aria-label="Elimina gruppo"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      Nessun gruppo creato. Crea un gruppo per iniziare.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Assegnazione numeri</CardTitle>
                  <CardDescription>
                    Assegna un numero a ogni atleta. I doppioni sono consentiti,
                    ma vengono segnalati.
                  </CardDescription>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <div className="text-sm text-muted-foreground">
                      Visualizzazione
                    </div>
                    <Select
                      value={jerseyGroupFilterId ?? "all"}
                      onValueChange={(v) =>
                        setJerseyGroupFilterId(v === "all" ? null : v)
                      }
                    >
                      <SelectTrigger className="w-[260px]">
                        <SelectValue placeholder="Tutti i gruppi" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tutti i gruppi</SelectItem>
                        {jerseyGroups.map((g: any) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {jerseyGroupFilterId && (
                      <div className="text-xs text-muted-foreground">
                        Mostro solo gli atleti appartenenti al gruppo (per
                        categoria) o già assegnati a quel gruppo.
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left border-b">
                          <th className="py-2 pr-3">Atleta</th>
                          <th className="py-2 pr-3">Categoria</th>
                          <th className="py-2 pr-3">Gruppo</th>
                          <th className="py-2 pr-3 w-[160px]">Numero</th>
                          <th className="py-2 pr-3 w-[160px]">Azioni</th>
                        </tr>
                      </thead>
                      <tbody>
                        {athletesForNumbers.map((a: any) => {
                          const athleteId = a.id;
                          const category =
                            a?.data?.category || "Senza Categoria";
                          const existing =
                            jerseyAssignments.find(
                              (x) => x.athleteId === athleteId,
                            ) || null;

                          const defaultGroup =
                            jerseyGroups.find((g) =>
                              (g.categories || []).includes(category),
                            ) || null;

                          const groupId =
                            existing?.groupId ?? defaultGroup?.id ?? null;
                          const number =
                            existing?.number ?? a?.data?.jerseyNumber ?? null;

                          return (
                            <tr key={athleteId} className="border-b">
                              <td className="py-2 pr-3 whitespace-nowrap">
                                {a?.first_name} {a?.last_name}
                                {(() => {
                                  const v = effectiveAssignment.get(athleteId);
                                  const key =
                                    v?.groupId && v?.number !== null
                                      ? `${v.groupId}:${v.number}`
                                      : "";
                                  const isDup =
                                    key &&
                                    (duplicateNumberMap.get(key) || 0) > 1;
                                  return isDup ? (
                                    <span
                                      title="Numero doppione nel gruppo"
                                      className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-[11px] font-semibold text-white"
                                    >
                                      D
                                    </span>
                                  ) : null;
                                })()}
                              </td>
                              <td className="py-2 pr-3">{category}</td>
                              <td className="py-2 pr-3">
                                <Select
                                  value={groupId || "none"}
                                  onValueChange={async (val) => {
                                    try {
                                      if (!activeClub?.id)
                                        throw new Error("Club non trovato");
                                      const { updateClubData } = await import(
                                        "@/lib/simplified-db"
                                      );
                                      const next = [...jerseyAssignments];
                                      const idx = next.findIndex(
                                        (x) => x.athleteId === athleteId,
                                      );
                                      const now = new Date().toISOString();
                                      const nextGroupId =
                                        val === "none" ? null : val;

                                      if (idx >= 0) {
                                        next[idx] = {
                                          ...next[idx],
                                          groupId: nextGroupId,
                                          updatedAt: now,
                                        };
                                      } else {
                                        next.push({
                                          athleteId,
                                          groupId: nextGroupId,
                                          number: number
                                            ? Number(number)
                                            : null,
                                          updatedAt: now,
                                        });
                                      }

                                      await updateClubData(
                                        activeClub.id,
                                        "jersey_assignments",
                                        next,
                                      );
                                      setJerseyAssignments(next);
                                    } catch (e: any) {
                                      toast({
                                        title: "Errore",
                                        description:
                                          e?.message ||
                                          "Impossibile aggiornare",
                                        variant: "destructive",
                                      });
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-9 w-[240px]">
                                    <SelectValue placeholder="Seleziona gruppo" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">
                                      Nessun gruppo
                                    </SelectItem>
                                    {jerseyGroups.map((g) => (
                                      <SelectItem key={g.id} value={g.id}>
                                        {g.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="py-2 pr-3">
                                <Input
                                  type="number"
                                  min={0}
                                  max={99}
                                  className="h-9 w-[120px]"
                                  value={number ?? ""}
                                  onChange={async (e) => {
                                    const raw = e.target.value;
                                    const nextNumber =
                                      raw === "" ? null : Number(raw);
                                    await upsertJerseyNumber({
                                      athlete: a,
                                      athleteId,
                                      groupId: groupId ?? null,
                                      nextNumber,
                                    });
                                  }}
                                  placeholder="0-99"
                                />
                              </td>
                              <td className="py-2 pr-3">
                                {groupId &&
                                (number === null ||
                                  number === undefined ||
                                  number === "") ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      assignRandomJerseyNumber({
                                        athlete: a,
                                        athleteId,
                                        groupId,
                                      })
                                    }
                                  >
                                    Casuale
                                  </Button>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
