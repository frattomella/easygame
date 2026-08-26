"use client";

import { useEffect, useState } from "react";
import { CreditCard, ExternalLink, Info, Loader2, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import {
  CONNECT_ACCOUNT_STATE_DEFINITIONS,
  type ConnectAccountState,
} from "@/lib/payments/connect-account";
import { formatCommissionPercent } from "@/lib/payments/commission";
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
        body: JSON.stringify({
          action: "onboarding_link",
          organization_id: organizationId,
        }),
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-5 w-5" />
            Conto di incasso online
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={cn("rounded-md border p-3", TONE_CLASS[definition.tone])}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="bg-white/60 font-medium">
                {definition.label}
              </Badge>
              {view.account.chargesEnabled ? (
                <Badge variant="outline" className="bg-white/60 text-xs">
                  Puo incassare
                </Badge>
              ) : null}
              {view.account.payoutsEnabled ? (
                <Badge variant="outline" className="bg-white/60 text-xs">
                  Riceve i versamenti
                </Badge>
              ) : null}
            </div>
            <p className="mt-2 text-sm">{definition.description}</p>
          </div>

          {view.account.requirements.length ? (
            <div className="rounded-md border p-3">
              <p className="text-sm font-medium">Cosa chiede il provider</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                {view.account.requirements.slice(0, 6).map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Questi dati si inseriscono presso il provider, non qui: EasyGame
                non raccoglie documenti di identita.
              </p>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
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
            <div className="rounded-md border p-3">
              <p className="text-sm text-muted-foreground">Incassi online</p>
              <p className="mt-1 text-lg font-semibold">
                {view.readiness.canCheckout ? "Attivi" : "Non disponibili"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {view.readiness.message}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {canRequestLink ? (
              <Button onClick={openOnboarding} disabled={busy} className="gap-2">
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )}
                {view.account.connected
                  ? "Riprendi il collegamento"
                  : "Collega il conto"}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={load} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Aggiorna
            </Button>
          </div>
        </CardContent>
      </Card>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Chi decide cosa</AlertTitle>
        <AlertDescription>
          L&apos;attivazione del servizio e la commissione le stabilisce
          EasyGame. La verifica del conto la fa il provider di pagamento, sui
          dati che inserisce il rappresentante legale della societa. EasyGame non
          richiede, non salva e non processa numeri di carta.
        </AlertDescription>
      </Alert>
    </div>
  );
}
