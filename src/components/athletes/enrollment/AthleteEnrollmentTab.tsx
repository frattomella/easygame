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
import { useContiIncasso } from "@/components/payments/use-conti-incasso";
import { useCausaliIncasso } from "@/components/payments/use-causali-incasso";
import { CoverageDialog } from "@/components/payments/CoverageDialog";
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
 * 1. **riepilogo economico** — i sette numeri, in sequenza (area A di N14);
 * 2. **prossima rata** — la cosa da fare adesso;
 * 3. **piano di pagamento** — le rate, con la copertura accanto (area B);
 * 4. **composizione della quota** — chiusa: spiega da dove viene il totale;
 * 5. **voucher assegnato e periodi** — separati dai pagamenti (aree C e D);
 * 6. **documenti** — chiusi.
 *
 * Le prime due rispondono alle domande di chi apre la scheda; tutto il resto e
 * dettaglio, e sta dietro una riga da aprire.
 *
 * ## Le cinque distinzioni che la scheda deve rendere ovvie (N14)
 *
 * Il collaudo reale ha trovato una scheda che le teneva tutte e cinque
 * implicite, e la segreteria le ricostruiva a mente:
 *
 * | Il piano | genera il **debito** |
 * | Il voucher | e una **copertura**, cioe una promessa |
 * | La copertura prevista | **non** e un incasso |
 * | La maturazione | **non** e una liquidazione |
 * | Il pagamento della famiglia | e un movimento reale, e sta per conto suo |
 *
 * Da qui la forma: le grandezze dell'**ente** e quelle della **famiglia** non
 * si sommano mai in un totale unico, e dove si affiancano il testo dice perche.
 *
 * ## Una fonte sola per i numeri
 *
 * Riepilogo, prossima rata, rate **e il riquadro dei voucher** leggono lo
 * stesso stato (`useAthletePaymentLedger`). Non ci sono due modi di calcolare
 * «pagato», e da N14 non ce ne sono due nemmeno di «quanto porta l'ente»: il
 * pannello dei contributi riceve la proiezione invece di rileggerla, perche due
 * letture della stessa cosa a mezzo secondo di distanza sono due verita e la
 * seconda arriva dopo che la prima e stata disegnata.
 *
 * Lo stato di una rata resta derivato dagli incassi e non si imposta a mano
 * (ADR-0036).
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
  no_plan: "border-egw-hairline bg-egw-page-100 text-egw-ink-72",
  pending: "border-egw-tint-amber-bd bg-egw-tint-amber text-egw-amber-ink",
  partial: "border-egw-tint-blue-bd bg-egw-tint-blue text-egw-blue-800",
  paid: "border-egw-tint-green-bd bg-egw-tint-green text-egw-green",
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
              <ChevronDown className="h-4 w-4 shrink-0 text-egw-ink-42" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-egw-ink-42" />
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
  hint,
  emphasis = false,
}: {
  label: string;
  value: unknown;
  /**
   * Cosa significa quel numero, in tre parole.
   *
   * **Non e decorazione**: e cio che impedisce di leggere «Voucher maturato
   * 100» come cento euro entrati in cassa. Il colore da solo non lo direbbe —
   * e a chi non distingue i colori non direbbe niente affatto — quindi la
   * distinzione e scritta.
   */
  hint?: string;
  emphasis?: boolean;
}) => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-dashed border-egw-rule py-1.5 last:border-0 dark:border-slate-800">
    <span className="text-sm text-muted-foreground">
      {label}
      {hint ? (
        <span className="ml-2 text-xs opacity-80">{hint}</span>
      ) : null}
    </span>
    <span
      className={`tabular-nums ${emphasis ? "text-lg font-bold text-egw-ink dark:text-slate-100" : "text-sm font-medium"}`}
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
  const causali = useCausaliIncasso();
  const conti = useContiIncasso();
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

  /* La rata di cui si sta gestendo la copertura da voucher (N7, area B di N14). */
  const [coverageTarget, setCoverageTarget] = React.useState<any>(null);

  const economics = ledger.planCoverage;

  /*
    **Quando il blocco «ente» ha qualcosa da dire.**

    Se l'atleta non ha nessun voucher, tre righe a zero non aggiungono niente e
    rubano lo spazio ai quattro numeri che contano. Se ne ha uno — anche non
    ancora appoggiato a nessuna rata — le righe compaiono, perche «assegnato ma
    impegnato per zero» e proprio la situazione che una segreteria deve
    riconoscere: e cio che il collaudo reale non riusciva a vedere.
  */
  const hasVoucher =
    ledger.fundingOverviews.length > 0 || economics.plannedCoverage > 0;

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
            **I sette numeri, in sequenza** (area A di N14).

            I totali stanno **qui e solo qui**. Ripeterli sotto le rate o in
            fondo alla pagina e cio che rendeva la scheda illeggibile.

            L'ordine racconta la catena: il piano genera il debito, il voucher
            ne copre una parte — prevista, poi maturata, poi liquidata — e cio
            che resta e della famiglia. Le due contabilita non si sommano in un
            totale unico, e ogni riga porta scritto cosa significa: il colore
            non e mai l'unica informazione.

            L'invariante e uno solo, e lo fa valere il dominio:
            `quota totale = copertura prevista + a carico della famiglia`.
          */}
          <div>
            <AmountLine
              label="Quota totale"
              value={economics.dueAmount}
              hint="il debito del piano"
            />

            {hasVoucher ? (
              <>
                <AmountLine
                  label="Copertura voucher prevista"
                  value={economics.plannedCoverage}
                  hint="promessa, non incassata"
                />
                <AmountLine
                  label="Voucher maturato"
                  value={economics.accruedCoverage}
                  hint="credito verso l'ente"
                />
                <AmountLine
                  label="Voucher liquidato"
                  value={economics.settledCoverage}
                  hint="versato dall'ente"
                />
                {/*
                  **Il credito certo verso l'ente** (N15). Sta fra il liquidato
                  e la quota della famiglia perche e li che si legge: sopra c'e
                  cio che e gia arrivato, sotto cio che tocca alla famiglia, e
                  questo e cio che manca ancora all'appello — ma solo la parte
                  **maturata**, che e l'unica che qualcuno deve davvero.
                */}
                <AmountLine
                  label="Voucher da ricevere"
                  value={economics.pendingCoverage}
                  hint="maturato meno liquidato"
                />
              </>
            ) : null}

            <AmountLine
              label="A carico della famiglia"
              value={economics.familyDueAmount}
              hint={hasVoucher ? "quota totale meno copertura" : undefined}
            />
            <AmountLine
              label="Pagato dalla famiglia"
              value={economics.familyPaidAmount}
            />
            <AmountLine
              label="Residuo famiglia"
              value={economics.familyResidualAmount}
              emphasis
            />
          </div>

          {hasVoucher ? (
            <p className="rounded-egw-control border border-egw-hairline bg-egw-page-100 p-3 text-xs text-egw-ink-72 dark:border-slate-800 dark:bg-slate-900/40">
              La copertura di un voucher <strong>non e un incasso</strong>:
              riduce quanto la famiglia deve, e in cassa entra solo quando
              l&apos;ente versa. Il maturato e un credito verso l&apos;ente, non
              una liquidazione.
            </p>
          ) : null}

          {/*
            **Lo scaduto e quello della famiglia** (N14). Su rate coperte da un
            voucher il conteggio lordo annunciava «due rate scadute per 400 EUR»
            per un debito che la famiglia non ha, e la telefonata partiva lo
            stesso.
          */}
          {ledger.familyTotals.overdueCount > 0 ? (
            <p className="text-sm font-medium text-egw-red">
              {ledger.familyTotals.overdueCount}{" "}
              {ledger.familyTotals.overdueCount === 1
                ? "rata scaduta"
                : "rate scadute"}{" "}
              per {formatCurrency(ledger.familyTotals.overdueAmount)} a carico
              della famiglia
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
          <div className="flex flex-col gap-3 rounded-egw-control border border-dashed border-egw-hairline p-3 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800">
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
            <p className="text-sm font-medium text-egw-green">
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

              {/*
                Gli importi di «prossima rata» sono gia quelli della famiglia:
                `nextInstallment` sceglie fra le rate ridotte alla loro quota
                (N14). Su una rata da 200 coperta per 150 il titolo dice 50, che
                e la cifra da chiedere allo sportello.
              */}
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

      {/* ------------------------------------------ 3. piano di pagamento */}
      <Section
        title="Piano di pagamento"
        count={ledger.ledgers.length}
        /*
          Si apre da sola quando **la famiglia** ha qualcosa di anomalo: una
          rata scaduta che un voucher copre per intero non e un'anomalia della
          famiglia, e aprire la sezione per quella significherebbe allarmare
          per un debito che non esiste.
        */
        defaultOpen={shouldExpandInstallments(ledger.familyTotals)}
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
          <p className="text-sm text-egw-ink-62">Lettura degli incassi...</p>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              Lo stato di una rata si ricava dagli incassi registrati: non si
              imposta a mano. La parte coperta da un voucher{" "}
              <strong>non conta come pagata</strong>: riduce quanto la famiglia
              deve, e resta un credito verso l&apos;ente.
            </p>
            <InstallmentLedgerList
              ledgers={ledger.ledgers}
              /*
                **La copertura si vede e si gestisce da qui** (area B di N14).

                Le due proprieta esistevano dalla lane N7 e le passava soltanto
                l'area Movimenti: la scheda «Iscrizione» — quella che una
                segreteria apre per capire quanto deve una famiglia — mostrava
                le rate lorde e non aveva nessun pulsante per coprirle. La
                funzione era completa e irraggiungibile dalla schermata in cui
                serviva (CLAUDE.md §11.8).
              */
              coverageByInstallment={ledger.coverageByInstallment}
              onManageCoverage={(installment) => setCoverageTarget(installment)}
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
              /*
                **Online si paga la quota della famiglia** (revisione ostile,
                H2). La correzione esisteva sull'area Movimenti e non qui:
                `validateOnlinePaymentAmount` limita al residuo della rata che
                riceve, e su una rata da 200 coperta per 150 il checkout
                accettava fino a 200 — centocinquanta euro che l'ente sta gia
                portando, e che nessun riquadro avrebbe poi mostrato come
                credito della famiglia.
              */
              onPayOnline={
                ledger.canPayOnline
                  ? (installment: any) =>
                      ledger.selectOnlineLedger(
                        ledger.withFamilyShare(installment),
                      )
                  : undefined
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

      {/* ------------------------- 5. voucher assegnato e periodi (aree C e D) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Voucher e contributi</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Un voucher assegnato non e denaro incassato: matura periodo per
            periodo, si rendiconta all&apos;ente, e solo alla fine l&apos;ente lo
            liquida. Nel riepilogo qui sopra compare come{" "}
            <strong>copertura</strong>, che riduce la quota della famiglia, mai
            come incasso.
          </p>
        </CardHeader>
        <CardContent>
          {/*
            **Gli stessi dati del riepilogo, non una seconda lettura** (N14).

            Il pannello leggeva `view=overview` per conto suo, mentre l'hook
            qui sopra leggeva la **stessa** proiezione per calcolare la
            copertura: due richieste, due risposte, e i sette numeri in cima
            potevano raccontare una storia diversa dal riquadro in fondo alla
            stessa pagina.

            `onChanged` chiude il cerchio: una decisione presa sul voucher
            ridisegna anche il riepilogo e le rate, perche annullare
            un'assegnazione cambia quanto la famiglia deve.
          */}
          <AthleteFundingSummary
            athleteId={athleteId}
            athleteName={athleteName}
            overviews={ledger.fundingOverviews}
            coverageAllocations={ledger.coverageAllocations}
            onChanged={() => ledger.reloadFunding()}
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
                    className="flex flex-wrap items-center justify-between gap-2 rounded-egw-control border border-egw-hairline p-3 dark:border-slate-800"
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
                    className="flex flex-wrap items-center justify-between gap-2 rounded-egw-control border border-egw-hairline p-3 dark:border-slate-800"
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
                        <Trash2 className="h-4 w-4 text-egw-red" />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      {/*
        **Coprire una rata con un voucher, dalla scheda in cui si guarda la
        rata** (area B di N14). La finestra e la stessa dell'area Movimenti: un
        secondo modo di promettere la stessa copertura sarebbe il duplicato che
        CLAUDE.md §11.1 elenca fra gli errori tipici di questo repository.
      */}
      <CoverageDialog
        open={Boolean(coverageTarget)}
        onOpenChange={(open) => {
          if (!open) setCoverageTarget(null);
        }}
        installment={coverageTarget}
        allocations={ledger.coverageAllocations}
        fundingOverviews={ledger.fundingOverviews}
        isSaving={ledger.isSaving}
        onAllocate={ledger.allocateCoverage}
        onReverse={ledger.reverseCoverage}
      />

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
        operationTypeChoices={causali}
        accountChoices={conti}
        isSaving={ledger.isSaving}
        onSubmit={ledger.registerPayment}
      />
    </div>
  );
}

export { EnrollmentPaymentBreakdown };
