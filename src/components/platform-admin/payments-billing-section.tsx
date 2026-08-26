"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Landmark,
  Link2,
  Loader2,
  Percent,
  RefreshCw,
  Receipt,
  Save,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
 * «Pagamenti & Billing»: il centro di controllo commerciale della piattaforma.
 *
 * **Perche quattro schede e non una pagina.** Sono quattro domini con quattro
 * proprietari diversi di fatto — chi vende (commissioni), chi assiste
 * (Connect), chi amministra il prodotto (billing EasyGame), chi risponde della
 * fiscalita — e in una pagina sola si sarebbero pestati i piedi. La divisione
 * segue la domanda che uno si fa arrivando qui, non la struttura dei dati.
 *
 * **Cosa questa schermata non mostra mai.** Chiavi segrete di Stripe: non
 * stanno nel database e non passano dall'API. Qui si legge **se** un ambiente
 * e configurato, non con cosa.
 *
 * **Gli identificativi tecnici stanno nei dettagli, non nelle colonne.**
 * `acct_1S...` non dice niente a nessuno finche non serve per riconciliare; in
 * elenco si legge il nome della societa e lo stato in parole.
 */

type ConnectAccount = {
  organizationId: string;
  provider: string;
  externalAccountId: string | null;
  accountType: "standard" | "express";
  state: ConnectAccountState;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirements: string[];
  onlinePaymentsEnabled: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
};

type BillingAccount = {
  plan: "free" | "plus";
  status: string;
  currentPeriodEnd: string | null;
  externalCustomerId: string | null;
  externalSubscriptionId: string | null;
  lastError: string | null;
};

type Commission = {
  percent: number;
  fixedCents: number;
  origin: "club" | "platform" | "fallback";
  effectiveFrom: string | null;
  note: string | null;
};

type ClubRow = {
  id: string;
  name: string;
  city?: string | null;
  account: ConnectAccount;
  billing: BillingAccount;
  commission: Commission;
};

type Overview = {
  stripe: {
    connectConfigured: boolean;
    billingConfigured: boolean;
    connect: {
      accountType: "standard" | "express";
      defaultCountry: string;
      onboardingEnabled: boolean;
    };
    billing: {
      prices: { plusMonthly: string; plusAnnual: string };
      customerPortalEnabled: boolean;
    };
  };
  fiscal: {
    providerKey: string | null;
    environment: "sandbox" | "production";
    capability: { canTransmit: boolean; message: string };
  };
  commission: {
    standard: Commission;
    history: Array<{
      id: string;
      percent: number;
      fixedCents: number;
      effectiveFrom: string;
      note: string | null;
    }>;
  };
  clubs: ClubRow[];
  events: Array<{
    id: string;
    provider: string;
    flow: string;
    type: string;
    status: string;
    error: string | null;
    receivedAt: string;
  }>;
};

const TONE_CLASS: Record<string, string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  danger: "border-red-200 bg-red-50 text-red-700",
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("it-IT");
};

/** Lo stato di un account connesso, in parole e con il tono giusto. */
function ConnectStateBadge({ state }: { state: ConnectAccountState }) {
  const definition =
    CONNECT_ACCOUNT_STATE_DEFINITIONS[state] ||
    CONNECT_ACCOUNT_STATE_DEFINITIONS.not_configured;

  return (
    <Badge
      variant="outline"
      className={cn("font-medium", TONE_CLASS[definition.tone])}
      title={definition.description}
    >
      {definition.label}
    </Badge>
  );
}

function ConfigurationRow({
  label,
  configured,
  detail,
}: {
  label: string;
  configured: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      {configured ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
      ) : (
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      )}
    </div>
  );
}

export function PaymentsBillingSection() {
  const { showToast } = useToast();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [standardPercent, setStandardPercent] = useState("");
  const [standardFixed, setStandardFixed] = useState("0");
  const [standardNote, setStandardNote] = useState("");
  const [overrideDraft, setOverrideDraft] = useState<Record<string, string>>({});
  const [priceMonthly, setPriceMonthly] = useState("");
  const [priceAnnual, setPriceAnnual] = useState("");

  const load = async () => {
    setLoading(true);
    const response = await apiRequest<Overview>("/api/v1/platform/payments");

    if (response.error || !response.data) {
      showToast(
        "error",
        response.error?.message || "Errore nella lettura della configurazione",
      );
      setLoading(false);
      return;
    }

    setOverview(response.data);
    setStandardPercent(String(response.data.commission.standard.percent));
    setStandardFixed(String(response.data.commission.standard.fixedCents || 0));
    setPriceMonthly(response.data.stripe.billing.prices.plusMonthly || "");
    setPriceAnnual(response.data.stripe.billing.prices.plusAnnual || "");
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    const response = await apiRequest("/api/v1/platform/payments", {
      method: "POST",
      body: body,
    });
    setBusy(null);

    if (response.error) {
      showToast("error", response.error.message || "Operazione non riuscita");
      return null;
    }

    await load();
    return response.data as any;
  };

  const clubsWithOnline = useMemo(
    () =>
      (overview?.clubs || []).filter(
        (club) => club.account.onlinePaymentsEnabled,
      ).length,
    [overview],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Caricamento configurazione pagamenti…
      </div>
    );
  }

  if (!overview) return null;

  return (
    <Tabs defaultValue="commissioni" className="space-y-4">
      {/*
        Le quattro schede scorrono orizzontalmente sotto i 768 px invece di
        andare a capo: quattro etichette impilate spingerebbero il contenuto
        sotto la piega su un telefono.
      */}
      <TabsList className="flex w-full justify-start overflow-x-auto">
        <TabsTrigger value="commissioni" className="shrink-0">
          Commissioni
        </TabsTrigger>
        <TabsTrigger value="connect" className="shrink-0">
          Stripe Connect
        </TabsTrigger>
        <TabsTrigger value="billing" className="shrink-0">
          Billing EasyGame
        </TabsTrigger>
        <TabsTrigger value="fiscalita" className="shrink-0">
          Fiscalita
        </TabsTrigger>
      </TabsList>

      {/* ------------------------------------------------------ commissioni */}
      <TabsContent value="commissioni" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Percent className="h-5 w-5" />
              Commissione standard EasyGame
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Vale per ogni societa che non abbia una condizione dedicata. Una
              modifica **non** cambia i movimenti gia registrati: ogni incasso
              porta con se la commissione applicata quel giorno.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="standard-percent">Percentuale</Label>
                <Input
                  id="standard-percent"
                  inputMode="decimal"
                  value={standardPercent}
                  onChange={(event) => setStandardPercent(event.target.value)}
                  placeholder="1,00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="standard-fixed">Quota fissa (centesimi)</Label>
                <Input
                  id="standard-fixed"
                  inputMode="numeric"
                  value={standardFixed}
                  onChange={(event) => setStandardFixed(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="standard-note">Nota</Label>
                <Input
                  id="standard-note"
                  value={standardNote}
                  onChange={(event) => setStandardNote(event.target.value)}
                  placeholder="Perche questa condizione"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() =>
                  send(
                    {
                      operation: "commission",
                      percent: Number(standardPercent.replace(",", ".")),
                      fixed_cents: Number(standardFixed) || 0,
                      note: standardNote || undefined,
                    },
                    "standard",
                  ).then((result) => {
                    if (result) {
                      setStandardNote("");
                      showToast("success", "Condizione standard aggiornata");
                    }
                  })
                }
                disabled={busy === "standard"}
                className="gap-2"
              >
                {busy === "standard" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Applica da adesso
              </Button>
              <p className="text-sm text-muted-foreground">
                In vigore:{" "}
                <strong>
                  {formatCommissionPercent(overview.commission.standard.percent)}
                </strong>
                {overview.commission.standard.fixedCents
                  ? ` + ${(overview.commission.standard.fixedCents / 100).toFixed(2)} €`
                  : ""}
                {overview.commission.standard.origin === "fallback"
                  ? " (valore di riserva: nessuna condizione ancora scritta)"
                  : ` dal ${formatDate(overview.commission.standard.effectiveFrom)}`}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Condizioni per societa</CardTitle>
            <p className="text-sm text-muted-foreground">
              Un valore vuoto significa «usa la condizione standard».
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {overview.clubs.map((club) => (
              <div
                key={club.id}
                className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{club.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {club.commission.origin === "club"
                      ? `Condizione dedicata: ${formatCommissionPercent(club.commission.percent)}`
                      : `Usa la condizione standard (${formatCommissionPercent(club.commission.percent)})`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Input
                    className="w-24"
                    inputMode="decimal"
                    placeholder="standard"
                    value={overrideDraft[club.id] ?? ""}
                    onChange={(event) =>
                      setOverrideDraft((current) => ({
                        ...current,
                        [club.id]: event.target.value,
                      }))
                    }
                    aria-label={`Commissione per ${club.name}`}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === `override-${club.id}`}
                    onClick={() =>
                      send(
                        {
                          operation: "commission",
                          organization_id: club.id,
                          percent: Number(
                            (overrideDraft[club.id] || "0").replace(",", "."),
                          ),
                        },
                        `override-${club.id}`,
                      ).then((result) => {
                        if (result) {
                          setOverrideDraft((current) => ({
                            ...current,
                            [club.id]: "",
                          }));
                          showToast("success", "Condizione dedicata applicata");
                        }
                      })
                    }
                  >
                    Applica
                  </Button>
                  {club.commission.origin === "club" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === `reset-${club.id}`}
                      onClick={() =>
                        send(
                          {
                            operation: "commission_reset",
                            organization_id: club.id,
                          },
                          `reset-${club.id}`,
                        )
                      }
                    >
                      Standard
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Storico delle condizioni standard
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overview.commission.history.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nessuna condizione ancora scritta.
              </p>
            ) : (
              overview.commission.history.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b py-2 text-sm last:border-b-0"
                >
                  <span className="font-medium">
                    {formatCommissionPercent(entry.percent)}
                    {entry.fixedCents
                      ? ` + ${(entry.fixedCents / 100).toFixed(2)} €`
                      : ""}
                  </span>
                  <span className="text-muted-foreground">
                    dal {formatDate(entry.effectiveFrom)}
                    {entry.note ? ` — ${entry.note}` : ""}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* --------------------------------------------------------- connect */}
      <TabsContent value="connect" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-5 w-5" />
              Stato dell&apos;integrazione
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <ConfigurationRow
              label="Credenziali Stripe"
              configured={overview.stripe.connectConfigured}
              detail={
                overview.stripe.connectConfigured
                  ? "La chiave segreta e presente su questo ambiente"
                  : "Manca STRIPE_SECRET_KEY: nessun checkout puo aprirsi"
              }
            />
            <ConfigurationRow
              label="Societa con incassi online attivi"
              configured={clubsWithOnline > 0}
              detail={`${clubsWithOnline} su ${overview.clubs.length}`}
            />
            <div className="space-y-2 rounded-md border p-3">
              <Label>Tipo di account per i nuovi collegamenti</Label>
              <p className="text-xs text-muted-foreground">
                <strong>Scelta irreversibile</strong> per gli account gia
                creati: cambiarla qui vale solo per i collegamenti successivi.
              </p>
              <p className="text-sm font-medium">
                {overview.stripe.connect.accountType === "express"
                  ? "Express"
                  : "Standard"}
              </p>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Nuovi collegamenti</Label>
                <p className="text-xs text-muted-foreground">
                  Sospenderli non tocca quelli esistenti.
                </p>
              </div>
              <Switch
                checked={overview.stripe.connect.onboardingEnabled}
                onCheckedChange={(checked) =>
                  send(
                    {
                      operation: "settings",
                      connect: { onboardingEnabled: checked },
                    },
                    "onboarding-toggle",
                  )
                }
                aria-label="Consenti nuovi collegamenti"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conti di incasso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.clubs.map((club) => (
              <div key={club.id} className="rounded-md border p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{club.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <ConnectStateBadge state={club.account.state} />
                      {club.account.chargesEnabled ? (
                        <Badge variant="outline" className="text-xs">
                          Incassa
                        </Badge>
                      ) : null}
                      {club.account.payoutsEnabled ? (
                        <Badge variant="outline" className="text-xs">
                          Riceve versamenti
                        </Badge>
                      ) : null}
                    </div>
                    {club.account.requirements.length ? (
                      <p className="mt-2 text-xs text-amber-700">
                        Richiesto dal provider:{" "}
                        {club.account.requirements.slice(0, 4).join(", ")}
                        {club.account.requirements.length > 4 ? "…" : ""}
                      </p>
                    ) : null}
                    {club.account.lastError ? (
                      <p className="mt-2 text-xs text-red-700">
                        {club.account.lastError}
                      </p>
                    ) : null}
                    {/*
                      L'identificativo tecnico sta qui, in fondo e in piccolo:
                      serve solo a chi deve riconciliare sul cruscotto Stripe.
                    */}
                    {club.account.externalAccountId ? (
                      <p className="mt-2 font-mono text-xs text-muted-foreground">
                        {club.account.externalAccountId} ·{" "}
                        {club.account.accountType} · sincronizzato{" "}
                        {formatDateTime(club.account.lastSyncedAt)}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={busy === `onboard-${club.id}`}
                      onClick={() =>
                        send(
                          {
                            operation: "connect_onboarding",
                            organization_id: club.id,
                            return_url: `${window.location.origin}/organization?connect=done`,
                            refresh_url: `${window.location.origin}/organization?connect=refresh`,
                          },
                          `onboard-${club.id}`,
                        ).then((result) => {
                          if (result?.url) {
                            /*
                              Il link si apre, non si copia in un campo: scade,
                              ed e a tutti gli effetti una credenziale
                              temporanea da consegnare al rappresentante.
                            */
                            openExternalUrl(result.url);
                          }
                        })
                      }
                    >
                      {busy === `onboard-${club.id}` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Link2 className="h-3.5 w-3.5" />
                      )}
                      {club.account.externalAccountId ? "Riapri" : "Collega"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1"
                      disabled={
                        busy === `sync-${club.id}` ||
                        !club.account.externalAccountId
                      }
                      onClick={() =>
                        send(
                          { operation: "connect_sync", organization_id: club.id },
                          `sync-${club.id}`,
                        )
                      }
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Sincronizza
                    </Button>
                    <Switch
                      checked={club.account.onlinePaymentsEnabled}
                      onCheckedChange={(checked) =>
                        send(
                          {
                            operation: "connect_toggle",
                            organization_id: club.id,
                            enabled: checked,
                          },
                          `toggle-${club.id}`,
                        )
                      }
                      aria-label={`Pagamenti online per ${club.name}`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ultimi eventi ricevuti</CardTitle>
            <p className="text-sm text-muted-foreground">
              Tipo, esito e ora. Il corpo dell&apos;evento non viene conservato:
              contiene l&apos;email di chi paga.
            </p>
          </CardHeader>
          <CardContent className="space-y-1">
            {overview.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nessun evento ricevuto finora.
              </p>
            ) : (
              overview.events.map((event) => (
                <div
                  key={event.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b py-2 text-sm last:border-b-0"
                >
                  <span className="font-mono text-xs">{event.type}</span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        event.status === "failed"
                          ? TONE_CLASS.danger
                          : event.status === "ignored"
                            ? TONE_CLASS.neutral
                            : TONE_CLASS.success,
                      )}
                    >
                      {event.status}
                    </Badge>
                    {event.flow === "platform" ? "billing" : "connect"} ·{" "}
                    {formatDateTime(event.receivedAt)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* --------------------------------------------------------- billing */}
      <TabsContent value="billing" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Landmark className="h-5 w-5" />
              Abbonamenti EasyGame
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Il denaro che le societa versano a Cedi Soft, sull&apos;account
              Stripe centrale. Non ha nulla a che vedere con gli incassi degli
              atleti.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <ConfigurationRow
              label="Credenziali account centrale"
              configured={overview.stripe.billingConfigured}
              detail={
                overview.stripe.billingConfigured
                  ? "La chiave segreta e presente su questo ambiente"
                  : "Manca STRIPE_SECRET_KEY"
              }
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="price-monthly">Prezzo Plus mensile</Label>
                <Input
                  id="price-monthly"
                  value={priceMonthly}
                  onChange={(event) => setPriceMonthly(event.target.value)}
                  placeholder="price_..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price-annual">Prezzo Plus annuale</Label>
                <Input
                  id="price-annual"
                  value={priceAnnual}
                  onChange={(event) => setPriceAnnual(event.target.value)}
                  placeholder="price_..."
                />
              </div>
            </div>

            <Button
              className="gap-2"
              disabled={busy === "prices"}
              onClick={() =>
                send(
                  {
                    operation: "settings",
                    billing: {
                      prices: {
                        plusMonthly: priceMonthly,
                        plusAnnual: priceAnnual,
                      },
                    },
                  },
                  "prices",
                ).then((result) => {
                  if (result) showToast("success", "Listino aggiornato");
                })
              }
            >
              {busy === "prices" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salva listino
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Abbonamenti per societa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overview.clubs.map((club) => (
              <div
                key={club.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm last:border-b-0"
              >
                <span className="min-w-0 truncate font-medium">{club.name}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">
                    {club.billing.plan === "plus" ? "Plus" : "Free"}
                  </Badge>
                  {club.billing.status}
                  {club.billing.currentPeriodEnd
                    ? ` · fino al ${formatDate(club.billing.currentPeriodEnd)}`
                    : ""}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ------------------------------------------------------- fiscalita */}
      <TabsContent value="fiscalita" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-5 w-5" />
              Fatturazione elettronica
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={cn(
                "rounded-md border p-3 text-sm",
                overview.fiscal.capability.canTransmit
                  ? TONE_CLASS.success
                  : TONE_CLASS.warning,
              )}
            >
              <p className="font-medium">
                {overview.fiscal.capability.canTransmit
                  ? "Trasmissione attiva"
                  : "Trasmissione non attiva"}
              </p>
              <p className="mt-1">{overview.fiscal.capability.message}</p>
            </div>

            <div className="rounded-md border p-3">
              <p className="text-sm font-medium">Cosa EasyGame fa oggi</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>
                  emette fatture numerate, con lo snapshot dei dati al momento
                  dell&apos;emissione;
                </li>
                <li>
                  genera e valida il tracciato FatturaPA, che si puo scaricare e
                  consegnare;
                </li>
                <li>
                  <strong>non</strong> trasmette allo SdI, e nessun documento
                  viene marcato come trasmesso.
                </li>
              </ul>
            </div>

            <div className="rounded-md border p-3">
              <p className="text-sm font-medium">Ambiente</p>
              <p className="text-sm text-muted-foreground">
                {overview.fiscal.environment === "production"
                  ? "Produzione"
                  : "Sandbox"}
              </p>
            </div>

            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              La scelta dell&apos;intermediario accreditato e una decisione
              contrattuale di Cedi Soft: finche non viene presa, questa sezione
              resta in sola lettura.
            </p>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
