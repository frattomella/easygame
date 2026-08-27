"use client";

import { useEffect, useState } from "react";
import { CreditCard, ExternalLink, Info, Loader2, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import {
  CONNECT_ACCOUNT_STATE_DEFINITIONS,
  type ConnectAccountState,
} from "@/lib/payments/connect-account";
import { formatCommissionPercent } from "@/lib/payments/commission";
import { getPaymentProviderDefinition } from "@/lib/payments/provider-registry";
import type { PaymentProviderKey } from "@/lib/payments/payment-types";
import { StripeBrandBadge } from "@/components/brand/stripe-brand";
import { cn } from "@/lib/utils";
import { openExternalUrl } from "@/lib/navigation/external-link";

/**
 * Il **conto di incasso** nella pagina Organizzazione: cosa la societa vede, e
 * la sola cosa che puo fare.
 *
 * **Cosa e sparito da questa scheda, e perche.** Fino al Blocco D c'erano un
 * campo di testo per l'identificativo dell'account e un menu a tendina per
 * dichiararsi «attivo». Non era un dettaglio dell'interfaccia: erano il conto
 * su cui finiva il denaro delle famiglie e il permesso di incassare, entrambi
 * scrivibili da chi apre la pagina. Adesso lo stato lo scrive Stripe e
 * l'abilitazione la concede EasyGame (ADR-0051).
 *
 * **Cosa resta, e perche resta.** Lo stato in parole — con **cosa manca**,
 * quando manca qualcosa — e il pulsante che apre il collegamento presso
 * Stripe. I dati del rappresentante legale li inserisce il rappresentante
 * legale, dentro Stripe: EasyGame non e un intermediario finanziario e non
 * deve custodire documenti di identita.
 *
 * La commissione si **mostra**. Nasconderla non la renderebbe piu bassa: la
 * renderebbe una sorpresa sull'estratto conto.
 */

type AccountView = {
  account: {
    state: ConnectAccountState;
    /** Chi e l'intermediario. Arriva dal record, non e scritto qui. */
    provider?: PaymentProviderKey;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    requirements: string[];
    onlinePaymentsEnabled: boolean;
    connected: boolean;
    lastSyncedAt: string | null;
  };
  readiness: { canCheckout: boolean; message: string; blocker: string | null };
  commission: { percent: number; fixedCents: number; effectiveFrom: string | null };
};

/**
 * Le due righe di stato che qualcuno legge davvero.
 *
 * «Attivi» e «Non attivi» e poco: la differenza fra «non incassi perche
 * mancano dei documenti» e «non incassi perche EasyGame non ti ha ancora
 * abilitato» decide chi deve muoversi, e senza si telefona.
 */
function CapabilityRow({
  label,
  enabled,
  hint,
}: {
  label: string;
  enabled: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right">
        <span
          className={cn(
            "text-sm font-medium",
            enabled ? "text-emerald-700" : "text-slate-500",
          )}
        >
          {enabled ? "Attivi" : "Non attivi"}
        </span>
        {hint ? (
          <span className="block text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </span>
    </div>
  );
}

const TONE_CLASS: Record<string, string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  danger: "border-red-200 bg-red-50 text-red-700",
};

export function ClubPaymentAccountPanel({
  organizationId,
}: {
  organizationId?: string | null;
}) {
  const { showToast } = useToast();
  const [view, setView] = useState<AccountView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const response = await apiRequest<AccountView>(
      organizationId
        ? `/api/v1/payments/account?organization_id=${encodeURIComponent(organizationId)}`
        : "/api/v1/payments/account",
    );

    if (response.error || !response.data) {
      showToast(
        "error",
        response.error?.message || "Errore nella lettura del conto di incasso",
      );
      setLoading(false);
      return;
    }

    setView(response.data);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const openOnboarding = async () => {
    setBusy(true);
    const response = await apiRequest<{ url: string }>(
      "/api/v1/payments/account",
      {
        method: "POST",
        body: {
          action: "onboarding_link",
          organization_id: organizationId,
        },
      },
    );
    setBusy(false);

    if (response.error || !response.data?.url) {
      showToast(
        "error",
        response.error?.message || "Collegamento non disponibile",
      );
      return;
    }

    /*
      Il link scade: si apre subito invece di mostrarlo. Un indirizzo di
      attivazione riutilizzabile e a tutti gli effetti una credenziale, e per
      email girerebbe finche qualcuno non lo trova.
    */
    try {
      if (!openExternalUrl(response.data.url)) {
        showToast("error", "Il browser ha bloccato la scheda: consenti i popup e riprova");
      }
    } catch {
      showToast("error", "Il collegamento ricevuto non e valido");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Caricamento stato pagamenti…
      </div>
    );
  }

  if (!view) return null;

  const definition =
    CONNECT_ACCOUNT_STATE_DEFINITIONS[view.account.state] ||
    CONNECT_ACCOUNT_STATE_DEFINITIONS.not_configured;

  const canRequestLink =
    view.account.onlinePaymentsEnabled &&
    view.account.state !== "active" &&
    view.account.state !== "disabled";

  /*
    Chi e l'intermediario, per nome. Il registro dei provider prevede che un
    domani non sia Stripe: il marchio si mostra a Stripe, il nome a chiunque
    altro, e la pagina non contiene la parola «Stripe» scritta a mano.
  */
  const providerKey = (view.account.provider || "stripe") as PaymentProviderKey;
  const providerDefinition = getPaymentProviderDefinition(providerKey);
  const providerLabel = providerDefinition?.label || "Provider di pagamento";
  const isStripe = providerKey === "stripe";

  /** Il collegamento c'e ed e completo: non serve altro da nessuno. */
  const fullyConfigured =
    view.account.state === "active" &&
    view.account.chargesEnabled &&
    view.account.payoutsEnabled;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-base">
            <span className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" aria-hidden />
              Conto di incasso online
            </span>
            {/*
              Il marchio sta **qui e solo qui**: nel punto in cui si decide di
              collegare un conto. Non su ogni rata e non su ogni movimento —
              nello storico basta «Metodo: Stripe / Carta online».
            */}
            {isStripe ? (
              <StripeBrandBadge connected={view.account.connected} />
            ) : (
              <span className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium">
                {providerLabel}
                <span className="h-4 w-px bg-slate-200" aria-hidden />
                <span className="text-xs font-medium text-slate-500">
                  {view.account.connected ? "Collegato" : "Non collegato"}
                </span>
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={cn("rounded-md border p-3", TONE_CLASS[definition.tone])}
          >
            <p className="text-sm font-medium">
              {fullyConfigured ? definition.label : "Configurazione incompleta"}
            </p>
            <p className="mt-1 text-sm">{definition.description}</p>
          </div>

          {/*
            Le due capacita, separate. Un conto puo incassare e non poter
            ancora versare: sono due verifiche diverse presso l'intermediario,
            e riassumerle in una sola riga nasconde proprio il caso in cui
            qualcuno deve fare qualcosa.
          */}
          <div className="rounded-md border px-3 py-1.5">
            <CapabilityRow
              label="Pagamenti online"
              enabled={view.readiness.canCheckout}
              hint={view.readiness.canCheckout ? undefined : view.readiness.message}
            />
            <CapabilityRow
              label="Payout"
              enabled={view.account.payoutsEnabled}
              hint={
                view.account.payoutsEnabled
                  ? undefined
                  : `${providerLabel} non ha ancora abilitato i versamenti sul conto della societa.`
              }
            />
          </div>

          {view.account.requirements.length ? (
            <div className="rounded-md border p-3">
              <p className="text-sm font-medium">
                Cosa chiede {providerLabel}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                {view.account.requirements.slice(0, 6).map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Questi dati si inseriscono presso {providerLabel}, non qui:
                EasyGame non raccoglie documenti di identita.
              </p>
            </div>
          ) : null}

          <div className="rounded-md border p-3">
            <p className="text-sm text-muted-foreground">
              Commissione EasyGame
            </p>
            <p className="mt-1 text-lg font-semibold">
              {formatCommissionPercent(view.commission.percent)}
              {view.commission.fixedCents
                ? ` + ${(view.commission.fixedCents / 100).toFixed(2)} €`
                : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Trattenuta su ogni incasso online. La stabilisce EasyGame.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {canRequestLink ? (
              <Button onClick={openOnboarding} disabled={busy} className="gap-2">
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <ExternalLink className="h-4 w-4" aria-hidden />
                )}
                {/*
                  La CTA dice cosa succede adesso, non cosa e successo prima:
                  «Completa la configurazione» quando manca qualcosa,
                  «Gestisci l'account» quando e tutto a posto.
                */}
                {view.account.connected
                  ? `Completa la configurazione su ${providerLabel}`
                  : `Collega il conto con ${providerLabel}`}
              </Button>
            ) : null}
            {fullyConfigured ? (
              <Button
                variant="outline"
                onClick={openOnboarding}
                disabled={busy || !view.account.onlinePaymentsEnabled}
                className="gap-2"
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                Gestisci account {providerLabel}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={load} className="gap-2">
              <RefreshCw className="h-4 w-4" aria-hidden />
              Aggiorna
            </Button>
          </div>
        </CardContent>
      </Card>

      <Alert>
        <Info className="h-4 w-4" aria-hidden />
        <AlertTitle>Chi decide cosa</AlertTitle>
        <AlertDescription>
          L&apos;attivazione del servizio e la commissione le stabilisce
          EasyGame. La verifica del conto la fa {providerLabel}, sui dati che
          inserisce il rappresentante legale della societa. EasyGame non
          richiede, non salva e non processa numeri di carta.
        </AlertDescription>
      </Alert>
    </div>
  );
}
