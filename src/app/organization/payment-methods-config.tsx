"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast-notification";
import { Plus, Edit, Trash2, CreditCard, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/components/providers/AuthProvider";
import { supabase } from "@/lib/supabase";
import { getClubSettings, saveClubSettings } from "@/lib/simplified-db";

interface PaymentMethod {
  id: string;
  name: string;
  type: string;
  is_enabled: boolean;
  processing_fee_percentage: number;
  processing_fee_fixed: number;
  display_order: number;
  config: any;
}

const normalizePaymentMethod = (method: any): PaymentMethod => ({
  id: String(
    method?.id ||
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `payment-method-${Date.now()}`),
  ),
  name: String(method?.name || ""),
  type: String(method?.type || "credit_card"),
  is_enabled: Boolean(method?.is_enabled ?? true),
  processing_fee_percentage: Number(method?.processing_fee_percentage || 0),
  processing_fee_fixed: Number(method?.processing_fee_fixed || 0),
  display_order: Number(method?.display_order || 0),
  config:
    typeof method?.config === "object" && method?.config ? method.config : {},
});

export function PaymentMethodsConfig() {
  const { showToast } = useToast();
  const { activeClub } = useAuth();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  const [loading, setLoading] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [currentMethod, setCurrentMethod] = useState<PaymentMethod | null>(
    null,
  );
  const [formData, setFormData] = useState({
    name: "",
    type: "credit_card",
    is_enabled: true,
    processing_fee_percentage: 0,
    processing_fee_fixed: 0,
    display_order: 0,
  });

  const persistFallbackMethods = async (methods: PaymentMethod[]) => {
    if (!activeClub?.id) {
      return;
    }

    await saveClubSettings(activeClub.id, {
      paymentMethods: methods.map((method) => normalizePaymentMethod(method)),
    });
  };

  useEffect(() => {
    const fetchPaymentMethods = async () => {
      try {
        setLoading(true);
        if (!activeClub?.id) {
          setPaymentMethods([]);
          return;
        }

        const { data, error } = await supabase
          .from("payment_methods")
          .select("*")
          .eq("organization_id", activeClub.id)
          .order("display_order", { ascending: true });
        const clubSettings = await getClubSettings(activeClub.id);
        const fallbackMethods = Array.isArray(clubSettings?.paymentMethods)
          ? clubSettings.paymentMethods.map(normalizePaymentMethod)
          : [];

        if (error) {
          setPaymentMethods(fallbackMethods);
          return;
        }

        const normalizedData = Array.isArray(data)
          ? data.map(normalizePaymentMethod)
          : [];
        const nextMethods =
          normalizedData.length > 0 ? normalizedData : fallbackMethods;

        setPaymentMethods(nextMethods);
        if (normalizedData.length > 0) {
          await persistFallbackMethods(normalizedData);
        }
      } catch (error) {
        console.error("Error fetching payment methods:", error);
        showToast("error", "Errore nel caricamento dei metodi di pagamento");
      } finally {
        setLoading(false);
      }
    };

    fetchPaymentMethods();
  }, [activeClub?.id, showToast]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        name.includes("fee")
          ? parseFloat(value || "0")
          : name === "display_order"
            ? parseInt(value || "0", 10)
            : value,
    }));
  };

  const handleSwitchChange = (checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      is_enabled: checked,
    }));
  };

  const handleAddMethod = async () => {
    try {
      // Validate form
      if (!formData.name || !formData.type) {
        showToast("error", "Nome e tipo sono campi obbligatori");
        return;
      }

      setLoading(true);

      if (!activeClub?.id) {
        showToast("error", "Nessun club attivo selezionato");
        return;
      }

      const newMethod: Omit<PaymentMethod, "id"> & { organization_id: string } = {
        name: formData.name,
        type: formData.type,
        is_enabled: formData.is_enabled,
        processing_fee_percentage: formData.processing_fee_percentage,
        processing_fee_fixed: formData.processing_fee_fixed,
        display_order: formData.display_order || paymentMethods.length + 1,
        organization_id: activeClub.id,
        config: {},
      };

      const { data, error } = await supabase
        .from("payment_methods")
        .insert(newMethod)
        .select("*")
        .single();
      const fallbackRecord = normalizePaymentMethod({
        ...newMethod,
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `payment-method-${Date.now()}`,
      });
      const nextMethods = [
        ...paymentMethods,
        error || !data ? fallbackRecord : normalizePaymentMethod(data),
      ];

      setPaymentMethods(nextMethods);
      await persistFallbackMethods(nextMethods);
      setShowAddDialog(false);
      resetForm();
      showToast("success", "Metodo di pagamento aggiunto con successo");
    } catch (error) {
      console.error("Error adding payment method:", error);
      showToast("error", "Errore nell'aggiunta del metodo di pagamento");
    } finally {
      setLoading(false);
    }
  };

  const handleEditMethod = async () => {
    if (!currentMethod) return;

    try {
      // Validate form
      if (!formData.name || !formData.type) {
        showToast("error", "Nome e tipo sono campi obbligatori");
        return;
      }

      setLoading(true);

      const { data, error } = await supabase
        .from("payment_methods")
        .update({
          name: formData.name,
          type: formData.type,
          is_enabled: formData.is_enabled,
          processing_fee_percentage: formData.processing_fee_percentage,
          processing_fee_fixed: formData.processing_fee_fixed,
          display_order: formData.display_order,
        })
        .eq("id", currentMethod.id)
        .select("*")
        .single();
      const updatedMethods = paymentMethods.map((method) =>
        method.id === currentMethod.id
          ? normalizePaymentMethod({
              ...method,
              ...(error || !data
                ? {
                    name: formData.name,
                    type: formData.type,
                    is_enabled: formData.is_enabled,
                    processing_fee_percentage:
                      formData.processing_fee_percentage,
                    processing_fee_fixed: formData.processing_fee_fixed,
                    display_order: formData.display_order,
                  }
                : data),
            })
          : method,
      );

      setPaymentMethods(updatedMethods);
      await persistFallbackMethods(updatedMethods);
      setShowEditDialog(false);
      resetForm();
      showToast("success", "Metodo di pagamento aggiornato con successo");
    } catch (error) {
      console.error("Error updating payment method:", error);
      showToast("error", "Errore nell'aggiornamento del metodo di pagamento");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleMethod = async (methodId: string) => {
    try {
      setLoading(true);

      const methodToToggle = paymentMethods.find((m) => m.id === methodId);
      if (!methodToToggle) return;

      const { data, error } = await supabase
        .from("payment_methods")
        .update({ is_enabled: !methodToToggle.is_enabled })
        .eq("id", methodId)
        .select("*")
        .single();
      const updatedMethods = paymentMethods.map((method) =>
        method.id === methodId
          ? normalizePaymentMethod({
              ...method,
              ...(error || !data
                ? { is_enabled: !method.is_enabled }
                : data),
            })
          : method,
      );

      setPaymentMethods(updatedMethods);
      await persistFallbackMethods(updatedMethods);
      showToast(
        "success",
        `Metodo di pagamento ${methodToToggle.is_enabled ? "disattivato" : "attivato"} con successo`,
      );
    } catch (error) {
      console.error("Error toggling payment method:", error);
      showToast(
        "error",
        "Errore nella modifica dello stato del metodo di pagamento",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMethod = async (methodId: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo metodo di pagamento?"))
      return;

    try {
      setLoading(true);

      const { error } = await supabase
        .from("payment_methods")
        .delete()
        .eq("id", methodId);

      const updatedMethods = paymentMethods.filter(
        (method) => method.id !== methodId,
      );
      setPaymentMethods(updatedMethods);
      await persistFallbackMethods(updatedMethods);
      showToast("success", "Metodo di pagamento eliminato con successo");
    } catch (error) {
      console.error("Error deleting payment method:", error);
      showToast("error", "Errore nell'eliminazione del metodo di pagamento");
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (method: PaymentMethod) => {
    setCurrentMethod(method);
    setFormData({
      name: method.name,
      type: method.type,
      is_enabled: method.is_enabled,
      processing_fee_percentage: method.processing_fee_percentage,
      processing_fee_fixed: method.processing_fee_fixed,
      display_order: method.display_order,
    });
    setShowEditDialog(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      type: "credit_card",
      is_enabled: true,
      processing_fee_percentage: 0,
      processing_fee_fixed: 0,
      display_order: 0,
    });
    setCurrentMethod(null);
  };

  const getPaymentMethodIcon = (type: string) => {
    switch (type) {
      case "credit_card":
        return <CreditCard className="h-5 w-5" />;
      case "paypal":
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-blue-600"
          >
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            <rect width="18" height="12" x="3" y="11" rx="2" />
          </svg>
        );
      case "apple_pay":
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z" />
            <path d="M10 2c1 .5 2 2 2 5" />
          </svg>
        );
      case "google_pay":
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="m8 12 2 2 4-4" />
          </svg>
        );
      case "bank_transfer":
        return (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="20" height="14" x="2" y="5" rx="2" />
            <line x1="2" x2="22" y1="10" y2="10" />
          </svg>
        );
      default:
        return <CreditCard className="h-5 w-5" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Metodi di Pagamento</h2>
        <Button onClick={() => setShowAddDialog(true)} disabled={loading}>
          <Plus className="h-4 w-4 mr-2" /> Nuovo Metodo
        </Button>
      </div>

      {/* Payment Methods Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Metodo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Commissione</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paymentMethods.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-4">
                  Nessun metodo di pagamento configurato
                </TableCell>
              </TableRow>
            ) : (
              paymentMethods.map((method) => (
                <TableRow key={method.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getPaymentMethodIcon(method.type)}
                      <span>{method.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {method.type === "credit_card" && "Carta di Credito"}
                    {method.type === "paypal" && "PayPal"}
                    {method.type === "apple_pay" && "Apple Pay"}
                    {method.type === "google_pay" && "Google Pay"}
                    {method.type === "bank_transfer" && "Bonifico Bancario"}
                    {method.type === "other" && "Altro"}
                  </TableCell>
                  <TableCell>
                    {method.processing_fee_percentage > 0 ? (
                      <span>
                        {method.processing_fee_percentage}%
                        {method.processing_fee_fixed > 0 &&
                          ` + ${method.processing_fee_fixed.toFixed(2)}€`}
                      </span>
                    ) : (
                      <span>Nessuna</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={method.is_enabled}
                        onCheckedChange={() => handleToggleMethod(method.id)}
                        disabled={loading}
                      />
                      <span
                        className={
                          method.is_enabled ? "text-green-600" : "text-gray-500"
                        }
                      >
                        {method.is_enabled ? "Attivo" : "Disattivato"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(method)}
                      disabled={loading}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteMethod(method.id)}
                      disabled={loading}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Payment Method Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aggiungi Metodo di Pagamento</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Es. Carta di Credito"
                disabled={loading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Tipo *</Label>
              <select
                id="type"
                name="type"
                value={formData.type}
                onChange={handleChange}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                disabled={loading}
              >
                <option value="credit_card">Carta di Credito</option>
                <option value="paypal">PayPal</option>
                <option value="apple_pay">Apple Pay</option>
                <option value="google_pay">Google Pay</option>
                <option value="bank_transfer">Bonifico Bancario</option>
                <option value="other">Altro</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="processing_fee_percentage">Commissione (%)</Label>
              <Input
                id="processing_fee_percentage"
                name="processing_fee_percentage"
                type="number"
                step="0.01"
                min="0"
                value={formData.processing_fee_percentage}
                onChange={handleChange}
                placeholder="Es. 1.5"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="processing_fee_fixed">
                Commissione fissa (€)
              </Label>
              <Input
                id="processing_fee_fixed"
                name="processing_fee_fixed"
                type="number"
                step="0.01"
                min="0"
                value={formData.processing_fee_fixed}
                onChange={handleChange}
                placeholder="Es. 0.30"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="display_order">Ordine di visualizzazione</Label>
              <Input
                id="display_order"
                name="display_order"
                type="number"
                min="1"
                value={formData.display_order}
                onChange={handleChange}
                placeholder="Es. 1"
                disabled={loading}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="is_enabled"
                checked={formData.is_enabled}
                onCheckedChange={handleSwitchChange}
                disabled={loading}
              />
              <Label htmlFor="is_enabled">Attivo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddDialog(false)}
              disabled={loading}
            >
              Annulla
            </Button>
            <Button onClick={handleAddMethod} disabled={loading}>
              {loading ? "Salvataggio..." : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Payment Method Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifica Metodo di Pagamento</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome *</Label>
              <Input
                id="edit-name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Es. Carta di Credito"
                disabled={loading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-type">Tipo *</Label>
              <select
                id="edit-type"
                name="type"
                value={formData.type}
                onChange={handleChange}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                disabled={loading}
              >
                <option value="credit_card">Carta di Credito</option>
                <option value="paypal">PayPal</option>
                <option value="apple_pay">Apple Pay</option>
                <option value="google_pay">Google Pay</option>
                <option value="bank_transfer">Bonifico Bancario</option>
                <option value="other">Altro</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-processing_fee_percentage">
                Commissione (%)
              </Label>
              <Input
                id="edit-processing_fee_percentage"
                name="processing_fee_percentage"
                type="number"
                step="0.01"
                min="0"
                value={formData.processing_fee_percentage}
                onChange={handleChange}
                placeholder="Es. 1.5"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-processing_fee_fixed">
                Commissione fissa (€)
              </Label>
              <Input
                id="edit-processing_fee_fixed"
                name="processing_fee_fixed"
                type="number"
                step="0.01"
                min="0"
                value={formData.processing_fee_fixed}
                onChange={handleChange}
                placeholder="Es. 0.30"
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-display_order">
                Ordine di visualizzazione
              </Label>
              <Input
                id="edit-display_order"
                name="display_order"
                type="number"
                min="1"
                value={formData.display_order}
                onChange={handleChange}
                placeholder="Es. 1"
                disabled={loading}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="edit-is_enabled"
                checked={formData.is_enabled}
                onCheckedChange={handleSwitchChange}
                disabled={loading}
              />
              <Label htmlFor="edit-is_enabled">Attivo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEditDialog(false)}
              disabled={loading}
            >
              Annulla
            </Button>
            <Button onClick={handleEditMethod} disabled={loading}>
              {loading ? "Aggiornamento..." : "Aggiorna"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
