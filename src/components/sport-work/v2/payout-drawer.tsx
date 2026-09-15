"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { CurrencyInput, DateInput, Field, FieldSizeProvider, FormGrid, Select, TextInput, Textarea } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { Checkbox, Skeleton } from "@/components/web/primitives/Controls";
import { DataChip } from "@/components/web/primitives/StatusPill";
import { InsetBlock, Eyebrow, Hairline } from "@/components/web/primitives/Surface";
import { AlertBlock } from "@/components/web/page/Alerts";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { formatMoney, formatPercent, MISSING } from "@/lib/web/format";
import { todayLocalDateOnly } from "@/lib/date-only";

/**
 * Il cassetto che **eroga un compenso** (720: la proposta e il modulo insieme).
 *
 * E la schermata piu importante del modulo, e non perche muove denaro: e
 * l'unico posto in cui un numero calcolato da EasyGame diventa una decisione
 * di una persona. Da qui tre scelte, le stesse della V1:
 *
 * 1. **Prima si propone, poi si registra.** L'apertura chiama `prepare`, che
 *    non scrive niente e restituisce la motivazione riga per riga.
 * 2. **Gli avvisi duri chiedono una spunta.** Autocertificazione mancante o
 *    soglia fiscale superata non bloccano, ma richiedono che qualcuno dichiari
 *    di aver capito; quella spunta finisce nell'audit con il suo nome.
 * 3. **La chiave del gesto nasce all'apertura, non all'invio**: due clic sul
 *    pulsante portano la stessa chiave e il secondo non fa uscire il denaro
 *    una seconda volta.
 */
export type PayoutDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installmentId?: string | null;
  relationshipId?: string | null;
  onDone?: () => void;
};

type Proposal = {
  installmentId: string | null;
  relationshipId: string;
  personName: string;
  installmentLabel: string | null;
  suggestedAmount: number;
  paidAt: string;
  netLabel: string;
  requiresAcknowledgement: boolean;
  acknowledgementReasons: string[];
  computation: {
    grossAmount: number;
    netSocial: number;
    netDefinitive: number | null;
    clubCost: number;
    definitive: boolean;
    fiscalTreatment: string;
    rulesVersion: string;
    explanation: Array<{ key: string; label: string; amount: number | null; kind: "amount" | "rate" | "note"; note?: string; emphasis?: boolean }>;
    warnings: Array<{ code: string; severity: "info" | "warning" | "hard"; message: string; detail?: string }>;
  };
};

const DEFAULT_OPERATION_TYPE = "";

const newIdempotencyKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `payout-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function PayoutDrawer({ open, onOpenChange, installmentId, relationshipId, onDone }: PayoutDrawerProps) {
  const { showToast } = useToast();
  const [amount, setAmount] = React.useState("");
  const [paidAt, setPaidAt] = React.useState(todayLocalDateOnly);
  const [paymentMethod, setPaymentMethod] = React.useState("Bonifico");
  const [reference, setReference] = React.useState("");
  /*
    W4-R7. La voce di rendiconto sotto cui questo compenso si somma. Vuoto
    **non** significa non classificato: il dominio ripiega su
    `compenso_sportivo`. La tendina serve a chi tiene voci distinte.
  */
  const [operationTypeCode, setOperationTypeCode] = React.useState(DEFAULT_OPERATION_TYPE);
  const [causali, setCausali] = React.useState<{ code: string; label: string }[]>([]);
  const [notes, setNotes] = React.useState("");
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [allowOverpayment, setAllowOverpayment] = React.useState(false);
  const [proposal, setProposal] = React.useState<Proposal | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const idempotencyKey = React.useRef<string>("");

  React.useEffect(() => {
    let vivo = true;
    void (async () => {
      /*
        Nessun parametro di filtro: la rotta non lo applica. Le causali in
        entrata si tolgono qui, dove si sa cosa serve a questa schermata.
      */
      const { data } = await apiRequest<any>("/api/v1/fiscal/operation-types");
      if (!vivo) return;
      const elenco = Array.isArray(data?.operationTypes) ? data.operationTypes : Array.isArray(data) ? data : [];
      setCausali(elenco.filter((voce: any) => voce?.directionHint !== "IN" && voce?.isActive !== false).map((voce: any) => ({ code: voce.code, label: voce.label })));
    })();
    return () => {
      vivo = false;
    };
  }, []);

  React.useEffect(() => {
    if (!open) return;
    idempotencyKey.current = newIdempotencyKey();
    setAcknowledged(false);
    setAllowOverpayment(false);
    setAmount("");
    setPaidAt(todayLocalDateOnly());
    setPaymentMethod("Bonifico");
    setReference("");
    setOperationTypeCode(DEFAULT_OPERATION_TYPE);
    setNotes("");
    setProposal(null);
    setError(null);
    setDirty(false);
  }, [open, installmentId, relationshipId]);

  const loadProposal = React.useCallback(async () => {
    if (!open) return;
    if (!installmentId && !relationshipId) return;
    setLoading(true);
    setError(null);
    const { data, error: apiError } = await apiRequest<Proposal>("/api/v1/sport-work/payouts/prepare", {
      method: "POST",
      body: { installmentId: installmentId || undefined, relationshipId: relationshipId || undefined, amount: amount || undefined, paidAt },
    });
    setLoading(false);
    if (apiError || !data) {
      setProposal(null);
      setError(apiError?.message || "Calcolo della proposta non riuscito");
      return;
    }
    setProposal(data);
    if (!amount) setAmount(String(data.suggestedAmount));
  }, [open, installmentId, relationshipId, amount, paidAt]);

  React.useEffect(() => {
    void loadProposal();
    // Ricalcolare a ogni battitura dell'importo renderebbe la schermata
    // inutilizzabile: il ricalcolo scatta quando cambia la data o si apre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, installmentId, relationshipId, paidAt]);

  const hardWarnings = (proposal?.computation.warnings || []).filter((warning) => warning.severity === "hard");
  const softWarnings = (proposal?.computation.warnings || []).filter((warning) => warning.severity !== "hard");
  const blocked = hardWarnings.length > 0 && !acknowledged;

  const touch = () => setDirty(true);

  const handleConfirm = async () => {
    if (!proposal || blocked) return;
    setSaving(true);
    const { data, error: apiError } = await apiRequest<any>("/api/v1/sport-work/payouts", {
      method: "POST",
      body: {
        installmentId: installmentId || undefined,
        relationshipId: relationshipId || undefined,
        amount,
        paidAt,
        paymentMethod,
        reference,
        operationTypeCode: operationTypeCode || undefined,
        notes,
        allowOverpayment,
        acknowledgeWarnings: hardWarnings.length > 0 ? acknowledged : true,
        idempotencyKey: idempotencyKey.current,
      },
    });
    setSaving(false);
    if (apiError) {
      showToast("error", apiError.message || "Erogazione non registrata");
      return;
    }
    showToast("success", data?.duplicate ? "Questa erogazione era già stata registrata: nessun doppio pagamento" : "Erogazione registrata");
    setDirty(false);
    onOpenChange(false);
    onDone?.();
  };

  const explanationValue = (line: Proposal["computation"]["explanation"][number]) =>
    line.kind === "note" ? MISSING : line.kind === "rate" ? formatPercent((line.amount ?? 0) * 100, 2) : formatMoney(line.amount);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      eyebrow="Erogazione"
      title="Eroga compenso"
      description={proposal ? `${proposal.personName}${proposal.installmentLabel ? ` — ${proposal.installmentLabel}` : ""}` : "Calcolo della proposta in corso"}
      dirty={dirty}
      locked={saving}
      data-test="sport-work-payout-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void handleConfirm()} loading={saving} disabled={!proposal || blocked}>
            Registra erogazione
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <div className="flex flex-col gap-6">
          {error ? (
            <AlertBlock severity="danger" title="La proposta non è stata calcolata">
              {error}
            </AlertBlock>
          ) : null}

          <DrawerSection eyebrow="Dati dell'erogazione">
            <FormGrid>
              <Field label="Importo lordo" htmlFor="payout-amount" required width="16ch">
                <CurrencyInput
                  id="payout-amount"
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    touch();
                  }}
                  onBlur={() => void loadProposal()}
                />
              </Field>
              <Field label="Data di pagamento" htmlFor="payout-date" required width="14ch" helper="L'anno di questa data decide le regole applicate, non la stagione.">
                <DateInput
                  id="payout-date"
                  value={paidAt}
                  onChange={(event) => {
                    setPaidAt(event.target.value);
                    touch();
                  }}
                />
              </Field>
              <Field label="Metodo" htmlFor="payout-method">
                <TextInput
                  id="payout-method"
                  value={paymentMethod}
                  onChange={(event) => {
                    setPaymentMethod(event.target.value);
                    touch();
                  }}
                />
              </Field>
              <Field label="Riferimento" htmlFor="payout-reference" optional>
                <TextInput
                  id="payout-reference"
                  value={reference}
                  onChange={(event) => {
                    setReference(event.target.value);
                    touch();
                  }}
                  placeholder="CRO, numero distinta…"
                />
              </Field>
            </FormGrid>
            <Field
              label="Voce di rendiconto"
              htmlFor="payout-causale"
              className="mt-5"
              helper="Sotto quale voce questa uscita compare nel rendiconto. Non è il trattamento fiscale, che resta del professionista."
            >
              <Select
                id="payout-causale"
                value={operationTypeCode || "__default__"}
                onValueChange={(value) => {
                  setOperationTypeCode(value === "__default__" ? DEFAULT_OPERATION_TYPE : value);
                  touch();
                }}
                options={[{ value: "__default__", label: "Compenso sportivo (predefinita)" }, ...causali.map((voce) => ({ value: voce.code, label: voce.label }))]}
              />
            </Field>
          </DrawerSection>

          {loading && !proposal ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : null}

          {proposal ? (
            <>
              <DrawerSection eyebrow="Come nasce questo numero">
                <InsetBlock className="p-0">
                  <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <span className="font-brand text-[12.5px] font-bold text-egw-ink">Calcolo</span>
                    <DataChip size="sm">Regole {proposal.computation.rulesVersion}</DataChip>
                  </div>
                  <Hairline />
                  <dl>
                    {proposal.computation.explanation.map((line) => (
                      <div key={line.key} className={cn("flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2 font-brand", line.emphasis && "bg-white")}>
                        <dt className={cn("min-w-0 text-[12.5px]", line.emphasis ? "font-semibold text-egw-ink" : "text-egw-ink-72")}>
                          {line.label}
                          {line.note ? <span className="mt-0.5 block text-[11px] text-egw-ink-62">{line.note}</span> : null}
                        </dt>
                        <dd className={cn("egw-num shrink-0 text-[12.5px]", line.emphasis ? "font-bold text-egw-ink" : "font-semibold text-egw-ink-72")}>{explanationValue(line)}</dd>
                      </div>
                    ))}
                  </dl>
                </InsetBlock>
                {loading ? <p className="mt-2 font-brand text-[11.5px] text-egw-ink-62">Ricalcolo in corso…</p> : null}
              </DrawerSection>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InsetBlock>
                  <Eyebrow className="mb-2">{proposal.netLabel}</Eyebrow>
                  <p className="egw-num font-brand text-[22px] font-extrabold leading-none text-egw-green">{formatMoney(proposal.computation.netSocial)}</p>
                  {proposal.computation.netDefinitive === null ? (
                    <p className="mt-2 font-brand text-[11.5px] leading-[1.45] text-egw-amber-ink">Trattamento fiscale da verificare: la ritenuta non è compresa in questo importo.</p>
                  ) : null}
                </InsetBlock>
                <InsetBlock>
                  <Eyebrow className="mb-2">Costo per il club</Eyebrow>
                  <p className="egw-num font-brand text-[22px] font-extrabold leading-none text-egw-ink">{formatMoney(proposal.computation.clubCost)}</p>
                  <p className="mt-2 font-brand text-[11.5px] leading-[1.45] text-egw-ink-62">Lordo più la quota contributiva a carico della società.</p>
                </InsetBlock>
              </div>

              {softWarnings.map((warning) => (
                <AlertBlock key={warning.code} severity="info" title={warning.message}>
                  {warning.detail}
                </AlertBlock>
              ))}

              {hardWarnings.length > 0 ? (
                <div className="flex flex-col gap-3 rounded-egw-field border border-egw-tint-amber-bd bg-egw-tint-amber px-4 py-3.5">
                  <Eyebrow tone="amber">Avvisi da confermare</Eyebrow>
                  {hardWarnings.map((warning) => (
                    <div key={warning.code} className="font-brand">
                      <p className="text-[13px] font-semibold text-egw-ink">{warning.message}</p>
                      {warning.detail ? <p className="mt-0.5 text-[12px] text-egw-ink-72">{warning.detail}</p> : null}
                    </div>
                  ))}
                  <label className="flex cursor-pointer items-start gap-2.5 font-brand text-[12.5px] text-egw-ink">
                    <Checkbox
                      checked={acknowledged}
                      onChange={(event) => {
                        setAcknowledged(event.target.checked);
                        touch();
                      }}
                      className="mt-0.5"
                    />
                    <span>Ho letto gli avvisi e procedo comunque. Questa scelta viene registrata con il mio nome e la data.</span>
                  </label>
                </div>
              ) : null}

              <label className="flex cursor-pointer items-start gap-2.5 font-brand text-[12.5px] text-egw-ink-72">
                <Checkbox
                  checked={allowOverpayment}
                  onChange={(event) => {
                    setAllowOverpayment(event.target.checked);
                    touch();
                  }}
                  className="mt-0.5"
                />
                <span>Consenti di erogare più del residuo della scadenza.</span>
              </label>

              <Field label="Note" htmlFor="payout-notes" optional>
                <Textarea
                  id="payout-notes"
                  rows={2}
                  value={notes}
                  onChange={(event) => {
                    setNotes(event.target.value);
                    touch();
                  }}
                />
              </Field>
            </>
          ) : null}
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}
