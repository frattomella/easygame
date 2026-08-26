"use client";

import React from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { apiRequest, readStoredActiveClub } from "@/lib/api/client";
import { canManageClubConfiguration } from "@/lib/access-roles";
import { FundingProgramDetail } from "./FundingProgramDetail";
import { useToast } from "@/components/ui/toast-notification";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  fundingAccrualSourceLabel,
  requirementUnitLabel,
  validateFundingProgram,
  SELECTABLE_FUNDING_ACCRUAL_SOURCES,
} from "@/lib/funding/funding-model";

/**
 * Configurazione dei programmi di contributo (ADR-0037).
 *
 * **Ogni bando e una riga di questo elenco, non un ramo nel codice.** Il
 * Voucher per lo Sport della Regione Lazio 2025 si configura qui — plafond 500,
 * 60 EUR al mese, almeno 8 ore, niente sotto la soglia — e il calcolo che ne
 * segue e lo stesso che serve un contributo comunale quindicinale a presenze.
 * Se un domani una soglia finisse nel codice, questa schermata smetterebbe di
 * essere la fonte di verita.
 *
 * Vive come componente e non dentro `registration-management/page.tsx` perche
 * quella pagina e gia una delle tre monolitiche che WP-19 sta scomponendo:
 * aggiungerle una scheda non deve volere dire aggiungerle settecento righe.
 */

const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const formatDate = (value?: unknown) => {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("it-IT");
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: {
    label: "BOZZA",
    className: "border-slate-200 bg-slate-100 text-slate-600",
  },
  active: {
    label: "ATTIVO",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  closed: {
    label: "CHIUSO",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
};

const emptyForm = () => ({
  name: "",
  funder_name: "",
  status: "draft",
  valid_from: "",
  valid_to: "",
  athlete_plafond: "",
  accrual_source: "easygame_attendance",
  period_amount: "",
  period_frequency: "monthly",
  period_length_days: "",
  requirement_unit: "hours",
  requirement_min: "",
  unmet_behavior: "none",
  max_periods: "",
  notes: "",
});

export function FundingProgramsPanel() {
  const { showToast } = useToast();
  const [programs, setPrograms] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm);

  /*
    Il programma aperto sta in stato e non in un indirizzo: questo pannello
    vive dentro una scheda di Gestione Iscrizioni, e cambiare rotta
    porterebbe via anche il resto della pagina.
  */
  const [openProgramId, setOpenProgramId] = React.useState<string | null>(null);
  const [canManage, setCanManage] = React.useState(false);

  React.useEffect(() => {
    setCanManage(canManageClubConfiguration(readStoredActiveClub()?.role));
  }, []);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await apiRequest<any[]>("/api/v1/funding/programs");
    setIsLoading(false);

    if (error) {
      showToast("error", error.message || "Errore nella lettura dei programmi");
      return;
    }

    setPrograms(Array.isArray(data) ? data : []);
  }, [showToast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const setField = (field: string, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const validationError = React.useMemo(
    () => validateFundingProgram(form),
    [form],
  );

  const handleSave = async () => {
    if (validationError) {
      showToast("error", validationError);
      return;
    }

    setIsSaving(true);
    const { error } = await apiRequest("/api/v1/funding/programs", {
      method: "POST",
      body: form,
    });
    setIsSaving(false);

    if (error) {
      showToast("error", error.message || "Creazione non riuscita");
      return;
    }

    setIsDialogOpen(false);
    setForm(emptyForm());
    await load();
    showToast("success", "Programma di contributo creato");
  };

  if (openProgramId) {
    return (
      <FundingProgramDetail
        programId={openProgramId}
        canManage={canManage}
        onBack={() => {
          setOpenProgramId(null);
          void load();
        }}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Voucher e contributi</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Bandi ed enti finanziatori. Le regole sono configurazione: importo
              per periodo, requisito minimo e cosa succede sotto la soglia.
            </p>
          </div>
          <Button
            className="w-full sm:w-auto"
            onClick={() => setIsDialogOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nuovo programma
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading && programs.length === 0 ? (
          <p className="text-sm text-slate-500">Lettura dei programmi...</p>
        ) : programs.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nessun programma configurato. Un voucher regionale, un contributo
            comunale o un bando privato si descrivono tutti con gli stessi
            campi.
          </p>
        ) : (
          <div className="space-y-3">
            {programs.map((program) => {
              const badge =
                STATUS_BADGE[String(program.status)] || STATUS_BADGE.draft;

              return (
                /*
                  La riga intera apre la scheda: `funding_enrollments`
                  esisteva nel modello e nessuna schermata lo sapeva
                  scrivere, quindi un bando caricato restava senza
                  beneficiari e non maturava niente.
                */
                <button
                  key={String(program.id)}
                  type="button"
                  onClick={() => setOpenProgramId(String(program.id))}
                  className="w-full rounded-lg border border-slate-200 p-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:border-slate-800 dark:hover:bg-slate-900"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{program.name}</p>
                    <Badge variant="outline" className={badge.className}>
                      {badge.label}
                    </Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      Apri la scheda
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {program.funder_name} · dal {formatDate(program.valid_from)}{" "}
                    al {formatDate(program.valid_to)}
                  </p>
                  <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                    <span>
                      Massimale programma:{" "}
                      <strong>{formatCurrency(program.athlete_plafond)}</strong>
                    </span>
                    <span>
                      Per periodo:{" "}
                      <strong>{formatCurrency(program.period_amount)}</strong>
                      {program.period_frequency === "monthly"
                        ? " al mese"
                        : ` ogni ${program.period_length_days} giorni`}
                    </span>
                    <span>
                      Requisito:{" "}
                      <strong>
                        {program.requirement_min}{" "}
                        {requirementUnitLabel(program.requirement_unit)}
                      </strong>
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Fonte della maturazione:{" "}
                    {fundingAccrualSourceLabel(
                      program.accrual_source || "easygame_attendance",
                    )}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nuovo programma di contributo</DialogTitle>
            <DialogDescription>
              Descrivi il bando con questi campi: il calcolo del maturato usa
              solo questi, e nessuna regola specifica di un singolo bando vive
              nel codice.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="funding-name">Nome *</Label>
                <Input
                  id="funding-name"
                  value={form.name}
                  onChange={(event) => setField("name", event.target.value)}
                  placeholder="Es. Voucher sport 2025/2026"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="funding-funder">Ente finanziatore *</Label>
                <Input
                  id="funding-funder"
                  value={form.funder_name}
                  onChange={(event) =>
                    setField("funder_name", event.target.value)
                  }
                  placeholder="Es. Regione, Comune, ente sportivo"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="funding-from">Valido dal *</Label>
                <Input
                  id="funding-from"
                  type="date"
                  value={form.valid_from}
                  onChange={(event) =>
                    setField("valid_from", event.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="funding-to">Valido al *</Label>
                <Input
                  id="funding-to"
                  type="date"
                  value={form.valid_to}
                  onChange={(event) => setField("valid_to", event.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="funding-plafond">
                  Massimale del programma per atleta (EUR) *
                </Label>
                <Input
                  id="funding-plafond"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.athlete_plafond}
                  onChange={(event) =>
                    setField("athlete_plafond", event.target.value)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  E il tetto che il bando pone al beneficiario. L&apos;importo
                  che ogni atleta usa <strong>presso questo club</strong> si
                  indica quando lo si iscrive, e puo essere piu basso.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="funding-period-amount">
                  Importo per periodo (EUR) *
                </Label>
                <Input
                  id="funding-period-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.period_amount}
                  onChange={(event) =>
                    setField("period_amount", event.target.value)
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="funding-frequency">Frequenza del periodo *</Label>
                <Select
                  value={form.period_frequency}
                  onValueChange={(value) => setField("period_frequency", value)}
                >
                  <SelectTrigger id="funding-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Mensile</SelectItem>
                    <SelectItem value="days">Ogni N giorni</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.period_frequency === "days" ? (
                <div className="space-y-2">
                  <Label htmlFor="funding-days">Giorni per periodo *</Label>
                  <Input
                    id="funding-days"
                    type="number"
                    min="1"
                    value={form.period_length_days}
                    onChange={(event) =>
                      setField("period_length_days", event.target.value)
                    }
                  />
                </div>
              ) : null}
            </div>

            {/*
              La fonte della maturazione e la domanda che decide se le presenze
              di EasyGame fanno nascere un credito o solo una previsione. Sta
              prima del requisito perche ne cambia il significato (ADR-0054).
            */}
            <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <Label>Fonte della maturazione *</Label>
              <p className="text-xs text-muted-foreground">
                Dove viene registrata la frequenza che fa maturare il
                contributo. Se la fonte ufficiale e una piattaforma dell&apos;ente,
                le presenze EasyGame restano una previsione: il maturato nasce
                solo quando qualcuno lo conferma.
              </p>
              <RadioGroup
                value={form.accrual_source}
                onValueChange={(value) => setField("accrual_source", value)}
                className="gap-2 pt-1"
              >
                {SELECTABLE_FUNDING_ACCRUAL_SOURCES.map((source) => (
                  <div key={source} className="flex items-center gap-2">
                    <RadioGroupItem
                      value={source}
                      id={`funding-source-${source}`}
                    />
                    <Label
                      htmlFor={`funding-source-${source}`}
                      className="font-normal"
                    >
                      {fundingAccrualSourceLabel(source)}
                    </Label>
                  </div>
                ))}
                <div className="flex items-center gap-2 opacity-50">
                  <RadioGroupItem
                    value="external_api"
                    id="funding-source-external_api"
                    disabled
                  />
                  <Label
                    htmlFor="funding-source-external_api"
                    className="font-normal"
                  >
                    API esterna — non ancora disponibile
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="funding-unit">Unita del requisito *</Label>
                <Select
                  value={form.requirement_unit}
                  onValueChange={(value) => setField("requirement_unit", value)}
                >
                  <SelectTrigger id="funding-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hours">Ore di allenamento</SelectItem>
                    <SelectItem value="sessions">Presenze</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="funding-min">Requisito minimo per periodo</Label>
                <Input
                  id="funding-min"
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.requirement_min}
                  onChange={(event) =>
                    setField("requirement_min", event.target.value)
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="funding-unmet">
                  Se il requisito non e raggiunto *
                </Label>
                <Select
                  value={form.unmet_behavior}
                  onValueChange={(value) => setField("unmet_behavior", value)}
                >
                  <SelectTrigger id="funding-unmet">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Il periodo non matura</SelectItem>
                    <SelectItem value="prorata">
                      Matura in proporzione
                    </SelectItem>
                    <SelectItem value="full">
                      Matura comunque per intero
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="funding-max-periods">
                  Numero massimo di periodi
                </Label>
                <Input
                  id="funding-max-periods"
                  type="number"
                  min="1"
                  value={form.max_periods}
                  onChange={(event) =>
                    setField("max_periods", event.target.value)
                  }
                  placeholder="Nessun limite"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="funding-notes">Note</Label>
              <Textarea
                id="funding-notes"
                rows={2}
                value={form.notes}
                onChange={(event) => setField("notes", event.target.value)}
              />
            </div>

            {validationError ? (
              <p className="text-sm font-medium text-amber-600">
                {validationError}
              </p>
            ) : null}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setIsDialogOpen(false)}
              disabled={isSaving}
            >
              Annulla
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => void handleSave()}
              disabled={isSaving || Boolean(validationError)}
            >
              {isSaving ? "Salvataggio..." : "Crea programma"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
