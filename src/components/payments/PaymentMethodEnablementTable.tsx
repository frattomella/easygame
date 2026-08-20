"use client";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  ClubPaymentSettings,
  PaymentProviderKey,
} from "@/lib/payments/payment-types";
import {
  isProviderConfigUsableForRegistration,
  paymentStatusLabel,
} from "@/lib/payments/payment-config-utils";
import {
  PAYMENT_PROVIDER_ORDER,
  PAYMENT_PROVIDER_REGISTRY,
} from "@/lib/payments/provider-registry";

type PaymentMethodEnablementTableProps = {
  settings: ClubPaymentSettings;
  onChange: (nextSettings: ClubPaymentSettings) => void;
};

export function PaymentMethodEnablementTable({
  settings,
  onChange,
}: PaymentMethodEnablementTableProps) {
  const toggleRegistrationMethod = (
    provider: PaymentProviderKey,
    checked: boolean,
  ) => {
    const nextMethods = checked
      ? Array.from(new Set([...settings.enabledRegistrationMethods, provider]))
      : settings.enabledRegistrationMethods.filter((item) => item !== provider);

    onChange({
      ...settings,
      enabledRegistrationMethods: nextMethods,
    });
  };

  return (
    <TooltipProvider>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Metodo</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Club</TableHead>
            <TableHead>Iscrizioni</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {PAYMENT_PROVIDER_ORDER.map((provider) => {
            const definition = PAYMENT_PROVIDER_REGISTRY[provider];
            const config = settings.providers[provider];
            const usable = isProviderConfigUsableForRegistration(config);
            const checked =
              usable && settings.enabledRegistrationMethods.includes(provider);

            return (
              <TableRow key={provider}>
                <TableCell className="font-medium">
                  {config.publicLabel || definition.label}
                </TableCell>
                <TableCell>{definition.label}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={config.enabled ? "default" : "secondary"}>
                      {config.enabled ? "Abilitato" : "Disabilitato"}
                    </Badge>
                    <Badge variant="outline">{paymentStatusLabel(config.status)}</Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Switch
                          checked={checked}
                          disabled={!usable}
                          onCheckedChange={(value) =>
                            toggleRegistrationMethod(provider, value)
                          }
                          aria-label={`Disponibile in iscrizioni: ${definition.label}`}
                        />
                      </span>
                    </TooltipTrigger>
                    {!usable ? (
                      <TooltipContent>
                        Configura prima il metodo nella sezione Pagamenti del Club.
                      </TooltipContent>
                    ) : null}
                  </Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TooltipProvider>
  );
}
