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

interface PaymentPlan {
  id: string;
  name: string;
  description: string;
  amount: number;
  installments: number;
  installmentAmount: number;
}

interface ChangePlanFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (planId: string) => void;
  currentPlanId?: string;
}

export function ChangePlanForm({
  isOpen,
  onClose,
  onSubmit,
  currentPlanId,
}: ChangePlanFormProps) {
  const { showToast } = useToast();
  const [selectedPlanId, setSelectedPlanId] = useState<string>(
    currentPlanId || "",
  );

  // Mock payment plans
  const paymentPlans: PaymentPlan[] = [
    {
      id: "plan1",
      name: "Quota Annuale - Unica Soluzione",
      description: "Pagamento in un'unica soluzione con sconto del 10%",
      amount: 450,
      installments: 1,
      installmentAmount: 450,
    },
    {
      id: "plan2",
      name: "Quota Annuale - Rate Trimestrali",
      description: "Pagamento in 3 rate trimestrali",
      amount: 480,
      installments: 3,
      installmentAmount: 160,
    },
    {
      id: "plan3",
      name: "Quota Annuale - Rate Mensili",
      description: "Pagamento in 9 rate mensili",
      amount: 495,
      installments: 9,
      installmentAmount: 55,
    },
  ];

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
          {paymentPlans.map((plan) => (
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
                        €{plan.amount.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Rate:</span>
                      <span>
                        {plan.installments} x €
                        {plan.installmentAmount.toFixed(2)}
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
