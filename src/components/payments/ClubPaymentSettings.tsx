"use client";

import { AlertTriangle, CreditCard } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type {
  ClubPaymentProviderConfig,
  ClubPaymentSettings as ClubPaymentSettingsType,
  PaymentProviderKey,
} from "@/lib/payments/payment-types";
import {
  isProviderConfigUsableForRegistration,
  normalizePaymentSettings,
} from "@/lib/payments/payment-config-utils";
import { PAYMENT_PROVIDER_ORDER } from "@/lib/payments/provider-registry";
import { PaymentMethodEnablementTable } from "./PaymentMethodEnablementTable";
import { PaymentProviderCard } from "./PaymentProviderCard";

type ClubPaymentSettingsProps = {
  value: ClubPaymentSettingsType;
  onChange: (nextSettings: ClubPaymentSettingsType) => void;
};

const countAvailableRegistrationMethods = (
  settings: ClubPaymentSettingsType,
) =>
  settings.enabledRegistrationMethods.filter((provider) =>
    isProviderConfigUsableForRegistration(settings.providers[provider]),
  ).length;

export function ClubPaymentSettings({
  value,
  onChange,
}: ClubPaymentSettingsProps) {
  const settings = normalizePaymentSettings(value);
  const availableCount = countAvailableRegistrationMethods(settings);

  const updateProvider = (
    provider: PaymentProviderKey,
    nextProvider: ClubPaymentProviderConfig,
  ) => {
    const nextSettings = {
      ...settings,
      providers: {
        ...settings.providers,
        [provider]: nextProvider,
      },
    };

    if (!isProviderConfigUsableForRegistration(nextProvider)) {
      nextSettings.enabledRegistrationMethods =
        nextSettings.enabledRegistrationMethods.filter(
          (item) => item !== provider,
        );
    }

    onChange(nextSettings);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Stato pagamenti online
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="rounded-md border p-3">
            <p className="text-sm text-muted-foreground">Pagamenti online</p>
            <div className="mt-2 flex items-center gap-2">
              <Switch
                checked={settings.enabled}
                onCheckedChange={(checked) =>
                  onChange({ ...settings, enabled: checked })
                }
                aria-label="Abilita pagamenti online"
              />
              <Badge variant={settings.enabled ? "default" : "secondary"}>
                {settings.enabled ? "Attivi" : "Disattivi"}
              </Badge>
            </div>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-sm text-muted-foreground">Valuta</p>
            <p className="mt-2 text-lg font-semibold">EUR</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-sm text-muted-foreground">Modalita</p>
            <p className="mt-2 text-lg font-semibold">
              {Object.values(settings.providers).some(
                (provider) => provider.mode === "live",
              )
                ? "Live"
                : "Test"}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-sm text-muted-foreground">
              Commissione piattaforma
            </p>
            <p className="mt-2 text-lg font-semibold">
              {settings.platformFeePercent}%
            </p>
          </div>
        </CardContent>
      </Card>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Dati carta non salvati</AlertTitle>
        <AlertDescription>
          EasyGame non richiede, salva o processa numeri carta, CVV o PAN. I
          pagamenti online sono predisposti per provider esterni server-side.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 xl:grid-cols-3">
        {PAYMENT_PROVIDER_ORDER.map((provider) => (
          <PaymentProviderCard
            key={provider}
            provider={provider}
            value={settings.providers[provider]}
            onChange={(nextProvider) => updateProvider(provider, nextProvider)}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Metodi disponibili in Gestione Iscrizioni</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sono selezionabili solo provider abilitati e configurati nel club.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <PaymentMethodEnablementTable settings={settings} onChange={onChange} />
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label>Metodi online pronti per le iscrizioni</Label>
            <Badge variant={availableCount > 0 ? "default" : "secondary"}>
              {availableCount}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
