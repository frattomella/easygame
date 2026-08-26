"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Minus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import {
  describeCediPayReadiness,
  CEDIPAY_PROVIDERS,
} from "@/lib/payments/cedipay/index";
import {
  HUB_EXTRA_SERVICE_DEFINITIONS,
  normalizePaymentSettings,
} from "@/lib/payments/payment-config-utils";
import type { EntitlementReason } from "@/lib/entitlements";

/**
 * Servizi e piani di un club, dalla console di piattaforma.
 *
 * **Cosa risponde questa schermata.** «Perche questa societa non vede i
 * pagamenti online?» — una domanda che oggi arriva al telefono e a cui si
 * rispondeva aprendo il database. Le risposte possibili sono quattro e sono
 * diverse fra loro: il piano non la comprende, l'abbonamento non e in corso,
 * il servizio non e attivo, o qualcuno l'ha revocata a mano. La colonna
 * «motivo» dice quale.
 *
 * **Perche non e un ERP.** Non ci sono fatture verso Cedi, non c'e un
 * listino modificabile, non c'e la contabilita della piattaforma. C'e cio che
 * serve a rispondere al telefono e a sbloccare un cliente: leggere lo stato e
 * concedere o revocare una funzione.
 *
 * **Perche le eccezioni sono tre valori e non due.** Togliere l'eccezione
 * (`—`) riporta la funzione alla regola del listino; `no` la vieta anche a
 * chi il listino la comprende. Con due soli valori «rimetti com'era»
 * sarebbe irraggiungibile.
 */

type ClubOption = {
  id: string;
  name: string;
  city?: string | null;
  settings?: any;
};

type FeatureVerdict = {
  key: string;
  label: string;
  area: string | null;
  allowed: boolean;
  reason: EntitlementReason;
  message: string;
};

type EntitlementsPayload = {
  organizationId: string;
  plan: "free" | "plus";
  effectivePlan: "free" | "plus";
  subscriptionStatus: string;
  activeExtras: string[];
  features: FeatureVerdict[];
};

const REASON_LABELS: Record<string, string> = {
  included_in_plan: "Compresa nel piano",
  unlocked_by_extra: "Servizio attivo",
  granted_by_platform: "Concessa da Cedi",
  revoked_by_platform: "Revocata da Cedi",
  requires_plan: "Richiede un piano superiore",
  requires_extra: "Richiede un servizio aggiuntivo",
  subscription_inactive: "Abbonamento non in corso",
  platform_admin: "Vista da amministratore",
  unknown_feature: "Sconosciuta",
};

const PLAN_LABELS: Record<string, string> = { free: "Free", plus: "Plus" };

/**
 * Gli stati in cui un abbonamento puo trovarsi.
 *
 * `past_due` e `cancelled` sono due cose diverse e restano separate: un
 * pagamento in ritardo non spegne il gestionale (vedi `PAYING_STATUSES` nel
 * calcolo), una disdetta si.
 */
const SUBSCRIPTION_STATUSES = [
  { value: "not_active", label: "Non attivo" },
  { value: "trialing", label: "In prova" },
  { value: "active", label: "Attivo" },
  { value: "past_due", label: "In ritardo" },
  { value: "cancelled", label: "Disdetto" },
  { value: "expired", label: "Scaduto" },
] as const;

export function ClubServicesSection({ clubs }: { clubs: ClubOption[] }) {
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [payload, setPayload] = useState<EntitlementsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return clubs.slice(0, 25);

    return clubs
      .filter((club) =>
        `${club.name} ${club.city || ""}`.toLowerCase().includes(query),
      )
      .slice(0, 25);
  }, [clubs, search]);

  const selected = useMemo(
    () => clubs.find((club) => club.id === selectedId) || null,
    [clubs, selectedId],
  );

  const load = useCallback(
    async (organizationId: string) => {
      if (!organizationId) return;
      setLoading(true);

      const { data, error } = await apiRequest<EntitlementsPayload>(
        `/api/v1/entitlements?organization_id=${encodeURIComponent(organizationId)}`,
      );

      setLoading(false);

      if (error) {
        showToast("error", error.message || "Servizi del club non leggibili");
        return;
      }

      setPayload(data);
    },
    [showToast],
  );

  useEffect(() => {
    if (selectedId) void load(selectedId);
  }, [selectedId, load]);

  const setOverride = async (key: string, value: boolean | null) => {
    if (!selectedId) return;
    setBusyKey(key);

    const { error } = await apiRequest("/api/v1/entitlements", {
      method: "POST",
      body: { organization_id: selectedId, key, value },
    });

    setBusyKey(null);

    if (error) {
      showToast("error", error.message || "Modifica non riuscita");
      return;
    }

    showToast("success", "Servizi del club aggiornati");
    await load(selectedId);
  };

  /**
   * Il piano di una societa si cambia **qui e solo qui**.
   *
   * Era un campo della pagina Organizzazione, cioe una scelta della societa:
   * un club poteva concedersi il piano superiore da solo. Da ADR-0048 la
   * scrittura passa da questa console e dal ruolo `platform_admin`, e ogni
   * cambio finisce nell'audit — perche «chi ha messo questo club in Plus?» e
   * una domanda commerciale, non tecnica, e va potuta rileggere.
   */
  const changePlan = async (updates: {
    plan?: string;
    status?: string;
    renewal_date?: string;
  }) => {
    if (!selectedId) return;
    setBusyKey("__plan__");

    const { error } = await apiRequest("/api/v1/entitlements", {
      method: "POST",
      body: { organization_id: selectedId, operation: "plan", ...updates },
    });

    setBusyKey(null);

    if (error) {
      showToast("error", error.message || "Cambio piano non riuscito");
      return;
    }

    showToast("success", "Piano aggiornato");
    await load(selectedId);
  };

  const changeService = async (key: string, enabled: boolean) => {
    if (!selectedId) return;
    setBusyKey(`service:${key}`);

    const { error } = await apiRequest("/api/v1/entitlements", {
      method: "POST",
      body: {
        organization_id: selectedId,
        operation: "service",
        key,
        value: enabled,
      },
    });

    setBusyKey(null);

    if (error) {
      showToast("error", error.message || "Modifica del servizio non riuscita");
      return;
    }

    showToast("success", enabled ? "Servizio attivato" : "Servizio disattivato");
    await load(selectedId);
  };

  /*
    Lo stato del provider di pagamento si legge dalle stesse impostazioni che
    usa il server, con la stessa funzione: una seconda lettura qui direbbe
    prima o poi una cosa diversa da quella che vede chi paga.
  */
  const paymentReadiness = useMemo(() => {
    if (!selected) return null;

    const settings = normalizePaymentSettings(
      selected.settings?.paymentSettings,
    );
    const provider =
      settings.enabledRegistrationMethods.find(
        (key) => settings.providers[key]?.enabled,
      ) || "stripe";

    return {
      provider,
      readiness: describeCediPayReadiness({
        provider,
        enabledByClub: Boolean(
          settings.enabled && settings.providers[provider]?.enabled,
        ),
        merchantExternalId: settings.providers[provider]?.connectedAccountId,
        merchantChargesEnabled:
          settings.providers[provider]?.status === "active",
      }),
    };
  }, [selected]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Servizi e piani</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cerca la societa per nome o citta"
            aria-label="Cerca la societa"
          />

          <div className="flex flex-wrap gap-2">
            {filtered.map((club) => (
              <Button
                key={club.id}
                type="button"
                size="sm"
                variant={club.id === selectedId ? "default" : "outline"}
                onClick={() => setSelectedId(club.id)}
              >
                {club.name}
              </Button>
            ))}
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nessuna societa corrisponde alla ricerca.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {selected && payload ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{selected.name}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Piano
                </p>
                <Badge>{PLAN_LABELS[payload.plan] || payload.plan}</Badge>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Piano che vale
                </p>
                <p className="text-sm">
                  {PLAN_LABELS[payload.effectivePlan] || payload.effectivePlan}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Abbonamento
                </p>
                <p className="text-sm">{payload.subscriptionStatus}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Servizi attivi
                </p>
                <p className="text-sm">
                  {payload.activeExtras.length
                    ? payload.activeExtras.join(", ")
                    : "Nessuno"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Piano e servizi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Il club vede queste informazioni in sola lettura. Si cambiano
                da qui, e ogni cambio resta nell&apos;audit.
              </p>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Piano
                </p>
                <div className="flex flex-wrap gap-2">
                  {(["free", "plus"] as const).map((plan) => (
                    <Button
                      key={plan}
                      type="button"
                      size="sm"
                      variant={payload.plan === plan ? "default" : "outline"}
                      disabled={busyKey === "__plan__"}
                      onClick={() => changePlan({ plan })}
                    >
                      {PLAN_LABELS[plan]}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Abbonamento
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUBSCRIPTION_STATUSES.map((status) => (
                    <Button
                      key={status.value}
                      type="button"
                      size="sm"
                      variant={
                        payload.subscriptionStatus === status.value
                          ? "default"
                          : "outline"
                      }
                      disabled={busyKey === "__plan__"}
                      onClick={() => changePlan({ status: status.value })}
                    >
                      {status.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Rinnovo
                </p>
                <Input
                  type="date"
                  className="max-w-xs"
                  defaultValue=""
                  aria-label="Data di rinnovo dell'abbonamento"
                  disabled={busyKey === "__plan__"}
                  onChange={(event) =>
                    changePlan({ renewal_date: event.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Servizi aggiuntivi
                </p>
                <div className="space-y-2">
                  {HUB_EXTRA_SERVICE_DEFINITIONS.map((service) => {
                    const active = payload.activeExtras.includes(service.key);
                    return (
                      <div
                        key={service.key}
                        className="flex flex-col gap-2 rounded-2xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="text-sm font-medium">{service.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {service.description}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={active ? "default" : "outline"}
                          disabled={busyKey === `service:${service.key}`}
                          onClick={() => changeService(service.key, !active)}
                        >
                          {active ? "Disattiva" : "Attiva"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {paymentReadiness ? (
            <Card>
              <CardHeader>
                <CardTitle>Incassi online</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm">
                  Provider:{" "}
                  {CEDIPAY_PROVIDERS[paymentReadiness.provider]?.label ||
                    paymentReadiness.provider}
                </p>
                <p className="text-sm text-muted-foreground">
                  {paymentReadiness.readiness.message}
                </p>
                {paymentReadiness.readiness.blocker ? (
                  <Badge variant="outline">
                    {paymentReadiness.readiness.blocker}
                  </Badge>
                ) : (
                  <Badge>Attivi</Badge>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Funzioni</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {payload.features.map((feature) => (
                <div
                  key={feature.key}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{feature.label}</p>
                      <Badge variant={feature.allowed ? "default" : "outline"}>
                        {feature.allowed ? "Attiva" : "Non attiva"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {REASON_LABELS[feature.reason] || feature.reason} —{" "}
                      {feature.message}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyKey === feature.key}
                      onClick={() => setOverride(feature.key, true)}
                      aria-label={`Concedi ${feature.label}`}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyKey === feature.key}
                      onClick={() => setOverride(feature.key, null)}
                      aria-label={`Togli l'eccezione su ${feature.label}`}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyKey === feature.key}
                      onClick={() => setOverride(feature.key, false)}
                      aria-label={`Revoca ${feature.label}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {loading
            ? "Lettura dei servizi in corso…"
            : "Scegli una societa per vedere piano, servizi e funzioni attive."}
        </p>
      )}
    </div>
  );
}
