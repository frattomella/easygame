"use client";

import React from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Download,
  Eye,
  FileText,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { InstallmentLedgerList } from "@/components/payments/InstallmentLedgerList";
import { RegisterPaymentDialog } from "@/components/payments/RegisterPaymentDialog";
import { PayOnlineDialog } from "@/components/payments/PayOnlineDialog";
import { RefundDialog } from "@/components/payments/RefundDialog";
import { DocumentDecisionDialog } from "@/components/payments/DocumentDecisionDialog";
import { useAthletePaymentLedger } from "@/components/payments/use-athlete-payment-ledger";
import { AthleteFundingSummary } from "@/components/funding/AthleteFundingSummary";
import { EnrollmentPaymentBreakdown } from "@/components/payments/EnrollmentPaymentBreakdown";
import { apiRequest } from "@/lib/api/client";
import {
  ENROLLMENT_PAYMENT_STATE_LABELS,
  shouldExpandInstallments,
  type InstallmentLedger,
  type LedgerTotals,
} from "@/lib/payments/installment-ledger";

/**
 * La scheda **Iscrizione** di un atleta (ADR-0056).
 *
 * ## Cosa c'era prima
 *
 * Sei riquadri che raccontavano la stessa cosa in modi diversi: «Riepilogo
 * Incasso» con i totali, «Rate e incassi» con le rate e i loro incassi,
 * «Storico Pagamenti» con **gli stessi** incassi in una seconda tabella e i
 * totali ripetuti nell'intestazione, piu una griglia obbligatori/opzionali/
 * totale dentro la configurazione del piano. Chi apriva la scheda per sapere
 * quanto restava da incassare trovava tre numeri e doveva scegliere di quale
 * fidarsi.
 *
 * ## L'ordine, e perche e quello
 *
 * 1. **riepilogo** — piano, quota, pagato, residuo, stato;
 * 2. **prossima rata** — la cosa da fare adesso;
 * 3. **rate** — chiuse, salvo anomalie;
 * 4. **composizione della quota** — chiusa: spiega da dove viene il totale;
 * 5. **voucher e contributi** — separati dai pagamenti della famiglia;
 * 6. **documenti** — chiusi.
 *
 * Le prime due rispondono alle cinque domande di chi apre la scheda; tutto il
 * resto e dettaglio, e sta dietro una riga da aprire.
 *
 * ## Una fonte sola per i numeri
 *
 * Riepilogo, prossima rata e rate leggono **lo stesso** stato
 * (`useAthletePaymentLedger`). Non ci sono due modi di calcolare «pagato»:
 * c'e Payments V2, e basta. Lo stato di una rata resta derivato dagli incassi
 * e non si imposta a mano (ADR-0036).
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
  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const STATE_BADGE_CLASS: Record<string, string> = {
  no_plan: "border-slate-200 bg-slate-100 text-slate-600",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  partial: "border-sky-200 bg-sky-50 text-sky-700",
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

/**
 * Una sezione che si apre.
 *
 * L'intestazione dice **sempre** quanto c'e dentro, cosi chiusa resta
 * informativa: «Rate (4)» e gia una risposta, e chi non ha bisogno del
 * dettaglio non lo apre.
 */
const Section = ({
  title,
  count,
  defaultOpen = false,
  action,
  children,
}: {
  title: string;
  count?: number | null;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = React.useState(defaultOpen);

  React.useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/*
            L'area toccabile e la riga intera, non la sola scritta: a 375 px
            un bersaglio alto ventiquattro pixel si manca, e chi lo manca
            crede che la sezione non si apra.
          */}
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            className="-my-2 flex min-h-[44px] min-w-0 flex-1 items-center gap-2 py-2 text-left"
          >
            {open ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
            )}
            <CardTitle className="truncate text-base">
              {title}
              {typeof count === "number" ? ` (${count})` : ""}
            </CardTitle>
          </button>
          {open ? action : null}
        </div>
      </CardHeader>
      {open ? <CardContent>{children}</CardContent> : null}
    </Card>
  );
};

const AmountLine = ({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: unknown;
  emphasis?: boolean;
}) => (
  <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-slate-100 py-1.5 last:border-0 dark:border-slate-800">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span
      className={`tabular-nums ${emphasis ? "text-lg font-bold text-slate-900 dark:text-slate-100" : "text-sm font-medium"}`}
    >
      {formatCurrency(value)}
    </span>
  </div>
);

export type EnrollmentDocument = {
  id: string;
  name: string;
  type?: string | null;
  uploadDate?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
};

type FiscalDocument = {
  id: string;
  kind: "receipt" | "invoice";
  number: string;
  issueDate: string | null;
  amount: number;
  cancelledAt: string | null;
};

export type AthleteEnrollmentTabProps = {
  athleteId: string;
  athleteName?: string | null;

  /** Stato dell'iscrizione: attiva, data, note. */
  enrollmentStatus: boolean;
  enrollmentDate: string;
  enrollmentNotes: string;
  isEnrollmentSaving: boolean;
  onEnrollmentToggle: (next: boolean) => void;
  onEnrollmentDateChange: (value: string) => void;
  onEnrollmentDateBlur: () => void;
  onEnrollmentNotesChange: (value: string) => void;
  onSaveEnrollment: () => void;

  /** Le rate dell'atleta: righe di `payments`. */
  charges: any[];
  methodChoices?: string[];
  onLedgerChanged?: (updatedCharge: any | null, totals: LedgerTotals) => void;
  /**
   * L'anagrafica di una rata: descrizione, importo, scadenza, note.
   *
   * Vive nel dettaglio della rata, dove si guarda quella rata. **Non e lo
   * stato**: quello resta derivato dagli incassi (ADR-0036).
   */
  onEditInstallment?: (ledger: InstallmentLedger) => void;
  onDeleteInstallment?: (ledger: InstallmentLedger) => void;
  /** Aggiunge una voce a debito fuori dal piano. Nasce sempre da incassare. */
  onAddInstallment?: () => void;

  /** Il piano scelto e la sua composizione. */
  planName: string | null;
  seasonLabel?: string | null;
  breakdown: React.ReactNode;
  planEditor: React.ReactNode;
  onEditPlan?: () => void;

  /** Documenti di iscrizione gia caricati. */
  documents: EnrollmentDocument[];
  onAddDocument: () => void;
  onCompileForm: () => void;
  onViewDocument: (document: EnrollmentDocument) => void;
  onDownloadDocument: (document: EnrollmentDocument) => void;
  onRemoveDocument: (documentId: string) => void;
};

export function AthleteEnrollmentTab({
  athleteId,
  athleteName,
  enrollmentStatus,
  enrollmentDate,
  enrollmentNotes,
  isEnrollmentSaving,
  onEnrollmentToggle,
  onEnrollmentDateChange,
  onEnrollmentDateBlur,
  onEnrollmentNotesChange,
  onSaveEnrollment,
  charges,
  methodChoices = [],
  onLedgerChanged,
  onEditInstallment,
  onDeleteInstallment,
  onAddInstallment,
  planName,
  seasonLabel,
  breakdown,
  planEditor,
  onEditPlan,
  documents,
  onAddDocument,
  onCompileForm,
  onViewDocument,
  onDownloadDocument,
  onRemoveDocument,
}: AthleteEnrollmentTabProps) {
  const ledger = useAthletePaymentLedger({
    athleteId,
    charges,
    onLedgerChanged,
  });

  /*
    Ricevute e fatture si leggono dalle risorse che le contengono, filtrate per
    atleta: non esiste una seconda idea di «documenti dell'atleta» da tenere
    allineata.
  */
  const [fiscalDocuments, setFiscalDocuments] = React.useState<FiscalDocument[]>(
    [],
  );

  React.useEffect(() => {
    if (!athleteId) return;
    let cancelled = false;

    void Promise.all([
      apiRequest<any[]>(
        `/api/v1/receipts?athlete_id=${encodeURIComponent(athleteId)}`,
      ),
      apiRequest<any[]>(
        `/api/v1/invoices?athlete_id=${encodeURIComponent(athleteId)}`,
      ),
    ]).then(([receipts, invoices]) => {
      if (cancelled) return;

      const map = (rows: any, kind: FiscalDocument["kind"]): FiscalDocument[] =>
        (Array.isArray(rows) ? rows : []).map((row: any) => ({
          id: String(row?.id || ""),
          kind,
          number: String(
            row?.receipt_number || row?.invoice_number || row?.id || "",
          ),
          issueDate: row?.issue_date || null,
          amount: Number(row?.amount || row?.total_amount || 0),
          cancelledAt: row?.cancelled_at || null,
        }));

      setFiscalDocuments(
        [...map(receipts.data, "receipt"), ...map(invoices.data, "invoice")]
          /*
            I documenti sono una cronologia: si leggono dal piu recente, e
            l'ordine alfabetico qui non significherebbe niente.
          */
          .sort((left, right) =>
            String(right.issueDate || "").localeCompare(
              String(left.issueDate || ""),
            ),
          ),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  const openFiscalDocument = (document: FiscalDocument) => {
    if (typeof window === "undefined") return;
    window.open(
      `/api/v1/documents/${document.kind}/${encodeURIComponent(document.id)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const next = ledger.nextInstallment;
  const state = ledger.paymentState;
  const hasPlan = ledger.ledgers.length > 0;

  const registerOn = (target: InstallmentLedger | null) => {
    if (!target) return;
    ledger.selectLedger(target);
  };

  return (
    <div className="space-y-4">
      {/* ------------------------------------------- 1. riepilogo iscrizione */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              {/*
                Senza piano ma con delle rate il titolo non puo dire «nessun
                piano assegnato» sopra un totale di 150 EUR: sono voci create
                a mano, e dirlo e piu utile che negarne l'esistenza.
              */}
              <CardTitle className="truncate text-lg">
                {planName ||
                  (hasPlan ? "Quota senza piano" : "Nessun piano assegnato")}
              </CardTitle>
              {seasonLabel ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {seasonLabel}
                </p>
              ) : null}
            </div>
            <Badge
              variant="outline"
              className={STATE_BADGE_CLASS[state] || STATE_BADGE_CLASS.pending}
            >
              {ENROLLMENT_PAYMENT_STATE_LABELS[state]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/*
            I totali stanno **qui e solo qui**. Ripeterli sotto le rate o in
            fondo alla pagina e cio che rendeva la scheda illeggibile.
          */}
          <div>
            <AmountLine label="Quota totale" value={ledger.totals.dueAmount} />
            <AmountLine label="Pagato" value={ledger.totals.paidAmount} />
            <AmountLine
              label="Residuo"
              value={ledger.totals.residualAmount}
              emphasis
            />
          </div>

          {ledger.totals.overdueCount > 0 ? (
            <p className="text-sm font-medium text-red-600">
              {ledger.totals.overdueCount}{" "}
              {ledger.totals.overdueCount === 1 ? "rata scaduta" : "rate scadute"}{" "}
              per {formatCurrency(ledger.totals.overdueAmount)}
            </p>
          ) : null}

          {ledger.allowManagement && next ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                className="w-full sm:w-auto"
                onClick={() => registerOn(next)}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Registra pagamento
              </Button>
              {/*
                Apre **la stessa** finestra della sezione «Rate»: l'importo si
                sceglie li. Due scorciatoie allo stesso gesto vanno bene; due
                gesti diversi per lo stesso fatto no.
              */}
              {ledger.canPayOnline ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => ledger.selectOnlineLedger(next)}
                >
                  Paga online
                </Button>
              ) : null}
            </div>
          ) : null}

          {/*
            Lo stato dell'iscrizione e la sua data: due campi, non un riquadro
            colorato a tutta larghezza. Chi apre questa scheda vuole sapere
            quanto resta da incassare, non se una spunta e verde.
          */}
          <div className="flex flex-col gap-3 rounded-lg border border-dashed border-slate-200 p-3 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800">
            <div className="flex items-center gap-3">
              <Switch
                id="enrollment"
                checked={enrollmentStatus}
                disabled={isEnrollmentSaving}
                onCheckedChange={onEnrollmentToggle}
              />
              <Label htmlFor="enrollment" className="text-sm">
                {enrollmentStatus ? "Iscrizione attiva" : "Iscrizione non attiva"}
              </Label>
            </div>
            <div className="sm:max-w-[14rem]">
              <Label htmlFor="enrollment-date" className="text-xs">
                Data iscrizione
              </Label>
              <Input
                id="enrollment-date"
                type="date"
                value={enrollmentDate || ""}
                disabled={isEnrollmentSaving}
                onChange={(event) => onEnrollmentDateChange(event.target.value)}
                onBlur={onEnrollmentDateBlur}
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---------------------------------------------- 2. prossima rata */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Prossima rata</CardTitle>
        </CardHeader>
        <CardContent>
          {!hasPlan ? (
            <p className="text-sm text-muted-foreground">
              Nessun piano di pagamento assegnato: assegnalo dalla composizione
              della quota.
            </p>
          ) : !next ? (
            /*
              Niente da incassare, niente pulsante: una CTA che non porta da
              nessuna parte e peggio dell'assenza di CTA.
            */
            <p className="text-sm font-medium text-emerald-700">
              Pagamenti completati
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{formatDate(next.dueDate)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {next.label}
                  </p>
                </div>
                <p className="text-xl font-bold">
                  {formatCurrency(next.dueAmount)}
                </p>
              </div>

              <div>
                <AmountLine label="Pagato" value={next.paidAmount} />
                <AmountLine label="Residuo" value={next.residualAmount} />
              </div>

              <div className="flex flex-wrap gap-2">
                {next.statusLabels.map((label) => (
                  <Badge key={label} variant="outline">
                    {label}
                  </Badge>
                ))}
              </div>

              {ledger.allowManagement ? (
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  onClick={() => registerOn(next)}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Registra pagamento
                </Button>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {/* --------------------------------------------------------- 3. rate */}
      <Section
        title="Rate"
        count={ledger.ledgers.length}
        defaultOpen={shouldExpandInstallments(ledger.totals)}
        action={
          ledger.allowManagement && onAddInstallment ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAddInstallment}
            >
              <Plus className="mr-2 h-4 w-4" />
              Aggiungi voce
            </Button>
          ) : null
        }
      >
        {ledger.isLoading && ledger.transactions.length === 0 ? (
          <p className="text-sm text-slate-500">Lettura degli incassi...</p>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              Lo stato di una rata si ricava dagli incassi registrati: non si
              imposta a mano.
            </p>
            <InstallmentLedgerList
              ledgers={ledger.ledgers}
              canManage={ledger.allowManagement}
              busyTransactionId={ledger.busyTransactionId}
              onRegisterPayment={ledger.selectLedger}
              onReverseTransaction={(transaction) =>
                void ledger.reverseTransaction(transaction)
              }
              onGenerateReceipt={(transaction) =>
                void ledger.generateReceipt(transaction)
              }
              onGenerateInvoice={(transaction) =>
                void ledger.generateInvoice(transaction)
              }
              onPayOnline={
                ledger.canPayOnline ? ledger.selectOnlineLedger : undefined
              }
              /*
                Il rimborso segue la stessa condizione del pagamento online: un
                club che non incassa online non ha incassi online da restituire.
              */
              onRefundTransaction={
                ledger.canPayOnline
                  ? (transaction) => ledger.selectRefundTransaction(transaction)
                  : undefined
              }
              refundAvailabilityFor={ledger.refundAvailabilityFor}
              pendingOnlineInstallmentId={ledger.pendingOnlineInstallmentId}
              onEditInstallment={onEditInstallment}
              onDeleteInstallment={onDeleteInstallment}
            />
          </>
        )}
      </Section>

      {/* --------------------------------------- 4. composizione della quota */}
      <Section
        title="Composizione della quota"
        action={
          onEditPlan ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onEditPlan}
            >
              <CalendarDays className="mr-2 h-4 w-4" />
              Modifica piano e rate
            </Button>
          ) : null
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Da dove viene il totale: quota base, servizi, sconti e pro-rata. Le
            rate e gli incassi stanno nella sezione «Rate».
          </p>
          {breakdown}
          {planEditor}

          <div className="space-y-2">
            <Label htmlFor="enrollment-notes">Note iscrizione</Label>
            <Textarea
              id="enrollment-notes"
              value={enrollmentNotes}
              rows={3}
              onChange={(event) => onEnrollmentNotesChange(event.target.value)}
            />
          </div>

          <Button
            type="button"
            onClick={onSaveEnrollment}
            disabled={isEnrollmentSaving}
            className="w-full sm:w-auto"
          >
            {isEnrollmentSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvataggio...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salva dati iscrizione
              </>
            )}
          </Button>
        </div>
      </Section>

      {/* ------------------------------------------ 5. voucher e contributi */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Voucher e contributi</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Un voucher assegnato non e denaro incassato: matura con la
            frequenza, si rendiconta, e solo alla fine l&apos;ente lo liquida.
            Non entra nei totali qui sopra.
          </p>
        </CardHeader>
        <CardContent>
          <AthleteFundingSummary
            athleteId={athleteId}
            athleteName={athleteName}
          />
        </CardContent>
      </Card>

      {/* ------------------------------------------------------ 6. documenti */}
      <Section
        title="Documenti e ricevute"
        count={documents.length + fiscalDocuments.length}
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onCompileForm}>
              <FileText className="mr-2 h-4 w-4" />
              Compila modulo
            </Button>
            <Button size="sm" onClick={onAddDocument}>
              <Plus className="mr-2 h-4 w-4" />
              Aggiungi
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ricevute e fatture
            </p>
            {fiscalDocuments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nessun documento fiscale emesso. Si emettono dal dettaglio di un
                incasso, nella sezione «Rate».
              </p>
            ) : (
              <ul className="space-y-2">
                {fiscalDocuments.map((document) => (
                  <li
                    key={`${document.kind}-${document.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {document.kind === "receipt" ? "Ricevuta" : "Fattura"}{" "}
                        {document.number}
                        {document.cancelledAt ? " · annullata" : ""}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatDate(document.issueDate)} ·{" "}
                        {formatCurrency(document.amount)}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openFiscalDocument(document)}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      Visualizza
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Documenti di iscrizione
            </p>
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nessun documento di iscrizione caricato.
              </p>
            ) : (
              <ul className="space-y-2">
                {documents.map((document) => (
                  <li
                    key={document.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {document.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {document.type || "Documento iscrizione"} ·{" "}
                        {formatDate(document.uploadDate)}
                      </span>
                    </span>
                    <span className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Visualizza ${document.name}`}
                        onClick={() => onViewDocument(document)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Scarica ${document.name}`}
                        onClick={() => onDownloadDocument(document)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Elimina ${document.name}`}
                        onClick={() => onRemoveDocument(document.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      <PayOnlineDialog
        open={Boolean(ledger.onlineLedger)}
        onOpenChange={(open) => {
          if (!open) ledger.selectOnlineLedger(null);
        }}
        ledger={ledger.onlineLedger}
        athleteName={athleteName}
        isSubmitting={ledger.isOpeningCheckout}
        onConfirm={(amount) =>
          ledger.onlineLedger
            ? ledger.payOnline(ledger.onlineLedger, amount)
            : undefined
        }
      />

      {/*
        La proposta del motore fiscale, **prima** dell'emissione: quale
        documento, con quale numero, con quale classificazione. Prima di questa
        finestra la spiegazione arrivava solo come errore, e solo quando
        qualcosa andava storto.
      */}
      <DocumentDecisionDialog
        open={Boolean(ledger.documentDecision.kind)}
        onOpenChange={(open) => {
          if (!open) ledger.closeDocumentDecision();
        }}
        kind={ledger.documentDecision.kind}
        preview={ledger.documentDecision.preview}
        isLoading={ledger.documentDecision.isLoading}
        isSubmitting={ledger.documentDecision.isSubmitting}
        error={ledger.documentDecision.error}
        onConfirm={() => void ledger.confirmDocumentIssue()}
      />

      <RefundDialog
        open={Boolean(ledger.refundTarget)}
        onOpenChange={(open) => {
          if (!open) ledger.selectRefundTransaction(null);
        }}
        transaction={ledger.refundTarget}
        ledger={
          ledger.refundTarget
            ? ledger.ledgers.find(
                (entry) =>
                  String(entry.installmentId || "") ===
                  String(ledger.refundTarget?.installmentId || ""),
              ) || null
            : null
        }
        availability={
          ledger.refundTarget
            ? ledger.refundAvailabilityFor(ledger.refundTarget)
            : null
        }
        athleteName={athleteName}
        isSubmitting={ledger.isRefunding}
        onConfirm={(submission) =>
          ledger.refundTarget
            ? ledger.refundTransaction(ledger.refundTarget, submission)
            : undefined
        }
      />

      <RegisterPaymentDialog
        open={Boolean(ledger.selectedLedger)}
        onOpenChange={(open) => {
          if (!open) ledger.selectLedger(null);
        }}
        ledger={ledger.selectedLedger}
        athleteName={athleteName}
        methodChoices={methodChoices}
        isSaving={ledger.isSaving}
        onSubmit={ledger.registerPayment}
      />
    </div>
  );
}

export { EnrollmentPaymentBreakdown };
