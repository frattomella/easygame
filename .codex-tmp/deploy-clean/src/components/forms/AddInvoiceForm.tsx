"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast-notification";
import { Checkbox } from "@/components/ui/checkbox";

interface AddInvoiceFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  athleteId?: string;
  athleteName?: string;
}

export function AddInvoiceForm({
  isOpen,
  onClose,
  onSubmit,
  athleteId = "",
  athleteName = "",
}: AddInvoiceFormProps) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    invoiceNumber: "",
    date: new Date().toISOString().split("T")[0],
    amount: "",
    description: "",
    paymentMethod: "bonifico",
    isElectronic: true,
    recipientCode: "",
    vatNumber: "",
    fiscalCode: "",
    address: "",
    city: "",
    postalCode: "",
    province: "",
    country: "Italia",
    notes: "",
  });

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (name: string, checked: boolean) => {
    setFormData((prev) => ({ ...prev, [name]: checked }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    if (
      !formData.invoiceNumber ||
      !formData.date ||
      !formData.amount ||
      !formData.description
    ) {
      showToast("error", "Compila tutti i campi obbligatori");
      return;
    }

    // Additional validation for electronic invoice
    if (formData.isElectronic && !formData.recipientCode) {
      showToast(
        "error",
        "Il codice destinatario è obbligatorio per la fattura elettronica",
      );
      return;
    }

    // Submit form
    onSubmit({
      ...formData,
      id: `inv-${Date.now()}`,
      athleteId,
      athleteName,
      status: "issued",
    });

    // Reset form
    setFormData({
      invoiceNumber: "",
      date: new Date().toISOString().split("T")[0],
      amount: "",
      description: "",
      paymentMethod: "bonifico",
      isElectronic: true,
      recipientCode: "",
      vatNumber: "",
      fiscalCode: "",
      address: "",
      city: "",
      postalCode: "",
      province: "",
      country: "Italia",
      notes: "",
    });

    // Close modal
    onClose();

    // Show success toast
    showToast("success", "Fattura creata con successo");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Emetti Fattura Elettronica</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoiceNumber">Numero Fattura*</Label>
              <Input
                id="invoiceNumber"
                name="invoiceNumber"
                value={formData.invoiceNumber}
                onChange={handleChange}
                placeholder="Es. 2024/001"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Data Emissione*</Label>
              <Input
                id="date"
                name="date"
                type="date"
                value={formData.date}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Importo (€)*</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={handleChange}
                placeholder="Es. 150.00"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Metodo di Pagamento*</Label>
              <select
                id="paymentMethod"
                name="paymentMethod"
                value={formData.paymentMethod}
                onChange={handleChange}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                required
              >
                <option value="bonifico">Bonifico Bancario</option>
                <option value="contanti">Contanti</option>
                <option value="carta">Carta di Credito/Debito</option>
                <option value="paypal">PayPal</option>
                <option value="altro">Altro</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrizione*</Label>
            <Input
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Es. Quota mensile corso di calcio"
              required
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="isElectronic"
              checked={formData.isElectronic}
              onCheckedChange={(checked) =>
                handleCheckboxChange("isElectronic", checked as boolean)
              }
            />
            <Label htmlFor="isElectronic" className="font-medium">
              Fattura Elettronica
            </Label>
          </div>

          {formData.isElectronic && (
            <div className="space-y-4 border-t pt-4 mt-4">
              <h3 className="font-medium">Dati per Fatturazione Elettronica</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="recipientCode">Codice Destinatario*</Label>
                  <Input
                    id="recipientCode"
                    name="recipientCode"
                    value={formData.recipientCode}
                    onChange={handleChange}
                    placeholder="Es. 0000000"
                    maxLength={7}
                    required={formData.isElectronic}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vatNumber">Partita IVA</Label>
                  <Input
                    id="vatNumber"
                    name="vatNumber"
                    value={formData.vatNumber}
                    onChange={handleChange}
                    placeholder="Es. IT12345678901"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fiscalCode">Codice Fiscale</Label>
                <Input
                  id="fiscalCode"
                  name="fiscalCode"
                  value={formData.fiscalCode}
                  onChange={handleChange}
                  placeholder="Es. RSSMRA80A01H501U"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Indirizzo</Label>
                <Input
                  id="address"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  placeholder="Es. Via Roma 123"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">Città</Label>
                  <Input
                    id="city"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    placeholder="Es. Milano"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="postalCode">CAP</Label>
                  <Input
                    id="postalCode"
                    name="postalCode"
                    value={formData.postalCode}
                    onChange={handleChange}
                    placeholder="Es. 20100"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="province">Provincia</Label>
                  <Input
                    id="province"
                    name="province"
                    value={formData.province}
                    onChange={handleChange}
                    placeholder="Es. MI"
                    maxLength={2}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Note</Label>
            <Textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Note aggiuntive..."
              className="min-h-[80px]"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} type="button">
              Annulla
            </Button>
            <Button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white dark:text-white"
            >
              Emetti Fattura
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
