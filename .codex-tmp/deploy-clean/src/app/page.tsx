"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  Shuffle,
} from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";

function formatDate(dateString?: string) {
  if (!dateString) return "-";
  try {
    return new Date(dateString).toLocaleDateString("it-IT");
  } catch {
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

export default function ClothingPage() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <AuthShell defaultMode="login" />
    </React.Suspense>
  );

  const { activeClub, user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);

  // Kits
  const [clothingKits, setClothingKits] = useState<any[]>([]);
  const [kitAssignments, setKitAssignments] = useState<any[]>([]);

  // People
  const [athletes, setAthletes] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
const [categories, setCategories] = useState<any[]>([]);

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
  const [kitFilter, setKitFilter] = useState<string[]>([]);
  const [isDeliveredOpen, setIsDeliveredOpen] = useState(true);
  const [jerseyGroups, setJerseyGroups] = useState<
    { id: string; name: string; categories: string[] }[]
  >([]);
  const [jerseyAssignments, setJerseyAssignments] = useState<
    { athleteId: string; groupId: string | null; number: number | null; updatedAt: string }[]
  >([]);
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupDraft, setGroupDraft] = useState<{ name: string; categories: string[] }>({
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

        setClothingKits(Array.isArray(kitsData) ? kitsData : []);
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

        // categories
        try {
          const categoriesData = await getClubData(activeClub.id, "categories");
          setCategories(Array.isArray(categoriesData) ? categoriesData : []);
        } catch {
          setCategories([]);
        }

        // jersey numbers
        const jerseyGroupsData = await getClubData(activeClub.id, "jersey_groups");
        setJerseyGroups(Array.isArray(jerseyGroupsData) ? jerseyGroupsData : []);
        const jerseyAssignmentsData = await getClubData(activeClub.id, "jersey_assignments");
        setJerseyAssignments(Array.isArray(jerseyAssignmentsData) ? jerseyAssignmentsData : []);

        // people
        try {
          const ath = await getClubAthletes(activeClub.id);
          setAthletes(Array.isArray(ath) ? ath : []);
        } catch {
          setAthletes([]);
        }
        try {
          const st = await getClubStaff(activeClub.id);
          setStaff(Array.isArray(st) ? st : []);
        } catch {
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

              <Card>
                <CardHeader className="py-4">
                  <CardTitle className="text-base">Filtra per kit</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={kitFilter.length === 0}
                        onChange={() => setKitFilter([])}
                      />
                      <span>Tutti</span>
                    </label>

                    {[
                      { id: "components", name: "Componenti" },
                      ...clothingKits.map((k: any) => ({ id: String(k.id), name: k.name || k.title || k.id })),
                    ].map((k: any) => {
                      const checked = kitFilter.includes(String(k.id));
                      return (
                        <label
                          key={k.id}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={checked}
                            onChange={() =>
                              setKitFilter((prev) => {
                                const next = prev.includes(String(k.id))
                                  ? prev.filter((x) => x !== String(k.id))
                                  : [...prev, String(k.id)];
                                return next;
                              })
                            }
                          />
                          <span>{k.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

    };
    load();
  }, [activeClub?.id, user]);

  
  const resolveCategoryId = (raw: any) => {
    if (!raw) return null;
    const s = String(raw);
    // direct match by id
    const byId = categories.find((c: any) => String(c?.id) === s);
    if (byId) return String(byId.id);
    // match by name
    const byName = categories.find((c: any) => String(c?.name) === s);
    if (byName) return String(byName.id ?? byName.name);
    return s;
  };

  const resolveCategoryLabel = (raw: any) => {
    if (!raw) return "Senza Categoria";
    const s = String(raw);
    const byId = categories.find((c: any) => String(c?.id) === s);
    if (byId) return String(byId.name ?? byId.id);
    const byName = categories.find((c: any) => String(c?.name) === s);
    if (byName) return String(byName.name ?? byName.id);
    return s;
  };

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
      const kitKey = String(a.kitId || (a.assignmentType === "components" ? "components" : ""));
      if (kitFilter.length && !kitFilter.includes(kitKey)) return;
      (a.items || []).forEach((it: any, idx: number) => {
        if (it.delivered) return;
        const titleKey = String(it.name || "")
          .trim()
          .toLowerCase();
        const qty = inventoryQtyByTitle.byTitle.get(titleKey) ?? 0;
        rows.push({
          assignmentId: a.id,
          kitId: kitKey,
          kitId: kitKey,
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
      const kitKey = String(a.kitId || (a.assignmentType === "components" ? "components" : ""));
      if (kitFilter.length && !kitFilter.includes(kitKey)) return;
      (a.items || []).forEach((it: any) => {
        if (!it.delivered) return;
        rows.push({
          assignmentId: a.id,
          kitId: kitKey,
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
    const current = Array.isArray(newKit.components) ? newKit.components : [];
    const exists = current.some((x: any) => String(x).trim() === title);
    const next = exists
      ? current.filter((x: any) => String(x).trim() !== title)
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
        components: Array.isArray(newKit.components) ? newKit.components : [],
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
          ? kit?.components || []
          : newAssignment.components || [];

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
                      <DialogTrigger asChild>
                        <Button
                          className="bg-blue-600 hover:bg-blue-700"
                          onClick={resetKitForm}
                        >
                          <Plus className="h-4 w-4 mr-2" /> Nuovo kit
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
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
                                    .sort((a, b) => a.title.localeCompare(b.title))
                                    .map((p) => {
                                      const checked = (newKit.components || []).some(
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
                                            onChange={() => toggleKitComponent(p.title)}
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
                                  Nessun prodotto in magazzino. Crea prima i prodotti nella tab
                                  “Magazzino”.
                                </div>
                              )}
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              Mostra solo i prodotti registrati nel magazzino del club.
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
                                    components: Array.isArray(kit.components)
                                      ? kit.components
                                      : [],
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
                            {(kit.components || [])
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
                            {(kit.components || []).length > 6 && (
                              <Badge variant="secondary" className="text-xs">
                                +{(kit.components || []).length - 6}
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
                      {isMissingOpen && (
                      <DialogTrigger asChild>
                        <Button
                          className="bg-blue-600 hover:bg-blue-700"
                          onClick={resetAssignmentForm}
                        >
                          <Plus className="h-4 w-4 mr-2" /> Nuova assegnazione
                        </Button>
                      </DialogTrigger>
                      )}


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
                                    p?.type === "staff" ? "staff" : "athlete",
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
                              <Label>Componenti (separati da virgola)</Label>
                              <Input
                                className="mt-2"
                                value={(newAssignment.components || []).join(
                                  ", ",
                                )}
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
                              onClick={() => setIsAssignmentDialogOpen(false)}
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
                                  : !(newAssignment.components || []).length)
                              }
                            >
                              Conferma
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
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
                              <td className="p-2">{formatDate(r.createdAt)}</td>
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
                      <CardTitle>Gruppi anti-doppione</CardTitle>
                      <CardDescription>
                        Crea gruppi che collegano più categorie: all&apos;interno di ogni gruppo i numeri di gioco devono essere univoci.
                      </CardDescription>
                    </div>
                    <Dialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
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
                            {editingGroupId ? "Modifica gruppo" : "Nuovo gruppo"}
                          </DialogTitle>
                        </DialogHeader>

                        <div className="space-y-4">
                          <div>
                            <Label>Nome gruppo</Label>
                            <Input
                              value={groupDraft.name}
                              onChange={(e) =>
                                setGroupDraft((d) => ({ ...d, name: e.target.value }))
                              }
                              placeholder="Es. Under17 + Under19"
                            />
                          </div>

                          <div>
                            <Label>Categorie incluse</Label>
                            <div className="mt-2 max-h-64 overflow-y-auto rounded-md border p-3 space-y-2">
                              {categories
                                .filter((c: any) => c && (c.id || c.name))
                                .map((c: any) => {
                                  const catId = String(c.id ?? c.name);
                                  const catLabel = String(c.name ?? c.id);
                                  const checked = groupDraft.categories.includes(catId);
                                  return (
                                    <label
                                      key={catId}
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
                                              ? d.categories.filter((x) => x !== catId)
                                              : [...d.categories, catId],
                                          }))
                                        }
                                      />
                                      <span>{catLabel}</span>
                                    </label>
                                  );
                                })}
                              {!categories?.length && (
                                <div className="text-sm text-muted-foreground">
                                  Nessuna categoria trovata (aggiungi prima degli atleti)
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
                                if (!activeClub?.id) throw new Error("Club non trovato");
                                if (!groupDraft.name.trim())
                                  throw new Error("Inserisci un nome gruppo");
                                if (groupDraft.categories.length < 1)
                                  throw new Error("Seleziona almeno una categoria");

                                const { updateClubData } = await import("@/lib/simplified-db");
                                const now = new Date().toISOString();
                                const next = [...jerseyGroups];

                                if (editingGroupId) {
                                  const idx = next.findIndex((g) => g.id === editingGroupId);
                                  if (idx >= 0)
                                    next[idx] = {
                                      ...next[idx],
                                      name: groupDraft.name.trim(),
                                      categories: Array.from(new Set(groupDraft.categories)),
                                    };
                                } else {
                                  next.push({
                                    id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()),
                                    name: groupDraft.name.trim(),
                                    categories: Array.from(new Set(groupDraft.categories)),
                                  });
                                }

                                await updateClubData(activeClub.id, "jersey_groups", next);
                                setJerseyGroups(next);
                                setIsGroupDialogOpen(false);
                                setEditingGroupId(null);
                                toast({ title: "Salvato", description: "Gruppo aggiornato" });
                              } catch (e: any) {
                                toast({
                                  title: "Errore",
                                  description: e?.message || "Impossibile salvare",
                                  variant: "destructive",
                                });
                              }
                            }}
                          >
                            {editingGroupId ? "Aggiorna" : "Salva"}
                          </Button>
                        </div>
                      </DialogContent>
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
                                <Badge key={c} variant="secondary" className="text-xs">
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
                                setEditingGroupId(g.id);
                                setGroupDraft({ name: g.name, categories: g.categories || [] });
                                setIsGroupDialogOpen(true);
                              }}
                              aria-label="Modifica gruppo"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={async () => {
                                try {
                                  if (!activeClub?.id) throw new Error("Club non trovato");
                                  const { updateClubData } = await import("@/lib/simplified-db");
                                  const nextGroups = jerseyGroups.filter((x) => x.id !== g.id);
                                  const nextAssignments = jerseyAssignments.map((a) =>
                                    a.groupId === g.id ? { ...a, groupId: null } : a,
                                  );
                                  await updateClubData(activeClub.id, "jersey_groups", nextGroups);
                                  await updateClubData(
                                    activeClub.id,
                                    "jersey_assignments",
                                    nextAssignments,
                                  );
                                  setJerseyGroups(nextGroups);
                                  setJerseyAssignments(nextAssignments);
                                  toast({
                                    title: "Eliminato",
                                    description: "Gruppo rimosso",
                                  });
                                } catch (e: any) {
                                  toast({
                                    title: "Errore",
                                    description: e?.message || "Impossibile eliminare",
                                    variant: "destructive",
                                  });
                                }
                              }}
                              aria-label="Elimina gruppo"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
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
                    Assegna un numero a ogni atleta. Il sistema blocca i duplicati
                    all&apos;interno del gruppo selezionato.
                  </CardDescription>
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
                        </tr>
                      </thead>
                      <tbody>
                        {athletes.map((a: any) => {
                          const athleteId = a.id;
                          const rawCategory = a?.data?.category;
                          const categoryId = resolveCategoryId(rawCategory);
                          const category = resolveCategoryLabel(rawCategory);
                          const existing =
                            jerseyAssignments.find((x) => x.athleteId === athleteId) || null;

                          const defaultGroup =
                            jerseyGroups.find((g) => (g.categories || []).includes(category)) ||
                            null;

                          const groupId = existing?.groupId ?? defaultGroup?.id ?? null;
                          const number = existing?.number ?? (a?.data?.jerseyNumber ?? null);

                          return (
                            <tr key={athleteId} className="border-b">
                              <td className="py-2 pr-3 whitespace-nowrap">
                                {a?.first_name} {a?.last_name}
                              </td>
                              <td className="py-2 pr-3">{category}</td>
                              <td className="py-2 pr-3">
                                <Select
                                  value={groupId || "none"}
                                  onValueChange={async (val) => {
                                    try {
                                      if (!activeClub?.id) throw new Error("Club non trovato");
                                      const { updateClubData } = await import("@/lib/simplified-db");
                                      const next = [...jerseyAssignments];
                                      const idx = next.findIndex((x) => x.athleteId === athleteId);
                                      const now = new Date().toISOString();
                                      const nextGroupId = val === "none" ? null : val;

                                      if (idx >= 0) {
                                        next[idx] = { ...next[idx], groupId: nextGroupId, updatedAt: now };
                                      } else {
                                        next.push({
                                          athleteId,
                                          groupId: nextGroupId,
                                          number: number ? Number(number) : null,
                                          updatedAt: now,
                                        });
                                      }

                                      await updateClubData(activeClub.id, "jersey_assignments", next);
                                      setJerseyAssignments(next);
                                    } catch (e: any) {
                                      toast({
                                        title: "Errore",
                                        description: e?.message || "Impossibile aggiornare",
                                        variant: "destructive",
                                      });
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-9 w-[240px]">
                                    <SelectValue placeholder="Seleziona gruppo" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">Nessun gruppo</SelectItem>
                                    {jerseyGroups.map((g) => (
                                      <SelectItem key={g.id} value={g.id}>
                                        {g.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="py-2 pr-3">
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    min={0}
                                    max={99}
                                    className="h-9 w-[120px]"
                                    value={number ?? ""}
                                    onChange={async (e) => {
                                      try {
                                        if (!activeClub?.id) throw new Error("Club non trovato");
                                        const raw = e.target.value;
                                        const nextNumber = raw === "" ? null : Number(raw);
                                        if (
                                          nextNumber !== null &&
                                          (Number.isNaN(nextNumber) ||
                                            nextNumber < 0 ||
                                            nextNumber > 99)
                                        )
                                          return;

                                        const effectiveGroupId = groupId;

                                        if (nextNumber !== null && effectiveGroupId) {
                                          const dup = jerseyAssignments.find(
                                            (x) =>
                                              x.athleteId !== athleteId &&
                                              x.groupId === effectiveGroupId &&
                                              Number(x.number) === Number(nextNumber),
                                          );
                                          if (dup) {
                                            toast({
                                              title: "Numero già usato",
                                              description:
                                                "Questo numero è già assegnato ad un altro atleta nello stesso gruppo.",
                                              variant: "destructive",
                                            });
                                            return;
                                          }
                                        }

                                        const { updateClubData } = await import("@/lib/simplified-db");
                                        const next = [...jerseyAssignments];
                                        const idx = next.findIndex((x) => x.athleteId === athleteId);
                                        const now = new Date().toISOString();

                                        if (idx >= 0) {
                                          next[idx] = {
                                            ...next[idx],
                                            groupId: effectiveGroupId,
                                            number: nextNumber,
                                            updatedAt: now,
                                          };
                                        } else {
                                          next.push({
                                            athleteId,
                                            groupId: effectiveGroupId,
                                            number: nextNumber,
                                            updatedAt: now,
                                          });
                                        }

                                        await updateClubData(activeClub.id, "jersey_assignments", next);
                                        setJerseyAssignments(next);
                                      } catch (e: any) {
                                        toast({
                                          title: "Errore",
                                          description: e?.message || "Impossibile aggiornare",
                                          variant: "destructive",
                                        });
                                      }
                                    }}
                                  />

                                  {groupId && (number === null || number === undefined) && (
                                    <Button
                                      variant="outline"
                                      size="icon"
                                      className="h-9 w-9"
                                      title="Assegna numero casuale"
                                      onClick={async () => {
                                        try {
                                          if (!activeClub?.id) throw new Error("Club non trovato");
                                          const effectiveGroupId = groupId;

                                          const used = new Set<number>();
                                          jerseyAssignments.forEach((x) => {
                                            if (
                                              x.groupId === effectiveGroupId &&
                                              x.athleteId !== athleteId &&
                                              x.number !== null &&
                                              x.number !== undefined
                                            ) {
                                              used.add(Number(x.number));
                                            }
                                          });

                                          const available: number[] = [];
                                          for (let n = 1; n <= 99; n++) {
                                            if (!used.has(n)) available.push(n);
                                          }
                                          if (!available.length)
                                            throw new Error("Nessun numero disponibile nel gruppo");

                                          const chosen =
                                            available[Math.floor(Math.random() * available.length)];

                                          const { updateClubData } = await import("@/lib/simplified-db");
                                          const next = [...jerseyAssignments];
                                          const idx = next.findIndex((x) => x.athleteId === athleteId);
                                          const now = new Date().toISOString();

                                          if (idx >= 0) {
                                            next[idx] = {
                                              ...next[idx],
                                              groupId: effectiveGroupId,
                                              number: chosen,
                                              updatedAt: now,
                                            };
                                          } else {
                                            next.push({
                                              athleteId,
                                              groupId: effectiveGroupId,
                                              number: chosen,
                                              updatedAt: now,
                                            });
                                          }

                                          await updateClubData(activeClub.id, "jersey_assignments", next);
                                          setJerseyAssignments(next);
                                        } catch (e: any) {
                                          toast({
                                            title: "Errore",
                                            description: e?.message || "Impossibile assegnare",
                                            variant: "destructive",
                                          });
                                        }
                                      }}
                                    >
                                      <Shuffle className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
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
