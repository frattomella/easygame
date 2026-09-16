"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import {
  normalizeCoverageAllocations,
  remainingCoverageCapacity,
  remainingEnrollmentCapacity,
  sumLiveCoverageForEnrollment,
  validateCoverageAllocation,
} from "@/lib/payments/coverage-ledger";

/**
 * **Coprire una rata con un voucher, e stornare la copertura** (N7 / ADR-0158).
 *
 * La finestra dice tre cose che devono restare separate a schermo, perche sono
 * separate nel dominio:
 *
 * * quanto la rata **vale** — il debito, che non cambia mai;
 * * quanto un ente **si e impegnato** a portarne — la copertura, che e una
 *   promessa e non denaro;
 * * quanto resta **alla famiglia**.
 *
 * L'avviso in fondo non e decorativo: e la frase che impedisce di leggere la
 * copertura come un incasso, ed e la ragione per cui ADR-0037 aveva rifiutato
 * la compensazione automatica.
 *
 * La validazione e la **stessa funzione** che usa il server
 * (`validateCoverageAllocation`): due idee di «quanto ci sta» divergono al
 * primo caso limite, e chi le scopre e la segreteria davanti a un errore che
 * non si aspettava.
 */

const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value) || 0);

export function CoverageDialog({
  open,
  onOpenChange,
  installment,
  allocations,
  fundingOverviews,
  isSaving,
  onAllocate,
  onReverse,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installment: { installmentId: string; label: string; dueAmount: number } | null;
  /** Tutte le coperture dell'atleta, non solo quelle di questa rata. */
  allocations: any[];
  /** Le adesioni ai bandi, con i cinque importi. */
  fundingOverviews: any[];
  isSaving: boolean;
  onAllocate: (input: {
    paymentId: string;
    enrollmentId: string;
    amount: number;
    idempotencyKey: string;
  }) => Promise<boolean>;
  onReverse: (allocationId: string, reason?: string) => Promise<boolean>;
}) {
  const [enrollmentId, setEnrollmentId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  /** La chiave del tentativo in corso: sopravvive a un errore, non a un successo. */
  const chiaveTentativo = React.useRef<string | null>(null);

  const paymentId = installment?.installmentId || "";

  const suQuestaRata = React.useMemo(
    () =>
      allocations.filter(
        (riga: any) => String(riga?.payment_id || riga?.paymentId) === paymentId,
      ),
    [allocations, paymentId],
  );

  const vive = React.useMemo(
    () =>
      normalizeCoverageAllocations(suQuestaRata).filter(
        (riga) => !riga.reversedAt && !riga.reversesAllocationId,
      ),
    [suQuestaRata],
  );

  /* Solo le adesioni attive: non si promette copertura su un voucher revocato. */
  const adesioni = React.useMemo(
    () =>
      fundingOverviews.filter(
        (overview: any) => String(overview?.enrollment?.status) === "active",
      ),
    [fundingOverviews],
  );

  React.useEffect(() => {
    if (!open) return;
    setEnrollmentId(adesioni[0]?.enrollment?.id || "");
    setAmount("");
    chiaveTentativo.current = null;
  }, [open, adesioni]);

  const adesioneScelta = adesioni.find(
    (overview: any) => String(overview?.enrollment?.id) === enrollmentId,
  );

  const capienzaRata = remainingCoverageCapacity(
    installment?.dueAmount ?? 0,
    suQuestaRata,
  );

  const capienzaVoucher = adesioneScelta
    ? remainingEnrollmentCapacity(
        adesioneScelta.enrollment.assigned_amount,
        allocations,
        enrollmentId,
      )
    : 0;

  const errore =
    amount.trim() && adesioneScelta
      ? validateCoverageAllocation({
          amount: Number(amount.replace(",", ".")),
          dueAmount: installment?.dueAmount ?? 0,
          existingOnInstallment: suQuestaRata,
          assignedAmount: adesioneScelta.enrollment.assigned_amount,
          existingOnEnrollment: allocations,
          enrollmentId,
        })
      : null;

  const puoSalvare =
    Boolean(paymentId && enrollmentId && amount.trim()) && !errore && !isSaving;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Copertura da voucher</DialogTitle>
          <DialogDescription>
            {installment
              ? `${installment.label} · ${formatCurrency(installment.dueAmount)}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {vive.length > 0 ? (
            <div className="space-y-2">
              <Label>Coperture attive</Label>
              {vive.map((riga) => {
                const overview = fundingOverviews.find(
                  (voce: any) => String(voce?.enrollment?.id) === riga.enrollmentId,
                );
                return (
                  <div
                    key={riga.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-egw-control border border-egw-hairline p-2 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {overview?.program?.name || "Programma"}
                      </p>
                      <p className="text-xs text-egw-ink-62">
                        {formatCurrency(riga.amount)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isSaving}
                      onClick={() =>
                        void onReverse(
                          riga.id,
                          "Copertura revocata dalla segreteria",
                        )
                      }
                    >
                      Storna
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : null}

          {adesioni.length === 0 ? (
            <p className="rounded-egw-control border border-egw-tint-amber-bd bg-egw-tint-amber p-3 text-xs text-egw-amber-ink">
              Questo atleta non ha adesioni attive a nessun programma di
              contributo. Iscrivilo prima a un bando attivo.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="coverage-enrollment">Programma</Label>
                <select
                  id="coverage-enrollment"
                  value={enrollmentId}
                  onChange={(event) => setEnrollmentId(event.target.value)}
                  className="h-10 w-full rounded-egw-control border border-input bg-background px-3 text-sm"
                >
                  {adesioni.map((overview: any) => (
                    <option
                      key={overview.enrollment.id}
                      value={overview.enrollment.id}
                    >
                      {overview.program?.name || "Programma"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="coverage-amount">Importo coperto</Label>
                <Input
                  id="coverage-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0,00"
                />
                <div className="flex flex-wrap gap-2 text-xs text-egw-ink-62">
                  <Badge variant="outline">
                    Sulla rata restano {formatCurrency(capienzaRata)}
                  </Badge>
                  <Badge variant="outline">
                    Del voucher restano {formatCurrency(capienzaVoucher)}
                  </Badge>
                  {adesioneScelta ? (
                    <Badge variant="outline">
                      Gia impegnati{" "}
                      {formatCurrency(
                        sumLiveCoverageForEnrollment(
                          normalizeCoverageAllocations(allocations),
                          enrollmentId,
                        ),
                      )}
                    </Badge>
                  ) : null}
                </div>
                {errore ? (
                  <p className="text-xs text-egw-red">{errore}</p>
                ) : null}
              </div>
            </>
          )}

          <p className="rounded-egw-control border border-egw-hairline bg-egw-page-100 p-3 text-xs text-egw-ink-72">
            Una copertura <strong>non e un incasso</strong>: dice quanto il club
            si aspetta dall&apos;ente, e riduce solo la quota a carico della
            famiglia. In cassa entra quando l&apos;ente versa.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Chiudi
          </Button>
          <Button
            disabled={!puoSalvare}
            onClick={async () => {
              /*
                **Una chiave per gesto** (revisione ostile, H4).

                La chiave la generava il chiamante da rata, adesione e importo:
                allocare 50 e poi altri 50 sulla stessa rata dava due volte la
                stessa chiave, e il secondo invio tornava indietro come
                duplicato — con l'avviso di successo e la copertura ferma a 50.

                La chiave nasce ora quando si preme, e vive finche quel
                tentativo non riesce: un rinvio dopo un errore di rete resta
                idempotente, due gesti distinti restano due promesse. Il doppio
                clic lo ferma il pulsante disabilitato.
              */
              if (!chiaveTentativo.current) {
                chiaveTentativo.current =
                  typeof crypto !== "undefined" && crypto.randomUUID
                    ? crypto.randomUUID()
                    : `coverage-${Date.now()}-${Math.random().toString(36).slice(2)}`;
              }

              const ok = await onAllocate({
                paymentId,
                enrollmentId,
                amount: Number(amount.replace(",", ".")),
                idempotencyKey: chiaveTentativo.current,
              });

              if (ok) {
                chiaveTentativo.current = null;
                setAmount("");
              }
            }}
          >
            {isSaving ? "Salvataggio..." : "Registra copertura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
