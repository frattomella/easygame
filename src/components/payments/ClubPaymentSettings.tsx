"use client";

import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { ClubPaymentSettings as ClubPaymentSettingsType } from "@/lib/payments/payment-types";
import {
  isProviderConfigUsableForRegistration,
  normalizePaymentSettings,
} from "@/lib/payments/payment-config-utils";
import { PaymentMethodEnablementTable } from "./PaymentMethodEnablementTable";
import { ClubPaymentAccountPanel } from "./ClubPaymentAccountPanel";

/**
 * La scheda **Pagamenti** della societa.
 *
 * **Cosa la societa governa davvero, dopo il Blocco D.** Un interruttore — se
 * accettare pagamenti online in questo momento — e quali metodi esporre in
 * Gestione Iscrizioni. Sono scelte operative: spegnere gli incassi durante la
 * chiusura estiva e una decisione della segreteria e nessuno gliela deve
 * togliere.
 *
 * **Cosa non governa piu, e non e una limitazione ma una riparazione.** Il
 * conto su cui il denaro arriva, lo stato di verifica e la commissione. Erano
 * tre campi modificabili da questa pagina: il primo decideva **dove finisce il
 * denaro delle famiglie**, il secondo **se si puo incassare**, il terzo
 * **quanto trattiene EasyGame**. Adesso i primi due li scrive Stripe e il
 * terzo lo decide Cedi Soft. Vedi ADR-0050 e ADR-0051.
 */

type ClubPaymentSettingsProps = {
  value: ClubPaymentSettingsType;
  onChange: (nextSettings: ClubPaymentSettingsType) => void;
  organizationId?: string | null;
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
  organizationId,
}: ClubPaymentSettingsProps) {
  const settings = normalizePaymentSettings(value);
  const availableCount = countAvailableRegistrationMethods(settings);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Accetta pagamenti online
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            L&apos;unico interruttore di questa pagina: sospende i pagamenti
            online senza disfare il collegamento del conto.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border p-3">
            <p className="text-sm text-muted-foreground">Stato scelto dal club</p>
            <div className="mt-2 flex items-center gap-2">
              <Switch
                checked={settings.enabled}
                onCheckedChange={(checked) =>
                  onChange({ ...settings, enabled: checked })
                }
                aria-label="Abilita pagamenti online"
              />
              <Badge variant={settings.enabled ? "default" : "secondary"}>
                {settings.enabled ? "Attivi" : "Sospesi"}
              </Badge>
            </div>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-sm text-muted-foreground">Valuta</p>
            <p className="mt-2 text-lg font-semibold">EUR</p>
          </div>
        </CardContent>
      </Card>

      <ClubPaymentAccountPanel organizationId={organizationId} />

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Dati carta non salvati</AlertTitle>
        <AlertDescription>
          EasyGame non richiede, salva o processa numeri carta, CVV o PAN. Il
          pagamento avviene sulla pagina del provider.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Metodi disponibili in Gestione Iscrizioni
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Sono selezionabili solo i metodi il cui conto risulta operativo.
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
