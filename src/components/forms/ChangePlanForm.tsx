"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast-notification";
import { Check } from "lucide-react";
import { normalizePaymentPlans } from "@/lib/payment-plan-utils";

const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value || 0));

interface ChangePlanFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (planId: string) => void;
  currentPlanId?: string;
  paymentPlans?: any[];
}

export function ChangePlanForm({
  isOpen,
  onClose,
  onSubmit,
  currentPlanId,
  paymentPlans = [],
}: ChangePlanFormProps) {
  const { showToast } = useToast();
  const [selectedPlanId, setSelectedPlanId] = useState<string>(
    currentPlanId || "",
  );

  const normalizedPaymentPlans = normalizePaymentPlans(paymentPlans).filter(
    (plan) => plan.active,
  );

  const handleSubmit = () => {
    if (!selectedPlanId) {
      showToast("error", "Seleziona un piano di pagamento");
      return;
    }

    onSubmit(selectedPlanId);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cambia Piano di Pagamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {normalizedPaymentPlans.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Nessun piano di pagamento configurato.
            </div>
          ) : null}
          {normalizedPaymentPlans.map((plan) => (
            <div
              key={plan.id}
              className={`p-4 border rounded-lg cursor-pointer transition-colors ${selectedPlanId === plan.id ? "border-blue-500 bg-blue-50" : "hover:border-gray-400"}`}
              onClick={() => setSelectedPlanId(plan.id)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {plan.description}
                  </p>
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Importo totale:</span>
                      <span className="font-medium">
                        {formatCurrency(plan.totalAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Rate:</span>
                      <span>
                        {plan.installmentsCount} x{" "}
                        {formatCurrency(plan.installmentAmount)}
                      </span>
                    </div>
                  </div>
                </div>
                {selectedPlanId === plan.id && (
                  <div className="h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center">
                    <Check className="h-4 w-4 text-white" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button
            onClick={handleSubmit}
            className="bg-blue-600 hover:bg-blue-700"
            disabled={!selectedPlanId}
          >
            Conferma
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
