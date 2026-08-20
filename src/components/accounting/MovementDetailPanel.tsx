"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { NormalizedClubMovement } from "@/lib/club-financial-summary";
import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  FileText,
  Mail,
  Printer,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";

type MovementDetailPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movement: NormalizedClubMovement | null;
  sourceLabel: string;
  statusLabel: string;
  subjectEmail?: string;
  subjectPhone?: string;
  invoice?: any | null;
  receipt?: any | null;
  canCreateInvoice: boolean;
  canCreateReceipt: boolean;
  createInvoiceReason: string;
  createReceiptReason: string;
  emailReason: string;
  formatCurrency: (value: number) => string;
  formatDate: (value?: string | null) => string;
  onCreateInvoice: () => void;
  onCreateReceipt: () => void;
  onPrintReceipt: () => void;
};

const DetailRow = ({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) => (
  <div className="grid grid-cols-[140px_1fr] gap-3 text-sm">
    <span className="text-muted-foreground">{label}</span>
    <span className="min-w-0 break-words font-medium">{value || "-"}</span>
  </div>
);

const ActionButton = ({
  disabled,
  reason,
  children,
  onClick,
}: {
  disabled: boolean;
  reason: string;
  children: ReactNode;
  onClick: () => void;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span className="inline-flex w-full sm:w-auto">
        <Button
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </span>
    </TooltipTrigger>
    {disabled && (
      <TooltipContent>
        <p>{reason}</p>
      </TooltipContent>
    )}
  </Tooltip>
);

export function MovementDetailPanel({
  open,
  onOpenChange,
  movement,
  sourceLabel,
  statusLabel,
  subjectEmail,
  subjectPhone,
  invoice,
  receipt,
  canCreateInvoice,
  canCreateReceipt,
  createInvoiceReason,
  createReceiptReason,
  emailReason,
  formatCurrency,
  formatDate,
  onCreateInvoice,
  onCreateReceipt,
  onPrintReceipt,
}: MovementDetailPanelProps) {
  if (!movement) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-xl" />
      </Sheet>
    );
  }

  const date = movement.paidAt || movement.date || movement.dueDate;
  const directionLabel =
    movement.direction === "income"
      ? "Entrata"
      : movement.direction === "expense"
        ? "Uscita"
        : "Giroconto";
  const DirectionIcon =
    movement.direction === "income"
      ? ArrowUp
      : movement.direction === "expense"
        ? ArrowDown
        : ArrowDownUp;
  const linkedEntity = movement.linkedEntity || {};
  const isAthlete = movement.originEntityType === "athlete" || movement.source === "athlete";
  const linkedName =
    movement.originEntityName ||
    movement.subjectName ||
    linkedEntity.name ||
    (isAthlete ? "Atleta non trovato" : "-");
  const linkedEmail =
    subjectEmail || movement.subjectEmail || linkedEntity.email || "";
  const linkedPhone =
    subjectPhone || movement.subjectPhone || linkedEntity.phone || "";
  const linkedCategory =
    movement.subjectCategory || linkedEntity.category || "";
  const linkedReference =
    linkedEntity.reference || movement.reference || movement.originEntityId || "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Dettaglio movimento</SheetTitle>
          <SheetDescription>
            Ricevuta, fattura e dati collegati del movimento selezionato.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6">
          <div className="rounded-md border p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Importo</p>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-2xl font-semibold">
                    {formatCurrency(movement.amount)}
                  </p>
                  <Badge
                    variant="outline"
                    className={cn(
                      "gap-1",
                      movement.direction === "income" &&
                        "border-green-200 bg-green-50 text-green-700",
                      movement.direction === "expense" &&
                        "border-red-200 bg-red-50 text-red-700",
                      movement.direction === "transfer" &&
                        "border-slate-200 bg-slate-50 text-slate-700",
                    )}
                  >
                    <DirectionIcon className="h-3.5 w-3.5" />
                    {directionLabel}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <DetailRow label="Data" value={formatDate(date)} />
              <DetailRow label="Stato" value={statusLabel} />
              <DetailRow label="Descrizione" value={movement.description} />
              <DetailRow label="Categoria" value={movement.category} />
              <DetailRow label="Origine" value={sourceLabel} />
              <DetailRow label="Metodo" value={movement.method} />
              <DetailRow label="Conto" value={movement.bankAccountName} />
            </div>
          </div>

          <div className="rounded-md border p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-semibold">Soggetto collegato</h3>
              <Badge variant="outline">{sourceLabel}</Badge>
            </div>
            <div className="space-y-3">
              <DetailRow
                label={isAthlete ? "Nome atleta" : "Nome"}
                value={linkedName}
              />
              <DetailRow label="Categoria" value={linkedCategory} />
              <DetailRow label="Email" value={linkedEmail} />
              <DetailRow label="Telefono" value={linkedPhone} />
              <DetailRow label="Riferimento" value={linkedReference} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Documenti</h3>
              <Badge variant="outline">
                {invoice || receipt ? "Documenti collegati" : "Nessun documento"}
              </Badge>
            </div>

            {invoice ? (
              <div className="rounded-md border p-3 text-sm">
                <div className="flex items-center gap-2 font-medium text-blue-700">
                  <FileText className="h-4 w-4" />
                  Fattura emessa
                </div>
                <p className="mt-1">
                  {movement.invoiceNumber || invoice.invoice_number || "-"}
                </p>
                <p className="text-muted-foreground">
                  {formatDate(movement.invoiceDate || invoice.issue_date)}
                </p>
              </div>
            ) : null}

            {receipt ? (
              <div className="rounded-md border p-3 text-sm">
                <div className="flex items-center gap-2 font-medium text-green-700">
                  <Receipt className="h-4 w-4" />
                  Ricevuta emessa
                </div>
                <p className="mt-1">
                  {movement.receiptNumber || receipt.receipt_number || "-"}
                </p>
                <p className="text-muted-foreground">
                  {formatDate(movement.receiptDate || receipt.issue_date)}
                </p>
              </div>
            ) : null}

            {!invoice && !receipt ? (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                Nessun documento emesso.
              </p>
            ) : null}
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold">Storico emissioni</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              {invoice ? (
                <p>
                  Fattura {movement.invoiceNumber || invoice.invoice_number} -
                  {" "}
                  {formatDate(movement.invoiceDate || invoice.issue_date)}
                </p>
              ) : null}
              {receipt ? (
                <p>
                  Ricevuta {movement.receiptNumber || receipt.receipt_number} -
                  {" "}
                  {formatDate(movement.receiptDate || receipt.issue_date)}
                </p>
              ) : null}
              {!invoice && !receipt ? <p>Nessuna emissione registrata.</p> : null}
            </div>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Integrazione fatturazione elettronica non configurata. Puoi creare
            una fattura interna collegata al pagamento, senza invio SDI.
          </div>

          <div className="flex flex-wrap gap-2">
            <ActionButton
              disabled={!canCreateInvoice || Boolean(invoice)}
              reason={invoice ? "Fattura gia emessa" : createInvoiceReason}
              onClick={onCreateInvoice}
            >
              <FileText className="mr-2 h-4 w-4" />
              Emetti fattura elettronica
            </ActionButton>

            <ActionButton
              disabled={!canCreateReceipt || Boolean(receipt)}
              reason={receipt ? "Ricevuta gia emessa" : createReceiptReason}
              onClick={onCreateReceipt}
            >
              <Receipt className="mr-2 h-4 w-4" />
              Crea ricevuta
            </ActionButton>

            <ActionButton
              disabled={!receipt}
              reason="Stampa disponibile solo con ricevuta emessa"
              onClick={onPrintReceipt}
            >
              <Printer className="mr-2 h-4 w-4" />
              Stampa ricevuta
            </ActionButton>

            <ActionButton disabled reason={emailReason} onClick={() => {}}>
              <Mail className="mr-2 h-4 w-4" />
              Invia via email
            </ActionButton>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
