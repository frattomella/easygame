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
import { normalizePaymentSettings } from "@/lib/payments/payment-config-utils";
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
