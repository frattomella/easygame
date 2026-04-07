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

interface AddPaymentFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  athletes?: Array<{
    id: string;
    name: string;
  }>;
}

export function AddPaymentForm({
  isOpen,
  onClose,
  onSubmit,
  athletes = [],
}: AddPaymentFormProps) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    athleteId: "",
    description: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    status: "paid",
    method: "",
    reference: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (
      (athletes.length > 0 && !formData.athleteId) ||
      !formData.description ||
      !formData.amount ||
      !formData.date ||
      !formData.method ||
      !formData.status
    ) {
      showToast("error", "Compila tutti i campi obbligatori");
      return;
    }

    const paymentData = {
      id: `payment-${Date.now()}`,
      athleteId: formData.athleteId || null,
      description: formData.description,
      amount: parseFloat(formData.amount),
      dueDate: formData.date,
      paidAt: formData.status === "paid" ? formData.date : null,
      status: formData.status,
      method: formData.method,
      reference: formData.reference,
    };

    onSubmit(paymentData);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Aggiungi Pagamento</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {athletes.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="athleteId">Atleta *</Label>
              <select
                id="athleteId"
                name="athleteId"
                value={formData.athleteId}
                onChange={handleChange}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                required
              >
                <option value="" disabled>
                  Seleziona atleta
                </option>
                {athletes.map((athlete) => (
                  <option key={athlete.id} value={athlete.id}>
                    {athlete.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="description">Descrizione *</Label>
            <Input
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Es. Rata 1 - Stagione 2023/2024"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">Importo (€) *</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              value={formData.amount}
              onChange={handleChange}
              placeholder="150.00"
              min="0"
              step="0.01"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="date">Data Scadenza / Pagamento *</Label>
            <Input
              id="date"
              name="date"
              type="date"
              value={formData.date}
              onChange={handleChange}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="method">Metodo di Pagamento *</Label>
            <select
              id="method"
              name="method"
              value={formData.method}
              onChange={handleChange}
              className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              required
            >
              <option value="" disabled>
                Seleziona metodo
              </option>
              <option value="Bonifico">Bonifico Bancario</option>
              <option value="Carta di Credito">Carta di Credito</option>
              <option value="Contanti">Contanti</option>
              <option value="Assegno">Assegno</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Stato *</Label>
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
          <div className="space-y-2">
            <Label htmlFor="reference">Riferimento</Label>
            <Input
              id="reference"
              name="reference"
              value={formData.reference}
              onChange={handleChange}
              placeholder="Es. APR-2026-001"
            />
          </div>
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
