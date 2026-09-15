"use client";

import * as React from "react";
import { FileText, Plus, Receipt, RefreshCw, Trash2, Wallet } from "lucide-react";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, RowActionDef } from "@/components/web/datagrid/types";
import { Button } from "@/components/web/primitives/Button";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { Drawer } from "@/components/web/overlays/Drawer";
import { ConfirmDialog, DangerConfirmDialog } from "@/components/web/overlays/Modal";
import { DateInput, Field, FieldSizeProvider, Select, TextInput, ValidationSummary } from "@/components/web/forms/Field";
import { useToast } from "@/components/ui/toast-notification";
import { formatDateShort, formatMoney } from "@/lib/web/format";
import { MONEY_STATUS, type StatusSpec } from "@/lib/web/status";
import { buildAttachmentFileName } from "@/lib/attachment-names";
import { todayLocalDateOnly } from "@/lib/date-only";

/**
 * Il registro pagamenti legacy dell'allenatore (`payments[]` dentro il
 * record): un promemoria, non una contabilita. Sostituisce la tabella e il
 * dialogo `AddTrainerPaymentForm` della V1 con la griglia e il cassetto del
 * sistema. Le scritture restano quelle di `simplified-db`
 * (`addTrainerPayment`, `updateTrainerPayment`, `deleteTrainerPayment`),
 * chiamate dalla scheda.
 */
export type TrainerPayment = {
  id: string;
  month: string;
  amount: string | number;
  date?: string;
  status: "paid" | "pending" | string;
};

/**
 * Un compenso pagato e denaro **uscito**: `MONEY_STATUS.paid` dice
 * «INCASSATO» e mentirebbe sul verso. Il sistema non ha ancora la parola per
 * il denaro in uscita; e un candidato alle fondamenta (vedi rapporto).
 */
const PAYOUT_PAID: StatusSpec = Object.freeze({ label: "PAGATO", weight: "solid", hue: "green" });

const paymentStatus = (status: string): StatusSpec => (status === "paid" ? PAYOUT_PAID : MONEY_STATUS.pending);

type Draft = { month: string; amount: string; date: string; status: "paid" | "pending" };

const emptyDraft = (): Draft => ({ month: "", amount: "", date: todayLocalDateOnly(), status: "paid" });

const downloadText = (content: string, fileName: string) => {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export function TrainerPaymentsPanel({
  payments,
  trainer,
  onAdd,
  onPay,
  onToggleStatus,
  onDelete,
}: {
  payments: TrainerPayment[];
  trainer: any;
  onAdd: (payment: TrainerPayment) => Promise<void>;
  onPay: (paymentId: string) => Promise<void>;
  onToggleStatus: (paymentId: string) => Promise<void>;
  onDelete: (paymentId: string) => Promise<void>;
}) {
  const { showToast } = useToast();
  const [addOpen, setAddOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(emptyDraft);
  const [dirty, setDirty] = React.useState(false);
  const [errors, setErrors] = React.useState<Array<{ id: string; label: string }>>([]);
  const [saving, setSaving] = React.useState(false);
  const [statusTarget, setStatusTarget] = React.useState<TrainerPayment | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<TrainerPayment | null>(null);
  const [busy, setBusy] = React.useState(false);

  const patch = (next: Partial<Draft>) => {
    setDirty(true);
    setDraft((current) => ({ ...current, ...next }));
  };

  const openAdd = () => {
    setDraft(emptyDraft());
    setErrors([]);
    setDirty(false);
    setAddOpen(true);
  };

  const handleAdd = async () => {
    const nextErrors: Array<{ id: string; label: string }> = [];
    if (!draft.month.trim()) nextErrors.push({ id: "trainer-payment-month", label: "Mese di riferimento" });
    if (!draft.amount.trim()) nextErrors.push({ id: "trainer-payment-amount", label: "Importo" });
    setErrors(nextErrors);
    if (nextErrors.length) return;

    setSaving(true);
    try {
      await onAdd({
        id: `payment-${Date.now()}`,
        month: draft.month.trim(),
        amount: draft.amount.trim(),
        date: draft.status === "paid" ? draft.date : "",
        status: draft.status,
      });
      setDirty(false);
      setAddOpen(false);
    } catch {
      // La scheda ha gia avvisato con il toast: il cassetto resta aperto.
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (value?: string) => (value ? formatDateShort(value) : "");

  const downloadReceipt = (payment: TrainerPayment) => {
    const receiptContent = `
RICEVUTA DI PAGAMENTO

Allenatore: ${trainer?.name ?? ""}
Codice Fiscale: ${trainer?.fiscalCode ?? ""}
Mese: ${payment.month}
Importo: €${payment.amount}
Data pagamento: ${formatDate(payment.date)}

Ricevuta generata il ${new Date().toLocaleDateString()}
`;
    downloadText(
      receiptContent,
      buildAttachmentFileName({
        documentType: "Ricevuta compenso",
        lastName: trainer?.lastName,
        firstName: trainer?.firstName,
        fullName: trainer?.name,
        date: payment.date,
        mimeType: "text/plain",
      }),
    );
    showToast("success", "Ricevuta scaricata con successo");
  };

  const downloadInvoice = (payment: TrainerPayment) => {
    const invoiceContent = `
FATTURA

Numero: INV-${Date.now().toString().substring(8)}
Data: ${new Date().toLocaleDateString()}

Allenatore: ${trainer?.name ?? ""}
Codice Fiscale: ${trainer?.fiscalCode ?? ""}
Indirizzo: ${trainer?.address ?? ""}

Descrizione: Compenso per attività di allenatore - ${payment.month}
Importo: €${payment.amount}
IVA: €0.00
Totale: €${payment.amount}

Data pagamento: ${formatDate(payment.date)}
Metodo di pagamento: Bonifico Bancario

Note: Operazione fuori campo IVA ai sensi dell'art. 5 DPR 633/72
`;
    downloadText(
      invoiceContent,
      buildAttachmentFileName({
        documentType: "Fattura compenso",
        lastName: trainer?.lastName,
        firstName: trainer?.firstName,
        fullName: trainer?.name,
        date: payment.date,
        mimeType: "text/plain",
      }),
    );
    showToast("success", "Fattura scaricata con successo");
  };

  const columns = React.useMemo<ColumnDef<TrainerPayment>[]>(
    () => [
      {
        id: "month",
        header: "Mese",
        kind: "text",
        locked: true,
        width: 1.4,
        minWidth: 140,
        cell: (row) => <span className="font-semibold">{row.month}</span>,
        sortValue: (row) => row.month,
      },
      {
        id: "amount",
        header: "Importo",
        kind: "amount",
        align: "right",
        width: 0.9,
        minWidth: 110,
        cell: (row) => <span className="egw-num font-bold">{formatMoney(row.amount)}</span>,
        sortValue: (row) => Number(String(row.amount).replace(",", ".")) || 0,
        exportValue: (row) => formatMoney(row.amount),
      },
      {
        id: "date",
        header: "Data pagamento",
        kind: "date",
        width: 1,
        minWidth: 120,
        cell: (row) => <span className="egw-num">{formatDateShort(row.date)}</span>,
        sortValue: (row) => row.date || null,
      },
      {
        id: "status",
        header: "Stato",
        kind: "status",
        width: 0.9,
        minWidth: 110,
        cell: (row) => <StatusPill status={paymentStatus(row.status)} />,
        sortValue: (row) => row.status,
        exportValue: (row) => paymentStatus(row.status).label,
      },
    ],
    [],
  );

  const rowActions = React.useMemo<RowActionDef<TrainerPayment>[]>(
    () => [
      {
        id: "pay",
        label: "Registra pagamento",
        icon: <Wallet />,
        primary: true,
        hidden: (row) => row.status !== "pending",
        onClick: (row) => void onPay(row.id),
      },
      {
        id: "receipt",
        label: "Ricevuta",
        icon: <Receipt />,
        primary: true,
        hidden: (row) => row.status === "pending",
        onClick: downloadReceipt,
      },
      {
        id: "invoice",
        label: "Fattura",
        icon: <FileText />,
        hidden: (row) => row.status === "pending",
        onClick: downloadInvoice,
      },
      {
        id: "toggle",
        label: "Cambia stato",
        icon: <RefreshCw />,
        onClick: (row) => setStatusTarget(row),
      },
      {
        id: "delete",
        label: "Elimina",
        icon: <Trash2 />,
        tone: "danger",
        onClick: (row) => setDeleteTarget(row),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onPay, trainer],
  );

  return (
    <>
      <DataGrid<TrainerPayment>
        module="allenatore-pagamenti"
        aria-label="Registro pagamenti dell'allenatore"
        rows={payments}
        getRowId={(row) => String(row.id)}
        columns={columns}
        search={{
          placeholder: "Cerca pagamento",
          match: (row, query) => String(row.month || "").toLowerCase().includes(query),
        }}
        defaultSort={{ columnId: "date", direction: "desc" }}
        noun={{ singular: "pagamento", plural: "pagamenti" }}
        rowActions={rowActions}
        canSelect={false}
        hideFooter={payments.length <= 25}
        persist={false}
        banner={
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-egw-hairline px-4 py-3">
            <div>
              <p className="font-brand text-[15px] font-bold text-egw-ink">Registro pagamenti</p>
              <p className="font-brand text-[12px] text-egw-ink-62">Promemoria storico dei compensi già registrati.</p>
            </div>
            <Button variant="neutral" size="sm" icon={<Plus />} onClick={openAdd}>
              Aggiungi pagamento
            </Button>
          </div>
        }
        empty={{
          icon: <Wallet />,
          title: "Nessun pagamento registrato per questo allenatore",
          description: "Il registro è un promemoria: il rapporto di lavoro vero si gestisce in «Lavoro e compensi».",
          primary: (
            <Button variant="neutral" size="sm" icon={<Plus />} onClick={openAdd}>
              Aggiungi pagamento
            </Button>
          ),
        }}
      />

      <Drawer
        open={addOpen}
        onOpenChange={setAddOpen}
        width="default"
        eyebrow="Registro pagamenti"
        title="Aggiungi pagamento stipendio"
        dirty={dirty}
        locked={saving}
        footer={
          <>
            <Button variant="primary" onClick={() => void handleAdd()} loading={saving}>
              Salva pagamento
            </Button>
            <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={saving}>
              Annulla
            </Button>
          </>
        }
      >
        <FieldSizeProvider size="sm">
          <div className="flex flex-col gap-5">
            <ValidationSummary errors={errors} />
            <Field
              label="Mese di riferimento"
              htmlFor="trainer-payment-month"
              required
              error={errors.some((e) => e.id === "trainer-payment-month") ? "Indica il mese" : undefined}
            >
              <TextInput
                id="trainer-payment-month"
                value={draft.month}
                onChange={(event) => patch({ month: event.target.value })}
                placeholder="Es. Maggio 2024"
              />
            </Field>
            <Field
              label="Importo"
              htmlFor="trainer-payment-amount"
              required
              width="16ch"
              error={errors.some((e) => e.id === "trainer-payment-amount") ? "Indica l'importo" : undefined}
            >
              <TextInput
                id="trainer-payment-amount"
                type="number"
                numeric
                min="0"
                step="0.01"
                trailing="€"
                value={draft.amount}
                onChange={(event) => patch({ amount: event.target.value })}
                placeholder="1500"
              />
            </Field>
            <Field label="Stato pagamento" htmlFor="trainer-payment-status" required>
              <Select
                id="trainer-payment-status"
                value={draft.status}
                onValueChange={(value) => patch({ status: value === "pending" ? "pending" : "paid" })}
                options={[
                  { value: "paid", label: "Pagato" },
                  { value: "pending", label: "In attesa" },
                ]}
              />
            </Field>
            {draft.status === "paid" ? (
              <Field label="Data pagamento" htmlFor="trainer-payment-date" width="20ch">
                <DateInput id="trainer-payment-date" value={draft.date} onChange={(event) => patch({ date: event.target.value })} />
              </Field>
            ) : null}
          </div>
        </FieldSizeProvider>
      </Drawer>

      <ConfirmDialog
        open={Boolean(statusTarget)}
        onOpenChange={(open) => {
          if (!open) setStatusTarget(null);
        }}
        title="Cambiare lo stato del compenso?"
        description="Lo stato passerà da pagato a in attesa, o viceversa."
        confirmLabel="Conferma"
        loading={busy}
        onConfirm={async () => {
          if (!statusTarget) return;
          setBusy(true);
          try {
            await onToggleStatus(statusTarget.id);
            setStatusTarget(null);
          } catch {
            // La scheda ha gia avvisato con il toast.
          } finally {
            setBusy(false);
          }
        }}
      />

      <DangerConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Eliminare il compenso?"
        description="Il compenso verrà rimosso dalla scheda dell'allenatore."
        consequences={deleteTarget ? [`${deleteTarget.month} · ${formatMoney(deleteTarget.amount)}`] : []}
        confirmLabel="Elimina"
        loading={busy}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setBusy(true);
          try {
            await onDelete(deleteTarget.id);
            setDeleteTarget(null);
          } catch {
            // La scheda ha gia avvisato con il toast.
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
