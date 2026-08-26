"use client";

import type {
  ClubSubscriptionSettings,
  HubExtraService,
} from "@/lib/payments/payment-types";
import {
  normalizeExtraServices,
  normalizeSubscriptionSettings,
} from "@/lib/payments/payment-config-utils";
import { ClubSubscriptionPanel } from "./ClubSubscriptionPanel";
import { HubExtraServicesPanel } from "./HubExtraServicesPanel";

type ClubBillingSettingsProps = {
  subscription: ClubSubscriptionSettings;
  extraServices: HubExtraService[];
  onSubscriptionChange?: (nextValue: ClubSubscriptionSettings) => void;
  onExtraServicesChange?: (nextValue: HubExtraService[]) => void;
  /**
   * Sola lettura: **e il valore giusto nel gestionale del club**. Piano e
   * servizi appartengono alla piattaforma (D37); i comandi esistono solo
   * nella console di Cedi, e il server ignora comunque cio che arrivasse da
   * altrove.
   */
  readOnly?: boolean;
};

export function ClubBillingSettings({
  subscription,
  extraServices,
  onSubscriptionChange,
  onExtraServicesChange,
  readOnly = false,
}: ClubBillingSettingsProps) {
  return (
    <div className="space-y-4">
      <ClubSubscriptionPanel
        value={normalizeSubscriptionSettings(subscription)}
        onChange={onSubscriptionChange}
        readOnly={readOnly}
      />
      <HubExtraServicesPanel
        value={normalizeExtraServices(extraServices)}
        onChange={onExtraServicesChange}
        readOnly={readOnly}
      />
    </div>
  );
}
