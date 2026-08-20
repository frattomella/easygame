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
  onSubscriptionChange: (nextValue: ClubSubscriptionSettings) => void;
  onExtraServicesChange: (nextValue: HubExtraService[]) => void;
};

export function ClubBillingSettings({
  subscription,
  extraServices,
  onSubscriptionChange,
  onExtraServicesChange,
}: ClubBillingSettingsProps) {
  return (
    <div className="space-y-4">
      <ClubSubscriptionPanel
        value={normalizeSubscriptionSettings(subscription)}
        onChange={onSubscriptionChange}
      />
      <HubExtraServicesPanel
        value={normalizeExtraServices(extraServices)}
        onChange={onExtraServicesChange}
      />
    </div>
  );
}
