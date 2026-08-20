"use client";

import { CreditCard, ShieldCheck, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
  ClubPaymentProviderConfig,
  PaymentProviderKey,
  PaymentProviderStatus,
} from "@/lib/payments/payment-types";
import { paymentStatusLabel } from "@/lib/payments/payment-config-utils";
import { PAYMENT_PROVIDER_REGISTRY } from "@/lib/payments/provider-registry";

type PaymentProviderCardProps = {
  provider: PaymentProviderKey;
  value: ClubPaymentProviderConfig;
  onChange: (nextValue: ClubPaymentProviderConfig) => void;
};

const STATUS_OPTIONS: PaymentProviderStatus[] = [
  "not_configured",
  "configured",
  "onboarding_required",
  "active",
  "disabled",
  "error",
];

const iconForProvider = (provider: PaymentProviderKey) => {
  if (provider === "paypal") return WalletCards;
  if (provider === "postepay") return ShieldCheck;
  return CreditCard;
};

export function PaymentProviderCard({
  provider,
  value,
  onChange,
}: PaymentProviderCardProps) {
  const definition = PAYMENT_PROVIDER_REGISTRY[provider];
  const Icon = iconForProvider(provider);

  const patch = (updates: Partial<ClubPaymentProviderConfig>) => {
    onChange({
      ...value,
      ...updates,
      provider,
    });
  };

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-700">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="text-base">{definition.label}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {definition.description}
              </p>
            </div>
          </div>
          <Switch
            checked={value.enabled}
            onCheckedChange={(checked) =>
              patch({
                enabled: checked,
                status: checked
                  ? value.status === "disabled"
                    ? "onboarding_required"
                    : value.status
                  : "disabled",
              })
            }
            aria-label={`Abilita ${definition.label}`}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{paymentStatusLabel(value.status)}</Badge>
          {!definition.isImplemented ? (
            <Badge variant="secondary">Predisposto</Badge>
          ) : null}
          <Badge variant="outline">{value.mode === "live" ? "Live" : "Test"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Stato</Label>
            <Select
              value={value.status}
              onValueChange={(status) =>
                patch({ status: status as PaymentProviderStatus })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {paymentStatusLabel(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Etichetta pubblica</Label>
            <Input
              value={value.publicLabel || ""}
              onChange={(event) => patch({ publicLabel: event.target.value })}
              placeholder={definition.label}
            />
          </div>
        </div>

        {provider === "paypal" ? (
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2 md:col-span-1">
              <Label>Email business</Label>
              <Input
                type="email"
                value={value.accountEmail || ""}
                onChange={(event) =>
                  patch({ accountEmail: event.target.value })
                }
                placeholder="business@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Merchant ID</Label>
              <Input
                value={value.merchantId || ""}
                onChange={(event) => patch({ merchantId: event.target.value })}
                placeholder="Non sensibile"
              />
            </div>
            <div className="space-y-2">
              <Label>Connected account ID</Label>
              <Input
                value={value.connectedAccountId || ""}
                onChange={(event) =>
                  patch({ connectedAccountId: event.target.value })
                }
                placeholder="Provider account"
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Gateway collegato</Label>
              <Input
                value={value.connectedAccountId || ""}
                onChange={(event) =>
                  patch({ connectedAccountId: event.target.value })
                }
                placeholder="Account gateway esterno"
              />
            </div>
            <div className="space-y-2">
              <Label>Merchant ID</Label>
              <Input
                value={value.merchantId || ""}
                onChange={(event) => patch({ merchantId: event.target.value })}
                placeholder="Non sensibile"
              />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label>Istruzioni visibili al club</Label>
          <Textarea
            value={value.instructions || ""}
            onChange={(event) => patch({ instructions: event.target.value })}
            placeholder="Note operative o stato onboarding"
            rows={3}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              patch({
                enabled: true,
                status:
                  value.status === "not_configured"
                    ? "onboarding_required"
                    : value.status,
              })
            }
          >
            Configura
          </Button>
          <Button type="button" variant="outline" disabled>
            Verifica
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => patch({ enabled: false, status: "disabled" })}
          >
            Disabilita
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
