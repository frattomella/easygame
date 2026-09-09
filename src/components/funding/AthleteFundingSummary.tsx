"use client";

import React from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  HandCoins,
  RefreshCw,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { apiRequest, readStoredActiveClub } from "@/lib/api/client";
import { useToast } from "@/components/ui/toast-notification";
import { canManageFundingAsActor } from "@/lib/funding/permissions";
import { normalizeCoverageAllocations, sumLiveCoverageForEnrollment } from "@/lib/payments/coverage-ledger";
import { EnrollAthletesDialog } from "./EnrollAthletesDialog";
import { FundingPeriodsTable } from "./FundingPeriodsTable";
import {
  ConfirmAccrualDialog,
  type AccrualConfirmationSubmission,
} from "./ConfirmAccrualDialog";
import {
  SettleAccrualDialog,
  type SettlementSubmission,
} from "./SettleAccrualDialog";
import {
  fundingAccrualSourceLabel,
  mergeFundingSummaries,
  requirementUnitLabel,
  type EnrollmentRemovalPlan,
  type FundingAccrualSource,
  type FundingPeriodDecision,
  type FundingPeriodRow,
  type FundingSummary,
} from "@/lib/funding/funding-model";

/**
 * Il **voucher assegnato** a un atleta, e i suoi periodi (aree C e D di N14).
 *
 * ---
 *
 * ## Sei numeri, non uno
 *
 * Un voucher assegnato non e denaro incassato, e il massimale del bando non e
 * cio che l'atleta usa qui: fra «il bando riconosce fino a 500» e «l'ente ci ha
 * versato 60» ci sono quattro passaggi che possono fallire separatamente.
 * Mostrarne un totale solo — che e cio che una segreteria si aspetterebbe di
 * vedere — porterebbe a contare come cassa dei soldi che nessuno ha versato.
 *
 * ## Massimale del programma e assegnato al club sono due righe diverse
 *
 * Mario ha diritto a 500 EUR complessivi e decide di usarne 300 qui: gli altri
 * 200 non sono disponibili a questa societa, e EasyGame non deve mai
 * comportarsi come se lo fossero. Il limite di questa iscrizione e 300.
 *
 * ## Cosa questo pannello ha imparato a fare
 *
 * **Annullare un'assegnazione** (N13). Il servizio sapeva togliere un atleta da
 * un programma da sempre, e la sola porta che ci arrivava stava nella scheda
 * del **programma**: chi apriva la scheda dell'**atleta** — cioe chiunque, in
 * un collaudo reale — vedeva un voucher assegnato e nessun modo di ritirarlo.
 * La forma e quella che CLAUDE.md §11.8 chiama per nome: codice completo e
 * irraggiungibile.
 *
 * Il pulsante non indovina cosa succedera: lo dice il dominio
 * (`overview.removal`), con la **stessa** funzione che poi decide davvero.
 *
 * ## Perche i numeri possono arrivare da fuori
 *
 * Quando la scheda «Iscrizione» li ha gia letti — e li ha, perche il riepilogo
 * economico in cima ne dipende — questo pannello li **riceve** invece di
 * rileggerli. Due letture della stessa proiezione a mezzo secondo di distanza
 * sono due verita, e la seconda arriva dopo che la prima e stata disegnata.
 */

const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

export type FundingOverview = {
  enrollment: Record<string, any>;
  program: Record<string, any>;
  accruals: Record<string, any>[];
  periods?: FundingPeriodRow[];
  summary: FundingSummary;
  removal?: EnrollmentRemovalPlan;
};

/**
 * Una riga del riepilogo economico.
 *
 * Righe e non riquadri affiancati: sei importi in griglia diventano due
 * colonne strette a 375 px, e i sei numeri che raccontano una storia in
 * sequenza vanno letti in sequenza.
 */
const AmountLine = ({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string;
  value: unknown;
  hint?: string;
  emphasis?: boolean;
}) => (
  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-dashed border-slate-100 py-1.5 last:border-0 dark:border-slate-800">
    <span className="text-sm text-muted-foreground">
      {label}
      {hint ? <span className="ml-2 text-xs opacity-80">{hint}</span> : null}
    </span>
    <span
      className={`text-sm tabular-nums ${emphasis ? "font-bold text-slate-900 dark:text-slate-100" : "font-medium"}`}
    >
      {formatCurrency(value)}
    </span>
  </div>
);

/**
 * **La finestra che dice cosa sta per succedere** (N13).
 *
 * Tre testi per tre esiti, e non e una gentilezza: «annullo e non resta niente»,
 * «annullo e lo storico resta» e «non posso annullare, l'ente ha gia versato»
 * sono tre fatti diversi, e una finestra sola con «Confermi?» li nasconderebbe
 * tutti e tre.
 */
const RemovalDialog = ({
  open,
  onOpenChange,
  programName,
  plan,
  isBusy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programName: string;
  plan: EnrollmentRemovalPlan | null;
  isBusy: boolean;
  onConfirm: (acknowledgeSettled: boolean) => void;
}) => {
  const esito = plan?.outcome ?? "delete";

  /*
    **Il consenso e un gesto, non l'assenza di un gesto** (revisione ostile, F2).

    La prima stesura passava `esito === "settled"` direttamente al pulsante: il
    server chiedeva un consenso esplicito e la schermata glielo dava sempre, da
    sola. Una guardia che il solo cliente reale soddisfa in automatico e una
    guardia decorativa — chiudere un'adesione su cui l'ente ha gia versato
    tornava a costare **un clic**, che e esattamente cio che il vaglio doveva
    impedire.
  */
  const [consenso, setConsenso] = React.useState(false);

  React.useEffect(() => {
    if (!open) setConsenso(false);
  }, [open]);

  const titolo =
    esito === "settled"
      ? "Questo voucher e gia stato liquidato"
      : esito === "revoke"
        ? "Revoca l'assegnazione del voucher"
        : "Annulla l'assegnazione del voucher";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titolo}</DialogTitle>
          <DialogDescription>{programName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-sm">
          {esito === "settled" ? (
            <>
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">
                L&apos;ente ha gia versato{" "}
                <strong>{formatCurrency(plan?.settledAmount)}</strong> su questa
                assegnazione. Annullarla rimetterebbe a carico della famiglia una
                quota che il club ha <strong>gia incassato dall&apos;ente</strong>:
                lo stesso importo, chiesto due volte.
              </p>
              <p className="text-muted-foreground">
                La strada corretta e stornare la liquidazione dalla scheda del
                programma, in «Contributi», e solo dopo chiudere
                l&apos;assegnazione. Se vuoi comunque chiuderla adesso — perche
                l&apos;atleta ha lasciato la societa e la liquidazione resta
                dov&apos;e — dichiaralo qui sotto: resta a registro.
              </p>
              <label className="flex min-h-[44px] items-start gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-800">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0"
                  checked={consenso}
                  onChange={(event) => setConsenso(event.target.checked)}
                />
                <span className="text-sm">
                  So che l&apos;ente ha gia versato{" "}
                  {formatCurrency(plan?.settledAmount)} e chiudo comunque
                  l&apos;assegnazione. La liquidazione resta dov&apos;e.
                </span>
              </label>
            </>
          ) : esito === "revoke" ? (
            <>
              <p>
                L&apos;assegnazione <strong>non verra cancellata</strong>: passa a
                «chiusa», smette di maturare e resta leggibile. Lo storico non si
                riscrive.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {(plan?.reasons ?? []).map((motivo) => (
                  <li key={motivo}>{motivo}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>
              Non e ancora successo niente su questa assegnazione: verra
              rimossa, e i periodi calcolati con lei.
            </p>
          )}

          {plan && plan.liveCoverageCount > 0 ? (
            <p className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sky-900">
              {plan.liveCoverageCount === 1
                ? "1 rata torna a carico della famiglia"
                : `${plan.liveCoverageCount} rate tornano a carico della famiglia`}
              : le coperture promesse vengono stornate, e il residuo risale.
            </p>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Nessun incasso viene creato o cancellato: cio che la famiglia ha gia
            versato resta dov&apos;e.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            variant="destructive"
            disabled={isBusy || (esito === "settled" && !consenso)}
            onClick={() => onConfirm(esito === "settled" && consenso)}
          >
            {isBusy
              ? "Operazione in corso..."
              : esito === "settled"
                ? "Chiudi comunque l'assegnazione"
                : esito === "revoke"
                  ? "Revoca l'assegnazione"
                  : "Annulla l'assegnazione"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export function AthleteFundingSummary({
  athleteId,
  athleteName,
  canManage,
  overviews: overviewsFromHost,
  coverageAllocations = [],
  onChanged,
}: {
  athleteId: string;
  /** Solo per il testo della finestra di iscrizione. */
  athleteName?: string | null;
  /** Se omesso si ricava dal ruolo attivo. L'autorizzazione vera la fa il server. */
  canManage?: boolean;
  /**
   * I contributi gia letti da chi ospita. Quando ci sono, questo pannello **non**
   * li rilegge: due letture della stessa proiezione sono due verita.
   */
  overviews?: FundingOverview[];
  /** Le coperture dell'atleta: dicono quanto del voucher e impegnato su rate. */
  coverageAllocations?: any[];
  /** Chiamato dopo ogni scrittura, perche l'ospite rilegga tutto insieme. */
  onChanged?: () => void | Promise<void>;
}) {
  const { showToast } = useToast();
  const [ownOverviews, setOwnOverviews] = React.useState<FundingOverview[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [busyEnrollmentId, setBusyEnrollmentId] = React.useState<string | null>(
    null,
  );
  const [busyPeriod, setBusyPeriod] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [derivedCanManage, setDerivedCanManage] = React.useState(false);
  const [confirmTarget, setConfirmTarget] = React.useState<{
    enrollmentId: string;
    accrual: Record<string, any>;
    residualAmount: number;
  } | null>(null);
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [removalTarget, setRemovalTarget] = React.useState<FundingOverview | null>(
    null,
  );
  /* Il periodo su cui e aperta la finestra dell'accredito (N15). */
  const [settleTarget, setSettleTarget] = React.useState<{
    overview: FundingOverview;
    accrual: Record<string, any>;
  } | null>(null);
  const [isSettling, setIsSettling] = React.useState(false);

  const hostControlled = Array.isArray(overviewsFromHost);
  const overviews = hostControlled ? overviewsFromHost! : ownOverviews;

  /*
    I programmi a cui questo atleta **non** e ancora iscritto. L'elenco lo
    calcola il server: «non ancora iscritto» e una differenza fra due insiemi,
    e farla qui vorrebbe dire ricevere tutti i programmi per poi scartarne
    meta.
  */
  const [enrollablePrograms, setEnrollablePrograms] = React.useState<any[]>([]);
  const [enrollOpen, setEnrollOpen] = React.useState(false);

  React.useEffect(() => {
    if (canManage !== undefined) return;
    /*
      **La porta e quella del dominio** (N12/N13): `funding.manage`, e non
      «sei proprietario?». Resta pero un ripiego, e sotto si vede perche.
    */
    setDerivedCanManage(
      canManageFundingAsActor(readStoredActiveClub()?.role),
    );
  }, [canManage]);

  /*
    **Il permesso lo dichiara il server** (revisione ostile, F4).

    Il gettone conservato nel browser porta lo **slug** del ruolo e non le sue
    chiavi: `AuthProvider` lo dice per esteso, ed e una scelta — le chiavi le
    rilegge il server a ogni richiesta. Ne segue che qualunque predicato di
    permesso valutato qui risponde `false` a **ogni** ruolo personalizzato,
    cioe proprio a quelli che questa lane ha reso capaci di decidere: la casella
    «Contributi e voucher» avrebbe governato il server e non lo schermo, e la
    «Segreteria contributi» avrebbe ricevuto il diritto senza vedere un
    pulsante.

    La proiezione porta percio la risposta con se (`overview.canManage`), e
    l'elenco dei programmi a cui iscrivere e vuoto per chi non puo iscrivere:
    due affermazioni del server, che e l'unico che sa. Il predicato locale resta
    come ripiego per il caso in cui non ci sia ancora niente da leggere.
  */
  const serverCanManage = React.useMemo(() => {
    if (overviews.length > 0) {
      return overviews.every((voce) => (voce as any).canManage === true);
    }
    /* Nessuna adesione: l'unico segnale e l'elenco dei bandi assegnabili. */
    return enrollablePrograms.length > 0 ? true : null;
  }, [overviews, enrollablePrograms]);

  const allowManagement = canManage ?? serverCanManage ?? derivedCanManage;

  const load = React.useCallback(async () => {
    if (!athleteId) return;

    setIsLoading(true);

    /*
      Due letture in parallelo e non in fila: la seconda serve solo al
      pulsante «Iscrivi a un programma», e metterla dopo aggiungerebbe un
      giro di rete all'apertura della scheda economica.

      Quando i contributi arrivano da chi ospita si chiede la sola seconda.
    */
    const [overviewResponse, enrollableResponse] = await Promise.all([
      hostControlled
        ? Promise.resolve({ data: null, error: null } as any)
        : apiRequest<FundingOverview[]>(
            `/api/v1/funding/enrollments?view=overview&athlete_id=${encodeURIComponent(athleteId)}`,
          ),
      apiRequest<any[]>(
        `/api/v1/funding/enrollments?view=enrollable&athlete_id=${encodeURIComponent(athleteId)}`,
      ),
    ]);

    setIsLoading(false);

    if (!hostControlled) {
      if (overviewResponse.error) {
        showToast(
          "error",
          overviewResponse.error.message ||
            "Errore nella lettura dei contributi",
        );
        return;
      }

      setOwnOverviews(
        Array.isArray(overviewResponse.data) ? overviewResponse.data : [],
      );
    }

    setEnrollablePrograms(
      Array.isArray(enrollableResponse.data) ? enrollableResponse.data : [],
    );
  }, [athleteId, hostControlled, showToast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  /** Rilegge cio che questo pannello possiede, e avvisa chi lo ospita. */
  const refresh = React.useCallback(async () => {
    await load();
    await onChanged?.();
  }, [load, onChanged]);

  const total = React.useMemo(
    () => mergeFundingSummaries(overviews.map((item) => item.summary)),
    [overviews],
  );

  const coperture = React.useMemo(
    () => normalizeCoverageAllocations(coverageAllocations),
    [coverageAllocations],
  );

  const handleRecompute = async (enrollmentId: string) => {
    setBusyEnrollmentId(enrollmentId);
    const { data, error } = await apiRequest<any>("/api/v1/funding/accruals", {
      method: "POST",
      body: { action: "recompute", enrollment_id: enrollmentId },
    });
    setBusyEnrollmentId(null);

    if (error) {
      showToast("error", error.message || "Ricalcolo non riuscito");
      return;
    }

    await refresh();

    /*
      **Cio che il ricalcolo non ha toccato va detto** (N12). Un ricalcolo che
      tace sui periodi decisi a mano e un ricalcolo di cui la segreteria si
      fida a torto: crederebbe che l'elenco intero venga dalle presenze.
    */
    const manuali = Number(data?.skippedManualPeriods || 0);
    showToast(
      "success",
      manuali > 0
        ? `Calcolo aggiornato dalle presenze. ${manuali} ${manuali === 1 ? "periodo deciso" : "periodi decisi"} dalla societa ${manuali === 1 ? "non e stato ricalcolato" : "non sono stati ricalcolati"}.`
        : "Calcolo aggiornato dalle presenze registrate",
    );
  };

  /**
   * **La decisione manuale su un periodo** (N12).
   *
   * `expected_status` porta al server lo stato che si stava guardando: se nel
   * frattempo qualcun altro l'ha cambiato la scrittura fallisce e lo dice,
   * invece di sovrascrivere in silenzio la decisione di un collega.
   */
  const handleDecide = async (
    enrollmentId: string,
    riga: FundingPeriodRow,
    decision: FundingPeriodDecision,
  ) => {
    const chiave = `${enrollmentId}:${riga.periodIndex}`;
    if (busyPeriod) return;

    setBusyPeriod(chiave);
    const { data, error } = await apiRequest<any>("/api/v1/funding/accruals", {
      method: "POST",
      body: {
        action: "decide",
        enrollment_id: enrollmentId,
        period_index: riga.periodIndex,
        decision,
        expected_status: riga.status,
      },
    });
    setBusyPeriod(null);

    if (error) {
      showToast("error", error.message || "Decisione non registrata");
      return;
    }

    await refresh();

    if (data?.unchanged) {
      showToast("info", "Il periodo era gia in questo stato");
      return;
    }

    showToast(
      "success",
      decision === "accrued"
        ? "Periodo segnato come maturato. E un credito verso l'ente, non un incasso."
        : decision === "not_accrued"
          ? "Periodo segnato come non maturato"
          : "Periodo restituito al calcolo dalle presenze: ricalcola per aggiornarlo",
    );
  };

  const handleRemove = async (
    overview: FundingOverview,
    acknowledgeSettled: boolean,
  ) => {
    const enrollmentId = String(overview.enrollment?.id || "");
    setBusyEnrollmentId(enrollmentId);

    const query = new URLSearchParams({
      reason: "Assegnazione annullata dalla segreteria",
    });
    if (acknowledgeSettled) query.set("acknowledge_settled", "1");

    const { data, error } = await apiRequest<any>(
      `/api/v1/funding/enrollments/${encodeURIComponent(enrollmentId)}?${query.toString()}`,
      { method: "DELETE" },
    );
    setBusyEnrollmentId(null);

    if (error) {
      showToast("error", error.message || "Annullamento non riuscito");
      return;
    }

    setRemovalTarget(null);
    await refresh();

    /*
      «Tolto dal programma» e «tolto dal programma, e tre rate tornano a carico
      della famiglia» sono due frasi diverse, e la seconda e quella che una
      segreteria deve leggere prima di richiamare la famiglia.
    */
    const stornate = Number(data?.coverageReversed || 0);
    showToast(
      "success",
      `${data?.outcome === "revoked" ? "Assegnazione revocata: lo storico resta" : "Assegnazione annullata"}${
        stornate > 0
          ? `. ${stornate} ${stornate === 1 ? "rata torna" : "rate tornano"} a carico della famiglia`
          : ""
      }`,
    );
  };

  /**
   * **Registra l'accredito dell'ente su un periodo** (N15).
   *
   * Chiude il ciclo: la stessa transazione scrive la liquidazione, aggiorna lo
   * stato del periodo e — perche il movimento bancario **e** la liquidazione,
   * proiettata nel registro — fa comparire il denaro sul conto del club. Non
   * c'e una seconda registrazione da chiedere all'operatore, e non c'e una
   * finestra in cui una delle due cose esista senza l'altra.
   */
  const handleSettle = async (submission: SettlementSubmission) => {
    if (!settleTarget) return;

    setIsSettling(true);
    const { data, error } = await apiRequest<any>(
      "/api/v1/funding/settlements",
      {
        method: "POST",
        body: {
          accrual_id: settleTarget.accrual.id,
          amount: submission.amount,
          settled_at: submission.settledAt,
          financial_account_id: submission.financialAccountId,
          reference: submission.reference || undefined,
          notes: submission.notes || undefined,
          method: "Bonifico",
          idempotency_key: submission.idempotencyKey,
        },
      },
    );
    setIsSettling(false);

    if (error) {
      showToast("error", error.message || "Liquidazione non registrata");
      return;
    }

    setSettleTarget(null);
    await refresh();

    showToast(
      "success",
      `Liquidazione registrata: ${new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
      }).format(
        Number(data?.amount || submission.amount),
      )} sul conto del club. Non e un pagamento della famiglia.`,
    );
  };

  const handleReverseSettlement = async (settlement: {
    settlementId: string;
    amount: number;
    settlementAmount: number;
    lineCount: number;
    description?: string | null;
  }) => {
    const euro = (valore: number) =>
      new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
      }).format(valore);

    /*
      **Lo storno dice cosa storna davvero** (revisione ostile, F1).

      Chiedeva conferma per l'importo della **riga** — la quota di questo
      periodo — e stornava la **testata**. Su un bonifico che un ente manda in
      blocco per venti atleti, il messaggio diceva 100 euro e l'operazione ne
      rimetteva indietro duemila, riportando diciannove periodi di altri atleti
      da «liquidato» a «rendicontato». Nessuno poteva accorgersene prima di
      premere.

      Lo storno resta un atto sulla testata — e cosi che funziona un bonifico —
      e quindi cio che deve cambiare e la **domanda**: si nomina l'importo
      intero e quanti periodi tocca.
    */
    const inBlocco = Number(settlement.lineCount || 1) > 1;

    const domanda = inBlocco
      ? `Questo accredito vale ${euro(settlement.settlementAmount)} ed e ripartito su ${settlement.lineCount} periodi: stornarlo li riguarda tutti, non solo ${euro(settlement.amount)} di questo. Perche?`
      : `Storna l'accredito di ${euro(settlement.settlementAmount)}. Perche?`;

    /*
      Uno storno deve dire **perche**: senza motivo la riga non spiega niente,
      ed e il dominio a pretenderlo. Si chiede qui invece di lasciare che il
      server rifiuti dopo il clic.
    */
    const motivo =
      typeof window === "undefined" ? "" : window.prompt(domanda, "");

    if (!motivo || !motivo.trim()) return;

    setIsSettling(true);
    const { error } = await apiRequest(
      `/api/v1/funding/settlements/${encodeURIComponent(settlement.settlementId)}/reverse`,
      { method: "POST", body: { reason: motivo.trim() } },
    );
    setIsSettling(false);

    if (error) {
      showToast("error", error.message || "Storno non riuscito");
      return;
    }

    await refresh();
    showToast(
      "success",
      "Accredito stornato: il movimento inverso e nel registro, e il periodo torna fra i crediti verso l'ente",
    );
  };

  const handleConfirm = async (submission: AccrualConfirmationSubmission) => {
    if (!confirmTarget) return;

    setIsConfirming(true);
    const { error } = await apiRequest("/api/v1/funding/accruals", {
      method: "POST",
      body: {
        action: "confirm",
        enrollment_id: confirmTarget.enrollmentId,
        confirmations: [
          {
            accrual_id: confirmTarget.accrual.id,
            amount: submission.amount,
            confirmed_at: submission.confirmedAt,
            external_reference: submission.externalReference,
            notes: submission.notes,
          },
        ],
      },
    });
    setIsConfirming(false);

    if (error) {
      showToast("error", error.message || "Conferma non riuscita");
      return;
    }

    setConfirmTarget(null);
    await refresh();
    showToast("success", "Maturazione confermata");
  };

  const enrollAction =
    allowManagement && enrollablePrograms.length > 0 ? (
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2 sm:w-auto"
        onClick={() => setEnrollOpen(true)}
      >
        <UserPlus className="h-4 w-4" />
        Assegna un voucher
      </Button>
    ) : null;

  const enrollDialog = (
    <EnrollAthletesDialog
      open={enrollOpen}
      onOpenChange={setEnrollOpen}
      onEnrolled={() => void refresh()}
      mode="athlete"
      athleteId={athleteId}
      athleteName={athleteName || "questo atleta"}
      programs={enrollablePrograms}
    />
  );

  if (!isLoading && overviews.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          Nessun voucher assegnato a questo atleta: la quota resta interamente a
          carico della famiglia.
          {allowManagement && enrollablePrograms.length === 0
            ? " Non ci sono programmi attivi a cui iscriverlo."
            : ""}
        </p>
        {enrollAction}
        {enrollDialog}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {enrollAction ? (
        <div className="flex justify-end">{enrollAction}</div>
      ) : null}

      {overviews.length > 1 ? (
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Totale contributi
          </p>
          <div className="mt-1">
            <AmountLine label="Assegnato al club" value={total.assignedAmount} />
            <AmountLine label="Maturato" value={total.accruedAmount} />
            <AmountLine label="Rendicontato" value={total.reportedAmount} />
            <AmountLine label="Liquidato" value={total.settledAmount} emphasis />
            <AmountLine label="Residuo" value={total.residualAmount} />
          </div>
        </div>
      ) : null}

      {overviews.map((overview) => {
        const enrollmentId = String(overview.enrollment?.id || "");
        const isOpen = Boolean(expanded[enrollmentId]);
        const summary = overview.summary;
        const unit = String(overview.program?.requirement_unit || "hours") as any;
        const source = String(
          overview.program?.accrual_source || "easygame_attendance",
        ) as FundingAccrualSource;
        const externalSource = source !== "easygame_attendance";
        const stato = String(overview.enrollment?.status || "active");
        const periods = (overview.periods || []) as FundingPeriodRow[];
        /*
          **L'impegnato lo dice il server** (revisione ostile, F5).

          Qui si sommavano tutte le coperture dell'atleta, e quella somma
          comprende le righe appese a rate **annullate**: quando un piano si
          rigenera le vecchie rate restano marcate e le loro coperture con esse.
          Il server le esclude dal tetto da C2 — e cio che permette di coprire
          le rate nuove — quindi subito dopo una rigenerazione la schermata
          mostrava il doppio e accusava l'operatore di uno sforamento
          inesistente.

          Il ripiego sulla somma locale resta per le risposte scritte prima che
          il campo esistesse.
        */
        const impegnato =
          typeof (overview as any).committedAmount === "number"
            ? (overview as any).committedAmount
            : sumLiveCoverageForEnrollment(coperture, enrollmentId);
        const requisito = Number(overview.program?.requirement_min || 0);

        return (
          <div
            key={enrollmentId}
            className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <HandCoins className="h-4 w-4 text-blue-600" />
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {overview.program?.name || "Programma"}
                  </p>
                  {overview.enrollment?.voucher_code ? (
                    <Badge variant="outline">
                      Voucher {overview.enrollment.voucher_code}
                    </Badge>
                  ) : null}
                  {/*
                    Lo stato dell'adesione non e decorativo: su una revocata i
                    pulsanti spariscono, e senza etichetta la loro assenza
                    sembrerebbe un guasto.
                  */}
                  {stato !== "active" ? (
                    <Badge
                      variant="outline"
                      className="border-slate-300 bg-slate-100 text-slate-600"
                    >
                      {stato === "closed" ? "REVOCATO" : "SOSPESO"}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {overview.program?.funder_name} ·{" "}
                  {formatCurrency(overview.program?.period_amount)} per periodo
                  {/*
                    N11 fino in fondo: un bando senza soglia non dice «con almeno
                    0 ore», che e un requisito inventato.
                  */}
                  {requisito > 0
                    ? `, con almeno ${requisito} ${requirementUnitLabel(unit)}`
                    : ", senza requisito di frequenza"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Fonte della maturazione: {fundingAccrualSourceLabel(source)}
                </p>
              </div>

              {allowManagement ? (
                <div className="flex flex-col gap-2 sm:items-end">
                  {stato === "active" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      disabled={busyEnrollmentId === enrollmentId}
                      onClick={() => void handleRecompute(enrollmentId)}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {busyEnrollmentId === enrollmentId
                        ? "Ricalcolo..."
                        : externalSource
                          ? "Aggiorna previsione"
                          : "Ricalcola dalle presenze"}
                    </Button>
                  ) : null}
                  {/*
                    **N13.** Il testo del pulsante lo sceglie il dominio, non la
                    schermata: `removal.outcome` e la stessa risposta che
                    `removeFundingEnrollment` applichera.
                  */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-red-600 hover:text-red-700 sm:w-auto"
                    disabled={busyEnrollmentId === enrollmentId}
                    onClick={() => setRemovalTarget(overview)}
                  >
                    {overview.removal?.outcome === "settled" ? (
                      <AlertTriangle className="mr-2 h-4 w-4" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    {overview.removal?.outcome === "delete"
                      ? "Annulla assegnazione"
                      : "Revoca assegnazione"}
                  </Button>
                </div>
              ) : null}
            </div>

            {/*
              I sei importi in sequenza. Il massimale del programma sta in cima
              perche e il contesto — «il bando arriva fino a qui» — e
              l'assegnato subito sotto perche e il limite vero di questa
              iscrizione (ADR-0054).
            */}
            <div className="mt-3">
              <AmountLine
                label="Massimale programma"
                value={overview.program?.athlete_plafond}
                hint="tetto del bando"
              />
              <AmountLine
                label="Assegnato al club"
                value={summary.assignedAmount}
                hint="limite di questa iscrizione"
                emphasis
              />
              {/*
                **Quanto del voucher e davvero appoggiato a delle rate** (N14).
                E il numero che collega questo riquadro al piano di pagamento
                qui sopra: un voucher assegnato per 500 e impegnato per 0 non
                sta riducendo la quota di nessuno, e prima non c'era modo di
                accorgersene da questa scheda.
              */}
              <AmountLine
                label="Impegnato sulle rate"
                value={impegnato}
                hint="copertura promessa alla famiglia"
              />
              {externalSource ? (
                <AmountLine
                  label="Previsione EasyGame"
                  value={summary.estimatedAmount}
                  hint="da confermare"
                />
              ) : null}
              <AmountLine label="Maturato" value={summary.accruedAmount} />
              <AmountLine label="Rendicontato" value={summary.reportedAmount} />
              <AmountLine
                label="Liquidato"
                value={summary.settledAmount}
                hint="versato dall'ente"
              />
              {/*
                **Il credito certo verso l'ente** (N15): maturato meno
                liquidato. Non «assegnato meno liquidato»: cio che non e
                maturato non e ancora dovuto da nessuno, e chiamarlo «da
                ricevere» farebbe aspettare al club denaro che non arrivera.
              */}
              <AmountLine
                label="Voucher da ricevere"
                value={summary.pendingSettlementAmount}
                hint="maturato meno liquidato"
              />
              <AmountLine label="Residuo" value={summary.residualAmount} />
            </div>

            {summary.assignedAmount > 0 ? (
              <div className="mt-3 space-y-1">
                <Progress
                  value={Math.round(
                    Math.min(1, summary.accruedAmount / summary.assignedAmount) *
                      100,
                  )}
                  className="h-2"
                />
                <p className="text-xs text-slate-500">
                  {/* «1 periodi maturati» lo scrive una macchina, non una persona. */}
                  {summary.accruedPeriodCount}{" "}
                  {summary.accruedPeriodCount === 1
                    ? "periodo maturato"
                    : "periodi maturati"}{" "}
                  su {periods.length || summary.periodCount}
                  {summary.pendingConfirmationPeriodCount > 0
                    ? ` · ${summary.pendingConfirmationPeriodCount} da confermare`
                    : ""}
                  {summary.unaccruedAmount > 0
                    ? ` · ${formatCurrency(summary.unaccruedAmount)} non maturati per requisito non raggiunto`
                    : ""}
                </p>
              </div>
            ) : null}

            {impegnato > summary.assignedAmount ? (
              <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                La copertura promessa supera l&apos;importo assegnato: controlla
                le coperture sulle rate.
              </p>
            ) : null}

            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full sm:w-auto"
              aria-expanded={isOpen}
              onClick={() =>
                setExpanded((current) => ({
                  ...current,
                  [enrollmentId]: !current[enrollmentId],
                }))
              }
            >
              {isOpen ? (
                <ChevronDown className="mr-1 h-4 w-4" />
              ) : (
                <ChevronRight className="mr-1 h-4 w-4" />
              )}
              Periodi del voucher ({periods.length || overview.accruals.length})
            </Button>

            {isOpen ? (
              <div className="mt-3">
                <FundingPeriodsTable
                  accruals={overview.accruals}
                  periods={periods}
                  program={overview.program}
                  externalSource={externalSource}
                  canManage={allowManagement && stato === "active"}
                  busyPeriodIndex={
                    busyPeriod && busyPeriod.startsWith(`${enrollmentId}:`)
                      ? Number(busyPeriod.split(":")[1])
                      : null
                  }
                  onConfirm={(accrual) =>
                    setConfirmTarget({
                      enrollmentId,
                      accrual,
                      residualAmount: summary.residualAmount,
                    })
                  }
                  onDecide={(riga, decision) =>
                    void handleDecide(enrollmentId, riga, decision)
                  }
                  /*
                    **La porta della liquidazione la dichiara il server** (N15,
                    e la lezione F4 di N14): il gettone conservato nel browser
                    porta lo slug del ruolo e non le sue chiavi, quindi un
                    predicato valutato qui risponderebbe `false` a ogni ruolo
                    personalizzato — cioe proprio a quelli che la lane ha reso
                    capaci di registrare un accredito.
                  */
                  canSettle={Boolean((overview as any).canSettle)}
                  canReverseSettlement={Boolean(
                    (overview as any).canReverseSettlement,
                  )}
                  onSettle={(accrual) =>
                    setSettleTarget({ overview, accrual })
                  }
                  onReverseSettlement={(settlement) =>
                    void handleReverseSettlement(settlement)
                  }
                />
              </div>
            ) : null}
          </div>
        );
      })}

      <ConfirmAccrualDialog
        accrual={confirmTarget?.accrual ?? null}
        residualAmount={confirmTarget?.residualAmount ?? 0}
        isSaving={isConfirming}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
        onSubmit={handleConfirm}
      />

      <SettleAccrualDialog
        open={Boolean(settleTarget)}
        onOpenChange={(open) => {
          if (!open) setSettleTarget(null);
        }}
        accrual={settleTarget?.accrual ?? null}
        athleteName={athleteName}
        programName={settleTarget?.overview?.program?.name}
        funderName={settleTarget?.overview?.program?.funder_name}
        /*
          **Il permesso sui conti lo dichiara il server** (revisione ostile,
          10a). La finestra aveva la porta e nessuno gliela passava: il valore
          restava al suo `true` di ripiego, e il ramo che spiega «i conti li
          vede chi ne ha il permesso» era codice morto. Un permesso dichiarato e
          non cablato e una casella che non fa niente.
        */
        canChooseAccount={Boolean(
          (settleTarget?.overview as any)?.canChooseAccount ?? true,
        )}
        isSaving={isSettling}
        onSubmit={handleSettle}
      />

      <RemovalDialog
        open={Boolean(removalTarget)}
        onOpenChange={(open) => {
          if (!open) setRemovalTarget(null);
        }}
        programName={removalTarget?.program?.name || "Programma"}
        plan={removalTarget?.removal ?? null}
        isBusy={busyEnrollmentId === String(removalTarget?.enrollment?.id || "")}
        onConfirm={(acknowledgeSettled) =>
          removalTarget
            ? void handleRemove(removalTarget, acknowledgeSettled)
            : undefined
        }
      />

      {enrollDialog}
    </div>
  );
}
