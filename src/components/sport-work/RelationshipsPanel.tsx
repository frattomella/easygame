"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import {
  COMPENSATION_FREQUENCIES,
  COMPENSATION_FREQUENCY_LABELS,
  RELATIONSHIP_TYPES,
  RELATIONSHIP_TYPE_HINTS,
  RELATIONSHIP_TYPE_LABELS,
  SPORT_WORK_ROLES,
  SPORT_WORK_ROLE_LABELS,
  type RelationshipType,
} from "@/lib/sport-work/model";
import {
  SOCIAL_COVERAGES,
  SOCIAL_COVERAGE_LABELS,
} from "@/lib/sport-work/rules";
import {
  formatCurrency,
  formatDate,
  relationshipStatusBadge,
  relationshipTypeLabel,
  roleLabel,
  statusBadgeOf,
} from "./sport-work-format";

/**
 * L'elenco dei rapporti di lavoro sportivo, e il dialogo che ne crea uno.
 *
 * **Il tipo di rapporto si sceglie con la sua conseguenza accanto.** Sopra
 * ogni opzione c'e cosa comporta: la co.co.co. fa girare il motore
 * contributivo, la partita IVA no, il subordinato lo liquida un consulente.
 * Chiedere una sigla senza dire cosa cambia e il modo in cui un gestionale
 * ottiene dati che sembrano scelte e non lo sono.
 *
 * **Il rapporto nasce in bozza, e la schermata non lo nasconde.** Attivarlo e
 * un atto separato, che verifica contratto e anagrafica: se manca qualcosa,
 * la scheda dice **cosa** manca invece di rifiutare e basta.
 */

const emptyPerson = () => ({
  firstName: "",
  lastName: "",
  fiscalCode: "",
  email: "",
  phone: "",
  originType: "trainer",
  socialCoverage: "NONE",
  fiscalProfile: "NONE",
  vatNumber: "",
  iban: "",
});

const emptyRelationship = () => ({
  personId: "",
  role: "COACH",
  relationshipType: "SPORT_COCOCO" as RelationshipType,
  startDate: "",
  endDate: "",
  contractAmount: "",
  compensationFrequency: "SEASONAL",
  weeklyHours: "",
  notes: "",
});

export function RelationshipsPanel({ clubId }: { clubId: string | null }) {
  const { showToast } = useToast();
  const router = useRouter();

  const [relationships, setRelationships] = React.useState<any[]>([]);
  const [people, setPeople] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("ALL");

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"existing" | "new">("existing");
  const [personForm, setPersonForm] = React.useState(emptyPerson);
  const [form, setForm] = React.useState(emptyRelationship);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const [relationshipsResult, peopleResult] = await Promise.all([
      apiRequest<any[]>("/api/v1/sport-work/relationships"),
      apiRequest<any[]>("/api/v1/sport-work/people"),
    ]);
    setLoading(false);

    if (relationshipsResult.error) {
      showToast(
        "error",
        relationshipsResult.error.message || "Errore nella lettura dei rapporti",
      );
      return;
    }

    setRelationships(
      Array.isArray(relationshipsResult.data) ? relationshipsResult.data : [],
    );
    setPeople(Array.isArray(peopleResult.data) ? peopleResult.data : []);
  }, [showToast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const nameById = React.useMemo(
    () =>
      new Map<string, string>(
        people.map((person: any) => [String(person.id), String(person.full_name)]),
      ),
    [people],
  );

  const visible = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return relationships.filter((relationship) => {
      if (statusFilter !== "ALL" && relationship.status !== statusFilter) {
        return false;
      }
      if (!term) return true;
      const name = nameById.get(String(relationship.person_id)) || "";
      return `${name} ${roleLabel(relationship.role)}`
        .toLowerCase()
        .includes(term);
    });
  }, [relationships, statusFilter, search, nameById]);

  const setPersonField = (field: string, value: string) =>
    setPersonForm((current) => ({ ...current, [field]: value }));

  const setField = (field: string, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const handleCreate = async () => {
    if (!form.startDate) {
      showToast("error", "La data di inizio del rapporto e obbligatoria");
      return;
    }

    setSaving(true);

    let personId = form.personId;

    if (mode === "new") {
      const { data, error } = await apiRequest<any>(
        "/api/v1/sport-work/people",
        { method: "POST", body: personForm },
      );

      if (error || !data) {
        setSaving(false);
        showToast("error", error?.message || "Creazione della persona non riuscita");
        return;
      }
      personId = data.id;
    }

    if (!personId) {
      setSaving(false);
      showToast("error", "Seleziona una persona o creane una nuova");
      return;
    }

    const { data, error } = await apiRequest<any>(
      "/api/v1/sport-work/relationships",
      { method: "POST", body: { ...form, personId } },
    );
    setSaving(false);

    if (error || !data) {
      showToast("error", error?.message || "Creazione del rapporto non riuscita");
      return;
    }

    setDialogOpen(false);
    setForm(emptyRelationship());
    setPersonForm(emptyPerson());
    showToast("success", "Rapporto creato in bozza");
    router.push(
      clubId
        ? `/sport-work/relationships/${data.id}?clubId=${encodeURIComponent(clubId)}`
        : `/sport-work/relationships/${data.id}`,
    );
  };

  const openDetail = (id: string) =>
    router.push(
      clubId
        ? `/sport-work/relationships/${id}?clubId=${encodeURIComponent(clubId)}`
        : `/sport-work/relationships/${id}`,
    );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>Rapporti di lavoro sportivo</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Chi lavora per la societa, a quali condizioni e per quale periodo.
            </p>
          </div>
          <Button
            className="w-full lg:w-auto"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nuovo rapporto
          </Button>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Cerca per nome o ruolo"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tutti gli stati</SelectItem>
              {Object.entries(relationshipStatusBadge).map(([value, badge]) => (
                <SelectItem key={value} value={value}>
                  {badge.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">Caricamento…</p>
        ) : visible.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            Nessun rapporto. Il primo si crea con «Nuovo rapporto».
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-gray-700">
            {visible.map((relationship) => {
              const badge = statusBadgeOf(
                relationshipStatusBadge,
                relationship.status,
                "DRAFT",
              );
              return (
                <li key={relationship.id}>
                  <button
                    type="button"
                    onClick={() => openDetail(relationship.id)}
                    className="flex w-full flex-col gap-2 px-6 py-4 text-left transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-gray-800"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {nameById.get(String(relationship.person_id)) ||
                          "Persona non trovata"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {roleLabel(relationship.role)} ·{" "}
                        {relationshipTypeLabel(relationship.relationship_type)} ·{" "}
                        {formatDate(relationship.start_date)}
                        {relationship.end_date
                          ? ` — ${formatDate(relationship.end_date)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {relationship.contract_amount ? (
                        <span className="text-sm tabular-nums">
                          {formatCurrency(relationship.contract_amount)}
                        </span>
                      ) : null}
                      <Badge variant="outline" className={badge.className}>
                        {badge.label}
                      </Badge>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuovo rapporto di lavoro sportivo</DialogTitle>
            <DialogDescription>
              Il rapporto nasce in bozza. Si attiva dalla sua scheda, quando ci
              sono contratto e anagrafica.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === "existing" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("existing")}
              >
                Persona gia censita
              </Button>
              <Button
                type="button"
                variant={mode === "new" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("new")}
              >
                Nuova persona
              </Button>
            </div>

            {mode === "existing" ? (
              <div className="space-y-2">
                <Label>Persona</Label>
                <Select
                  value={form.personId}
                  onValueChange={(value) => setField("personId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona una persona" />
                  </SelectTrigger>
                  <SelectContent>
                    {people.map((person: any) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.full_name}
                        {person.fiscal_code ? ` — ${person.fiscal_code}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sw-first">Nome</Label>
                  <Input
                    id="sw-first"
                    value={personForm.firstName}
                    onChange={(event) =>
                      setPersonField("firstName", event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sw-last">Cognome</Label>
                  <Input
                    id="sw-last"
                    value={personForm.lastName}
                    onChange={(event) =>
                      setPersonField("lastName", event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sw-cf">Codice fiscale</Label>
                  <Input
                    id="sw-cf"
                    value={personForm.fiscalCode}
                    onChange={(event) =>
                      setPersonField("fiscalCode", event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sw-email">Email</Label>
                  <Input
                    id="sw-email"
                    type="email"
                    value={personForm.email}
                    onChange={(event) =>
                      setPersonField("email", event.target.value)
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Copertura previdenziale dichiarata</Label>
                  <Select
                    value={personForm.socialCoverage}
                    onValueChange={(value) =>
                      setPersonField("socialCoverage", value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SOCIAL_COVERAGES.map((coverage) => (
                        <SelectItem key={coverage} value={coverage}>
                          {SOCIAL_COVERAGE_LABELS[coverage]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Decide l&apos;aliquota. La dichiara il lavoratore: EasyGame
                    non la deduce dal ruolo.
                  </p>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Ruolo</Label>
                <Select
                  value={form.role}
                  onValueChange={(value) => setField("role", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPORT_WORK_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {SPORT_WORK_ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Tipo di rapporto</Label>
                <Select
                  value={form.relationshipType}
                  onValueChange={(value) => setField("relationshipType", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {RELATIONSHIP_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {RELATIONSHIP_TYPE_HINTS[form.relationshipType]}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sw-start">Inizio</Label>
                <Input
                  id="sw-start"
                  type="date"
                  value={form.startDate}
                  onChange={(event) => setField("startDate", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sw-end">Fine</Label>
                <Input
                  id="sw-end"
                  type="date"
                  value={form.endDate}
                  onChange={(event) => setField("endDate", event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sw-amount">Importo pattuito</Label>
                <Input
                  id="sw-amount"
                  inputMode="decimal"
                  value={form.contractAmount}
                  onChange={(event) =>
                    setField("contractAmount", event.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Periodicita</Label>
                <Select
                  value={form.compensationFrequency}
                  onValueChange={(value) =>
                    setField("compensationFrequency", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPENSATION_FREQUENCIES.map((frequency) => (
                      <SelectItem key={frequency} value={frequency}>
                        {COMPENSATION_FREQUENCY_LABELS[frequency]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sw-hours">Ore settimanali dichiarate</Label>
                <Input
                  id="sw-hours"
                  inputMode="decimal"
                  value={form.weeklyHours}
                  onChange={(event) => setField("weeklyHours", event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Oltre 24 ore la presunzione di autonomia non opera piu: il
                  dato serve al consulente, EasyGame non ne trae conclusioni.
                </p>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="sw-notes">Note</Label>
                <Textarea
                  id="sw-notes"
                  rows={2}
                  value={form.notes}
                  onChange={(event) => setField("notes", event.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="w-full sm:w-auto"
            >
              Annulla
            </Button>
            <Button
              onClick={handleCreate}
              disabled={saving}
              className="w-full sm:w-auto"
            >
              {saving ? "Creazione…" : "Crea rapporto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
