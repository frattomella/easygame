"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type {
  HubExtraBillingStatus,
  HubExtraService,
  HubExtraServiceKey,
} from "@/lib/payments/payment-types";
import { normalizeExtraServices } from "@/lib/payments/payment-config-utils";

type HubExtraServicesPanelProps = {
  value: HubExtraService[];
  onChange: (nextValue: HubExtraService[]) => void;
};

const statusLabel = (status: HubExtraBillingStatus) => {
  const labels: Record<HubExtraBillingStatus, string> = {
    not_active: "Non attivo",
    active: "Attivo",
    trialing: "In prova",
    cancelled: "Annullato",
  };

  return labels[status] || "Non attivo";
};

export function HubExtraServicesPanel({
  value,
  onChange,
}: HubExtraServicesPanelProps) {
  const services = normalizeExtraServices(value);

  const patch = (
    serviceKey: HubExtraServiceKey,
    updates: Partial<HubExtraService>,
  ) => {
    onChange(
      services.map((service) =>
        service.key === serviceKey
          ? {
              ...service,
              ...updates,
              activatedAt:
                updates.enabled && !service.activatedAt
                  ? new Date().toISOString()
                  : service.activatedAt,
            }
          : service,
      ),
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Servizi Extra HUB</CardTitle>
        <p className="text-sm text-muted-foreground">
          Predisposizione commerciale per servizi aggiuntivi oltre al piano Plus.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => (
            <Card key={service.key}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{service.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {service.description}
                    </p>
                  </div>
                  <Switch
                    checked={service.enabled}
                    onCheckedChange={(checked) =>
                      patch(service.key, {
                        enabled: checked,
                        billingStatus: checked ? "active" : "not_active",
                      })
                    }
                    aria-label={`Abilita ${service.name}`}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={service.enabled ? "default" : "secondary"}>
                    {statusLabel(service.billingStatus)}
                  </Badge>
                  <Badge variant="outline">
                    {service.priceCents
                      ? `EUR ${(service.priceCents / 100).toFixed(2)}`
                      : "Prezzo da configurare"}
                  </Badge>
                </div>
                <Button type="button" variant="outline" disabled={!service.enabled}>
                  {service.enabled ? "Gestisci" : "Attiva"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
