"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { CurrencyInput, DateInput, Field, FieldSizeProvider, FormGrid, Select, Textarea } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { Checkbox } from "@/components/web/primitives/Controls";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { InfoCard } from "@/components/web/page/Cards";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { formatDateShort, formatMoney } from "@/lib/web/format";
import { todayLocalDateOnly } from "@/lib/date-only";
import { CONFIGURED_RULE_YEARS } from "@/lib/sport-work/rules";
import { DECLARATION_STATUS_SPEC, specOf } from "@/components/sport-work/v2/sport-work-status";

/**
 * L'**autocertificazione dei compensi esterni**, in un cassetto da 480.
 *
 * Non e il caricamento di un allegato: e la registrazione di un dato che
 * entra nel calcolo. Il valore principale non e la precisione del netto: e
 * provare cosa il club sapeva e quando. Registrarne una nuova **sostituisce**
 * quella dell'anno, che resta marcata: per questo lo storico e qui sotto.
 *
 * Stessa scrittura della V1: `POST /api/v1/sport-work/declarations`.
 */
export function DeclarationDrawer({
  open,
  onOpenChange,
  personId,
  defaultYear,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId: string;
  defaultYear?: number;
  onDone?: () => void;
}) {
  const { showToast } = useToast();
  const [year, setYear] = React.useState(defaultYear || CONFIGURED_RULE_YEARS[0]);
  const [amount, setAmount] = React.useState("");
  const [declarationDate, setDeclarationDate] = React.useState(todayLocalDateOnly);
  const [hasOtherCoverage, setHasOtherCoverage] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [history, setHistory] = React.useState<any[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setYear(defaultYear || CONFIGURED_RULE_YEARS[0]);
    setAmount("");
    setDeclarationDate(todayLocalDateOnly());
    setHasOtherCoverage(false);
    setNotes("");
    setDirty(false);
    setError(null);
  }, [open, defaultYear]);

  React.useEffect(() => {
    if (!open) return;
    void (async () => {
      const { data } = await apiRequest<any[]>(`/api/v1/sport-work/declarations?person_id=${encodeURIComponent(personId)}`);
      setHistory(Array.isArray(data) ? data : []);
    })();
  }, [open, personId]);

  const handleSave = async () => {
    if (amount.trim() === "") {
      setError("Indica l'importo dichiarato: zero è una dichiarazione, il campo vuoto no");
      return;
    }
    setSaving(true);
    const { error: apiError } = await apiRequest("/api/v1/sport-work/declarations", {
      method: "POST",
      body: { personId, fiscalYear: year, externalAmount: amount, declarationDate, hasOtherCoverage, notes },
    });
    setSaving(false);
    if (apiError) {
      showToast("error", apiError.message || "Registrazione non riuscita");
      return;
    }
    showToast("success", "Autocertificazione registrata");
    setDirty(false);
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="Posizione"
      title="Autocertificazione compensi esterni"
      description="Quanto il lavoratore dichiara di aver percepito da altri committenti nell'anno. Entra nel calcolo dei contributi."
      dirty={dirty}
      locked={saving}
      data-test="sport-work-declaration-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void handleSave()} loading={saving}>
            Registra
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <div className="flex flex-col gap-6">
          <DrawerSection eyebrow="Dichiarazione">
            <div className="flex flex-col gap-5">
              <FormGrid>
                <Field label="Anno" htmlFor="decl-year" width="10ch">
                  <Select
                    id="decl-year"
                    value={String(year)}
                    onValueChange={(value) => {
                      setYear(Number(value));
                      setDirty(true);
                    }}
                    options={CONFIGURED_RULE_YEARS.map((configured) => ({ value: String(configured), label: String(configured) }))}
                  />
                </Field>
                <Field label="Data della dichiarazione" htmlFor="decl-date" width="14ch">
                  <DateInput
                    id="decl-date"
                    value={declarationDate}
                    onChange={(event) => {
                      setDeclarationDate(event.target.value);
                      setDirty(true);
                    }}
                  />
                </Field>
              </FormGrid>
              <Field label="Compensi percepiti altrove" htmlFor="decl-amount" required width="18ch" error={error} helper="Zero è una dichiarazione: il campo vuoto no.">
                <CurrencyInput
                  id="decl-amount"
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    setDirty(true);
                    if (error) setError(null);
                  }}
                />
              </Field>
              <label className="flex cursor-pointer items-start gap-2.5 font-brand text-[12.5px] text-egw-ink">
                <Checkbox
                  checked={hasOtherCoverage}
                  onChange={(event) => {
                    setHasOtherCoverage(event.target.checked);
                    setDirty(true);
                  }}
                  className="mt-0.5"
                />
                <span>Il lavoratore dichiara di avere altra copertura previdenziale.</span>
              </label>
              <Field label="Note" htmlFor="decl-notes" optional>
                <Textarea
                  id="decl-notes"
                  rows={2}
                  value={notes}
                  onChange={(event) => {
                    setNotes(event.target.value);
                    setDirty(true);
                  }}
                />
              </Field>
            </div>
          </DrawerSection>

          <InfoCard eyebrow="A cosa serve">
            Questa dichiarazione non serve solo a calcolare meglio: serve a provare cosa la società sapeva e quando. Se la dichiarazione è falsa o tardiva la responsabilità è del lavoratore, ma il danno operativo — contributi non versati, sanzioni — è del club.
          </InfoCard>

          {history.length > 0 ? (
            <DrawerSection eyebrow="Dichiarazioni già acquisite">
              <InsetBlock className="p-0">
                <ul>
                  {history.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-egw-hairline px-4 py-2.5 font-brand text-[12.5px] last:border-0">
                      <span className="flex min-w-0 items-center gap-2 text-egw-ink-72">
                        <span className="egw-num">{row.fiscal_year}</span>
                        <span className="egw-num">{formatDateShort(row.declaration_date)}</span>
                        <StatusPill status={specOf(DECLARATION_STATUS_SPEC, row.status)} size="sm" />
                      </span>
                      <span className="egw-num font-bold text-egw-ink">{formatMoney(row.external_amount)}</span>
                    </li>
                  ))}
                </ul>
              </InsetBlock>
            </DrawerSection>
          ) : null}
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}
