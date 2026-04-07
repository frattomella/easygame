"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function PaymentSection({
  id,
  openPaymentModal,
}: {
  id: string;
  openPaymentModal: () => void;
}) {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPayments = async () => {
      try {
        setLoading(true);
        // This is a placeholder - adjust the query based on your actual database schema
        const { data, error } = await supabase
          .from("payments")
          .select("*")
          .eq("athlete_id", id);

        if (error) {
          console.error("Error loading payments:", error);
          return;
        }

        setPayments(data || []);
      } catch (err) {
        console.error("Error in payment loading:", err);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadPayments();
    }
  }, [id]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pagamenti</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        ) : payments.length > 0 ? (
          <div className="space-y-4">
            <div className="text-sm text-gray-500">
              Ultimi pagamenti effettuati:
            </div>
            <ul className="space-y-2">
              {payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex justify-between items-center border-b pb-2"
                >
                  <span>{payment.description}</span>
                  <span className="font-medium">
                    €{payment.amount.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="text-sm text-gray-500">
            Nessun pagamento registrato.
          </div>
        )}

        <Button className="mt-4 w-full" onClick={openPaymentModal}>
          Effettua un nuovo pagamento
        </Button>
      </CardContent>
    </Card>
  );
}
