"use client";

import React from "react";
import { Loader2, Search, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { sortPeopleByLastName } from "@/lib/athlete-name-utils";

/**
 * L'iscrizione a un programma di contributo, **da entrambe le direzioni**.
 *
 * **Perche un componente solo e non due.** Il flusso «programma → iscrivo
 * atleti» e il flusso «atleta → lo iscrivo a un programma» sono la stessa
 * operazione guardata da due parti: stesso servizio, stesse regole, stessi
 * campi individuali. Due componenti avrebbero voluto dire due elenchi di campi
 * da tenere allineati, e sarebbero divergenti al primo bando che chiede
 * qualcosa in piu — che e il modo in cui una funzione smette di essere una
 * funzione sola.
 *
 * **Cosa cambia fra i due modi, e cosa no.** Cambia **cosa si sceglie**: nel
 * primo un elenco di atleti a selezione multipla, nel secondo un programma da
 * una tendina. Non cambia niente altro: plafond individuale e codice voucher
 * si compilano allo stesso modo, e la chiamata e la stessa.
 *
 * **Cosa questo modulo non fa, e non deve fare.** Non permette di scrivere un
 * importo maturato. Il maturato si ricava dalle presenze secondo le regole del
 * programma ([ADR-0037](../../../docs/knowledge-base/18-decision-log.md)):
 * qui si assegna un **tetto**, che e un'altra cosa, e confonderli
 * significherebbe riconoscere contributi che nessuno ha frequentato.
 */

export type EnrollableAthlete = {
  id: string;
  firstName: string;
  lastName: string;
};

type PerAthlete = { assignedAmount: string; voucherCode: string };

export type EnrollAthletesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chiamato dopo un'iscrizione riuscita, per ricaricare cio che sta sotto. */
  onEnrolled?: () => void;
} & (
  | {
      mode: "program";
      programId: string;
      programName: string;
      /** Il plafond predefinito del programma: si propone, e si puo cambiare. */
      defaultAmount: number;
      athletes: EnrollableAthlete[];
    }
  | {
      mode: "athlete";
      athleteId: string;
      athleteName: string;
      /** I programmi a cui questo atleta **non** e ancora iscritto. */
      programs: Array<Record<string, any>>;
    }
);

const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

export function EnrollAthletesDialog(props: EnrollAthletesDialogProps) {
  const { open, onOpenChange, onEnrolled } = props;
  const { showToast } = useToast();

  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [perAthlete, setPerAthlete] = React.useState<Record<string, PerAthlete>>(
    {},
  );
  const [programId, setProgramId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [voucherCode, setVoucherCode] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  /* Riaprire la finestra non deve ereditare la selezione di quella prima. */
  React.useEffect(() => {
    if (open) return;
    setQuery("");
    setSelected([]);
    setPerAthlete({});
    setProgramId("");
    setAmount("");
    setVoucherCode("");
  }, [open]);

  const visibleAthletes = React.useMemo(() => {
    if (props.mode !== "program") return [];
    const needle = query.trim().toLowerCase();

    const filtered = needle
      ? props.athletes.filter((athlete) =>
          `${athlete.lastName} ${athlete.firstName}`
            .toLowerCase()
            .includes(needle),
        )
      : props.athletes;

    /* Cognome poi nome, come ogni altro elenco di persone in EasyGame. */
    return sortPeopleByLastName(
      filtered.map((athlete) => ({
        ...athlete,
        first_name: athlete.firstName,
        last_name: athlete.lastName,
      })),
    ) as Array<EnrollableAthlete & Record<string, any>>;
  }, [props, query]);

  if (!open) return null;

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );

  const patchAthlete = (id: string, updates: Partial<PerAthlete>) =>
    setPerAthlete((current) => ({
      ...current,
      [id]: {
        ...{ assignedAmount: "", voucherCode: "" },
        ...(current[id] || {}),
        ...updates,
      },
    }));

  const submit = async () => {
    setSaving(true);

    const body: Record<string, any> =
      props.mode === "program"
        ? {
            program_id: props.programId,
            athlete_ids: selected,
            per_athlete: Object.fromEntries(
              selected.map((id) => [
                id,
                {
                  assignedAmount: perAthlete[id]?.assignedAmount
                    ? Number(perAthlete[id].assignedAmount.replace(",", "."))
                    : undefined,
                  voucherCode: perAthlete[id]?.voucherCode || undefined,
                },
              ]),
            ),
          }
        : {
            program_id: programId,
            athlete_ids: [props.athleteId],
            per_athlete: {
              [props.athleteId]: {
                assignedAmount: amount
                  ? Number(amount.replace(",", "."))
                  : undefined,
                voucherCode: voucherCode || undefined,
              },
            },
          };

    const { data, error } = await apiRequest<{
      created: any[];
      skipped: Array<{ athleteId: string; reason: string }>;
    }>("/api/v1/funding/enrollments", {
      method: "POST",
      body: body,
    });

    setSaving(false);

    if (error) {
      showToast("error", error.message || "Iscrizione non riuscita");
      return;
    }

    const created = data?.created?.length || 0;
    const skipped = data?.skipped || [];

    if (created) {
      showToast(
        "success",
        created === 1
          ? "Atleta iscritto al programma"
          : `${created} atleti iscritti al programma`,
      );
    }

    /*
      Chi e stato saltato si dice, con il motivo. Un lotto in cui tre atleti
      erano gia iscritti e passato a meta, e nasconderlo lascerebbe credere che
      siano dentro tutti.
    */
    if (skipped.length) {
      showToast(
        created ? "info" : "error",
        `${skipped.length} non iscritti: ${skipped[0].reason}`,
      );
    }

    if (created) {
      onEnrolled?.();
      onOpenChange(false);
    }
  };

  const canSubmit =
    props.mode === "program" ? selected.length > 0 : Boolean(programId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={
        props.mode === "program"
          ? `Iscrivi atleti a ${props.programName}`
          : `Iscrivi ${props.athleteName} a un programma`
      }
    >
      {/*
        A telefono la finestra sale dal basso e occupa l'altezza che serve; da
        tablet in su e una scheda centrata. Sotto i 375 px l'elenco degli
        atleti scorre da solo invece di spingere i pulsanti fuori dallo schermo.
      */}
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl bg-white shadow-xl sm:rounded-xl dark:bg-slate-950">
        <div className="border-b p-4">
          <h3 className="text-base font-semibold">
            {props.mode === "program"
              ? `Iscrivi atleti — ${props.programName}`
              : `Iscrivi ${props.athleteName} a un programma`}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Si assegna un <strong>tetto</strong>, non un importo maturato: il
            maturato si ricava dalle presenze secondo le regole del programma.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {props.mode === "program" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="enroll-search">Cerca un atleta</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="enroll-search"
                    className="pl-8"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Cognome o nome"
                  />
                </div>
              </div>

              {visibleAthletes.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  {props.athletes.length === 0
                    ? "Tutti gli atleti del club sono gia iscritti a questo programma."
                    : "Nessun atleta corrisponde alla ricerca."}
                </p>
              ) : (
                <div className="space-y-2">
                  {visibleAthletes.map((athlete) => {
                    const isSelected = selected.includes(athlete.id);

                    return (
                      <div
                        key={athlete.id}
                        className="rounded-md border p-3"
                      >
                        <label className="flex cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0"
                            checked={isSelected}
                            onChange={() => toggle(athlete.id)}
                            aria-label={`Seleziona ${athlete.lastName} ${athlete.firstName}`}
                          />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {athlete.lastName} {athlete.firstName}
                          </span>
                        </label>

                        {/*
                          I campi individuali compaiono solo sull'atleta
                          selezionato: mostrarli su tutti trasformerebbe un
                          elenco di duecento persone in un modulo di
                          quattrocento campi.
                        */}
                        {isSelected ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label
                                htmlFor={`amount-${athlete.id}`}
                                className="text-xs"
                              >
                                Assegnato al club
                              </Label>
                              <Input
                                id={`amount-${athlete.id}`}
                                inputMode="decimal"
                                value={perAthlete[athlete.id]?.assignedAmount || ""}
                                onChange={(event) =>
                                  patchAthlete(athlete.id, {
                                    assignedAmount: event.target.value,
                                  })
                                }
                                placeholder={formatCurrency(props.defaultAmount)}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label
                                htmlFor={`voucher-${athlete.id}`}
                                className="text-xs"
                              >
                                Codice voucher
                              </Label>
                              <Input
                                id={`voucher-${athlete.id}`}
                                value={perAthlete[athlete.id]?.voucherCode || ""}
                                onChange={(event) =>
                                  patchAthlete(athlete.id, {
                                    voucherCode: event.target.value,
                                  })
                                }
                                placeholder="Se l'ente ne assegna uno"
                              />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="enroll-program">Programma</Label>
                <Select value={programId} onValueChange={setProgramId}>
                  <SelectTrigger id="enroll-program">
                    <SelectValue placeholder="Scegli un programma" />
                  </SelectTrigger>
                  <SelectContent>
                    {props.programs.map((program) => (
                      <SelectItem key={program.id} value={String(program.id)}>
                        {program.name} — {program.funder_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {props.programs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Non ci sono programmi attivi a cui questo atleta non sia gia
                    iscritto.
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="enroll-amount">Importo assegnato al club</Label>
                  <Input
                    id="enroll-amount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="Massimale del programma"
                  />
                  {/*
                    Non e il massimale del bando: e quanto il beneficiario
                    decide di usare qui. Il massimale lo limita, non lo
                    sostituisce (ADR-0054).
                  */}
                  <p className="text-xs text-muted-foreground">
                    Quanto l&apos;atleta usa presso questa societa. Vuoto = tutto
                    il massimale del programma.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="enroll-voucher">Codice voucher</Label>
                  <Input
                    id="enroll-voucher"
                    value={voucherCode}
                    onChange={(event) => setVoucherCode(event.target.value)}
                    placeholder="Se l'ente ne assegna uno"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t p-4">
          {props.mode === "program" ? (
            <Badge variant={selected.length ? "default" : "secondary"}>
              {selected.length} selezionati
            </Badge>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button
              onClick={() => void submit()}
              disabled={!canSubmit || saving}
              className="gap-2"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              Iscrivi
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
