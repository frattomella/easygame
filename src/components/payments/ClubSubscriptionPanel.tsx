"use client";

import { BadgeCheck } from "lucide-react";
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
import type { ClubSubscriptionSettings } from "@/lib/payments/payment-types";
import {
  normalizeSubscriptionSettings,
  subscriptionStatusLabel,
} from "@/lib/payments/payment-config-utils";

type ClubSubscriptionPanelProps = {
  value: ClubSubscriptionSettings;
  onChange: (nextValue: ClubSubscriptionSettings) => void;
};

const isDevelopment = process.env.NODE_ENV !== "production";

export function ClubSubscriptionPanel({
  value,
  onChange,
}: ClubSubscriptionPanelProps) {
  const subscription = normalizeSubscriptionSettings(value);

  const patch = (updates: Partial<ClubSubscriptionSettings>) => {
    onChange({
      ...subscription,
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BadgeCheck className="h-5 w-5" />
          Account e Fatturazione
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-md border p-3">
            <p className="text-sm text-muted-foreground">Piano</p>
            <div className="mt-2 flex items-center gap-2">
              <Badge>{subscription.plan === "plus" ? "Plus" : "Free"}</Badge>
              <Badge variant="secondary">Predisposizione</Badge>
            </div>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-sm text-muted-foreground">Stato</p>
            <p className="mt-2 font-semibold">
              {subscriptionStatusLabel(subscription.status)}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-sm text-muted-foreground">Ciclo</p>
            <p className="mt-2 font-semibold">
              {subscription.billingCycle === "annual" ? "Annuale" : "Mensile"}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-sm text-muted-foreground">Rinnovo</p>
            <p className="mt-2 font-semibold">
              {subscription.renewalDate || "Non configurato"}
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Piano</Label>
            <Select
              value={subscription.plan}
              onValueChange={(plan) =>
                patch({ plan: plan === "free" ? "free" : "plus" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="plus">Plus</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Stato</Label>
            <Select
              value={subscription.status}
              onValueChange={(status) =>
                patch({ status: status as ClubSubscriptionSettings["status"] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="not_active">Non attivo</SelectItem>
                <SelectItem value="trialing">In prova</SelectItem>
                <SelectItem value="active">Attivo</SelectItem>
                <SelectItem value="past_due">Scaduto</SelectItem>
                <SelectItem value="cancelled">Annullato</SelectItem>
                <SelectItem value="expired">Scaduto definitivo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Data rinnovo</Label>
            <Input
              type="date"
              value={subscription.renewalDate || ""}
              onChange={(event) => patch({ renewalDate: event.target.value })}
            />
          </div>
        </div>

        <div className="rounded-md border p-4">
          <h3 className="font-semibold">Abbonamento Plus</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Il piano Plus abilita un set di servizi avanzati del gestionale.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {(subscription.includedServices || []).map((service) => (
              <div key={service} className="rounded-md bg-muted/40 px-3 py-2 text-sm">
                {service}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled>
            Gestisci abbonamento
          </Button>
          {isDevelopment ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => patch({ plan: "plus", status: "active" })}
            >
              Simula attivazione Plus
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
