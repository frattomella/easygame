"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Building2, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-notification";
import { cn } from "@/lib/utils";
import { normalizeStructure, type ClubStructure } from "@/lib/structures-utils";
import { StructureBookingsSection } from "./StructureBookingsSection";
import { StructureFieldsSection } from "./StructureFieldsSection";
import { StructureInfoSection } from "./StructureInfoSection";
import { StructurePricingSection } from "./StructurePricingSection";
import { StructureRentPaymentsSection } from "./StructureRentPaymentsSection";

type StructureDetailPageProps = {
  structure: ClubStructure;
  onBack: () => void;
  onSave: (structure: ClubStructure) => Promise<boolean>;
};

export function StructureDetailPage({
  structure,
  onBack,
  onSave,
}: StructureDetailPageProps) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState<ClubStructure>(() =>
    normalizeStructure(structure),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(normalizeStructure(structure));
  }, [structure]);

  const save = async () => {
    if (!draft.name.trim()) {
      showToast("error", "Il nome della struttura e obbligatorio");
      return;
    }

    setSaving(true);
    try {
      const ok = await onSave(normalizeStructure(draft));
      showToast(ok ? "success" : "error", ok ? "Struttura salvata" : "Salvataggio fallito");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-lg border bg-white p-4 shadow-sm md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <Button type="button" variant="ghost" className="mb-2 px-0" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Torna alle strutture
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-blue-50 text-blue-600">
              <Building2 className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {draft.name || "Struttura senza nome"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {[draft.address, draft.city].filter(Boolean).join(", ") ||
                  "Indirizzo non inserito"}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge
              variant="outline"
              className={cn(
                draft.isVisibleToMembers
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-slate-200 bg-slate-50 text-slate-600",
              )}
            >
              {draft.isVisibleToMembers ? "Visibile" : "Non visibile"}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                draft.isRentable
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-slate-50 text-slate-600",
              )}
            >
              {draft.isRentable ? "Affittabile" : "Non affittabile"}
            </Badge>
          </div>
        </div>
        <Button type="button" onClick={save} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Salvataggio..." : "Salva"}
        </Button>
      </div>

      <Tabs defaultValue="info" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="info">Informazioni</TabsTrigger>
          <TabsTrigger value="fields">Campi</TabsTrigger>
          <TabsTrigger value="rent">Pagamenti / Fitti</TabsTrigger>
          <TabsTrigger value="pricing">Tariffe</TabsTrigger>
          <TabsTrigger value="bookings">Prenotazioni</TabsTrigger>
          <TabsTrigger value="notes">Note</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <StructureInfoSection structure={draft} onChange={setDraft} />
        </TabsContent>
        <TabsContent value="fields">
          <StructureFieldsSection structure={draft} onChange={setDraft} />
        </TabsContent>
        <TabsContent value="rent">
          <StructureRentPaymentsSection structure={draft} onChange={setDraft} />
        </TabsContent>
        <TabsContent value="pricing">
          <StructurePricingSection structure={draft} onChange={setDraft} />
        </TabsContent>
        <TabsContent value="bookings">
          <StructureBookingsSection structure={draft} onChange={setDraft} />
        </TabsContent>
        <TabsContent value="notes">
          <Card>
            <CardHeader>
              <CardTitle>Note struttura</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={8}
                value={draft.notes || ""}
                onChange={(event) =>
                  setDraft({ ...draft, notes: event.target.value })
                }
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

