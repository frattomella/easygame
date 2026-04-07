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
import { Plus, Edit, Trash2, CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/providers/AuthProvider";

interface BankAccount {
  id: string;
  name: string;
  iban: string;
  bank_name: string;
  status: "active" | "inactive";
  current_balance: number;
  created_at: string;
  updated_at: string;
}

interface BankAccountListProps {
  bankAccounts: BankAccount[];
  setBankAccounts: React.Dispatch<React.SetStateAction<BankAccount[]>>;
  activeClubId: string | null;
}

export function BankAccountList({
  bankAccounts,
  setBankAccounts,
  activeClubId,
}: BankAccountListProps) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [currentAccount, setCurrentAccount] = useState<BankAccount | null>(
    null,
  );
  const [formData, setFormData] = useState({
    name: "",
    iban: "",
    bank_name: "",
    status: "active" as "active" | "inactive",
  });

  // Fetch bank accounts from database
  useEffect(() => {
    const fetchBankAccounts = async () => {
      try {
        if (!activeClubId || !user) return;

        // Load bank accounts from database
        const { getClubData } = await import("@/lib/simplified-db");
        const accounts = await getClubData(activeClubId, "bank_accounts");

        if (accounts && accounts.length > 0) {
          setBankAccounts(accounts);
        }
      } catch (error) {
        console.error("Error fetching bank accounts:", error);
      }
    };

    fetchBankAccounts();
  }, [user, setBankAccounts, activeClubId]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddAccount = async () => {
    // Validate form
    if (!formData.name || !formData.iban || !formData.bank_name) {
      showToast("error", "Compila tutti i campi obbligatori");
      return;
    }

    if (!activeClubId) {
      showToast("error", "Nessun club attivo trovato");
      return;
    }

    try {
      // Create new account
      const newAccount: BankAccount = {
        id: `bank-${Date.now()}`,
        name: formData.name,
        iban: formData.iban,
        bank_name: formData.bank_name,
        status: formData.status,
        current_balance: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Save to database
      const { addClubData } = await import("@/lib/simplified-db");
      await addClubData(activeClubId, "bank_accounts", newAccount);

      setBankAccounts([...bankAccounts, newAccount]);
      setShowAddDialog(false);
      resetForm();
      showToast("success", "Conto corrente aggiunto con successo");
    } catch (error) {
      console.error("Error adding bank account:", error);
      showToast("error", "Errore nel salvare il conto corrente");
    }
  };

  const handleEditAccount = async () => {
    if (!currentAccount) return;

    // Validate form
    if (!formData.name || !formData.iban || !formData.bank_name) {
      showToast("error", "Compila tutti i campi obbligatori");
      return;
    }

    if (!activeClubId) {
      showToast("error", "Nessun club attivo trovato");
      return;
    }

    try {
      // Update account
      const updatedAccounts = bankAccounts.map((account) =>
        account.id === currentAccount.id
          ? {
              ...account,
              name: formData.name,
              iban: formData.iban,
              bank_name: formData.bank_name,
              status: formData.status,
              updated_at: new Date().toISOString(),
            }
          : account,
      );

      // Save to database
      const { updateClubDataArray } = await import("@/lib/simplified-db");
      await updateClubDataArray(activeClubId, "bank_accounts", updatedAccounts);

      setBankAccounts(updatedAccounts);
      setShowEditDialog(false);
      resetForm();
      showToast("success", "Conto corrente aggiornato con successo");
    } catch (error) {
      console.error("Error updating bank account:", error);
      showToast("error", "Errore nell'aggiornare il conto corrente");
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    if (confirm("Sei sicuro di voler eliminare questo conto corrente?")) {
      if (!activeClubId) {
        showToast("error", "Nessun club attivo trovato");
        return;
      }

      try {
        const updatedAccounts = bankAccounts.filter(
          (account) => account.id !== accountId,
        );

        // Save to database
        const { updateClubDataArray } = await import("@/lib/simplified-db");
        await updateClubDataArray(
          activeClubId,
          "bank_accounts",
          updatedAccounts,
        );

        setBankAccounts(updatedAccounts);
        showToast("success", "Conto corrente eliminato con successo");
      } catch (error) {
        console.error("Error deleting bank account:", error);
        showToast("error", "Errore nell'eliminare il conto corrente");
      }
    }
  };

  const openEditDialog = (account: BankAccount) => {
    setCurrentAccount(account);
    setFormData({
      name: account.name,
      iban: account.iban,
      bank_name: account.bank_name,
      status: account.status,
    });
    setShowEditDialog(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      iban: "",
      bank_name: "",
      status: "active",
    });
    setCurrentAccount(null);
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Conti Correnti</h2>
        <Button type="button" onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nuovo Conto
        </Button>
      </div>

      {/* Bank Accounts Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {bankAccounts.map((account) => (
          <Card
            key={account.id}
            className={`transition-all duration-200 ${
              account.status === "active"
                ? "border-green-200 bg-green-50/50 hover:bg-green-50"
                : "border-gray-200 bg-gray-50/50 opacity-75 hover:bg-gray-50"
            }`}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center justify-between">
                <div className="flex items-center">
                  <CreditCard
                    className={`h-5 w-5 mr-2 ${
                      account.status === "active"
                        ? "text-green-600"
                        : "text-gray-400"
                    }`}
                  />
                  {account.name}
                </div>
                <span
                  className={`px-2 py-1 rounded-full text-xs font-medium ${
                    account.status === "active"
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {account.status === "active" ? "Attivo" : "Inattivo"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p
                  className={`text-2xl font-bold ${
                    account.status === "active"
                      ? "text-gray-900"
                      : "text-gray-500"
                  }`}
                >
                  {formatCurrency(account.current_balance)}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {account.iban}
                </p>
                <p className="text-sm text-muted-foreground">
                  {account.bank_name}
                </p>
                <div className="flex justify-end mt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => openEditDialog(account)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => handleDeleteAccount(account.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bank Accounts Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>IBAN</TableHead>
              <TableHead>Banca</TableHead>
              <TableHead>Saldo</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bankAccounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-4">
                  Nessun conto corrente trovato
                </TableCell>
              </TableRow>
            ) : (
              bankAccounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>{account.name}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {account.iban}
                  </TableCell>
                  <TableCell>{account.bank_name}</TableCell>
                  <TableCell>
                    {formatCurrency(account.current_balance)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${account.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}
                    >
                      {account.status === "active" ? "Attivo" : "Inattivo"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      onClick={() => openEditDialog(account)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      onClick={() => handleDeleteAccount(account.id)}
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

      {/* Add Bank Account Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aggiungi Conto Corrente</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome Conto *</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Es. Conto Principale"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="iban">IBAN *</Label>
              <Input
                id="iban"
                name="iban"
                value={formData.iban}
                onChange={handleChange}
                placeholder="Es. IT60X0542811101000000123456"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank_name">Banca *</Label>
              <Input
                id="bank_name"
                name="bank_name"
                value={formData.bank_name}
                onChange={handleChange}
                placeholder="Es. Banca Intesa"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Stato</Label>
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              >
                <option value="active">Attivo</option>
                <option value="inactive">Inattivo</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddDialog(false)}
            >
              Annulla
            </Button>
            <Button type="button" onClick={handleAddAccount}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Bank Account Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifica Conto Corrente</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome Conto *</Label>
              <Input
                id="edit-name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Es. Conto Principale"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-iban">IBAN *</Label>
              <Input
                id="edit-iban"
                name="iban"
                value={formData.iban}
                onChange={handleChange}
                placeholder="Es. IT60X0542811101000000123456"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-bank_name">Banca *</Label>
              <Input
                id="edit-bank_name"
                name="bank_name"
                value={formData.bank_name}
                onChange={handleChange}
                placeholder="Es. Banca Intesa"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status">Stato</Label>
              <select
                id="edit-status"
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              >
                <option value="active">Attivo</option>
                <option value="inactive">Inattivo</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowEditDialog(false)}
            >
              Annulla
            </Button>
            <Button type="button" onClick={handleEditAccount}>
              Aggiorna
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
