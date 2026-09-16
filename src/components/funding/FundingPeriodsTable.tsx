"use client";

import React from "react";
import {
  Banknote,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  Undo2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  describeFundingPeriodMeasure,
  describeFundingPeriodProgress,
  describeFundingPeriodRequirement,
  describeSettlementEligibility,
  fundingAccrualOriginLabel,
  pendingSettlementOfAccrual,
  resolveFundingPeriodMeasure,
  resolveFundingPeriodRequirement,
  type FundingAccrualOrigin,
  type FundingPeriodDecision,
  type FundingPeriodRow,
} from "@/lib/funding/funding-model";

/**
 * Il ciclo di vita di un contributo, periodo per periodo (ADR-0054, N12).
 *
 * ## Perche righe e non una data-grid
 *
 * Le colonne che servono davvero sono otto — periodo, frequenza, requisito,
 * previsione, stato ufficiale, maturato, rendicontato, liquidato — e otto
 * colonne a 375 px sono una tabella che scorre di lato e non si legge. Qui la
 * riga chiusa dice le tre cose che decidono (quale periodo, quanto vale, a che
 * punto e), e il resto si apre.
 *
 * ## Perche previsione e maturato sono due voci separate
 *
 * Su un programma la cui fonte ufficiale sta fuori da EasyGame, cio che le
 * presenze del club dicono non e un credito: e un'indicazione. Metterle nella
 * stessa colonna significherebbe far leggere come maturato un numero che l'ente
 * non ha riconosciuto.
 *
 * ## Perche le azioni stanno sulla riga chiusa
 *
 * Perche sono il motivo per cui questo elenco esiste (N12). Una decisione che
 * si raggiunge solo dopo aver aperto un accordion e una decisione che la
 * segreteria non prende: il pannello aperto spiega **perche** un periodo e
 * dov'e, ma «maturato / non maturato» si decide guardando l'elenco.
 *
 * ## Cosa questo file non calcola piu
 *
 * Frequenza e requisito. Li interpolava direttamente dalla riga di maturato, e
 * su un periodo previsto quella riga non c'e: usciva «Frequenza EasyGame
 * undefined ore» e «Requisito undefined ore non raggiunto» (N10, N11). Adesso i
 * due casi in cui il numero non esiste hanno un nome nel dominio —
 * `measure.kind === "unknown"` e `requirement.kind === "none"` — e la frase la
 * scrive una funzione sola, che e la sola difesa contro il ritorno di
 * `undefined` per la terza volta.
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

export const ACCRUAL_STATUS_BADGE: Record<
  string,
  { label: string; className: string }
> = {
  /*
    **Il periodo che c'e e non e stato calcolato** (N8).

    Non e un sesto stato in archivio: e cio che si vede di un mese del bando
    prima che qualcuno abbia ricalcolato. Distinguerlo da «non maturato» e la
    ragione per cui esiste — «non maturato» dice che l'atleta non ha
    frequentato abbastanza, «previsto» dice che nessuno ha ancora guardato, e
    confonderli e il modo in cui si rendiconta all'ente un mese mai verificato.
  */
  planned: {
    label: "PREVISTO",
    className: "border-dashed border-egw-hairline bg-white text-egw-ink-62",
  },
  not_accrued: {
    label: "NON MATURATO",
    className: "border-egw-hairline bg-egw-page-100 text-egw-ink-72",
  },
  pending_confirmation: {
    label: "DA CONFERMARE",
    className: "border-egw-tint-blue-bd bg-egw-tint-blue text-egw-indigo",
  },
  accrued: {
    label: "MATURATO",
    className: "border-egw-tint-blue-bd bg-egw-tint-blue text-egw-blue-800",
  },
  reported: {
    label: "RENDICONTATO",
    className: "border-egw-tint-amber-bd bg-egw-tint-amber text-egw-amber-ink",
  },
  settled: {
    label: "LIQUIDATO",
    className: "border-egw-tint-green-bd bg-egw-tint-green text-egw-green",
  },
};

const DetailRow = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) => (
  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-dashed border-egw-rule py-1.5 last:border-0 dark:border-slate-800">
    <span className="text-xs uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
    <span className="text-sm font-medium text-egw-ink dark:text-slate-100">
      {value}
      {hint ? (
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </span>
  </div>
);

export type FundingAccrualRow = Record<string, any>;

/** La riga che questo componente disegna: quella del dominio, piu niente. */
type Riga = FundingPeriodRow & { readonly id: string };

/**
 * Le righe da disegnare.
 *
 * `periods` comanda quando c'e: porta **tutti** i periodi del bando, calcolati
 * e non (N8), gia corredati di misura e requisito risolti dal dominio. Il
 * ripiego su `accruals` serve alle sole schermate che non hanno ancora la
 * proiezione nuova, e passa dalle **stesse** funzioni: un secondo modo di
 * ricavare la frequenza sarebbe il secondo posto da cui `undefined` puo
 * ritornare.
 */
const costruisciRighe = (
  periods: readonly FundingPeriodRow[] | undefined,
  accruals: readonly FundingAccrualRow[],
  program: unknown,
): Riga[] => {
  if (periods && periods.length) {
    return periods.map((period) => ({
      ...period,
      id: period.accrual?.id
        ? String(period.accrual.id)
        : `previsto-${period.periodIndex}`,
    }));
  }

  return (Array.isArray(accruals) ? accruals : []).map((accrual) => {
    const measure = resolveFundingPeriodMeasure(accrual, program);

    return {
      id: String(accrual.id || `periodo-${accrual.period_index}`),
      periodIndex: Number(accrual.period_index ?? 0),
      label: String(accrual.period_label || "Periodo"),
      start: String(accrual.period_start || ""),
      end: String(accrual.period_end || ""),
      status: String(accrual.status || "not_accrued") as Riga["status"],
      accrual,
      measure,
      requirement: resolveFundingPeriodRequirement(accrual, program, measure),
      plannedAmount: Number(accrual.eligible_amount || 0),
      manualDecision: Boolean(accrual?.data?.manualDecision),
    };
  });
};

export function FundingPeriodsTable({
  accruals,
  periods,
  program,
  externalSource,
  canManage = false,
  canSettle = false,
  canReverseSettlement = false,
  busyPeriodIndex = null,
  onConfirm,
  onDecide,
  onSettle,
  onReverseSettlement,
}: {
  accruals: FundingAccrualRow[];
  /**
   * **Tutti** i periodi del bando, calcolati e non (N8). Quando c'e, comanda
   * lui: la schermata mostrava le sole righe di maturato, e il ricalcolo si
   * ferma a oggi, quindi i mesi futuri non comparivano affatto.
   */
  periods?: FundingPeriodRow[];
  /** La configurazione del bando: porta requisito e unita dei periodi previsti. */
  program?: unknown;
  /** Vero quando la fonte ufficiale del programma sta fuori da EasyGame. */
  externalSource: boolean;
  canManage?: boolean;
  /**
   * Se il ruolo attivo puo **registrare** il bonifico di un ente (N15). Non
   * coincide con `canManage`: la porta chiede anche la chiave contabile, e la
   * risposta la porta il server.
   */
  canSettle?: boolean;
  /** Se puo **stornare** un accredito gia registrato: chiede `accounting.reverse`. */
  canReverseSettlement?: boolean;
  /** Il periodo su cui una decisione e in volo: il suo indice, o `null`. */
  busyPeriodIndex?: number | null;
  onConfirm?: (accrual: FundingAccrualRow) => void;
  /** La decisione manuale su un periodo (N12). */
  onDecide?: (riga: FundingPeriodRow, decision: FundingPeriodDecision) => void;
  /** Registra l'accredito dell'ente su questo periodo (N15). */
  onSettle?: (accrual: FundingAccrualRow) => void;
  /** Storna un accredito gia registrato. */
  onReverseSettlement?: (settlement: {
    settlementId: string;
    /** Quanto di questo accredito riguarda **questo** periodo. */
    amount: number;
    /** Quanto vale l'accredito **intero**: e cio che lo storno rimette indietro. */
    settlementAmount: number;
    /** Su quanti periodi e ripartito. Piu di uno = piu beneficiari. */
    lineCount: number;
    description?: string | null;
  }) => void;
}) {
  const [openId, setOpenId] = React.useState<string | null>(null);

  const righe = React.useMemo(
    () => costruisciRighe(periods, accruals, program),
    [periods, accruals, program],
  );

  if (!righe.length) {
    return (
      <p className="text-sm text-egw-ink-62">
        Il programma non genera nessun periodo: controlla le date di validita.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {righe.map((riga) => {
        const id = riga.id;
        const isOpen = openId === id;
        const accrual = riga.accrual;
        const status = String(riga.status || "not_accrued");
        const badge =
          ACCRUAL_STATUS_BADGE[status] || ACCRUAL_STATUS_BADGE.not_accrued;
        const pending = status === "pending_confirmation";
        const settled = status === "settled";
        const reportedAmount = ["reported", "settled"].includes(status)
          ? Number(accrual?.accrued_amount || 0)
          : 0;
        const settledAmount = Number(accrual?.settled_amount || 0);
        const busy = busyPeriodIndex === riga.periodIndex;

        /*
          **Quanto resta da ricevere su questo periodo** (N15): maturato meno
          liquidato. Non «previsto meno liquidato»: cio che non e maturato non e
          ancora un credito verso l'ente, e sommarlo qui direbbe al club di
          aspettarsi denaro che nessuno gli deve.
        */
        const daRicevere = accrual ? pendingSettlementOfAccrual(accrual) : 0;

        /*
          Se su questo periodo si possa registrare un accredito lo decide la
          **stessa** funzione che il servizio applica: un pulsante acceso su un
          periodo che il server rifiuta e una promessa.
        */
        const liquidabile =
          accrual && describeSettlementEligibility(accrual).kind === "eligible";

        /* Gli accrediti gia registrati su questo periodo, storni compresi. */
        const accrediti: any[] = Array.isArray(accrual?.settlements)
          ? accrual.settlements
          : [];

        /*
          L'importo in evidenza risponde alla domanda del momento: su un periodo
          da confermare e la previsione, su uno gia calcolato e il maturato, su
          uno mai toccato e quanto il periodo **varrebbe**. Mostrare zero su un
          mese futuro direbbe che non arrivera niente.
        */
        const importoInEvidenza = accrual
          ? pending
            ? Number(accrual.estimated_amount || 0)
            : Number(accrual.accrued_amount || 0)
          : riga.plannedAmount;

        const progresso = describeFundingPeriodProgress(riga.requirement);

        return (
          <li
            key={id}
            className="rounded-egw-control border border-egw-hairline dark:border-slate-800"
          >
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : id)}
              aria-expanded={isOpen}
              className="flex w-full flex-col gap-2 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="flex min-w-0 items-center gap-2">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-egw-ink-42" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-egw-ink-42" />
                )}
                <span className="min-w-0">
                  <span className="block truncate font-medium capitalize text-egw-ink dark:text-slate-100">
                    {riga.label}
                  </span>
                  {/*
                    **Qui usciva «undefined ore su undefined richieste»** (N10,
                    N11). Adesso la frase la sceglie il dominio, e quando non
                    c'e niente da confrontare non si scrive un confronto.
                  */}
                  <span className="block text-xs text-egw-ink-62">
                    {progresso ?? describeFundingPeriodMeasure(riga.measure)}
                  </span>
                </span>
              </span>

              <span className="flex flex-wrap items-center gap-2 sm:justify-end">
                <span className="text-sm font-semibold">
                  {formatCurrency(importoInEvidenza)}
                </span>
                {pending ? (
                  <span className="text-xs text-egw-indigo">previsione</span>
                ) : null}
                {!accrual ? (
                  <span className="text-xs text-egw-ink-62">previsto</span>
                ) : null}
                {/*
                  **Quanto resta da ricevere, sulla riga chiusa** (N15). E la
                  cifra per cui una segreteria apre questo elenco: senza, per
                  sapere se c'e un accredito da aspettare bisognava aprire ogni
                  periodo uno per uno.
                */}
                {daRicevere > 0 ? (
                  <span className="text-xs font-medium text-egw-amber-ink dark:text-amber-300">
                    da ricevere {formatCurrency(daRicevere)}
                  </span>
                ) : null}
                {riga.manualDecision ? (
                  <Badge
                    variant="outline"
                    className="border-egw-tint-blue-bd bg-egw-tint-blue text-egw-indigo"
                  >
                    DECISO DALLA SOCIETA
                  </Badge>
                ) : null}
                <Badge variant="outline" className={badge.className}>
                  {badge.label}
                </Badge>
              </span>
            </button>

            {/*
              **Le azioni stanno qui, non dentro il pannello** (N12).

              Sono il motivo per cui questo elenco esiste. Un periodo previsto
              non ha ancora una riga in archivio e si decide lo stesso: la riga
              nasce quando qualcuno preme, che e la differenza fra «gestire i
              periodi» e «gestire i periodi che il ricalcolo ha gia toccato».

              Su un periodo liquidato non c'e nessun pulsante di decisione:
              l'ente ha versato su quell'importo, e la correzione passa dallo
              storno dell'accredito — che da N15 **esiste**, ed e qui sotto.
              Un pulsante che si accende per poi rifiutarsi e peggio di un
              pulsante che non c'e.
            */}
            {canManage && onDecide && !settled ? (
              /*
                A 375 px due pulsanti affiancati spezzano «Segna come maturato»
                su tre righe: a quella larghezza si impilano, e ognuno prende la
                riga intera. Da `sm` in su tornano accanto, dove lo spazio c'e.
              */
              <div className="flex flex-col gap-2 border-t border-dashed border-egw-rule px-3 py-2 sm:flex-row sm:flex-wrap dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || status === "accrued"}
                  onClick={() => onDecide(riga, "accrued")}
                  className="flex-1 sm:flex-none"
                >
                  <ThumbsUp className="mr-2 h-4 w-4" />
                  Segna come maturato
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || status === "not_accrued"}
                  onClick={() => onDecide(riga, "not_accrued")}
                  className="flex-1 sm:flex-none"
                >
                  <ThumbsDown className="mr-2 h-4 w-4" />
                  Segna come non maturato
                </Button>
                {/*
                  Ritirare la decisione compare **solo** se una decisione c'e:
                  altrimenti sarebbe un pulsante che non fa niente, e chi lo
                  preme non capisce se ha funzionato.
                */}
                {riga.manualDecision ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => onDecide(riga, "auto")}
                    className="flex-1 sm:flex-none"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Torna al calcolo automatico
                  </Button>
                ) : null}
              </div>
            ) : null}

            {/*
              **«Registra liquidazione», sulla riga** (N15).

              E l'atto che chiude il ciclo — Previsto → Maturato → Liquidato —
              e fino a oggi non aveva **nessuna** porta: le due rotte delle
              liquidazioni erano scritte, provate e senza un solo chiamante.

              L'etichetta cambia quando un accredito c'e gia, perche «Registra
              liquidazione» su un periodo liquidato per meta lascerebbe credere
              di doverla rifare da capo. Su un periodo liquidato per intero non
              compare affatto: cio che resta e lo storno.
            */}
            {canSettle && onSettle && liquidabile ? (
              <div className="flex flex-col gap-2 border-t border-dashed border-egw-rule px-3 py-2 sm:flex-row sm:flex-wrap dark:border-slate-800">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => onSettle(accrual!)}
                  className="flex-1 sm:flex-none"
                >
                  <Banknote className="mr-2 h-4 w-4" />
                  {settledAmount > 0
                    ? "Registra altra liquidazione"
                    : "Registra liquidazione"}
                </Button>
              </div>
            ) : null}

            {isOpen ? (
              <div className="border-t border-egw-rule px-3 pb-3 pt-2 dark:border-slate-800">
                <DetailRow
                  label="Periodo"
                  value={`${formatDate(riga.start)} — ${formatDate(riga.end)}`}
                />
                {/*
                  N10. I tre casi hanno tre frasi, e nessuna delle tre e un
                  numero inventato: la misura vera, «non ancora disponibile»
                  quando nessuno ha misurato.
                */}
                <DetailRow
                  label="Frequenza EasyGame"
                  value={describeFundingPeriodMeasure(riga.measure)}
                  hint={
                    accrual?.data?.sessionsWithoutDuration
                      ? `${accrual.data.sessionsWithoutDuration} allenamenti senza orario`
                      : undefined
                  }
                />
                {/*
                  N11. «Nessun requisito di frequenza» e una configurazione
                  legittima e non un dato mancante: un requisito a zero
                  disegnato come «0 ore» sarebbe un numero falso.
                */}
                <DetailRow
                  label="Requisito"
                  value={describeFundingPeriodRequirement(riga.requirement)}
                  hint={progresso ?? undefined}
                />
                <DetailRow
                  label="Importo previsto"
                  value={formatCurrency(riga.plannedAmount)}
                />
                {accrual ? (
                  <DetailRow
                    label="Previsione EasyGame"
                    value={formatCurrency(accrual.estimated_amount)}
                  />
                ) : null}
                <DetailRow
                  label="Stato ufficiale"
                  value={
                    <Badge variant="outline" className={badge.className}>
                      {badge.label}
                    </Badge>
                  }
                />
                <DetailRow
                  label="Maturato"
                  value={formatCurrency(accrual?.accrued_amount)}
                  hint={
                    accrual?.accrual_origin
                      ? fundingAccrualOriginLabel(
                          accrual.accrual_origin as FundingAccrualOrigin,
                        )
                      : undefined
                  }
                />
                <DetailRow
                  label="Rendicontato"
                  value={formatCurrency(reportedAmount)}
                  hint={
                    accrual?.reported_at
                      ? `il ${formatDate(accrual.reported_at)}`
                      : undefined
                  }
                />
                <DetailRow
                  label="Liquidato"
                  value={formatCurrency(settledAmount)}
                />
                {/*
                  N15. `maturato − liquidato`, e non `previsto − liquidato`: cio
                  che non e maturato non e ancora un credito verso l'ente.
                */}
                <DetailRow
                  label="Da ricevere"
                  value={formatCurrency(daRicevere)}
                  hint={
                    daRicevere > 0 && settledAmount > 0
                      ? "accredito parziale"
                      : undefined
                  }
                />

                {accrual?.confirmed_at ? (
                  <DetailRow
                    label="Conferma"
                    value={formatDate(accrual.confirmed_at)}
                    hint={
                      [accrual.external_reference, accrual.confirmation_notes]
                        .filter(Boolean)
                        .join(" · ") || undefined
                    }
                  />
                ) : null}

                {/*
                  **Chi ha deciso, quando, e da quale stato** (N12). L'audit
                  vive anche in `audit_events`, ma una segreteria che guarda un
                  periodo non apre il registro delle operazioni: la traccia va
                  letta dove sta il fatto.
                */}
                {Array.isArray(accrual?.data?.manualDecisions) &&
                accrual.data.manualDecisions.length > 0 ? (
                  <div className="mt-2 rounded-egw-control bg-egw-tint-blue/60 p-2 dark:bg-indigo-950/20">
                    <p className="text-xs font-semibold uppercase tracking-wide text-egw-indigo dark:text-indigo-300">
                      Decisioni della societa
                    </p>
                    <ul className="mt-1 space-y-1">
                      {accrual.data.manualDecisions.map(
                        (voce: any, index: number) => (
                          <li key={index} className="text-xs text-egw-ink-72">
                            {voce.decision === "auto"
                              ? "Restituito al calcolo"
                              : voce.decision === "accrued"
                                ? `Maturato ${formatCurrency(voce.toAmount)}`
                                : "Non maturato"}{" "}
                            · da «{voce.fromStatus}» · {formatDate(voce.decidedAt)}
                            {voce.notes ? ` · ${voce.notes}` : ""}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                ) : null}

                {Array.isArray(accrual?.data?.previousConfirmations) &&
                accrual.data.previousConfirmations.length > 0 ? (
                  <div className="mt-2 rounded-egw-control bg-egw-page-100 p-2 dark:bg-slate-900/40">
                    <p className="text-xs font-semibold uppercase tracking-wide text-egw-ink-62">
                      Conferme precedenti
                    </p>
                    <ul className="mt-1 space-y-1">
                      {accrual.data.previousConfirmations.map(
                        (entry: any, index: number) => (
                          <li key={index} className="text-xs text-egw-ink-72">
                            {formatCurrency(entry.amount)} ·{" "}
                            {formatDate(entry.confirmedAt)}
                            {entry.externalReference
                              ? ` · ${entry.externalReference}`
                              : ""}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                ) : null}

                {/*
                  **Gli accrediti dell'ente su questo periodo** (N15).

                  Sono la storia che rende lo stato «liquidato» verificabile:
                  quando, quanto, con quale riferimento bancario. E il posto in
                  cui vive lo **storno**, perche lo storno agisce sulla testata
                  della liquidazione e non sulla riga di ripartizione — e senza
                  questo elenco un periodo liquidato per errore restava un
                  vicolo cieco, con la scheda che mandava la segreteria a
                  cercare un controllo che non esisteva.
                */}
                {accrediti.length > 0 ? (
                  <div className="mt-2 rounded-egw-control bg-egw-tint-green/60 p-2 dark:bg-emerald-950/20">
                    <p className="text-xs font-semibold uppercase tracking-wide text-egw-green dark:text-emerald-300">
                      Accrediti dell&apos;ente
                    </p>
                    <ul className="mt-1 space-y-1">
                      {accrediti.map((accredito: any) => (
                        <li
                          key={`${accredito.settlementId}-${accredito.amount}`}
                          className="flex flex-wrap items-center justify-between gap-2 text-xs text-egw-ink-72 dark:text-egw-ink-42"
                        >
                          <span className="min-w-0">
                            {formatCurrency(accredito.amount)} ·{" "}
                            {formatDate(accredito.settledAt)}
                            {accredito.reference
                              ? ` · ${accredito.reference}`
                              : ""}
                            {accredito.reversedAt
                              ? " · stornato"
                              : accredito.isReversal
                                ? " · storno"
                                : ""}
                            {/*
                              **Un bonifico in blocco lo dice** (F1). Se la
                              testata tocca piu periodi, l'importo qui accanto e
                              solo la quota di questo: chi preme «Storna» ne
                              rimette indietro un altro, e deve saperlo prima.
                            */}
                            {Number(accredito.lineCount || 1) > 1 ? (
                              <span className="block text-[0.95em] text-egw-amber-ink dark:text-amber-300">
                                quota di un accredito da{" "}
                                {formatCurrency(accredito.settlementAmount)} su{" "}
                                {accredito.lineCount} periodi
                              </span>
                            ) : null}
                          </span>
                          {/*
                            Si storna la testata originale, una volta sola: uno
                            storno non si storna, e su una riga gia stornata il
                            pulsante non compare invece di rifiutarsi.
                          */}
                          {canReverseSettlement &&
                          onReverseSettlement &&
                          !accredito.reversedAt &&
                          !accredito.isReversal ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                onReverseSettlement({
                                  settlementId: String(accredito.settlementId),
                                  amount: Number(accredito.amount || 0),
                                  settlementAmount: Number(
                                    accredito.settlementAmount ??
                                      accredito.amount ??
                                      0,
                                  ),
                                  lineCount: Number(accredito.lineCount || 1),
                                  description: accredito.description,
                                })
                              }
                            >
                              <Undo2 className="mr-2 h-3.5 w-3.5" />
                              Storna
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {accrual?.data?.reason ? (
                  <p className="mt-2 text-xs text-egw-ink-62">
                    {accrual.data.reason}
                  </p>
                ) : null}

                {externalSource && canManage && accrual && !settled ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full sm:w-auto"
                    onClick={() => onConfirm?.(accrual)}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {accrual.confirmed_at
                      ? "Correggi l'importo confermato"
                      : "Registra la conferma dell'ente"}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
