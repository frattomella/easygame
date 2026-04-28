"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast-notification";

interface AddTrainerPaymentFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
}

export function AddTrainerPaymentForm({
  isOpen,
  onClose,
  onSubmit,
}: AddTrainerPaymentFormProps) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    month: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    status: "paid",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.month || !formData.amount) {
      showToast("error", "Compila tutti i campi obbligatori");
      return;
    }

    const paymentData = {
      id: `payment-${Date.now()}`,
      month: formData.month,
      amount: formData.amount,
      date: formData.status === "paid" ? formData.date : "",
      status: formData.status,
    };

    onSubmit(paymentData);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Aggiungi Pagamento Stipendio</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="month">Mese di Riferimento *</Label>
            <Input
              id="month"
              name="month"
              value={formData.month}
              onChange={handleChange}
              placeholder="Es. Maggio 2024"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">Importo (€) *</Label>
            <Input
              id="amount"
              name="amount"
              value={formData.amount}
              onChange={handleChange}
              placeholder="1500"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Stato Pagamento *</Label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              required
            >
              <option value="paid">Pagato</option>
              <option value="pending">In Attesa</option>
            </select>
          </div>
          {formData.status === "paid" && (
            <div className="space-y-2">
              <Label htmlFor="date">Data Pagamento</Label>
              <Input
                id="date"
                name="date"
                type="date"
                value={formData.date}
                onChange={handleChange}
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} type="button">
              Annulla
            </Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
              Salva Pagamento
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
