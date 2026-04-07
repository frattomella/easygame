import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-notification";
import { CreditCard, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

interface PaymentMethod {
  id: string;
  name: string;
  type: string;
  is_enabled: boolean;
  processing_fee_percentage: number;
  processing_fee_fixed: number;
}

interface Payment {
  id: string;
  description: string;
  amount: number;
  due_date: string;
  status: string;
}

interface PaymentMethodsProps {
  athleteId: string;
  payments: Payment[];
  onPaymentComplete: (paymentId: string, status: string) => void;
}

export function PaymentMethods({
  athleteId,
  payments,
  onPaymentComplete,
}: PaymentMethodsProps) {
  const { showToast } = useToast();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(
    null,
  );
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [cardDetails, setCardDetails] = useState({
    cardNumber: "",
    cardHolder: "",
    expiryDate: "",
    cvv: "",
  });

  // Fetch available payment methods
  useEffect(() => {
    const fetchPaymentMethods = async () => {
      try {
        setLoading(true);
        // In a real implementation, you would fetch from Supabase
        // const { data, error } = await supabase
        //   .from('payment_methods_config')
        //   .select('*')
        //   .eq('is_enabled', true);
        // 
        // if (error) throw error;
        // setPaymentMethods(data || []);
        
        // For now, we'll just set an empty array
        setPaymentMethods([]);
        setLoading(false);
      } catch (err) {
        console.error("Error fetching payment methods:", err);
        setError(
          "Impossibile caricare i metodi di pagamento. Riprova più tardi.",
        );
        setLoading(false);
      }
    };

    fetchPaymentMethods();
  }, []);

  const handlePayNow = (payment: Payment) => {
    setSelectedPayment(payment);
    setShowPaymentDialog(true);
  };

  const handleSelectMethod = (method: PaymentMethod) => {
    setSelectedMethod(method);
  };

  const handleCardDetailsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCardDetails((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleProcessPayment = async () => {
    if (!selectedPayment || !selectedMethod) return;

    try {
      setProcessingPayment(true);

      // In a real implementation, this would call a secure payment gateway API
      // For demo purposes, we're simulating a successful payment after a delay
      setTimeout(() => {
        // Simulate successful payment
        onPaymentComplete(selectedPayment.id, "completed");
        showToast("success", "Pagamento completato con successo");
        setShowPaymentDialog(false);
        setSelectedPayment(null);
        setSelectedMethod(null);
        setCardDetails({
          cardNumber: "",
          cardHolder: "",
          expiryDate: "",
          cvv: "",
        });
        setProcessingPayment(false);
      }, 2000);
    } catch (err) {
      console.error("Error processing payment:", err);
      showToast("error", "Errore durante il pagamento. Riprova più tardi.");
      setProcessingPayment(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("it-IT", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
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
      case "revolut":
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

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2">Caricamento metodi di pagamento...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border border-red-300 bg-red-50 rounded-md text-red-800">
        <AlertCircle className="h-5 w-5 inline mr-2" />
        {error}
      </div>
    );
  }

  return (
    <>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Metodi di Pagamento Disponibili</CardTitle>
        </CardHeader>
        <CardContent>
          {paymentMethods.length === 0 ? (
            <p className="text-muted-foreground">
              Nessun metodo di pagamento disponibile al momento.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {paymentMethods.map((method) => (
                <div
                  key={method.id}
                  className="p-4 border rounded-lg flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => handleSelectMethod(method)}
                >
                  <div className="flex items-center gap-3">
                    {getPaymentMethodIcon(method.type)}
                    <div>
                      <p className="font-medium">{method.name}</p>
                      {method.processing_fee_percentage > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Commissione: {method.processing_fee_percentage}%
                          {method.processing_fee_fixed > 0 &&
                            ` + ${method.processing_fee_fixed.toFixed(2)}€`}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Completa il Pagamento</DialogTitle>
          </DialogHeader>

          {selectedPayment && (
            <div className="space-y-4">
              <div className="p-4 border rounded-lg">
                <p className="font-medium">{selectedPayment.description}</p>
                <p className="text-sm text-muted-foreground">
                  Scadenza: {formatDate(selectedPayment.due_date)}
                </p>
                <p className="font-bold text-lg mt-2">
                  {selectedPayment.amount.toFixed(2)}€
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-medium">Seleziona metodo di pagamento</h3>
                <div className="grid grid-cols-1 gap-2">
                  {paymentMethods.map((method) => (
                    <div
                      key={method.id}
                      className={`p-3 border rounded-lg flex items-center justify-between cursor-pointer ${selectedMethod?.id === method.id ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-800"}`}
                      onClick={() => handleSelectMethod(method)}
                    >
                      <div className="flex items-center gap-3">
                        {getPaymentMethodIcon(method.type)}
                        <span>{method.name}</span>
                      </div>
                      {selectedMethod?.id === method.id && (
                        <CheckCircle className="h-5 w-5 text-blue-500" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {selectedMethod?.type === "credit_card" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="cardNumber">Numero Carta</Label>
                    <Input
                      id="cardNumber"
                      name="cardNumber"
                      placeholder="1234 5678 9012 3456"