"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MouseEvent } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-notification";
import { AdvancedTransactionDialog } from "@/components/accounting/AdvancedTransactionDialog";
import {
  BankAccountList,
  type BankAccount,
} from "@/components/accounting/BankAccountList";
import { MovementDetailPanel } from "@/components/accounting/MovementDetailPanel";
import { AddInvoiceForm } from "@/components/forms/AddInvoiceForm";
import { AthletePaymentLedger } from "@/components/payments/AthletePaymentLedger";
import { getClubPaymentMethodChoices } from "@/lib/payments/payment-config-utils";
import { useAuth } from "@/components/providers/AuthProvider";
import { apiRequest } from "@/lib/api/client";
import {
  addClubData,
  deleteClubDataItem,
  updateClubDataArray,
} from "@/lib/simplified-db";
import {
  aggregateClubPayments,
  getMovementSourceLabel,
  loadClubFinancialSources,
  summarizeClubMovements,
  type NormalizedClubMovement,
} from "@/lib/club-financial-summary";
import {
  loadClubEntityDirectory,
  type ClubEntityOption,
} from "@/lib/club-entity-directory";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  Edit,
  Eye,
  FileText,
  Plus,
  Receipt,
  Search,
  Trash2,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { paymentDateOf, sortByDateDesc } from "@/lib/sorting";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type MovementSourceType =
  | "transactions"
  | "expected_income"
  | "expected_expenses"
  | "transfers"
  | string;

const emptyCurrency = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
});

const formatCurrency = (value: number) => emptyCurrency.format(Number(value) || 0);

const formatDate = (dateString?: string | null) => {
  if (!dateString) {
    return "-";
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleDateString("it-IT", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const rawData = (value: unknown) => {
  const raw = (value || {}) as any;
  if (!raw.data) {
    return {};
  }
  if (typeof raw.data === "object") {
    return raw.data;
  }
  try {
    return JSON.parse(raw.data);
  } catch {
    return {};
  }
};

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) {
      return text;
    }
  }
  return "";
};

const getSubjectEmail = (movement: NormalizedClubMovement | null) => {
  if (!movement) {
    return "";
  }

  const raw = (movement.raw || {}) as any;
  const data = rawData(raw);
  return firstText(
    movement.subjectEmail,
    movement.linkedEntity?.email,
    raw.email,
    raw.subjectEmail,
    raw.athlete_email,
    raw.trainer_email,
    raw.member_email,
    raw.staff_email,
    raw.sponsor_email,
    raw.supplier_email,
    raw._originEntityEmail,
    data.email,
    data.parentEmail,
  );
};

const getSubjectPhone = (movement: NormalizedClubMovement | null) => {
  if (!movement) {
    return "";
  }

  const raw = (movement.raw || {}) as any;
  const data = rawData(raw);
  return firstText(
    movement.subjectPhone,
    movement.linkedEntity?.phone,
    raw.phone,
    raw.subjectPhone,
    raw.athlete_phone,
    raw.trainer_phone,
    raw.member_phone,
    raw.staff_phone,
    raw.sponsor_phone,
    raw.supplier_phone,
    raw._originEntityPhone,
    data.phone,
    data.parentPhone,
  );
};

const getMovementReference = (movement: NormalizedClubMovement) => {
  const raw = (movement.raw || {}) as any;
  if (movement.source === "athlete") {
    return firstText(
      movement.originEntityName,
      movement.subjectName,
      movement.linkedEntity?.name,
      movement.reference,
      raw.reference,
      "Atleta non trovato",
    );
  }

  return firstText(
    movement.reference,
    raw.reference,
    movement.subjectName,
    movement.originEntityName,
    "-",
  );
};

const getEditableMovementId = (movement: NormalizedClubMovement) => {
  const raw = (movement.raw || {}) as any;
  return firstText(raw.id, movement.id);
};

const getMovementSourceType = (
  movement: NormalizedClubMovement,
): MovementSourceType => {
  const raw = (movement.raw || {}) as any;
  return firstText(movement.sourceTable, raw._sourceTable, raw.sourceTable);
};

const getMovementDate = (movement: NormalizedClubMovement) =>
  movement.paidAt || movement.date || movement.dueDate;

const normalizeStatusToken = (status?: string) =>
  String(status || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const isPaidStatus = (status?: string) =>
  [
    "paid",
    "pagato",
    "completed",
    "completato",
    "saldato",
    "issued",
  ].includes(normalizeStatusToken(status));

const isOverdueStatus = (status?: string) =>
  ["overdue", "scaduto"].includes(normalizeStatusToken(status));

const isPendingStatus = (status?: string) =>
  [
    "pending",
    "in_attesa",
    "overdue",
    "scaduto",
    "unpaid",
    "non_pagato",
  ].includes(normalizeStatusToken(status));

const statusLabel = (status?: string) => {
  const normalized = String(status || "").toLowerCase();
  if (["paid", "completed", "complete", "saldato", "pagato"].includes(normalized)) {
    return "Pagato";
  }
  if (["cancelled", "canceled", "annullato", "annullata"].includes(normalized)) {
    return "Annullato";
  }
  if (["overdue", "scaduto", "scaduta"].includes(normalized)) {
    return "Scaduto";
  }
  return "In attesa";
};

const sourceBadgeClassName = (source: NormalizedClubMovement["source"]) => {
  const styles: Record<string, string> = {
    athlete: "border-blue-200 bg-blue-50 text-blue-700",
    procura: "border-teal-200 bg-teal-50 text-teal-700",
    trainer: "border-violet-200 bg-violet-50 text-violet-700",
    sponsor: "border-emerald-200 bg-emerald-50 text-emerald-700",
    member: "border-cyan-200 bg-cyan-50 text-cyan-700",
    staff: "border-purple-200 bg-purple-50 text-purple-700",
    supplier: "border-orange-200 bg-orange-50 text-orange-700",
    structure: "border-lime-200 bg-lime-50 text-lime-700",
    transfer: "border-slate-200 bg-slate-50 text-slate-700",
    manual: "border-zinc-200 bg-zinc-50 text-zinc-700",
    invoice: "border-indigo-200 bg-indigo-50 text-indigo-700",
    receipt: "border-green-200 bg-green-50 text-green-700",
  };

  return styles[source] || "border-zinc-200 bg-zinc-50 text-zinc-700";
};

const escapeHtml = (value: unknown) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export default function MovementsPage() {
  const { showToast } = useToast();
  const { user, activeClub } = useAuth();
  const activeClubId = activeClub?.id || null;

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBankAccountFilter, setSelectedBankAccountFilter] =
    useState("all");
  const [loading, setLoading] = useState(true);
  const [showAddTransactionDialog, setShowAddTransactionDialog] =
    useState(false);
  const [showAddTransferDialog, setShowAddTransferDialog] = useState(false);
  const [showAddExpectedDialog, setShowAddExpectedDialog] = useState(false);
  const [expectedType, setExpectedType] = useState<"income" | "expense">(
    "income",
  );
  const [showAddInvoice, setShowAddInvoice] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any | null>(null);
  const [selectedMovement, setSelectedMovement] =
    useState<NormalizedClubMovement | null>(null);
  const [isMovementDetailOpen, setIsMovementDetailOpen] = useState(false);

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [clubPaymentMethodChoices, setClubPaymentMethodChoices] = useState<
    string[]
  >([]);
  const [clubMovements, setClubMovements] = useState<NormalizedClubMovement[]>(
    [],
  );
  const [expectedIncome, setExpectedIncome] = useState<any[]>([]);
  const [expectedExpenses, setExpectedExpenses] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [entityDirectory, setEntityDirectory] = useState<ClubEntityOption[]>([]);

  const [newTransaction, setNewTransaction] = useState({
    date: new Date().toISOString().split("T")[0],
    description: "",
    category: "",
    amount: 0,
    type: "income",
    paymentMethod: "",
    reference: "",
    bankAccountId: "",
  });

  const [newExpected, setNewExpected] = useState({
    date: new Date().toISOString().split("T")[0],
    description: "",
    category: "",
    amount: 0,
    reference: "",
    status: "pending",
    bankAccountId: "",
  });

  const [newTransfer, setNewTransfer] = useState({
    date: new Date().toISOString().split("T")[0],
    description: "",
    fromAccount: "",
    toAccount: "",
    amount: 0,
    status: "completed",
  });

  const bankAccountById = useMemo(
    () =>
      new Map(
        bankAccounts
          .filter((account) => account.id)
          .map((account) => [String(account.id), account]),
      ),
    [bankAccounts],
  );

  const invoiceByPaymentId = useMemo(
    () =>
      new Map(
        invoices
          .filter((invoice) => invoice.payment_id || invoice.paymentId)
          .map((invoice) => [
            String(invoice.payment_id || invoice.paymentId),
            invoice,
          ]),
      ),
    [invoices],
  );

  const receiptByPaymentId = useMemo(
    () =>
      new Map(
        receipts
          .filter((receipt) => receipt.payment_id || receipt.paymentId)
          .map((receipt) => [
            String(receipt.payment_id || receipt.paymentId),
            receipt,
          ]),
      ),
    [receipts],
  );

  const paymentById = useMemo(
    () =>
      new Map(
        payments
          .filter((payment) => payment.id)
          .map((payment) => [String(payment.id), payment]),
      ),
    [payments],
  );

  const loadData = useCallback(async () => {
    if (!activeClubId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { getClub } = await import("@/lib/simplified-db");
      const [financialSources, directoryData, clubRecord] = await Promise.all([
        loadClubFinancialSources(activeClubId),
        loadClubEntityDirectory(activeClubId),
        // I metodi di incasso del club servono a «Registra pagamento»: senza,
        // il metodo tornerebbe a essere testo libero (ADR-0036).
        getClub(activeClubId).catch(() => null),
      ]);
      setClubPaymentMethodChoices(
        getClubPaymentMethodChoices((clubRecord as any)?.settings),
      );
      const bankAccountsData = financialSources.bankAccounts || [];
      const transactionsData = financialSources.transactions || [];
      const expectedIncomeData = financialSources.expectedIncome || [];
      const expectedExpensesData = financialSources.expectedExpenses || [];
      const transfersData = financialSources.transfers || [];
      const invoicesData = financialSources.invoices || [];
      const receiptsData = financialSources.receipts || [];
      const paymentsData = [
        ...(financialSources.payments || []),
        ...(financialSources.simplifiedPayments || []),
      ];

      setEntityDirectory(directoryData);
      setBankAccounts(bankAccountsData);
      setTransactions(transactionsData);
      setExpectedIncome(expectedIncomeData);
      setExpectedExpenses(expectedExpensesData);
      // Anche i bonifici sono una cronologia: dal piu recente.
      setTransfers(sortByDateDesc(transfersData, paymentDateOf));
      setInvoices(invoicesData);
      setReceipts(receiptsData);
      setPayments(paymentsData);
      setClubMovements(
        aggregateClubPayments({
          ...financialSources,
          bankAccounts: bankAccountsData,
          transactions: transactionsData,
          expectedIncome: expectedIncomeData,
          expectedExpenses: expectedExpensesData,
          transfers: transfersData,
          invoices: invoicesData,
          receipts: receiptsData,
          payments: paymentsData,
        }),
      );
    } catch (error) {
      console.error("Error loading financial data:", error);
      showToast("error", "Errore nel caricamento dei dati finanziari");
    } finally {
      setLoading(false);
    }
  }, [activeClubId, showToast]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    if (!action) {
      return;
    }

    if (action === "new") {
      setShowAddTransactionDialog(true);
    }

    params.delete("action");
    const nextQuery = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname,
    );
  }, []);

  useEffect(() => {
    if (user && activeClubId) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [user, activeClubId, loadData]);

  const movementRows = useMemo(
    () =>
      clubMovements.length > 0
        ? clubMovements
        : aggregateClubPayments({ transactions, bankAccounts }),
    [bankAccounts, clubMovements, transactions],
  );

  const paidMovementRows = useMemo(
    () =>
      movementRows.filter(
        (movement) =>
          movement.direction === "transfer" || isPaidStatus(movement.status),
      ),
    [movementRows],
  );

  const expectedMovementRows = useMemo(
    () =>
      movementRows.filter(
        (movement) =>
          movement.direction !== "transfer" &&
          (isPendingStatus(movement.status) || isOverdueStatus(movement.status)),
      ),
    [movementRows],
  );

  const filterMovementRows = useCallback(
    (rows: NormalizedClubMovement[]) =>
      rows.filter((movement) => {
        const raw = (movement.raw || {}) as any;
        const searchableText = [
          movement.description,
          movement.category,
          movement.subjectName,
          movement.originEntityName,
          movement.source,
          movement.status,
          movement.reference,
          raw.reference,
        ]
          .join(" ")
          .toLowerCase();
        const matchesSearch =
          !searchQuery || searchableText.includes(searchQuery.toLowerCase());

        const accountId = movement.bankAccountId || raw.bankAccountId || raw.bank_account_id;
        const matchesAccount =
          selectedBankAccountFilter === "all" ||
          String(accountId) === selectedBankAccountFilter;

        return matchesSearch && matchesAccount;
      }),
    [searchQuery, selectedBankAccountFilter],
  );

  const filteredTransactions = useMemo(
    () => filterMovementRows(paidMovementRows),
    [filterMovementRows, paidMovementRows],
  );

  const filteredExpectedMovements = useMemo(
    () => filterMovementRows(expectedMovementRows),
    [expectedMovementRows, filterMovementRows],
  );

  const totals = useMemo(() => summarizeClubMovements(movementRows), [movementRows]);

  const resetNewTransaction = () => {
    setNewTransaction({
      date: new Date().toISOString().split("T")[0],
      description: "",
      category: "",
      amount: 0,
      type: "income",
      paymentMethod: "",
      reference: "",
      bankAccountId: bankAccounts[0]?.id || "",
    });
  };

  const resetNewExpected = () => {
    setNewExpected({
      date: new Date().toISOString().split("T")[0],
      description: "",
      category: "",
      amount: 0,
      reference: "",
      status: "pending",
      bankAccountId: bankAccounts[0]?.id || "",
    });
  };

  const resetNewTransfer = () => {
    setNewTransfer({
      date: new Date().toISOString().split("T")[0],
      description: "",
      fromAccount: bankAccounts[0]?.id || "",
      toAccount: bankAccounts[1]?.id || "",
      amount: 0,
      status: "completed",
    });
  };

  const handleAddTransaction = async () => {
    if (!activeClubId) {
      showToast("error", "Nessun club attivo trovato");
      return;
    }

    if (bankAccounts.length === 0) {
      showToast("error", "Devi prima creare almeno un conto corrente");
      return;
    }

    if (
      !newTransaction.category.trim() ||
      Number(newTransaction.amount) <= 0 ||
      !newTransaction.bankAccountId
    ) {
      showToast("error", "Compila tutti i campi obbligatori");
      return;
    }

    try {
      const newTransactionWithId = {
        ...newTransaction,
        amount: Number(newTransaction.amount),
        id: `transaction-${Date.now()}`,
      };

      await addClubData(activeClubId, "transactions", newTransactionWithId);

      const updatedBankAccounts = bankAccounts.map((account) => {
        if (account.id !== newTransaction.bankAccountId) {
          return account;
        }

        const balanceChange =
          newTransaction.type === "income"
            ? Number(newTransaction.amount)
            : -Number(newTransaction.amount);

        return {
          ...account,
          current_balance: Number(account.current_balance || 0) + balanceChange,
          updated_at: new Date().toISOString(),
        };
      });

      await updateClubDataArray(activeClubId, "bank_accounts", updatedBankAccounts);
      setShowAddTransactionDialog(false);
      resetNewTransaction();
      await loadData();
      showToast("success", "Transazione registrata con successo");
    } catch (error) {
      console.error("Error adding transaction:", error);
      showToast("error", "Errore nel salvare la transazione");
    }
  };

  const handleAddExpected = async () => {
    if (!activeClubId) {
      showToast("error", "Nessun club attivo trovato");
      return;
    }

    if (
      !newExpected.category.trim() ||
      Number(newExpected.amount) <= 0 ||
      !newExpected.bankAccountId
    ) {
      showToast("error", "Compila tutti i campi obbligatori");
      return;
    }

    try {
      const newExpectedWithId = {
        ...newExpected,
        amount: Number(newExpected.amount),
        id: `expected-${Date.now()}`,
      };
      const dataType =
        expectedType === "income" ? "expected_income" : "expected_expenses";

      await addClubData(activeClubId, dataType, newExpectedWithId);
      setShowAddExpectedDialog(false);
      resetNewExpected();
      await loadData();
      showToast(
        "success",
        expectedType === "income"
          ? "Entrata prevista registrata con successo"
          : "Uscita prevista registrata con successo",
      );
    } catch (error) {
      console.error("Error adding expected item:", error);
      showToast("error", "Errore nel salvare l'elemento previsto");
    }
  };

  const handleAddTransfer = async () => {
    if (!activeClubId) {
      showToast("error", "Nessun club attivo trovato");
      return;
    }

    if (
      !newTransfer.fromAccount ||
      !newTransfer.toAccount ||
      Number(newTransfer.amount) <= 0
    ) {
      showToast("error", "Compila tutti i campi obbligatori");
      return;
    }

    if (newTransfer.fromAccount === newTransfer.toAccount) {
      showToast("error", "Scegli due conti differenti");
      return;
    }

    try {
      const newTransferWithId = {
        ...newTransfer,
        amount: Number(newTransfer.amount),
        id: `transfer-${Date.now()}`,
      };

      await addClubData(activeClubId, "transfers", newTransferWithId);

      const updatedBankAccounts = bankAccounts.map((account) => {
        if (account.id === newTransfer.fromAccount) {
          return {
            ...account,
            current_balance:
              Number(account.current_balance || 0) - Number(newTransfer.amount),
            updated_at: new Date().toISOString(),
          };
        }
        if (account.id === newTransfer.toAccount) {
          return {
            ...account,
            current_balance:
              Number(account.current_balance || 0) + Number(newTransfer.amount),
            updated_at: new Date().toISOString(),
          };
        }
        return account;
      });

      await updateClubDataArray(activeClubId, "bank_accounts", updatedBankAccounts);
      setShowAddTransferDialog(false);
      resetNewTransfer();
      await loadData();
      showToast("success", "Giroconto registrato con successo");
    } catch (error) {
      console.error("Error adding transfer:", error);
      showToast("error", "Errore nel salvare il giroconto");
    }
  };

  const handleDeleteTransaction = async (transactionId: string) => {
    if (!activeClubId || !confirm("Sei sicuro di voler eliminare questa transazione?")) {
      return;
    }

    try {
      const transactionToDelete = transactions.find(
        (transaction) => String(transaction.id) === String(transactionId),
      );

      if (transactionToDelete) {
        const updatedBankAccounts = bankAccounts.map((account) => {
          if (account.id !== transactionToDelete.bankAccountId) {
            return account;
          }

          const balanceChange =
            transactionToDelete.type === "income"
              ? -Number(transactionToDelete.amount)
              : Number(transactionToDelete.amount);

          return {
            ...account,
            current_balance: Number(account.current_balance || 0) + balanceChange,
            updated_at: new Date().toISOString(),
          };
        });

        await updateClubDataArray(activeClubId, "bank_accounts", updatedBankAccounts);
      }

      await deleteClubDataItem(activeClubId, "transactions", transactionId);
      await loadData();
      showToast("success", "Transazione eliminata con successo");
    } catch (error) {
      console.error("Error deleting transaction:", error);
      showToast("error", "Errore nell'eliminare la transazione");
    }
  };

  const handleDeleteExpectedIncome = async (expectedId: string) => {
    if (
      !activeClubId ||
      !confirm("Sei sicuro di voler eliminare questa entrata prevista?")
    ) {
      return;
    }

    try {
      await deleteClubDataItem(activeClubId, "expected_income", expectedId);
      await loadData();
      showToast("success", "Entrata prevista eliminata con successo");
    } catch (error) {
      console.error("Error deleting expected income:", error);
      showToast("error", "Errore nell'eliminare l'entrata prevista");
    }
  };

  const handleDeleteExpectedExpense = async (expectedId: string) => {
    if (
      !activeClubId ||
      !confirm("Sei sicuro di voler eliminare questa uscita prevista?")
    ) {
      return;
    }

    try {
      await deleteClubDataItem(activeClubId, "expected_expenses", expectedId);
      await loadData();
      showToast("success", "Uscita prevista eliminata con successo");
    } catch (error) {
      console.error("Error deleting expected expense:", error);
      showToast("error", "Errore nell'eliminare l'uscita prevista");
    }
  };

  const handleDeleteTransfer = async (transferId: string) => {
    if (!activeClubId || !confirm("Sei sicuro di voler eliminare questo giroconto?")) {
      return;
    }

    try {
      const transferToDelete = transfers.find(
        (transfer) => String(transfer.id) === String(transferId),
      );

      if (transferToDelete) {
        const updatedBankAccounts = bankAccounts.map((account) => {
          if (account.id === transferToDelete.fromAccount) {
            return {
              ...account,
              current_balance:
                Number(account.current_balance || 0) +
                Number(transferToDelete.amount),
              updated_at: new Date().toISOString(),
            };
          }
          if (account.id === transferToDelete.toAccount) {
            return {
              ...account,
              current_balance:
                Number(account.current_balance || 0) -
                Number(transferToDelete.amount),
              updated_at: new Date().toISOString(),
            };
          }
          return account;
        });

        await updateClubDataArray(activeClubId, "bank_accounts", updatedBankAccounts);
      }

      await deleteClubDataItem(activeClubId, "transfers", transferId);
      await loadData();
      showToast("success", "Giroconto eliminato con successo");
    } catch (error) {
      console.error("Error deleting transfer:", error);
      showToast("error", "Errore nell'eliminare il giroconto");
    }
  };

  const handleConvertExpected = async (
    expected: any,
    type: "income" | "expense",
  ) => {
    if (!activeClubId) {
      return;
    }

    try {
      const convertedTransaction = {
        date: new Date().toISOString().split("T")[0],
        description: expected.description,
        category: expected.category,
        amount: Number(expected.amount),
        type,
        paymentMethod: "",
        reference: expected.reference,
        bankAccountId: expected.bankAccountId,
        id: `transaction-${Date.now()}`,
      };

      await addClubData(activeClubId, "transactions", convertedTransaction);

      const updatedBankAccounts = bankAccounts.map((account) => {
        if (account.id !== expected.bankAccountId) {
          return account;
        }

        const balanceChange =
          type === "income" ? Number(expected.amount) : -Number(expected.amount);

        return {
          ...account,
          current_balance: Number(account.current_balance || 0) + balanceChange,
          updated_at: new Date().toISOString(),
        };
      });

      await updateClubDataArray(activeClubId, "bank_accounts", updatedBankAccounts);
      await deleteClubDataItem(
        activeClubId,
        type === "income" ? "expected_income" : "expected_expenses",
        expected.id,
      );
      await loadData();
      showToast("success", "Convertito in transazione con successo");
    } catch (error) {
      console.error("Error converting expected to transaction:", error);
      showToast("error", "Errore nella conversione");
    }
  };

  const getCompatiblePayment = (movement: NormalizedClubMovement | null) => {
    if (!movement?.paymentId) {
      return null;
    }

    const payment = paymentById.get(String(movement.paymentId));
    if (payment) {
      return payment;
    }

    const raw = (movement.raw || {}) as any;
    return getMovementSourceType(movement) === "payments" &&
      String(raw.id) === String(movement.paymentId)
      ? raw
      : null;
  };

  const getLinkedInvoice = (movement: NormalizedClubMovement | null) => {
    if (!movement) {
      return null;
    }

    if (movement.paymentId && invoiceByPaymentId.has(String(movement.paymentId))) {
      return invoiceByPaymentId.get(String(movement.paymentId));
    }

    if (movement.invoiceId || movement.invoiceNumber) {
      return {
        id: movement.invoiceId,
        invoice_number: movement.invoiceNumber,
        issue_date: movement.invoiceDate,
      };
    }

    return null;
  };

  const getLinkedReceipt = (movement: NormalizedClubMovement | null) => {
    if (!movement) {
      return null;
    }

    if (movement.paymentId && receiptByPaymentId.has(String(movement.paymentId))) {
      return receiptByPaymentId.get(String(movement.paymentId));
    }

    if (movement.receiptId || movement.receiptNumber) {
      return {
        id: movement.receiptId,
        receipt_number: movement.receiptNumber,
        issue_date: movement.receiptDate,
      };
    }

    return null;
  };

  const openInvoiceModal = (movement: NormalizedClubMovement | null) => {
    const payment = getCompatiblePayment(movement);
    if (!payment) {
      showToast("error", "Fattura disponibile solo per pagamenti collegati");
      return;
    }

    setSelectedPayment(payment);
    setShowAddInvoice(true);
  };

  const handleCreateInvoice = async (invoiceData: any) => {
    if (!activeClubId || !selectedPayment) {
      return;
    }

    try {
      const { error } = await supabase.from("invoices").insert({
        organization_id: activeClubId,
        athlete_id: selectedPayment.athlete_id || null,
        payment_id: selectedPayment.id,
        invoice_number: invoiceData.invoiceNumber,
        issue_date: invoiceData.date,
        amount: Number(invoiceData.amount),
        description: invoiceData.description,
        payment_method: invoiceData.paymentMethod,
        status: invoiceData.status || "issued",
        is_electronic: Boolean(invoiceData.isElectronic),
        recipient_code: invoiceData.recipientCode || null,
        vat_number: invoiceData.vatNumber || null,
        fiscal_code: invoiceData.fiscalCode || null,
        address: invoiceData.address || null,
        city: invoiceData.city || null,
        postal_code: invoiceData.postalCode || null,
        province: invoiceData.province || null,
        country: invoiceData.country || "Italia",
        notes: invoiceData.notes || null,
      });

      if (error) {
        throw new Error(error.message);
      }

      setSelectedPayment(null);
      setShowAddInvoice(false);
      await loadData();
      showToast("success", "Fattura interna collegata al pagamento");
    } catch (error: any) {
      showToast(
        "error",
        error?.message || "Errore durante la creazione della fattura",
      );
    }
  };

  const handleGenerateReceipt = async (payment: any) => {
    if (!activeClubId || !payment?.id) {
      showToast("error", "Ricevuta disponibile solo per pagamenti collegati");
      return;
    }

    if (!isPaidStatus(payment.status)) {
      showToast("error", "La ricevuta puo essere generata solo per pagamenti saldati");
      return;
    }

    if (receiptByPaymentId.has(String(payment.id))) {
      showToast("success", "Ricevuta gia emessa");
      return;
    }

    try {
      /*
        La ricevuta la emette il server, e la emette **sull'incasso**.

        Qui dentro c'era una seconda implementazione: la riga veniva scritta
        dal browser, e il numero se lo calcolava contando le ricevute gia
        caricate in pagina. Due conseguenze, entrambe reali. Il numero
        dipendeva da cosa quella pagina aveva scaricato — due operatori
        collegati insieme ne producevano due uguali — e usava una forma
        (`R-2026-001`) diversa da quella del server. Adesso passa da
        `document-numbering`, che e il proprietario della numerazione
        (ADR-0044), attraverso la stessa rotta che usa la scheda atleta.
      */
      const { data: transactions, error: listError } = await apiRequest<any[]>(
        `/api/v1/payment-transactions?payment_id=${encodeURIComponent(payment.id)}`,
      );

      if (listError) {
        throw new Error(listError.message);
      }

      const settled = (transactions || []).find(
        (transaction: any) => !transaction.reversedAt && !transaction.reversed_at,
      );

      if (!settled) {
        showToast(
          "error",
          "Nessun incasso registrato su questa rata: la ricevuta si emette da un incasso",
        );
        return;
      }

      const { data, error } = await apiRequest<any>(
        `/api/v1/payment-transactions/${encodeURIComponent(settled.id)}`,
        { method: "POST", body: { action: "issue-receipt" } },
      );

      if (error) {
        throw new Error(error.message);
      }

      await loadData();
      showToast(
        "success",
        `Ricevuta ${data?.receipt_number || ""} emessa`.trim(),
      );
    } catch (error: any) {
      showToast(
        "error",
        error?.message || "Errore durante la generazione della ricevuta",
      );
    }
  };

  const handlePrintReceipt = () => {
    const receipt = getLinkedReceipt(selectedMovement);
    if (!selectedMovement || !receipt) {
      return;
    }

    const printWindow = window.open("", "_blank", "width=720,height=900");
    if (!printWindow) {
      showToast("error", "Impossibile aprire la finestra di stampa");
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Ricevuta ${escapeHtml(receipt.receipt_number || selectedMovement.receiptNumber)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #111827; }
            .box { border: 1px solid #d1d5db; border-radius: 8px; padding: 24px; }
            h1 { margin: 0 0 16px; }
            p { margin: 8px 0; }
          </style>
        </head>
        <body>
          <div class="box">
            <h1>Ricevuta</h1>
            <p><strong>Numero:</strong> ${escapeHtml(receipt.receipt_number || selectedMovement.receiptNumber || "-")}</p>
            <p><strong>Data:</strong> ${escapeHtml(formatDate(receipt.issue_date || selectedMovement.receiptDate))}</p>
            <p><strong>Soggetto:</strong> ${escapeHtml(selectedMovement.subjectName || selectedMovement.originEntityName || "-")}</p>
            <p><strong>Descrizione:</strong> ${escapeHtml(selectedMovement.description)}</p>
            <p><strong>Importo:</strong> ${escapeHtml(formatCurrency(selectedMovement.amount))}</p>
            <p><strong>Metodo:</strong> ${escapeHtml(selectedMovement.method || "-")}</p>
          </div>
          <script>window.print();</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const openMovementDetail = (movement: NormalizedClubMovement) => {
    setSelectedMovement(movement);
    setIsMovementDetailOpen(true);
  };

  const renderDocumentBadges = (movement: NormalizedClubMovement) => {
    const invoice = getLinkedInvoice(movement);
    const receipt = getLinkedReceipt(movement);

    return (
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={cn(
                "gap-1",
                invoice
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-500",
              )}
            >
              <FileText className="h-3.5 w-3.5" />
              {invoice ? "Fattura" : "-"}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {invoice
                ? `Fattura emessa: ${movement.invoiceNumber || invoice.invoice_number || "-"}`
                : "Nessuna fattura"}
            </p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={cn(
                "gap-1",
                receipt
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-slate-200 text-slate-500",
              )}
            >
              <Receipt className="h-3.5 w-3.5" />
              {receipt ? "Ricevuta" : "-"}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {receipt
                ? `Ricevuta emessa: ${movement.receiptNumber || receipt.receipt_number || "-"}`
                : "Nessuna ricevuta"}
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  };

  const renderMovementActions = (movement: NormalizedClubMovement) => {
    const sourceType = getMovementSourceType(movement);
    const editableId = getEditableMovementId(movement);

    const stop = (event: MouseEvent) => event.stopPropagation();

    if (sourceType === "transactions" && movement.canDelete) {
      return (
        <div className="flex justify-end gap-1" onClick={stop}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button type="button" variant="ghost" size="icon" disabled>
                  <Edit className="h-4 w-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>Modifica non ancora disponibile</p>
            </TooltipContent>
          </Tooltip>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => handleDeleteTransaction(editableId)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => openMovementDetail(movement)}
          >
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      );
    }

    if (sourceType === "expected_income" || sourceType === "expected_expenses") {
      const raw = movement.raw as any;
      return (
        <div className="flex justify-end gap-1" onClick={stop}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Converti in transazione"
            onClick={() =>
              handleConvertExpected(
                raw,
                sourceType === "expected_income" ? "income" : "expense",
              )
            }
          >
            <ArrowDownUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Elimina"
            onClick={() =>
              sourceType === "expected_income"
                ? handleDeleteExpectedIncome(editableId)
                : handleDeleteExpectedExpense(editableId)
            }
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => openMovementDetail(movement)}
          >
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      );
    }

    if (sourceType === "transfers" && movement.canDelete) {
      return (
        <div className="flex justify-end gap-1" onClick={stop}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => handleDeleteTransfer(editableId)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => openMovementDetail(movement)}
          >
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      );
    }

    return (
      <div className="flex justify-end gap-1" onClick={stop}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button type="button" variant="ghost" size="icon" disabled>
                <Trash2 className="h-4 w-4" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>Movimento generato da altra sezione</p>
          </TooltipContent>
        </Tooltip>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => openMovementDetail(movement)}
        >
          <Eye className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  const activeInvoice = getLinkedInvoice(selectedMovement);
  const activeReceipt = getLinkedReceipt(selectedMovement);
  const activePayment = getCompatiblePayment(selectedMovement);
  const selectedMovementEmail = getSubjectEmail(selectedMovement);
  const selectedMovementPhone = getSubjectPhone(selectedMovement);
  const canCreateInvoice = Boolean(selectedMovement && activePayment && !activeInvoice);
  const canCreateReceipt = Boolean(
      selectedMovement &&
      activePayment &&
      isPaidStatus(activePayment?.status || selectedMovement.status) &&
      !activeReceipt,
  );
  const createInvoiceReason = !selectedMovement?.paymentId
    ? "Fattura disponibile solo per pagamenti collegati"
    : !activePayment
      ? "Pagamento non compatibile con fattura interna"
      : "Fattura gia emessa";
  const createReceiptReason = !selectedMovement?.paymentId
    ? "Ricevuta disponibile solo per pagamenti collegati"
    : !activePayment
      ? "Ricevuta disponibile solo per pagamenti collegati"
      : !isPaidStatus(activePayment?.status || selectedMovement.status)
        ? "Ricevuta disponibile solo per movimenti saldati"
        : "Ricevuta gia emessa";

  if (loading) {
    return (
      <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Movimenti Finanziari" />
          <main className={dashboardMainClassName}>
            <DashboardPageContainer>
              <div className="flex h-64 items-center justify-center">
                <div className="text-lg">Caricamento dati finanziari...</div>
              </div>
            </DashboardPageContainer>
          </main>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Movimenti Finanziari" />
          <main className={dashboardMainClassName}>
            <DashboardPageContainer>
              <SharedPageHeader
                title="Movimenti Finanziari"
                subtitle="Centro contabile unico per entrate, uscite, giroconti, fatture e ricevute."
              />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Entrate</p>
                        <p className="text-2xl font-bold text-green-600">
                          {formatCurrency(totals.totalIncome)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Previste: {formatCurrency(totals.totalPendingIncome)}
                        </p>
                      </div>
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                        <ArrowUp className="h-6 w-6 text-green-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Uscite</p>
                        <p className="text-2xl font-bold text-red-600">
                          {formatCurrency(totals.totalExpense)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Previste: {formatCurrency(totals.totalPendingExpense)}
                        </p>
                      </div>
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                        <ArrowDown className="h-6 w-6 text-red-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Saldo</p>
                        <p
                          className={cn(
                            "text-2xl font-bold",
                            totals.balance >= 0 ? "text-blue-600" : "text-red-600",
                          )}
                        >
                          {formatCurrency(totals.balance)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Pagati: {totals.paidCount} | Aperti: {totals.pendingCount}
                        </p>
                      </div>
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                        <ArrowDownUp className="h-6 w-6 text-blue-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <Tabs defaultValue="transactions" className="w-full">
                  <CardHeader className="border-b">
                    <TabsList className="flex w-fit justify-start self-start">
                      <TabsTrigger value="transactions">Movimenti</TabsTrigger>
                      <TabsTrigger value="expected">Previsti</TabsTrigger>
                      <TabsTrigger value="transfers">Giroconti</TabsTrigger>
                    </TabsList>
                  </CardHeader>

                  <TabsContent value="transactions" className="m-0 p-4">
                    <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="flex w-full flex-col gap-3 md:max-w-2xl md:flex-row">
                        <div className="relative w-full">
                          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                          <Input
                            type="text"
                            placeholder="Cerca per descrizione, origine, soggetto..."
                            className="pl-8"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                          />
                        </div>
                        <select
                          className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 md:max-w-xs"
                          value={selectedBankAccountFilter}
                          onChange={(event) =>
                            setSelectedBankAccountFilter(event.target.value)
                          }
                        >
                          <option value="all">Tutti i conti</option>
                          {bankAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Button onClick={() => setShowAddTransactionDialog(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nuova Transazione
                      </Button>
                    </div>

                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Importo</TableHead>
                            <TableHead>Descrizione</TableHead>
                            <TableHead>Riferimento</TableHead>
                            <TableHead>Metodo</TableHead>
                            <TableHead>Conto</TableHead>
                            <TableHead>Documenti</TableHead>
                            <TableHead className="text-right">Azioni</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredTransactions.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={8} className="py-6 text-center">
                                Nessun movimento trovato
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredTransactions.map((movement) => {
                              const raw = (movement.raw || {}) as any;
                              const accountName =
                                movement.bankAccountName ||
                                bankAccountById.get(
                                  String(
                                    movement.bankAccountId ||
                                      raw.bankAccountId ||
                                      raw.bank_account_id ||
                                      "",
                                  ),
                                )?.name ||
                                "-";
                              const reference = getMovementReference(movement);
                              const method =
                                movement.method ||
                                raw.method ||
                                raw.paymentMethod ||
                                raw.payment_method ||
                                "-";
                              const isIncome = movement.direction === "income";
                              const isExpense = movement.direction === "expense";
                              const DirectionIcon = isIncome
                                ? ArrowUp
                                : isExpense
                                  ? ArrowDown
                                  : ArrowDownUp;

                              return (
                                <TableRow
                                  key={`${movement.source}-${movement.id}`}
                                  className="cursor-pointer"
                                  onClick={() => openMovementDetail(movement)}
                                >
                                  <TableCell className="whitespace-nowrap">
                                    {formatDate(getMovementDate(movement))}
                                  </TableCell>
                                  <TableCell
                                    className={cn(
                                      "whitespace-nowrap",
                                      isIncome && "text-green-700",
                                      isExpense && "text-red-700",
                                      !isIncome && !isExpense && "text-slate-700",
                                    )}
                                  >
                                    <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-1 font-semibold">
                                        <DirectionIcon className="h-4 w-4" />
                                        <span>
                                        {isIncome ? "+" : isExpense ? "-" : ""}
                                        {formatCurrency(movement.amount)}
                                        </span>
                                      </div>
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          "w-fit",
                                          isIncome &&
                                            "border-green-200 bg-green-50 text-green-700",
                                          isExpense &&
                                            "border-red-200 bg-red-50 text-red-700",
                                          !isIncome &&
                                            !isExpense &&
                                            "border-slate-200 bg-slate-50 text-slate-700",
                                        )}
                                      >
                                        {isIncome
                                          ? "Entrata"
                                          : isExpense
                                            ? "Uscita"
                                            : "Trasferimento"}
                                      </Badge>
                                    </div>
                                  </TableCell>
                                  <TableCell className="min-w-[260px]">
                                    <div className="space-y-2">
                                      <div className="font-medium">
                                        {movement.description || "-"}
                                      </div>
                                      <div className="flex flex-wrap gap-1.5">
                                        <Badge
                                          variant="outline"
                                          className={sourceBadgeClassName(movement.source)}
                                        >
                                          {getMovementSourceLabel(movement.source)}
                                        </Badge>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="min-w-[180px]">
                                    {reference}
                                  </TableCell>
                                  <TableCell className="min-w-[130px]">
                                    {method}
                                  </TableCell>
                                  <TableCell className="min-w-[150px]">
                                    {accountName}
                                  </TableCell>
                                  <TableCell>{renderDocumentBadges(movement)}</TableCell>
                                  <TableCell className="text-right">
                                    {renderMovementActions(movement)}
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  <TabsContent value="expected" className="m-0 p-4">
                    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="flex gap-2">
                        <Button
                          variant={expectedType === "income" ? "default" : "outline"}
                          onClick={() => setExpectedType("income")}
                        >
                          Entrate Previste
                        </Button>
                        <Button
                          variant={expectedType === "expense" ? "default" : "outline"}
                          onClick={() => setExpectedType("expense")}
                        >
                          Uscite Previste
                        </Button>
                      </div>
                      <Button onClick={() => setShowAddExpectedDialog(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nuovo Previsto
                      </Button>
                    </div>

                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Importo</TableHead>
                            <TableHead>Descrizione</TableHead>
                            <TableHead>Riferimento</TableHead>
                            <TableHead>Metodo</TableHead>
                            <TableHead>Conto</TableHead>
                            <TableHead>Documenti</TableHead>
                            <TableHead className="text-right">Azioni</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredExpectedMovements.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={8} className="py-6 text-center">
                                Nessun previsto trovato
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredExpectedMovements.map((movement) => {
                              const raw = (movement.raw || {}) as any;
                              const accountName =
                                movement.bankAccountName ||
                                bankAccountById.get(
                                  String(
                                    movement.bankAccountId ||
                                      raw.bankAccountId ||
                                      raw.bank_account_id ||
                                      "",
                                  ),
                                )?.name ||
                                "-";
                              const reference = getMovementReference(movement);
                              const method =
                                movement.method ||
                                raw.method ||
                                raw.paymentMethod ||
                                raw.payment_method ||
                                "-";
                              const isIncome = movement.direction === "income";
                              const isExpense = movement.direction === "expense";
                              const DirectionIcon = isIncome
                                ? ArrowUp
                                : isExpense
                                  ? ArrowDown
                                  : ArrowDownUp;

                              return (
                                <TableRow
                                  key={`${movement.source}-${movement.id}`}
                                  className="cursor-pointer"
                                  onClick={() => openMovementDetail(movement)}
                                >
                                  <TableCell className="whitespace-nowrap">
                                    {formatDate(getMovementDate(movement))}
                                  </TableCell>
                                  <TableCell
                                    className={cn(
                                      "whitespace-nowrap",
                                      isIncome && "text-green-700",
                                      isExpense && "text-red-700",
                                      !isIncome && !isExpense && "text-slate-700",
                                    )}
                                  >
                                    <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-1 font-semibold">
                                        <DirectionIcon className="h-4 w-4" />
                                        <span>
                                          {isIncome ? "+" : isExpense ? "-" : ""}
                                          {formatCurrency(movement.amount)}
                                        </span>
                                      </div>
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          "w-fit",
                                          isIncome &&
                                            "border-green-200 bg-green-50 text-green-700",
                                          isExpense &&
                                            "border-red-200 bg-red-50 text-red-700",
                                          !isIncome &&
                                            !isExpense &&
                                            "border-slate-200 bg-slate-50 text-slate-700",
                                        )}
                                      >
                                        {isIncome
                                          ? "Entrata"
                                          : isExpense
                                            ? "Uscita"
                                            : "Trasferimento"}
                                      </Badge>
                                    </div>
                                  </TableCell>
                                  <TableCell className="min-w-[260px]">
                                    <div className="space-y-2">
                                      <div className="font-medium">
                                        {movement.description || "-"}
                                      </div>
                                      <Badge
                                        variant="outline"
                                        className={sourceBadgeClassName(movement.source)}
                                      >
                                        {getMovementSourceLabel(movement.source)}
                                      </Badge>
                                    </div>
                                  </TableCell>
                                  <TableCell className="min-w-[180px]">
                                    {reference}
                                  </TableCell>
                                  <TableCell className="min-w-[130px]">
                                    {method}
                                  </TableCell>
                                  <TableCell className="min-w-[150px]">
                                    {accountName}
                                  </TableCell>
                                  <TableCell>{renderDocumentBadges(movement)}</TableCell>
                                  <TableCell className="text-right">
                                    {renderMovementActions(movement)}
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  <TabsContent value="transfers" className="m-0 p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-lg font-medium">Giroconti tra conti</h3>
                      <Button onClick={() => setShowAddTransferDialog(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nuovo Giroconto
                      </Button>
                    </div>

                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Descrizione</TableHead>
                            <TableHead>Da Conto</TableHead>
                            <TableHead>A Conto</TableHead>
                            <TableHead>Importo</TableHead>
                            <TableHead className="text-right">Azioni</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transfers.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="py-6 text-center">
                                Nessun giroconto trovato
                              </TableCell>
                            </TableRow>
                          ) : (
                            transfers.map((transfer) => (
                              <TableRow key={transfer.id}>
                                <TableCell>{formatDate(transfer.date)}</TableCell>
                                <TableCell>{transfer.description || "-"}</TableCell>
                                <TableCell>
                                  {bankAccountById.get(String(transfer.fromAccount))
                                    ?.name || "-"}
                                </TableCell>
                                <TableCell>
                                  {bankAccountById.get(String(transfer.toAccount))
                                    ?.name || "-"}
                                </TableCell>
                                <TableCell>
                                  {formatCurrency(Number(transfer.amount))}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteTransfer(transfer.id)}
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
                  </TabsContent>
                </Tabs>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Conti</CardTitle>
                </CardHeader>
                <CardContent>
                  <BankAccountList
                    bankAccounts={bankAccounts}
                    setBankAccounts={setBankAccounts}
                    activeClubId={activeClubId}
                  />
                </CardContent>
              </Card>
            </DashboardPageContainer>
          </main>
        </div>

        <AdvancedTransactionDialog
          open={showAddTransactionDialog}
          onOpenChange={setShowAddTransactionDialog}
          clubId={activeClubId || ""}
          bankAccounts={bankAccounts}
          entities={entityDirectory}
          onSaved={loadData}
        />

        <Dialog open={showAddExpectedDialog} onOpenChange={setShowAddExpectedDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {expectedType === "income"
                  ? "Aggiungi Entrata Prevista"
                  : "Aggiungi Uscita Prevista"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="expected-date">Data Prevista</Label>
                <Input
                  id="expected-date"
                  name="date"
                  type="date"
                  value={newExpected.date}
                  onChange={(event) =>
                    setNewExpected((prev) => ({
                      ...prev,
                      date: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expected-description">
                  Descrizione (opzionale)
                </Label>
                <Input
                  id="expected-description"
                  name="description"
                  placeholder="Descrizione"
                  value={newExpected.description}
                  onChange={(event) =>
                    setNewExpected((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="expected-category">Categoria</Label>
                  <Input
                    id="expected-category"
                    name="category"
                    placeholder="Categoria"
                    value={newExpected.category}
                    onChange={(event) =>
                      setNewExpected((prev) => ({
                        ...prev,
                        category: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expected-amount">Importo (EUR)</Label>
                  <Input
                    id="expected-amount"
                    name="amount"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={newExpected.amount}
                    onChange={(event) =>
                      setNewExpected((prev) => ({
                        ...prev,
                        amount: Number(event.target.value),
                      }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="expected-bankAccountId">Conto Corrente</Label>
                <select
                  id="expected-bankAccountId"
                  name="bankAccountId"
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                  value={newExpected.bankAccountId}
                  onChange={(event) =>
                    setNewExpected((prev) => ({
                      ...prev,
                      bankAccountId: event.target.value,
                    }))
                  }
                >
                  <option value="">Seleziona un conto</option>
                  {bankAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="expected-reference">Riferimento</Label>
                <Input
                  id="expected-reference"
                  name="reference"
                  placeholder="Riferimento (es. nome atleta, fornitore)"
                  value={newExpected.reference}
                  onChange={(event) =>
                    setNewExpected((prev) => ({
                      ...prev,
                      reference: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowAddExpectedDialog(false)}
              >
                Annulla
              </Button>
              <Button onClick={handleAddExpected}>Salva</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showAddTransferDialog} onOpenChange={setShowAddTransferDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Aggiungi Giroconto</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="transfer-date">Data</Label>
                <Input
                  id="transfer-date"
                  name="date"
                  type="date"
                  value={newTransfer.date}
                  onChange={(event) =>
                    setNewTransfer((prev) => ({
                      ...prev,
                      date: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="transfer-description">
                  Descrizione (opzionale)
                </Label>
                <Input
                  id="transfer-description"
                  name="description"
                  placeholder="Descrizione del giroconto"
                  value={newTransfer.description}
                  onChange={(event) =>
                    setNewTransfer((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="transfer-fromAccount">Da Conto</Label>
                <select
                  id="transfer-fromAccount"
                  name="fromAccount"
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                  value={newTransfer.fromAccount}
                  onChange={(event) =>
                    setNewTransfer((prev) => ({
                      ...prev,
                      fromAccount: event.target.value,
                    }))
                  }
                >
                  <option value="">Seleziona un conto</option>
                  {bankAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} - {formatCurrency(account.current_balance || 0)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="transfer-toAccount">A Conto</Label>
                <select
                  id="transfer-toAccount"
                  name="toAccount"
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                  value={newTransfer.toAccount}
                  onChange={(event) =>
                    setNewTransfer((prev) => ({
                      ...prev,
                      toAccount: event.target.value,
                    }))
                  }
                >
                  <option value="">Seleziona un conto</option>
                  {bankAccounts.map((account) => (
                    <option
                      key={account.id}
                      value={account.id}
                      disabled={account.id === newTransfer.fromAccount}
                    >
                      {account.name} - {formatCurrency(account.current_balance || 0)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="transfer-amount">Importo (EUR)</Label>
                <Input
                  id="transfer-amount"
                  name="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={newTransfer.amount}
                  onChange={(event) =>
                    setNewTransfer((prev) => ({
                      ...prev,
                      amount: Number(event.target.value),
                    }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowAddTransferDialog(false)}
              >
                Annulla
              </Button>
              <Button onClick={handleAddTransfer}>Salva</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <MovementDetailPanel
          open={isMovementDetailOpen}
          onOpenChange={(open) => {
            setIsMovementDetailOpen(open);
            if (!open) {
              setSelectedMovement(null);
            }
          }}
          movement={selectedMovement}
          sourceLabel={
            selectedMovement
              ? getMovementSourceLabel(selectedMovement.source)
              : "-"
          }
          statusLabel={statusLabel(selectedMovement?.status)}
          subjectEmail={selectedMovementEmail}
          subjectPhone={selectedMovementPhone}
          invoice={activeInvoice}
          receipt={activeReceipt}
          canCreateInvoice={canCreateInvoice}
          canCreateReceipt={canCreateReceipt}
          createInvoiceReason={createInvoiceReason}
          createReceiptReason={createReceiptReason}
          emailReason={
            selectedMovementEmail
              ? "Invio email non configurato"
              : "Email soggetto non disponibile"
          }
          formatCurrency={formatCurrency}
          formatDate={formatDate}
          onCreateInvoice={() => openInvoiceModal(selectedMovement)}
          onCreateReceipt={() => handleGenerateReceipt(activePayment)}
          onPrintReceipt={handlePrintReceipt}
          ledgerSlot={
            activePayment?.athlete_id ? (
              <AthletePaymentLedger
                athleteId={String(activePayment.athlete_id)}
                athleteName={
                  selectedMovement?.subjectName ||
                  selectedMovement?.originEntityName ||
                  null
                }
                charges={[activePayment]}
                methodChoices={clubPaymentMethodChoices}
                showTotals={false}
                onLedgerChanged={() => {
                  void loadData();
                }}
              />
            ) : null
          }
        />

        <AddInvoiceForm
          isOpen={showAddInvoice}
          onClose={() => {
            setShowAddInvoice(false);
            setSelectedPayment(null);
          }}
          onSubmit={handleCreateInvoice}
          athleteId={selectedPayment?.athlete_id || ""}
          athleteName={
            selectedMovement?.subjectName ||
            selectedMovement?.originEntityName ||
            ""
          }
        />
      </div>
    </TooltipProvider>
  );
}
