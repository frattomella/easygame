"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-notification";
import { BankAccountList } from "@/components/accounting/BankAccountList";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  getClubData,
  addClubData,
  updateClubDataItem,
  deleteClubDataItem,
} from "@/lib/simplified-db";
import {
  ArrowDownUp,
  ArrowUp,
  ArrowDown,
  Plus,
  Search,
  Trash2,
  Edit,
  FileText,
  Euro,
  Calendar,
  CreditCard,
  Building,
  User,
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function MovementsPage() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddTransactionDialog, setShowAddTransactionDialog] =
    useState(false);
  const [showAddTransferDialog, setShowAddTransferDialog] = useState(false);
  const [showAddExpectedDialog, setShowAddExpectedDialog] = useState(false);
  const [expectedType, setExpectedType] = useState("income"); // income or expense
  const [selectedBankAccountFilter, setSelectedBankAccountFilter] =
    useState("all");
  const [loading, setLoading] = useState(true);
  const [activeClubId, setActiveClubId] = useState<string | null>(null);

  // Bank accounts state
  const [bankAccounts, setBankAccounts] = useState([]);

  // Data for transactions
  const [transactions, setTransactions] = useState([]);

  // Data for expected income
  const [expectedIncome, setExpectedIncome] = useState([]);

  // Data for expected expenses
  const [expectedExpenses, setExpectedExpenses] = useState([]);

  // Data for transfers
  const [transfers, setTransfers] = useState([]);

  // Get active club from AuthProvider
  const { activeClub } = useAuth();

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
    const nextUrl = nextQuery
      ? `${window.location.pathname}?${nextQuery}`
      : window.location.pathname;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, []);

  // Load data from database
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        // Check if active club is available
        if (!activeClub?.id) {
          showToast("error", "Nessun club attivo trovato");
          return;
        }

        setActiveClubId(activeClub.id);

        // Load all financial data
        const [
          bankAccountsData,
          transactionsData,
          expectedIncomeData,
          expectedExpensesData,
          transfersData,
        ] = await Promise.all([
          getClubData(activeClub.id, "bank_accounts"),
          getClubData(activeClub.id, "transactions"),
          getClubData(activeClub.id, "expected_income"),
          getClubData(activeClub.id, "expected_expenses"),
          getClubData(activeClub.id, "transfers"),
        ]);

        setBankAccounts(bankAccountsData || []);
        setTransactions(transactionsData || []);
        setExpectedIncome(expectedIncomeData || []);
        setExpectedExpenses(expectedExpensesData || []);
        setTransfers(transfersData || []);
      } catch (error) {
        console.error("Error loading financial data:", error);
        showToast("error", "Errore nel caricamento dei dati finanziari");
      } finally {
        setLoading(false);
      }
    };

    if (user && activeClub?.id) {
      loadData();
    }
  }, [user, activeClub?.id, showToast]);

  // New transaction form state
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

  // New expected income/expense form state
  const [newExpected, setNewExpected] = useState({
    date: new Date().toISOString().split("T")[0],
    description: "",
    category: "",
    amount: 0,
    reference: "",
    status: "pending",
    bankAccountId: "1",
  });

  // New transfer form state
  const [newTransfer, setNewTransfer] = useState({
    date: new Date().toISOString().split("T")[0],
    description: "",
    fromAccount: "",
    toAccount: "",
    amount: 0,
    status: "completed",
  });

  // Filter transactions based on search query and selected bank account
  const filteredTransactions = transactions.filter((transaction) => {
    const matchesSearch =
      transaction.description
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      transaction.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      transaction.reference.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesAccount =
      selectedBankAccountFilter === "all" ||
      transaction.bankAccountId === selectedBankAccountFilter;

    return matchesSearch && matchesAccount;
  });

  // Handle transaction form change
  const handleTransactionChange = (e) => {
    const { name, value } = e.target;
    setNewTransaction({ ...newTransaction, [name]: value });
  };

  // Handle expected income/expense form change
  const handleExpectedChange = (e) => {
    const { name, value } = e.target;
    setNewExpected({ ...newExpected, [name]: value });
  };

  // Handle transfer form change
  const handleTransferChange = (e) => {
    const { name, value } = e.target;
    setNewTransfer({ ...newTransfer, [name]: value });
  };

  // Add new transaction
  const handleAddTransaction = async () => {
    // Check if there are any bank accounts available
    if (bankAccounts.length === 0) {
      showToast("error", "Devi prima creare almeno un conto corrente");
      return;
    }

    if (
      !newTransaction.category.trim() ||
      newTransaction.amount <= 0 ||
      !newTransaction.bankAccountId ||
      !activeClubId
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

      // Save transaction to database
      await addClubData(activeClubId, "transactions", newTransactionWithId);

      // Update bank account balance
      const updatedBankAccounts = bankAccounts.map((account) => {
        if (account.id === newTransaction.bankAccountId) {
          const balanceChange =
            newTransaction.type === "income"
              ? Number(newTransaction.amount)
              : -Number(newTransaction.amount);

          return {
            ...account,
            current_balance: account.current_balance + balanceChange,
            updated_at: new Date().toISOString(),
          };
        }
        return account;
      });

      // Update bank accounts in database using the correct function
      const { updateClubDataArray } = await import("@/lib/simplified-db");
      await updateClubDataArray(
        activeClubId,
        "bank_accounts",
        updatedBankAccounts,
      );

      setBankAccounts(updatedBankAccounts);
      setTransactions([...transactions, newTransactionWithId]);
      setShowAddTransactionDialog(false);
      resetNewTransaction();
      showToast("success", "Transazione registrata con successo");
    } catch (error) {
      console.error("Error adding transaction:", error);
      showToast("error", "Errore nel salvare la transazione");
    }
  };

  // Add new expected income/expense
  const handleAddExpected = async () => {
    if (
      !newExpected.category ||
      newExpected.amount <= 0 ||
      !newExpected.bankAccountId ||
      !activeClubId
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

      // Save to database
      await addClubData(activeClubId, dataType, newExpectedWithId);

      if (expectedType === "income") {
        setExpectedIncome([...expectedIncome, newExpectedWithId]);
      } else {
        setExpectedExpenses([...expectedExpenses, newExpectedWithId]);
      }

      setShowAddExpectedDialog(false);
      resetNewExpected();
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

  // Add new transfer
  const handleAddTransfer = async () => {
    if (
      !newTransfer.fromAccount ||
      !newTransfer.toAccount ||
      newTransfer.amount <= 0 ||
      !activeClubId
    ) {
      showToast("error", "Compila tutti i campi obbligatori");
      return;
    }

    try {
      const newTransferWithId = {
        ...newTransfer,
        amount: Number(newTransfer.amount),
        id: `transfer-${Date.now()}`,
      };

      // Save transfer to database
      await addClubData(activeClubId, "transfers", newTransferWithId);

      // Update bank account balances
      const updatedBankAccounts = bankAccounts.map((account) => {
        if (account.id === newTransfer.fromAccount) {
          return {
            ...account,
            current_balance:
              account.current_balance - Number(newTransfer.amount),
            updated_at: new Date().toISOString(),
          };
        }
        if (account.id === newTransfer.toAccount) {
          return {
            ...account,
            current_balance:
              account.current_balance + Number(newTransfer.amount),
            updated_at: new Date().toISOString(),
          };
        }
        return account;
      });

      // Update bank accounts in database
      await updateClubDataItem(
        activeClubId,
        "bank_accounts",
        updatedBankAccounts,
      );

      setBankAccounts(updatedBankAccounts);
      setTransfers([...transfers, newTransferWithId]);
      setShowAddTransferDialog(false);
      resetNewTransfer();
      showToast("success", "Giroconto registrato con successo");
    } catch (error) {
      console.error("Error adding transfer:", error);
      showToast("error", "Errore nel salvare il giroconto");
    }
  };

  // Delete transaction
  const handleDeleteTransaction = async (transactionId) => {
    if (
      confirm("Sei sicuro di voler eliminare questa transazione?") &&
      activeClubId
    ) {
      try {
        const transactionToDelete = transactions.find(
          (t) => t.id === transactionId,
        );

        if (transactionToDelete) {
          // Update bank account balance
          const updatedBankAccounts = bankAccounts.map((account) => {
            if (account.id === transactionToDelete.bankAccountId) {
              const balanceChange =
                transactionToDelete.type === "income"
                  ? -transactionToDelete.amount
                  : transactionToDelete.amount;

              return {
                ...account,
                current_balance: account.current_balance + balanceChange,
                updated_at: new Date().toISOString(),
              };
            }
            return account;
          });

          // Update bank accounts in database
          await updateClubDataItem(
            activeClubId,
            "bank_accounts",
            updatedBankAccounts,
          );
          setBankAccounts(updatedBankAccounts);
        }

        // Delete transaction from database
        await deleteClubDataItem(activeClubId, "transactions", transactionId);

        setTransactions(
          transactions.filter(
            (transaction) => transaction.id !== transactionId,
          ),
        );
        showToast("success", "Transazione eliminata con successo");
      } catch (error) {
        console.error("Error deleting transaction:", error);
        showToast("error", "Errore nell'eliminare la transazione");
      }
    }
  };

  // Delete expected income
  const handleDeleteExpectedIncome = async (expectedId) => {
    if (
      confirm("Sei sicuro di voler eliminare questa entrata prevista?") &&
      activeClubId
    ) {
      try {
        await deleteClubDataItem(activeClubId, "expected_income", expectedId);
        setExpectedIncome(
          expectedIncome.filter((expected) => expected.id !== expectedId),
        );
        showToast("success", "Entrata prevista eliminata con successo");
      } catch (error) {
        console.error("Error deleting expected income:", error);
        showToast("error", "Errore nell'eliminare l'entrata prevista");
      }
    }
  };

  // Delete expected expense
  const handleDeleteExpectedExpense = async (expectedId) => {
    if (
      confirm("Sei sicuro di voler eliminare questa uscita prevista?") &&
      activeClubId
    ) {
      try {
        await deleteClubDataItem(activeClubId, "expected_expenses", expectedId);
        setExpectedExpenses(
          expectedExpenses.filter((expected) => expected.id !== expectedId),
        );
        showToast("success", "Uscita prevista eliminata con successo");
      } catch (error) {
        console.error("Error deleting expected expense:", error);
        showToast("error", "Errore nell'eliminare l'uscita prevista");
      }
    }
  };

  // Delete transfer
  const handleDeleteTransfer = async (transferId) => {
    if (
      confirm("Sei sicuro di voler eliminare questo giroconto?") &&
      activeClubId
    ) {
      try {
        const transferToDelete = transfers.find((t) => t.id === transferId);
        if (transferToDelete) {
          // Update bank account balances
          const updatedBankAccounts = bankAccounts.map((account) => {
            if (account.id === transferToDelete.fromAccount) {
              return {
                ...account,
                current_balance:
                  account.current_balance + transferToDelete.amount,
                updated_at: new Date().toISOString(),
              };
            }
            if (account.id === transferToDelete.toAccount) {
              return {
                ...account,
                current_balance:
                  account.current_balance - transferToDelete.amount,
                updated_at: new Date().toISOString(),
              };
            }
            return account;
          });

          // Update bank accounts in database
          await updateClubDataItem(
            activeClubId,
            "bank_accounts",
            updatedBankAccounts,
          );
          setBankAccounts(updatedBankAccounts);
        }

        // Delete transfer from database
        await deleteClubDataItem(activeClubId, "transfers", transferId);
        setTransfers(
          transfers.filter((transfer) => transfer.id !== transferId),
        );
        showToast("success", "Giroconto eliminato con successo");
      } catch (error) {
        console.error("Error deleting transfer:", error);
        showToast("error", "Errore nell'eliminare il giroconto");
      }
    }
  };

  // Convert expected to transaction
  const handleConvertExpected = async (expected, type) => {
    if (!activeClubId) return;

    try {
      const newTransaction = {
        date: new Date().toISOString().split("T")[0],
        description: expected.description,
        category: expected.category,
        amount: expected.amount,
        type: type,
        paymentMethod: "",
        reference: expected.reference,
        bankAccountId: expected.bankAccountId,
        id: `transaction-${Date.now()}`,
      };

      // Save transaction to database
      await addClubData(activeClubId, "transactions", newTransaction);

      // Update bank account balance
      const updatedBankAccounts = bankAccounts.map((account) => {
        if (account.id === expected.bankAccountId) {
          const balanceChange =
            type === "income" ? expected.amount : -expected.amount;

          return {
            ...account,
            current_balance: account.current_balance + balanceChange,
            updated_at: new Date().toISOString(),
          };
        }
        return account;
      });

      // Update bank accounts in database
      const { updateClubDataArray } = await import("@/lib/simplified-db");
      await updateClubDataArray(
        activeClubId,
        "bank_accounts",
        updatedBankAccounts,
      );
      setBankAccounts(updatedBankAccounts);
      setTransactions([...transactions, newTransaction]);

      // Remove from expected and update database
      const dataType =
        type === "income" ? "expected_income" : "expected_expenses";
      await deleteClubDataItem(activeClubId, dataType, expected.id);

      if (type === "income") {
        setExpectedIncome(
          expectedIncome.filter((item) => item.id !== expected.id),
        );
      } else {
        setExpectedExpenses(
          expectedExpenses.filter((item) => item.id !== expected.id),
        );
      }

      showToast("success", "Convertito in transazione con successo");
    } catch (error) {
      console.error("Error converting expected to transaction:", error);
      showToast("error", "Errore nella conversione");
    }
  };

  // Reset new transaction form
  const resetNewTransaction = () => {
    setNewTransaction({
      date: new Date().toISOString().split("T")[0],
      description: "",
      category: "",
      amount: 0,
      type: "income",
      paymentMethod: "",
      reference: "",
      bankAccountId: bankAccounts.length > 0 ? bankAccounts[0].id : "",
    });
  };

  // Reset new expected income/expense form
  const resetNewExpected = () => {
    setNewExpected({
      date: new Date().toISOString().split("T")[0],
      description: "",
      category: "",
      amount: 0,
      reference: "",
      status: "pending",
      bankAccountId: bankAccounts.length > 0 ? bankAccounts[0].id : "",
    });
  };

  // Reset new transfer form
  const resetNewTransfer = () => {
    setNewTransfer({
      date: new Date().toISOString().split("T")[0],
      description: "",
      fromAccount: bankAccounts.length > 0 ? bankAccounts[0].id : "",
      toAccount: bankAccounts.length > 1 ? bankAccounts[1].id : "",
      amount: 0,
      status: "completed",
    });
  };

  // Format date
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("it-IT", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Truncate description with tooltip
  const TruncatedDescription = ({ description, maxLength = 30 }) => {
    if (!description || description.length <= maxLength) {
      return <span>{description || "-"}</span>;
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help">
            {description.substring(0, maxLength)}...
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs">{description}</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  // Calculate totals
  const calculateTotals = () => {
    const totalIncome = transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);
    const balance = totalIncome - totalExpense;

    const totalExpectedIncome = expectedIncome.reduce(
      (sum, t) => sum + t.amount,
      0,
    );
    const totalExpectedExpense = expectedExpenses.reduce(
      (sum, t) => sum + t.amount,
      0,
    );

    return {
      totalIncome,
      totalExpense,
      balance,
      totalExpectedIncome,
      totalExpectedExpense,
    };
  };

  const totals = calculateTotals();

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Movimenti Finanziari" />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="mx-auto max-w-9xl space-y-6">
              <div className="flex justify-center items-center h-64">
                <div className="text-lg">Caricamento dati finanziari...</div>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Movimenti Finanziari" />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="mx-auto max-w-9xl space-y-6">
              <div className="space-y-2">
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Movimenti Finanziari
                </h1>
                <p className="text-gray-600 mt-2">
                  Monitora entrate, uscite e bilanci del club.
                </p>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-muted-foreground">Entrate</p>
                        <p className="text-2xl font-bold text-green-600">
                          €{totals.totalIncome.toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Previste: €{totals.totalExpectedIncome.toFixed(2)}
                        </p>
                      </div>
                      <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                        <ArrowUp className="h-6 w-6 text-green-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-muted-foreground">Uscite</p>
                        <p className="text-2xl font-bold text-red-600">
                          €{totals.totalExpense.toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Previste: €{totals.totalExpectedExpense.toFixed(2)}
                        </p>
                      </div>
                      <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                        <ArrowDown className="h-6 w-6 text-red-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Bank Accounts Section */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
                <div className="p-4">
                  <BankAccountList
                    bankAccounts={bankAccounts}
                    setBankAccounts={setBankAccounts}
                    activeClubId={activeClubId}
                  />
                </div>
              </div>

              {/* Main Content */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                <Tabs defaultValue="transactions" className="w-full">
                  <div className="border-b px-4">
                    <TabsList className="flex justify-start">
                      <TabsTrigger value="transactions">
                        Transazioni
                      </TabsTrigger>
                      <TabsTrigger value="expected">Previsti</TabsTrigger>
                      <TabsTrigger value="transfers">Giroconti</TabsTrigger>
                    </TabsList>
                  </div>

                  {/* Transactions Tab */}
                  <TabsContent value="transactions" className="p-4">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                      <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
                        <div className="relative w-full max-w-sm">
                          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                          <Input
                            type="text"
                            placeholder="Cerca transazioni..."
                            className="pl-8"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                          />
                        </div>
                        <div className="w-full max-w-sm">
                          <select
                            className="w-full h-10 rounded-md border border-input bg-background px-3 py-2"
                            value={selectedBankAccountFilter}
                            onChange={(e) =>
                              setSelectedBankAccountFilter(e.target.value)
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
                      </div>
                      <Button onClick={() => setShowAddTransactionDialog(true)}>
                        <Plus className="h-4 w-4 mr-2" /> Nuova Transazione
                      </Button>
                    </div>

                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Descrizione</TableHead>
                            <TableHead>Categoria</TableHead>
                            <TableHead>Importo</TableHead>
                            <TableHead>Metodo</TableHead>
                            <TableHead>Conto</TableHead>
                            <TableHead>Riferimento</TableHead>
                            <TableHead className="text-right">Azioni</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredTransactions.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={8}
                                className="text-center py-4"
                              >
                                Nessuna transazione trovata
                              </TableCell>
                            </TableRow>
                          ) : (
                            filteredTransactions.map((transaction) => (
                              <TableRow key={transaction.id}>
                                <TableCell>
                                  {formatDate(transaction.date)}
                                </TableCell>
                                <TableCell>
                                  <TruncatedDescription
                                    description={transaction.description}
                                  />
                                </TableCell>
                                <TableCell>{transaction.category}</TableCell>
                                <TableCell
                                  className={
                                    transaction.type === "income"
                                      ? "text-green-600"
                                      : "text-red-600"
                                  }
                                >
                                  {transaction.type === "income" ? "+" : "-"}€
                                  {transaction.amount.toFixed(2)}
                                </TableCell>
                                <TableCell>
                                  {transaction.paymentMethod}
                                </TableCell>
                                <TableCell>
                                  {bankAccounts.find(
                                    (account) =>
                                      account.id === transaction.bankAccountId,
                                  )?.name || ""}
                                </TableCell>
                                <TableCell>{transaction.reference}</TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      handleDeleteTransaction(transaction.id)
                                    }
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

                  {/* Expected Tab */}
                  <TabsContent value="expected" className="p-4">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex space-x-2">
                        <Button
                          variant={
                            expectedType === "income" ? "default" : "outline"
                          }
                          onClick={() => setExpectedType("income")}
                        >
                          Entrate Previste
                        </Button>
                        <Button
                          variant={
                            expectedType === "expense" ? "default" : "outline"
                          }
                          onClick={() => setExpectedType("expense")}
                        >
                          Uscite Previste
                        </Button>
                      </div>
                      <Button onClick={() => setShowAddExpectedDialog(true)}>
                        <Plus className="h-4 w-4 mr-2" /> Nuovo Previsto
                      </Button>
                    </div>

                    {expectedType === "income" ? (
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Data</TableHead>
                              <TableHead>Descrizione</TableHead>
                              <TableHead>Categoria</TableHead>
                              <TableHead>Importo</TableHead>
                              <TableHead>Conto</TableHead>
                              <TableHead>Riferimento</TableHead>
                              <TableHead className="text-right">
                                Azioni
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {expectedIncome.length === 0 ? (
                              <TableRow>
                                <TableCell
                                  colSpan={7}
                                  className="text-center py-4"
                                >
                                  Nessuna entrata prevista trovata
                                </TableCell>
                              </TableRow>
                            ) : (
                              expectedIncome.map((expected) => (
                                <TableRow key={expected.id}>
                                  <TableCell>
                                    {formatDate(expected.date)}
                                  </TableCell>
                                  <TableCell>{expected.description}</TableCell>
                                  <TableCell>{expected.category}</TableCell>
                                  <TableCell className="text-green-600">
                                    €{expected.amount.toFixed(2)}
                                  </TableCell>
                                  <TableCell>
                                    {bankAccounts.find(
                                      (account) =>
                                        account.id === expected.bankAccountId,
                                    )?.name || ""}
                                  </TableCell>
                                  <TableCell>{expected.reference}</TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() =>
                                        handleConvertExpected(
                                          expected,
                                          "income",
                                        )
                                      }
                                      title="Converti in transazione"
                                    >
                                      <ArrowDownUp className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() =>
                                        handleDeleteExpectedIncome(expected.id)
                                      }
                                      title="Elimina"
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
                    ) : (
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Data</TableHead>
                              <TableHead>Descrizione</TableHead>
                              <TableHead>Categoria</TableHead>
                              <TableHead>Importo</TableHead>
                              <TableHead>Conto</TableHead>
                              <TableHead>Riferimento</TableHead>
                              <TableHead className="text-right">
                                Azioni
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {expectedExpenses.length === 0 ? (
                              <TableRow>
                                <TableCell
                                  colSpan={7}
                                  className="text-center py-4"
                                >
                                  Nessuna uscita prevista trovata
                                </TableCell>
                              </TableRow>
                            ) : (
                              expectedExpenses.map((expected) => (
                                <TableRow key={expected.id}>
                                  <TableCell>
                                    {formatDate(expected.date)}
                                  </TableCell>
                                  <TableCell>{expected.description}</TableCell>
                                  <TableCell>{expected.category}</TableCell>
                                  <TableCell className="text-red-600">
                                    €{expected.amount.toFixed(2)}
                                  </TableCell>
                                  <TableCell>
                                    {bankAccounts.find(
                                      (account) =>
                                        account.id === expected.bankAccountId,
                                    )?.name || ""}
                                  </TableCell>
                                  <TableCell>{expected.reference}</TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() =>
                                        handleConvertExpected(
                                          expected,
                                          "expense",
                                        )
                                      }
                                      title="Converti in transazione"
                                    >
                                      <ArrowDownUp className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() =>
                                        handleDeleteExpectedExpense(expected.id)
                                      }
                                      title="Elimina"
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
                    )}
                  </TabsContent>

                  {/* Transfers Tab */}
                  <TabsContent value="transfers" className="p-4">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-medium">
                        Giroconti tra conti
                      </h3>
                      <Button onClick={() => setShowAddTransferDialog(true)}>
                        <Plus className="h-4 w-4 mr-2" /> Nuovo Giroconto
                      </Button>
                    </div>

                    <div className="rounded-md border">
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
                              <TableCell
                                colSpan={6}
                                className="text-center py-4"
                              >
                                Nessun giroconto trovato
                              </TableCell>
                            </TableRow>
                          ) : (
                            transfers.map((transfer) => (
                              <TableRow key={transfer.id}>
                                <TableCell>
                                  {formatDate(transfer.date)}
                                </TableCell>
                                <TableCell>
                                  <TruncatedDescription
                                    description={transfer.description}
                                  />
                                </TableCell>
                                <TableCell>
                                  {bankAccounts.find(
                                    (account) =>
                                      account.id === transfer.fromAccount,
                                  )?.name || ""}
                                </TableCell>
                                <TableCell>
                                  {bankAccounts.find(
                                    (account) =>
                                      account.id === transfer.toAccount,
                                  )?.name || ""}
                                </TableCell>
                                <TableCell>
                                  €{transfer.amount.toFixed(2)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      handleDeleteTransfer(transfer.id)
                                    }
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
              </div>
            </div>
          </main>
        </div>

        {/* Add Transaction Dialog */}
        <Dialog
          open={showAddTransactionDialog}
          onOpenChange={setShowAddTransactionDialog}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Aggiungi Transazione</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Tipo</Label>
                  <select
                    id="type"
                    name="type"
                    className="w-full rounded-md border border-input bg-background px-3 py-2"
                    value={newTransaction.type}
                    onChange={handleTransactionChange}
                  >
                    <option value="income">Entrata</option>
                    <option value="expense">Uscita</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">Data</Label>
                  <Input
                    id="date"
                    name="date"
                    type="date"
                    value={newTransaction.date}
                    onChange={handleTransactionChange}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Descrizione (opzionale)</Label>
                <Input
                  id="description"
                  name="description"
                  placeholder="Descrizione della transazione"
                  value={newTransaction.description}
                  onChange={handleTransactionChange}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Categoria</Label>
                  <Input
                    id="category"
                    name="category"
                    placeholder="Categoria"
                    value={newTransaction.category}
                    onChange={handleTransactionChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Importo (€)</Label>
                  <Input
                    id="amount"
                    name="amount"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={newTransaction.amount}
                    onChange={handleTransactionChange}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentMethod">Metodo di Pagamento</Label>
                <Input
                  id="paymentMethod"
                  name="paymentMethod"
                  placeholder="Metodo di pagamento"
                  value={newTransaction.paymentMethod}
                  onChange={handleTransactionChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reference">Riferimento</Label>
                <Input
                  id="reference"
                  name="reference"
                  placeholder="Riferimento (es. nome atleta, fornitore)"
                  value={newTransaction.reference}
                  onChange={handleTransactionChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bankAccountId">Conto Corrente</Label>
                <select
                  id="bankAccountId"
                  name="bankAccountId"
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                  value={newTransaction.bankAccountId}
                  onChange={handleTransactionChange}
                >
                  <option value="">Seleziona un conto</option>
                  {bankAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} -{" "}
                      {new Intl.NumberFormat("it-IT", {
                        style: "currency",
                        currency: "EUR",
                      }).format(account.current_balance)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowAddTransactionDialog(false)}
              >
                Annulla
              </Button>
              <Button onClick={handleAddTransaction}>Salva</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Expected Dialog */}
        <Dialog
          open={showAddExpectedDialog}
          onOpenChange={setShowAddExpectedDialog}
        >
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
                  onChange={handleExpectedChange}
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
                  onChange={handleExpectedChange}
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
                    onChange={handleExpectedChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expected-amount">Importo (€)</Label>
                  <Input
                    id="expected-amount"
                    name="amount"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={newExpected.amount}
                    onChange={handleExpectedChange}
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
                  onChange={handleExpectedChange}
                >
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
                  onChange={handleExpectedChange}
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

        {/* Add Transfer Dialog */}
        <Dialog
          open={showAddTransferDialog}
          onOpenChange={setShowAddTransferDialog}
        >
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
                  onChange={handleTransferChange}
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
                  onChange={handleTransferChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="transfer-fromAccount">Da Conto</Label>
                <select
                  id="transfer-fromAccount"
                  name="fromAccount"
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                  value={newTransfer.fromAccount}
                  onChange={handleTransferChange}
                >
                  <option value="">Seleziona un conto</option>
                  {bankAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} -{" "}
                      {new Intl.NumberFormat("it-IT", {
                        style: "currency",
                        currency: "EUR",
                      }).format(account.current_balance)}
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
                  onChange={handleTransferChange}
                >
                  <option value="">Seleziona un conto</option>
                  {bankAccounts.map((account) => (
                    <option
                      key={account.id}
                      value={account.id}
                      disabled={account.id === newTransfer.fromAccount}
                    >
                      {account.name} -{" "}
                      {new Intl.NumberFormat("it-IT", {
                        style: "currency",
                        currency: "EUR",
                      }).format(account.current_balance)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="transfer-amount">Importo (€)</Label>
                <Input
                  id="transfer-amount"
                  name="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={newTransfer.amount}
                  onChange={handleTransferChange}
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
      </div>
    </TooltipProvider>
  );
}
