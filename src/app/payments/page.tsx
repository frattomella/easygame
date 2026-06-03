"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { MobileTopBar } from "@/components/layout/MobileTopBar";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast-notification";
import { useAuth } from "@/components/providers/AuthProvider";
import { AddPaymentForm } from "@/components/forms/AddPaymentForm";
import { AddInvoiceForm } from "@/components/forms/AddInvoiceForm";
import { PaymentMethodsConfig } from "@/app/organization/payment-methods-config";
import { supabase } from "@/lib/supabase";
import { getClubSettings } from "@/lib/simplified-db";
import {
  aggregateClubPayments,
  loadClubFinancialSources,
  summarizeClubMovements,
  type NormalizedClubMovement,
} from "@/lib/club-financial-summary";
import {
  compareAthletesByLastName,
  getAthleteDisplayName,
} from "@/lib/athlete-name-utils";
import {
  CreditCard,
  FileText,
  Receipt,
  Wallet,
  Plus,
  Link2,
} from "lucide-react";

type AthleteOption = {
  id: string;
  name: string;
};

export default function PaymentsPage() {
  const { showToast } = useToast();
  const { activeClub } = useAuth();
  const [loading, setLoading] = useState(true);
  const [athletes, setAthletes] = useState<AthleteOption[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [clubMovements, setClubMovements] = useState<NormalizedClubMovement[]>(
    [],
  );
  const [invoices, setInvoices] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [showAddInvoice, setShowAddInvoice] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any | null>(null);

  const clubId = activeClub?.id || null;

  const loadData = async () => {
    if (!clubId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const [
        athletesResponse,
        paymentsResponse,
        invoicesResponse,
        receiptsResponse,
        paymentMethodsResponse,
        clubSettings,
      ] = await Promise.all([
        supabase
          .from("simplified_athletes")
          .select("*")
          .eq("organization_id", clubId),
        supabase.from("payments").select("*").eq("organization_id", clubId),
        supabase.from("invoices").select("*").eq("organization_id", clubId),
        supabase.from("receipts").select("*").eq("organization_id", clubId),
        supabase
          .from("payment_methods")
          .select("*")
          .eq("organization_id", clubId),
        getClubSettings(clubId),
      ]);

      if (athletesResponse.error) throw new Error(athletesResponse.error.message);
      if (paymentsResponse.error) throw new Error(paymentsResponse.error.message);
      if (invoicesResponse.error) throw new Error(invoicesResponse.error.message);
      if (receiptsResponse.error) throw new Error(receiptsResponse.error.message);
      const fallbackMethods = Array.isArray(clubSettings?.paymentMethods)
        ? clubSettings.paymentMethods
        : [];
      const financialSources = await loadClubFinancialSources(clubId);

      setAthletes(
        (athletesResponse.data || [])
          .slice()
          .sort(compareAthletesByLastName)
          .map((athlete: any) => ({
            id: athlete.id,
            name: getAthleteDisplayName(athlete) || "Atleta",
          })),
      );
      setPayments(paymentsResponse.data || []);
      setClubMovements(
        aggregateClubPayments({
          ...financialSources,
          payments: paymentsResponse.data || [],
        }),
      );
      setInvoices(invoicesResponse.data || []);
      setReceipts(receiptsResponse.data || []);
      setPaymentMethods(
        paymentMethodsResponse.error || !(paymentMethodsResponse.data || []).length
          ? fallbackMethods
          : paymentMethodsResponse.data || [],
      );
    } catch (error: any) {
      showToast(
        "error",
        error?.message || "Errore nel caricamento della pagina pagamenti",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [clubId]);

  const athleteMap = useMemo(
    () => new Map(athletes.map((athlete) => [athlete.id, athlete.name])),
    [athletes],
  );

  const invoiceByPaymentId = useMemo(
    () =>
      new Map(
        invoices
          .filter((invoice) => invoice.payment_id)
          .map((invoice) => [invoice.payment_id, invoice]),
      ),
    [invoices],
  );

  const receiptByPaymentId = useMemo(
    () =>
      new Map(
        receipts
          .filter((receipt) => receipt.payment_id)
          .map((receipt) => [receipt.payment_id, receipt]),
      ),
    [receipts],
  );

  const totals = useMemo(() => {
    const financialTotals = summarizeClubMovements(clubMovements);

    return {
      totalCollected: financialTotals.totalIncome,
      totalPending: financialTotals.totalPendingIncome,
      invoices: invoices.length,
      receipts: receipts.length,
    };
  }, [clubMovements, invoices.length, receipts.length]);

  const athletePaymentIds = useMemo(
    () => new Set(payments.map((payment) => String(payment.id))),
    [payments],
  );

  const paymentRows = useMemo(() => {
    if (clubMovements.length) {
      return clubMovements;
    }

    return aggregateClubPayments({ payments });
  }, [clubMovements, payments]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
    }).format(value || 0);

  const formatDate = (value?: string | null) => {
    if (!value) return "-";
    return new Date(value).toLocaleDateString("it-IT");
  };

  const buildReceiptNumber = () =>
    `R-${new Date().getFullYear()}-${String(receipts.length + 1).padStart(3, "0")}`;

  const handleAddPayment = async (paymentData: any) => {
    if (!clubId) return;

    try {
      const paymentPayload = {
        organization_id: clubId,
        athlete_id: paymentData.athleteId || null,
        description: paymentData.description,
        amount: paymentData.amount,
        due_date: paymentData.dueDate,
        paid_at: paymentData.paidAt,
        status: paymentData.status,
        method: paymentData.method,
        reference: paymentData.reference || null,
        data: {
          athlete_name: paymentData.athleteId
            ? athleteMap.get(paymentData.athleteId)
            : null,
        },
      };

      const { data: payment, error } = await supabase
        .from("payments")
        .insert(paymentPayload)
        .select("*")
        .single();

      if (error || !payment) {
        throw new Error(error?.message || "Pagamento non salvato");
      }

      if (payment.status === "paid") {
        await supabase.from("receipts").insert({
          organization_id: clubId,
          athlete_id: payment.athlete_id || null,
          payment_id: payment.id,
          receipt_number: buildReceiptNumber(),
          issue_date: payment.paid_at || payment.due_date || new Date().toISOString(),
          amount: payment.amount,
          description: `Ricevuta ${payment.description}`,
          status: "issued",
          method: payment.method || null,
        });
      }

      showToast("success", "Pagamento registrato con successo");
      await loadData();
    } catch (error: any) {
      showToast(
        "error",
        error?.message || "Errore durante la creazione del pagamento",
      );
    }
  };

  const handleCreateInvoice = async (invoiceData: any) => {
    if (!clubId || !selectedPayment) return;

    try {
      const { error } = await supabase.from("invoices").insert({
        organization_id: clubId,
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

      showToast("success", "Fattura collegata al pagamento");
      setSelectedPayment(null);
      setShowAddInvoice(false);
      await loadData();
    } catch (error: any) {
      showToast(
        "error",
        error?.message || "Errore durante la creazione della fattura",
      );
    }
  };

  const handleGenerateReceipt = async (payment: any) => {
    if (!clubId) return;

    if (payment.status !== "paid") {
      showToast("error", "La ricevuta puo essere generata solo per pagamenti saldati");
      return;
    }

    if (receiptByPaymentId.has(payment.id)) {
      showToast("success", "La ricevuta e gia presente");
      return;
    }

    try {
      const linkedInvoice = invoiceByPaymentId.get(payment.id);
      const { error } = await supabase.from("receipts").insert({
        organization_id: clubId,
        athlete_id: payment.athlete_id || null,
        payment_id: payment.id,
        invoice_id: linkedInvoice?.id || null,
        receipt_number: buildReceiptNumber(),
        issue_date: payment.paid_at || new Date().toISOString(),
        amount: payment.amount,
        description: `Ricevuta ${payment.description}`,
        status: "issued",
        method: payment.method || null,
      });

      if (error) {
        throw new Error(error.message);
      }

      showToast("success", "Ricevuta generata correttamente");
      await loadData();
    } catch (error: any) {
      showToast(
        "error",
        error?.message || "Errore durante la generazione della ricevuta",
      );
    }
  };

  const openInvoiceModal = (payment: any) => {
    setSelectedPayment(payment);
    setShowAddInvoice(true);
  };

  const paymentBadge = (status: string) =>
    status === "cancelled" ? (
      <Badge variant="outline" className="border-slate-300 text-slate-600">
        Annullato
      </Badge>
    ) : status === "paid" ? (
      <Badge className="bg-green-500 text-white">Pagato</Badge>
    ) : (
      <Badge variant="outline" className="border-amber-500 text-amber-600">
        In attesa
      </Badge>
    );

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <div className="hidden lg:flex w-full">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Pagamenti" />
          <main className={dashboardMainClassName}>
            <DashboardPageContainer>
              <SharedPageHeader
                title="Pagamenti"
                subtitle="Gestisci in un unico punto pagamenti, fatture, ricevute e metodi di incasso."
                actions={
                  <Button
                    onClick={() => setShowAddPayment(true)}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Nuovo pagamento
                  </Button>
                }
              />

              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Incassato
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <span className="text-2xl font-bold">
                      {formatCurrency(totals.totalCollected)}
                    </span>
                    <Wallet className="h-5 w-5 text-blue-600" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Da incassare
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <span className="text-2xl font-bold">
                      {formatCurrency(totals.totalPending)}
                    </span>
                    <CreditCard className="h-5 w-5 text-amber-600" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Fatture
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <span className="text-2xl font-bold">{totals.invoices}</span>
                    <FileText className="h-5 w-5 text-blue-600" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Ricevute
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between">
                    <span className="text-2xl font-bold">{totals.receipts}</span>
                    <Receipt className="h-5 w-5 text-blue-600" />
                  </CardContent>
                </Card>
              </div>

              <Tabs defaultValue="payments" className="space-y-4">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="payments">Pagamenti</TabsTrigger>
                  <TabsTrigger value="invoices">Fatture</TabsTrigger>
                  <TabsTrigger value="receipts">Ricevute</TabsTrigger>
                  <TabsTrigger value="methods">Metodi</TabsTrigger>
                </TabsList>

                <TabsContent value="payments">
                  <Card>
                    <CardHeader>
                      <CardTitle>Registro pagamenti</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {loading ? (
                        <div className="text-sm text-muted-foreground">
                          Caricamento dati pagamenti...
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Soggetto</TableHead>
                                <TableHead>Origine</TableHead>
                                <TableHead>Descrizione</TableHead>
                                <TableHead>Importo</TableHead>
                                <TableHead>Data</TableHead>
                                <TableHead>Stato</TableHead>
                                <TableHead>Fattura</TableHead>
                                <TableHead>Ricevuta</TableHead>
                                <TableHead>Azioni</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {paymentRows.map((payment) => {
                                const rawPayment =
                                  payment.source === "athlete" &&
                                  athletePaymentIds.has(String((payment.raw as any)?.id))
                                    ? (payment.raw as any)
                                    : null;
                                const isCancelled = payment.status === "cancelled";
                                const linkedInvoice = rawPayment
                                  ? invoiceByPaymentId.get(rawPayment.id)
                                  : null;
                                const linkedReceipt = rawPayment
                                  ? receiptByPaymentId.get(rawPayment.id)
                                  : null;
                                return (
                                  <TableRow key={`${payment.source}-${payment.id}`}>
                                    <TableCell>
                                      {payment.subjectName || "-"}
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="outline">
                                        {payment.source}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>{payment.description}</TableCell>
                                    <TableCell>
                                      {payment.direction === "expense" ? "-" : ""}
                                      {formatCurrency(Number(payment.amount))}
                                    </TableCell>
                                    <TableCell>
                                      {formatDate(
                                        payment.paidAt || payment.date || payment.dueDate,
                                      )}
                                    </TableCell>
                                    <TableCell>{paymentBadge(payment.status)}</TableCell>
                                    <TableCell>
                                      {linkedInvoice ? (
                                        <span className="font-medium text-blue-700">
                                          {linkedInvoice.invoice_number}
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground">-</span>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      {linkedReceipt ? (
                                        <span className="font-medium text-blue-700">
                                          {linkedReceipt.receipt_number}
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground">-</span>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      {rawPayment ? (
                                        <div className="flex flex-wrap gap-2">
                                          {!isCancelled && !linkedInvoice && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => openInvoiceModal(rawPayment)}
                                          >
                                            <Link2 className="mr-1 h-3.5 w-3.5" />
                                            Fattura
                                          </Button>
                                          )}
                                          {!isCancelled && !linkedReceipt && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleGenerateReceipt(rawPayment)}
                                          >
                                            <Receipt className="mr-1 h-3.5 w-3.5" />
                                            Ricevuta
                                          </Button>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-muted-foreground">-</span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="invoices">
                  <Card>
                    <CardHeader>
                      <CardTitle>Fatture emesse</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Numero</TableHead>
                              <TableHead>Atleta</TableHead>
                              <TableHead>Importo</TableHead>
                              <TableHead>Data emissione</TableHead>
                              <TableHead>Pagamento</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {invoices.map((invoice) => (
                              <TableRow key={invoice.id}>
                                <TableCell className="font-medium">
                                  {invoice.invoice_number}
                                </TableCell>
                                <TableCell>
                                  {athleteMap.get(invoice.athlete_id) || "-"}
                                </TableCell>
                                <TableCell>
                                  {formatCurrency(Number(invoice.amount))}
                                </TableCell>
                                <TableCell>{formatDate(invoice.issue_date)}</TableCell>
                                <TableCell>
                                  {invoice.payment_id ? (
                                    <Badge variant="outline" className="text-blue-600">
                                      Collegata
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground">Manuale</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="receipts">
                  <Card>
                    <CardHeader>
                      <CardTitle>Ricevute disponibili</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Numero</TableHead>
                              <TableHead>Atleta</TableHead>
                              <TableHead>Importo</TableHead>
                              <TableHead>Data</TableHead>
                              <TableHead>Metodo</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {receipts.map((receipt) => (
                              <TableRow key={receipt.id}>
                                <TableCell className="font-medium">
                                  {receipt.receipt_number || "-"}
                                </TableCell>
                                <TableCell>
                                  {athleteMap.get(receipt.athlete_id) || "-"}
                                </TableCell>
                                <TableCell>
                                  {formatCurrency(Number(receipt.amount))}
                                </TableCell>
                                <TableCell>{formatDate(receipt.issue_date)}</TableCell>
                                <TableCell>{receipt.method || "-"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="methods">
                  <PaymentMethodsConfig />
                  <Card className="mt-4">
                    <CardHeader>
                      <CardTitle>Metodi attivi</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      {paymentMethods.map((method) => (
                        <Badge
                          key={method.id}
                          className={
                            method.is_enabled
                              ? "bg-blue-600 text-white"
                              : "bg-gray-200 text-gray-700"
                          }
                        >
                          {method.name}
                        </Badge>
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </DashboardPageContainer>
          </main>
        </div>
      </div>

      <div className="flex flex-1 flex-col lg:hidden">
        <MobileTopBar />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <SharedPageHeader
              title="Pagamenti"
              subtitle="Usa la versione desktop per la gestione completa di pagamenti, fatture e ricevute."
            />
          </DashboardPageContainer>
        </main>
      </div>

      <AddPaymentForm
        isOpen={showAddPayment}
        onClose={() => setShowAddPayment(false)}
        onSubmit={handleAddPayment}
        athletes={athletes}
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
          selectedPayment?.athlete_id
            ? athleteMap.get(selectedPayment.athlete_id) || ""
            : ""
        }
      />
    </div>
  );
}
