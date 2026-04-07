"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PinInput } from "@/components/ui/pin-input";
import { useToast } from "@/components/ui/toast-notification";
import { CheckCircle, Clock, DollarSign, FileText } from "lucide-react";

interface Payment {
  id: string;
  month: string;
  amount: string;
  date: string;
  status: "paid" | "pending";
}

interface TrainerPaymentsProps {
  payments?: Payment[];
  showSalary?: boolean;
  onViewSalary?: () => void;
  isLoading?: boolean;
}

export function TrainerPayments({
  payments = [],
  showSalary = false,
  onViewSalary = () => {},
  isLoading = false,
}: TrainerPaymentsProps) {
  const { showToast } = useToast();
  const [showPinDialog, setShowPinDialog] = useState(false);
  const correctPin = "1234"; // In a real app, this would be stored securely

  const handlePinSubmit = (pin: string) => {
    if (pin === correctPin) {
      onViewSalary();
      setShowPinDialog(false);
      showToast("success", "PIN corretto");
    } else {
      showToast("error", "PIN errato");
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleDateString("it-IT", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>I Miei Pagamenti</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <div className="animate-pulse flex flex-col items-center gap-4">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (payments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>I Miei Pagamenti</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            Non ci sono pagamenti registrati.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>I Miei Pagamenti</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Mese</th>
                  <th className="text-left py-3 px-4 font-medium">Importo</th>
                  <th className="text-left py-3 px-4 font-medium">
                    Data Pagamento
                  </th>
                  <th className="text-left py-3 px-4 font-medium">Stato</th>
                  <th className="text-left py-3 px-4 font-medium">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr
                    key={payment.id}
                    className="border-b hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <td className="py-3 px-4">{payment.month}</td>
                    <td className="py-3 px-4">
                      <span>€{payment.amount}</span>
                    </td>
                    <td className="py-3 px-4">{formatDate(payment.date)}</td>
                    <td className="py-3 px-4">
                      {payment.status === "paid" ? (
                        <Badge className="bg-green-500 text-white flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Pagato
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-amber-500 border-amber-500 flex items-center gap-1"
                        >
                          <Clock className="h-3 w-3" />
                          In Attesa
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {payment.status === "paid" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            // Crea un documento di ricevuta
                            const receiptContent = `
                              RICEVUTA DI PAGAMENTO
                              
                              Mese: ${payment.month}
                              Importo: €${payment.amount}
                              Data pagamento: ${formatDate(payment.date)}
                              
                              Ricevuta generata il ${new Date().toLocaleDateString()}
                            `;

                            const blob = new Blob([receiptContent], {
                              type: "text/plain",
                            });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `ricevuta-${payment.month
                              .replace(/\s+/g, "-")
                              .toLowerCase()}.txt`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);

                            showToast(
                              "success",
                              "Ricevuta scaricata con successo",
                            );
                          }}
                        >
                          <FileText className="h-3.5 w-3.5 mr-1" />
                          Ricevuta
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={true}
                          onClick={() => {
                            showToast(
                              "success",
                              "Stato del pagamento aggiornato",
                            );
                          }}
                        >
                          Cambia Stato
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <PinInput
        isOpen={showPinDialog}
        onClose={() => setShowPinDialog(false)}
        onSubmit={handlePinSubmit}
        title="Inserisci PIN"
        description="Inserisci il PIN di 4 cifre per visualizzare i dati sensibili"
      />
    </>
  );
}
