"use client";

import React, { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { useAuth } from "@/components/providers/AuthProvider";
import { MobileTopBar } from "@/components/layout/MobileTopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/components/ui/toast-notification";
import {
  Plus,
  Pencil,
  Trash2,
  CreditCard,
  CalendarClock,
  Save,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

type PaymentStatus = "Pagato" | "In attesa" | "Scaduto";

type StructurePayment = {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  type: "Quota" | "Iscrizione" | "Abbigliamento" | "Trasferta" | "Altro";
  amount: number;
  status: PaymentStatus;
};

type FieldPricing = {
  id: string;
  durationMinutes: number; // 30, 60, 90...
  price: number; // price for that slot
};

type AvailabilitySlot = { start: string; end: string };

type FieldAvailabilityV2 = Record<string, AvailabilitySlot[]>; // per-day slots

type FieldOwnership = "Pubblica" | "Privata";

type StructureField = {
  id: string;
  name: string;
  // Requested options
  ownership: FieldOwnership; // Proprietà Pubblica/Privata
  inRent: boolean; // In affitto
  isBookable: boolean; // Campi Affittabili
  isVisible: boolean; // Mostra/Nascondi per atleti/genitori

  availability: FieldAvailabilityV2;
  pricing: FieldPricing[];
};

type ClubStructure = {
  id: string;
  name: string;
  address: string;

  // Struttura options
  isPublic: boolean; // Pubblica/Privata
  isVisibleToMembers: boolean; // Visibile/Non visibile ai tesserati
  isRentable: boolean; // Affittabile SI/NO

  payments: StructurePayment[];
  fields: StructureField[];
};

const WEEK_DAYS: { key: string; label: string }[] = [
  { key: "Lun", label: "Lunedì" },
  { key: "Mar", label: "Martedì" },
  { key: "Mer", label: "Mercoledì" },
  { key: "Gio", label: "Giovedì" },
  { key: "Ven", label: "Venerdì" },
  { key: "Sab", label: "Sabato" },
  { key: "Dom", label: "Domenica" },
];

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDate(dateString?: string) {
  if (!dateString) return "-";
  try {
    const [y, m, d] = dateString.split("-").map((x) => parseInt(x, 10));
    if (!y || !m || !d) return dateString;
    return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
  } catch {
    return dateString;
  }
}

function badgeClassForPaymentStatus(status: PaymentStatus) {
  if (status === "Pagato") return "bg-green-500";
  if (status === "Scaduto") return "bg-red-500";
  return "bg-yellow-500";
}

function normalizeAvailability(input: any): FieldAvailabilityV2 {
  // Accepts legacy shape: {days:[], startTime, endTime}
  // or already v2: { Lun:[{start,end}], ... }
  if (!input) {
    return WEEK_DAYS.reduce((acc, d) => {
      acc[d.key] = [];
      return acc;
    }, {} as FieldAvailabilityV2);
  }

  // v2-like
  if (typeof input === "object" && !Array.isArray(input) && !input.days) {
    const out: FieldAvailabilityV2 = {};
    for (const day of WEEK_DAYS) {
      const raw = (input as any)[day.key];
      if (Array.isArray(raw)) {
        out[day.key] = raw
          .map((s: any) => ({
            start: String(s?.start || "").slice(0, 5),
            end: String(s?.end || "").slice(0, 5),
          }))
          .filter((s: any) => s.start && s.end);
      } else {
        out[day.key] = [];
      }
    }
    return out;
  }

  // legacy
  const days: string[] = Array.isArray(input.days) ? input.days : [];
  const startTime = String(input.startTime || "18:00").slice(0, 5);
  const endTime = String(input.endTime || "22:00").slice(0, 5);

  const out: FieldAvailabilityV2 = WEEK_DAYS.reduce((acc, d) => {
    acc[d.key] = [];
    return acc;
  }, {} as FieldAvailabilityV2);

  for (const day of days) {
    if (out[day]) out[day] = [{ start: startTime, end: endTime }];
  }

  return out;
}

function normalizeField(raw: any): StructureField {
  return {
    id: raw?.id || uid("field"),
    name: raw?.name || "Campo",
    ownership: raw?.ownership === "Privata" ? "Privata" : "Pubblica",
    inRent: typeof raw?.inRent === "boolean" ? raw.inRent : false,
    isBookable: typeof raw?.isBookable === "boolean" ? raw.isBookable : true,
    isVisible: typeof raw?.isVisible === "boolean" ? raw.isVisible : true,
    availability: normalizeAvailability(raw?.availability),
    pricing: Array.isArray(raw?.pricing)
      ? raw.pricing.map((p: any) => ({
          id: p?.id || uid("price"),
          durationMinutes: Number(p?.durationMinutes ?? 60),
          price: Number(p?.price ?? 0),
        }))
      : [],
  };
}

function normalizePayment(raw: any): StructurePayment {
  return {
    id: raw?.id || uid("payment"),
    date: raw?.date || new Date().toISOString().split("T")[0],
    description: raw?.description || "",
    type:
      raw?.type === "Iscrizione" ||
      raw?.type === "Abbigliamento" ||
      raw?.type === "Trasferta" ||
      raw?.type === "Altro"
        ? raw.type
        : "Quota",
    amount: Number(raw?.amount ?? 0),
    status:
      raw?.status === "In attesa" || raw?.status === "Scaduto"
        ? raw.status
        : "Pagato",
  };
}

export default function StrutturePage() {
  const { user, activeClub } = useAuth();
  const { showToast } = useToast();

  const [clubId, setClubId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeClubId, setActiveClubId] = useState<string | null>(null);

  const [structures, setStructures] = useState<ClubStructure[]>([]);

  // Structure create/edit modal
  const [isStructureModalOpen, setIsStructureModalOpen] = useState(false);
  const [editingStructureId, setEditingStructureId] = useState<string | null>(
    null,
  );
  const [structureForm, setStructureForm] = useState({
    name: "",
    address: "",
    isPublic: true,
    isVisibleToMembers: true,
    isRentable: false,
  });

  // Payments (same UX as athletes)
  const [showAddPaymentFor, setShowAddPaymentFor] = useState<string | null>(
    null,
  );
  const [newPayment, setNewPayment] = useState({
    date: "",
    description: "",
    type: "Quota" as StructurePayment["type"],
    amount: "",
    status: "Pagato" as PaymentStatus,
  });

  // Keep date initialized client-side (avoid hydration mismatch)
  useEffect(() => {
    if (!newPayment.date) {
      setNewPayment((prev) => ({
        ...prev,
        date: new Date().toISOString().split("T")[0],
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [openPaymentsByStructure, setOpenPaymentsByStructure] = useState<
    Record<string, boolean>
  >({});
  const [openFieldsByStructure, setOpenFieldsByStructure] = useState<
    Record<string, boolean>
  >({});

  // Read active club after mount
  useEffect(() => {
    // Prefer AuthProvider activeClub (user-specific), fallback to localStorage for safety.
    if (typeof window === "undefined") return;

    const readActiveClubId = () => {
      try {
        // User-specific key first (matches AuthProvider/Header behaviour)
        if (user?.id) {
          const rawUser = localStorage.getItem(`activeClub_${user.id}`);
          if (rawUser) {
            const parsedUser = JSON.parse(rawUser);
            return parsedUser?.id || null;
          }
        }

        // Generic key fallback
        const raw = localStorage.getItem("activeClub");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed?.id || null;
      } catch {
        return null;
      }
    };

    const idFromContext = (activeClub as any)?.id || null;
    setActiveClubId(idFromContext ?? readActiveClubId());

    const handleStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key === "activeClub" || (user?.id && e.key === `activeClub_${user.id}`)) {
        const id = idFromContext ?? readActiveClubId();
        setActiveClubId(id);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [activeClub, user?.id]);;

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const id = activeClubId;
        if (!id) {
          setClubId(null);
          setStructures([]);
          return;
        }

        setClubId(id);

        const { getClubStructures } = await import("@/lib/simplified-db");
        const dbStructures = await getClubStructures(id);

        const normalized: ClubStructure[] = (dbStructures || []).map(
          (s: any) => ({
            id: s?.id || uid("structure"),
            name: s?.name || "",
            address: s?.address || "",
            isPublic: typeof s?.isPublic === "boolean" ? s.isPublic : true,
            isVisibleToMembers:
              typeof s?.isVisibleToMembers === "boolean"
                ? s.isVisibleToMembers
                : true,
            isRentable:
              typeof s?.isRentable === "boolean" ? s.isRentable : false,
            payments: Array.isArray(s?.payments)
              ? s.payments.map(normalizePayment)
              : [],
            fields: Array.isArray(s?.fields)
              ? s.fields.map(normalizeField)
              : [],
          }),
        );

        setStructures(normalized);
      } catch (e) {
        console.error(e);
        showToast("error", "Errore nel caricamento delle strutture");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClubId]);

  const persist = async (next: ClubStructure[]) => {
    if (!clubId) return false;
    const { saveClubStructures } = await import("@/lib/simplified-db");
    const ok = await saveClubStructures(clubId, next);
    if (!ok) showToast("error", "Salvataggio strutture fallito");
    return ok;
  };

  const resetStructureForm = () => {
    setEditingStructureId(null);
    setStructureForm({
      name: "",
      address: "",
      isPublic: true,
      isVisibleToMembers: true,
      isRentable: false,
    });
  };

  const openCreateStructure = () => {
    resetStructureForm();
    setIsStructureModalOpen(true);
  };

  const openEditStructure = (id: string) => {
    const s = structures.find((x) => x.id === id);
    if (!s) return;

    setEditingStructureId(id);
    setStructureForm({
      name: s.name,
      address: s.address,
      isPublic: s.isPublic,
      isVisibleToMembers: (s as any).isVisibleToMembers ?? true,
      isRentable: s.isRentable,
    });
    setIsStructureModalOpen(true);
  };

  const handleDeleteStructure = async (id: string) => {
    const next = structures.filter((s) => s.id !== id);
    setStructures(next);
    await persist(next);
    showToast("success", "Struttura eliminata");
  };

  const handleSaveStructure = async () => {
    if (!structureForm.name.trim()) {
      showToast("error", "Inserisci il nome della struttura");
      return;
    }

    let next: ClubStructure[];

    if (editingStructureId) {
      next = structures.map((s) =>
        s.id === editingStructureId
          ? {
              ...s,
              name: structureForm.name.trim(),
              address: structureForm.address.trim(),
              isPublic: structureForm.isPublic,
              isVisibleToMembers: structureForm.isVisibleToMembers,
              isRentable: structureForm.isRentable,
            }
          : s,
      );
    } else {
      const newStructure: ClubStructure = {
        id: uid("structure"),
        name: structureForm.name.trim(),
        address: structureForm.address.trim(),
        isPublic: structureForm.isPublic,
        isVisibleToMembers: structureForm.isVisibleToMembers,
        isRentable: structureForm.isRentable,
        payments: [],
        fields: [],
      };
      next = [...structures, newStructure];
    }

    setStructures(next);
    const ok = await persist(next);
    if (ok) {
      showToast("success", "Struttura salvata");
      // IMPORTANT: close modal + reset mode to avoid "Modifica struttura" after create
      setIsStructureModalOpen(false);
      resetStructureForm();
    }
  };

  const toggleStructurePayments = (structureId: string) => {
    setOpenPaymentsByStructure((prev) => ({
      ...prev,
      [structureId]: !prev[structureId],
    }));
  };

  const toggleStructureFields = (structureId: string) => {
    setOpenFieldsByStructure((prev) => ({
      ...prev,
      [structureId]: !prev[structureId],
    }));
  };

  // Payments logic (mirrors athletes page)
  const openAddPayment = (structureId: string) => {
    setShowAddPaymentFor(structureId);
    setNewPayment({
      date: new Date().toISOString().split("T")[0],
      description: "",
      type: "Quota",
      amount: "",
      status: "Pagato",
    });
  };

  const addPayment = async () => {
    const structureId = showAddPaymentFor;
    if (!structureId) return;

    if (!newPayment.description || !newPayment.amount || !newPayment.date) {
      showToast("error", "Compila tutti i campi obbligatori");
      return;
    }

    const amount = parseFloat(String(newPayment.amount).replace(",", "."));
    if (Number.isNaN(amount)) {
      showToast("error", "Importo non valido");
      return;
    }

    const paymentData: StructurePayment = {
      id: uid("payment"),
      date: newPayment.date,
      description: newPayment.description,
      type: newPayment.type,
      amount,
      status: newPayment.status,
    };

    const next = structures.map((s) =>
      s.id === structureId
        ? { ...s, payments: [...(s.payments || []), paymentData] }
        : s,
    );

    setStructures(next);
    const ok = await persist(next);
    if (ok) {
      setShowAddPaymentFor(null);
      showToast("success", "Pagamento aggiunto con successo");
    }
  };

  const removePayment = async (structureId: string, paymentId: string) => {
    const next = structures.map((s) =>
      s.id === structureId
        ? {
            ...s,
            payments: (s.payments || []).filter((p) => p.id !== paymentId),
          }
        : s,
    );
    setStructures(next);
    const ok = await persist(next);
    if (ok) showToast("success", "Pagamento eliminato");
  };

  // Fields
  const addField = async (structureId: string) => {
    const next = structures.map((s) =>
      s.id === structureId
        ? {
            ...s,
            fields: [
              ...(s.fields || []),
              {
                id: uid("field"),
                name: "Nuovo campo",
                ownership: "Pubblica",
                inRent: false,
                isBookable: true,
                isVisible: true,
                availability: normalizeAvailability({
                  days: ["Lun", "Mer", "Ven"],
                  startTime: "18:00",
                  endTime: "22:00",
                }),
                pricing: [
                  { id: uid("price"), durationMinutes: 60, price: 0 },
                  { id: uid("price"), durationMinutes: 30, price: 0 },
                ],
              },
            ],
          }
        : s,
    );

    setStructures(next);
    await persist(next);
  };

  const updateField = async (
    structureId: string,
    fieldId: string,
    patch: Partial<StructureField>,
  ) => {
    const next = structures.map((s) =>
      s.id === structureId
        ? {
            ...s,
            fields: (s.fields || []).map((f) =>
              f.id === fieldId ? { ...f, ...patch } : f,
            ),
          }
        : s,
    );

    setStructures(next);
    await persist(next);
  };

  const removeField = async (structureId: string, fieldId: string) => {
    const next = structures.map((s) =>
      s.id === structureId
        ? { ...s, fields: (s.fields || []).filter((f) => f.id !== fieldId) }
        : s,
    );

    setStructures(next);
    await persist(next);
  };

  const addSlot = async (
    structureId: string,
    fieldId: string,
    dayKey: string,
  ) => {
    const s = structures.find((x) => x.id === structureId);
    const f = s?.fields?.find((x) => x.id === fieldId);
    const current = f?.availability || normalizeAvailability(null);
    const nextDaySlots = [
      ...(current[dayKey] || []),
      { start: "18:00", end: "22:00" },
    ];
    const nextAvail = { ...current, [dayKey]: nextDaySlots };
    await updateField(structureId, fieldId, { availability: nextAvail });
  };

  const updateSlot = async (
    structureId: string,
    fieldId: string,
    dayKey: string,
    index: number,
    patch: Partial<AvailabilitySlot>,
  ) => {
    const s = structures.find((x) => x.id === structureId);
    const f = s?.fields?.find((x) => x.id === fieldId);
    const current = f?.availability || normalizeAvailability(null);
    const slots = [...(current[dayKey] || [])];
    slots[index] = { ...slots[index], ...patch };
    const nextAvail = { ...current, [dayKey]: slots };
    await updateField(structureId, fieldId, { availability: nextAvail });
  };

  const removeSlot = async (
    structureId: string,
    fieldId: string,
    dayKey: string,
    index: number,
  ) => {
    const s = structures.find((x) => x.id === structureId);
    const f = s?.fields?.find((x) => x.id === fieldId);
    const current = f?.availability || normalizeAvailability(null);
    const slots = [...(current[dayKey] || [])].filter((_, i) => i !== index);
    const nextAvail = { ...current, [dayKey]: slots };
    await updateField(structureId, fieldId, { availability: nextAvail });
  };

  const addPricing = async (structureId: string, fieldId: string) => {
    const s = structures.find((x) => x.id === structureId);
    const f = s?.fields?.find((x) => x.id === fieldId);
    const pricing = Array.isArray(f?.pricing) ? f!.pricing : [];
    const nextPricing = [
      ...pricing,
      { id: uid("price"), durationMinutes: 60, price: 0 },
    ];
    await updateField(structureId, fieldId, { pricing: nextPricing });
  };

  const updatePricing = async (
    structureId: string,
    fieldId: string,
    priceId: string,
    patch: Partial<FieldPricing>,
  ) => {
    const s = structures.find((x) => x.id === structureId);
    const f = s?.fields?.find((x) => x.id === fieldId);
    const pricing = Array.isArray(f?.pricing) ? f!.pricing : [];
    const nextPricing = pricing.map((p) =>
      p.id === priceId ? { ...p, ...patch } : p,
    );
    await updateField(structureId, fieldId, { pricing: nextPricing });
  };

  const removePricing = async (
    structureId: string,
    fieldId: string,
    priceId: string,
  ) => {
    const s = structures.find((x) => x.id === structureId);
    const f = s?.fields?.find((x) => x.id === fieldId);
    const pricing = Array.isArray(f?.pricing) ? f!.pricing : [];
    const nextPricing = pricing.filter((p) => p.id !== priceId);
    await updateField(structureId, fieldId, { pricing: nextPricing });
  };

  const emptyState = useMemo(() => {
    if (loading) return null;
    if (!clubId) {
      return (
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Nessun club selezionato</p>
        </div>
      );
    }
    return null;
  }, [clubId, loading]);

  return (
    <div className="min-h-screen bg-background">
      <MobileTopBar />
      <div className="flex">
        <Sidebar />
        <div className="flex-1 flex flex-col min-h-screen">
          <Header title="Strutture" />
          <main className="flex-1 p-4 md:p-6 space-y-6 overflow-y-auto">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Strutture
                </h1>
                <p className="text-gray-600 mt-2">
                  Registra strutture, gestisci pagamenti e configura i campi.
                </p>
              </div>

              <Dialog
                open={isStructureModalOpen}
                onOpenChange={(open) => {
                  setIsStructureModalOpen(open);
                  if (!open) resetStructureForm();
                }}
              >
                <DialogTrigger asChild>
                  <Button className="gap-2" onClick={openCreateStructure}>
                    <Plus className="h-4 w-4" />
                    Nuova struttura
                  </Button>
                </DialogTrigger>

                <DialogContent className="max-w-xl">
                  <DialogHeader>
                    <DialogTitle>
                      {editingStructureId
                        ? "Modifica struttura"
                        : "Aggiungi struttura"}
                    </DialogTitle>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <Label>Nome *</Label>
                      <Input
                        value={structureForm.name}
                        onChange={(e) =>
                          setStructureForm((prev) => ({
                            ...prev,
                            name: e.target.value,
                          }))
                        }
                        placeholder="Es: PalaSport"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label>Indirizzo</Label>
                      <Input
                        value={structureForm.address}
                        onChange={(e) =>
                          setStructureForm((prev) => ({
                            ...prev,
                            address: e.target.value,
                          }))
                        }
                        placeholder="Via..."
                      />
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <Label>Struttura pubblica</Label>
                        <p className="text-xs text-muted-foreground">
                          Visibile nei contesti interni.
                        </p>
                      </div>
                      <Switch
                        checked={structureForm.isPublic}
                        onCheckedChange={(checked) =>
                          setStructureForm((prev) => ({
                            ...prev,
                            isPublic: checked,
                          }))
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <Label>Visibile ai tesserati</Label>
                        <p className="text-xs text-muted-foreground">
                          Se disattivato, la struttura non sarà visibile ad
                          atleti e genitori.
                        </p>
                      </div>
                      <Switch
                        checked={structureForm.isVisibleToMembers}
                        onCheckedChange={(checked) =>
                          setStructureForm((prev) => ({
                            ...prev,
                            isVisibleToMembers: checked,
                          }))
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <Label>Affittabile</Label>
                        <p className="text-xs text-muted-foreground">
                          Abilita l'affitto della struttura.
                        </p>
                      </div>
                      <Switch
                        checked={structureForm.isRentable}
                        onCheckedChange={(checked) =>
                          setStructureForm((prev) => ({
                            ...prev,
                            isRentable: checked,
                          }))
                        }
                      />
                    </div>

                    <Separator />

                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setIsStructureModalOpen(false)}
                      >
                        Annulla
                      </Button>
                      <Button className="gap-2" onClick={handleSaveStructure}>
                        <Save className="h-4 w-4" />
                        Salva
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {emptyState}

            {loading ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  Caricamento...
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {structures.length === 0 ? (
                  <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                      Nessuna struttura registrata.
                    </CardContent>
                  </Card>
                ) : (
                  structures.map((s) => (
                    <Card key={s.id} className="overflow-hidden">
                      <CardHeader className="flex flex-row items-start justify-between gap-4">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            {s.name || "(Senza nome)"}
                            {(s as any).isVisibleToMembers ? (
                              <Badge className="bg-gray-100 text-gray-700 border border-gray-200">
                                Visibile ai tesserati
                              </Badge>
                            ) : (
                              <Badge className="bg-gray-100 text-gray-500 border border-gray-200">
                                Non visibile ai tesserati
                              </Badge>
                            )}
                          </CardTitle>
                          {s.address ? (
                            <p className="text-sm text-muted-foreground mt-1">
                              {s.address}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => openEditStructure(s.id)}
                          >
                            <Pencil className="h-4 w-4" />
                            Modifica
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Elimina struttura"
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Eliminare la struttura?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Questa azione eliminerà anche campi, tariffe e
                                  pagamenti associati. Non è reversibile.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annulla</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteStructure(s.id)}
                                >
                                  Elimina
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-4">
                        {/* Payments */}
                        <div className="rounded-lg border p-3">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                              <CreditCard className="h-4 w-4" />
                              <p className="font-medium">Pagamenti</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {openPaymentsByStructure[s.id] ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openAddPayment(s.id)}
                                >
                                  <Plus className="h-4 w-4 mr-2" />
                                  Aggiungi Pagamento
                                </Button>
                              ) : null}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleStructurePayments(s.id)}
                                aria-label={
                                  openPaymentsByStructure[s.id]
                                    ? "Nascondi pagamenti"
                                    : "Mostra pagamenti"
                                }
                              >
                                {openPaymentsByStructure[s.id] ? (
                                  <ChevronUp className="h-5 w-5" />
                                ) : (
                                  <ChevronDown className="h-5 w-5" />
                                )}
                              </Button>
                            </div>
                          </div>

                          {openPaymentsByStructure[s.id] ? (
                            <div className="mt-3 overflow-x-auto">
                              <table className="w-full">
                                <thead>
                                  <tr className="border-b">
                                    <th className="text-left p-2">Data</th>
                                    <th className="text-left p-2">
                                      Descrizione
                                    </th>
                                    <th className="text-left p-2">Importo</th>
                                    <th className="text-left p-2">Stato</th>
                                    <th className="text-left p-2">Azioni</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {s.payments?.length ? (
                                    s.payments.map((p) => (
                                      <tr key={p.id} className="border-b">
                                        <td className="p-2">
                                          {formatDate(p.date)}
                                        </td>
                                        <td className="p-2">{p.description}</td>
                                        <td className="p-2">
                                          € {Number(p.amount || 0).toFixed(2)}
                                        </td>
                                        <td className="p-2">
                                          <Badge
                                            className={badgeClassForPaymentStatus(
                                              p.status,
                                            )}
                                          >
                                            {p.status}
                                          </Badge>
                                        </td>
                                        <td className="p-2">
                                          <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                title="Elimina"
                                              >
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                              </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                              <AlertDialogHeader>
                                                <AlertDialogTitle>
                                                  Eliminare il pagamento?
                                                </AlertDialogTitle>
                                                <AlertDialogDescription>
                                                  Questa azione non è
                                                  reversibile.
                                                </AlertDialogDescription>
                                              </AlertDialogHeader>
                                              <AlertDialogFooter>
                                                <AlertDialogCancel>
                                                  Annulla
                                                </AlertDialogCancel>
                                                <AlertDialogAction
                                                  onClick={() =>
                                                    removePayment(s.id, p.id)
                                                  }
                                                  className="bg-red-600 hover:bg-red-700"
                                                >
                                                  Elimina
                                                </AlertDialogAction>
                                              </AlertDialogFooter>
                                            </AlertDialogContent>
                                          </AlertDialog>
                                        </td>
                                      </tr>
                                    ))
                                  ) : (
                                    <tr>
                                      <td
                                        colSpan={5}
                                        className="p-4 text-center text-muted-foreground"
                                      >
                                        Nessun pagamento registrato
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          ) : null}
                        </div>

                        {/* Fields & Pricing */}
                        <div className="rounded-lg border p-3">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                              <CalendarClock className="h-4 w-4" />
                              <p className="font-medium">Campi e tariffe</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {openFieldsByStructure[s.id] ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => addField(s.id)}
                                >
                                  <Plus className="h-4 w-4 mr-2" />
                                  Aggiungi campo
                                </Button>
                              ) : null}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleStructureFields(s.id)}
                                aria-label={
                                  openFieldsByStructure[s.id]
                                    ? "Nascondi campi e tariffe"
                                    : "Mostra campi e tariffe"
                                }
                              >
                                {openFieldsByStructure[s.id] ? (
                                  <ChevronUp className="h-5 w-5" />
                                ) : (
                                  <ChevronDown className="h-5 w-5" />
                                )}
                              </Button>
                            </div>
                          </div>

                          {openFieldsByStructure[s.id] ? (
                            <div className="mt-3">
                              {!s.fields?.length ? (
                                <p className="text-sm text-muted-foreground">
                                  Nessun campo registrato.
                                </p>
                              ) : (
                                <Accordion type="multiple" className="w-full">
                                  {s.fields.map((f) => (
                                    <AccordionItem key={f.id} value={f.id}>
                                      <AccordionTrigger>
                                        <div className="flex items-center justify-between w-full pr-2 gap-3">
                                          <div className="text-left">
                                            <p className="font-medium">
                                              {f.name}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                              Proprietà: {f.ownership} •{" "}
                                              {f.isBookable
                                                ? "Affittabile"
                                                : "Non affittabile"}{" "}
                                              •{" "}
                                              {f.inRent
                                                ? "In affitto"
                                                : "Non in affitto"}
                                            </p>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                updateField(s.id, f.id, {
                                                  isVisible: !f.isVisible,
                                                });
                                              }}
                                              title={
                                                f.isVisible
                                                  ? "Nascondi ad atleti/genitori"
                                                  : "Mostra ad atleti/genitori"
                                              }
                                            >
                                              {f.isVisible ? (
                                                <>
                                                  <Eye className="h-4 w-4 mr-2" />{" "}
                                                  Mostra
                                                </>
                                              ) : (
                                                <>
                                                  <EyeOff className="h-4 w-4 mr-2" />{" "}
                                                  Nascosto
                                                </>
                                              )}
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                removeField(s.id, f.id);
                                              }}
                                              title="Elimina campo"
                                            >
                                              <Trash2 className="h-4 w-4 text-red-500" />
                                            </Button>
                                          </div>
                                        </div>
                                      </AccordionTrigger>

                                      <AccordionContent>
                                        <div className="space-y-5 pt-2">
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                              <Label>Nome campo</Label>
                                              <Input
                                                value={f.name}
                                                onChange={(e) =>
                                                  updateField(s.id, f.id, {
                                                    name: e.target.value,
                                                  })
                                                }
                                              />
                                            </div>

                                            <div className="space-y-1">
                                              <Label>Proprietà</Label>
                                              <Select
                                                value={f.ownership}
                                                onValueChange={(v) =>
                                                  updateField(s.id, f.id, {
                                                    ownership:
                                                      v as FieldOwnership,
                                                  })
                                                }
                                              >
                                                <SelectTrigger>
                                                  <SelectValue placeholder="Seleziona" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="Pubblica">
                                                    Pubblica
                                                  </SelectItem>
                                                  <SelectItem value="Privata">
                                                    Privata
                                                  </SelectItem>
                                                </SelectContent>
                                              </Select>
                                            </div>

                                            <div className="flex items-center justify-between rounded-lg border p-3">
                                              <div>
                                                <Label>In affitto</Label>
                                                <p className="text-xs text-muted-foreground">
                                                  Flag del campo
                                                </p>
                                              </div>
                                              <Switch
                                                checked={f.inRent}
                                                onCheckedChange={(checked) =>
                                                  updateField(s.id, f.id, {
                                                    inRent: checked,
                                                  })
                                                }
                                              />
                                            </div>

                                            <div className="flex items-center justify-between rounded-lg border p-3">
                                              <div>
                                                <Label>Campo affittabile</Label>
                                                <p className="text-xs text-muted-foreground">
                                                  Disponibile per prenotazioni
                                                </p>
                                              </div>
                                              <Switch
                                                checked={f.isBookable}
                                                onCheckedChange={(checked) =>
                                                  updateField(s.id, f.id, {
                                                    isBookable: checked,
                                                  })
                                                }
                                              />
                                            </div>
                                          </div>

                                          <Separator />

                                          <div>
                                            <p className="font-medium mb-2">
                                              Orari per giorno
                                            </p>
                                            <div className="space-y-3">
                                              {WEEK_DAYS.map((d) => {
                                                const slots =
                                                  f.availability?.[d.key] || [];
                                                return (
                                                  <div
                                                    key={d.key}
                                                    className="rounded-lg border p-3"
                                                  >
                                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                                      <p className="font-medium">
                                                        {d.label}
                                                      </p>
                                                      <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() =>
                                                          addSlot(
                                                            s.id,
                                                            f.id,
                                                            d.key,
                                                          )
                                                        }
                                                      >
                                                        <Plus className="h-4 w-4 mr-2" />
                                                        Aggiungi fascia
                                                      </Button>
                                                    </div>

                                                    {slots.length === 0 ? (
                                                      <p className="text-sm text-muted-foreground mt-2">
                                                        Nessuna fascia oraria.
                                                      </p>
                                                    ) : (
                                                      <div className="mt-2 space-y-2">
                                                        {slots.map(
                                                          (slot, idx) => (
                                                            <div
                                                              key={`${d.key}-${idx}`}
                                                              className="flex items-center gap-2 flex-wrap"
                                                            >
                                                              <div className="space-y-1">
                                                                <Label className="text-xs">
                                                                  Inizio
                                                                </Label>
                                                                <Input
                                                                  type="time"
                                                                  value={
                                                                    slot.start
                                                                  }
                                                                  onChange={(
                                                                    e,
                                                                  ) =>
                                                                    updateSlot(
                                                                      s.id,
                                                                      f.id,
                                                                      d.key,
                                                                      idx,
                                                                      {
                                                                        start:
                                                                          e
                                                                            .target
                                                                            .value,
                                                                      },
                                                                    )
                                                                  }
                                                                  className="w-36"
                                                                />
                                                              </div>
                                                              <div className="space-y-1">
                                                                <Label className="text-xs">
                                                                  Fine
                                                                </Label>
                                                                <Input
                                                                  type="time"
                                                                  value={
                                                                    slot.end
                                                                  }
                                                                  onChange={(
                                                                    e,
                                                                  ) =>
                                                                    updateSlot(
                                                                      s.id,
                                                                      f.id,
                                                                      d.key,
                                                                      idx,
                                                                      {
                                                                        end: e
                                                                          .target
                                                                          .value,
                                                                      },
                                                                    )
                                                                  }
                                                                  className="w-36"
                                                                />
                                                              </div>
                                                              <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() =>
                                                                  removeSlot(
                                                                    s.id,
                                                                    f.id,
                                                                    d.key,
                                                                    idx,
                                                                  )
                                                                }
                                                                title="Rimuovi fascia"
                                                              >
                                                                <Trash2 className="h-4 w-4 text-red-500" />
                                                              </Button>
                                                            </div>
                                                          ),
                                                        )}
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>

                                          <Separator />

                                          <div>
                                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                              <p className="font-medium">
                                                Tariffe
                                              </p>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() =>
                                                  addPricing(s.id, f.id)
                                                }
                                              >
                                                <Plus className="h-4 w-4 mr-2" />
                                                Aggiungi tariffa
                                              </Button>
                                            </div>

                                            <div className="mt-3 space-y-2">
                                              {f.pricing?.length ? (
                                                f.pricing.map((p) => (
                                                  <div
                                                    key={p.id}
                                                    className="flex items-center gap-2 flex-wrap"
                                                  >
                                                    <div className="space-y-1">
                                                      <Label className="text-xs">
                                                        Durata (min)
                                                      </Label>
                                                      <Input
                                                        type="number"
                                                        value={
                                                          p.durationMinutes
                                                        }
                                                        onChange={(e) =>
                                                          updatePricing(
                                                            s.id,
                                                            f.id,
                                                            p.id,
                                                            {
                                                              durationMinutes:
                                                                Number(
                                                                  e.target
                                                                    .value || 0,
                                                                ),
                                                            },
                                                          )
                                                        }
                                                        className="w-36"
                                                      />
                                                    </div>

                                                    <div className="space-y-1">
                                                      <Label className="text-xs">
                                                        Prezzo (€)
                                                      </Label>
                                                      <Input
                                                        type="number"
                                                        step="0.01"
                                                        value={p.price}
                                                        onChange={(e) =>
                                                          updatePricing(
                                                            s.id,
                                                            f.id,
                                                            p.id,
                                                            {
                                                              price: Number(
                                                                String(
                                                                  e.target
                                                                    .value,
                                                                ).replace(
                                                                  ",",
                                                                  ".",
                                                                ) || 0,
                                                              ),
                                                            },
                                                          )
                                                        }
                                                        className="w-36"
                                                      />
                                                    </div>

                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      onClick={() =>
                                                        removePricing(
                                                          s.id,
                                                          f.id,
                                                          p.id,
                                                        )
                                                      }
                                                      title="Rimuovi tariffa"
                                                    >
                                                      <Trash2 className="h-4 w-4 text-red-500" />
                                                    </Button>
                                                  </div>
                                                ))
                                              ) : (
                                                <p className="text-sm text-muted-foreground">
                                                  Nessuna tariffa.
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      </AccordionContent>
                                    </AccordionItem>
                                  ))}
                                </Accordion>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Add Payment Modal (same pattern as athletes/[id]) */}
      <Dialog
        open={!!showAddPaymentFor}
        onOpenChange={(open) => {
          if (!open) setShowAddPaymentFor(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aggiungi Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Data *</Label>
              <Input
                type="date"
                value={newPayment.date}
                onChange={(e) =>
                  setNewPayment({ ...newPayment, date: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Descrizione *</Label>
              <Input
                value={newPayment.description}
                onChange={(e) =>
                  setNewPayment({ ...newPayment, description: e.target.value })
                }
                placeholder="Es: Canone mensile"
              />
            </div>
            <div>
              <Label>Importo (€) *</Label>
              <Input
                type="number"
                step="0.01"
                value={newPayment.amount}
                onChange={(e) =>
                  setNewPayment({ ...newPayment, amount: e.target.value })
                }
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Stato *</Label>
              <Select
                value={newPayment.status}
                onValueChange={(value) =>
                  setNewPayment({
                    ...newPayment,
                    status: value as PaymentStatus,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona stato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pagato">Pagato</SelectItem>
                  <SelectItem value="In attesa">In attesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddPaymentFor(null)}
            >
              Annulla
            </Button>
            <Button
              onClick={addPayment}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Aggiungi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
