"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  formatDate,
  uid,
  type ClubStructure,
  type PaymentStatus,
  type StructurePayment,
} from "@/lib/structures-utils";

type StructureRentPaymentsSectionProps = {
  structure: ClubStructure;
  onChange: (structure: ClubStructure) => void;
};

const statusClassName = (status: PaymentStatus) => {
  if (status === "Pagato") return "bg-green-500";
  if (status === "Scaduto") return "bg-red-500";
  return "bg-yellow-500";
};

export function StructureRentPaymentsSection({
  structure,
  onChange,
}: StructureRentPaymentsSectionProps) {
  const [paymentForm, setPaymentForm] = useState({
    date: new Date().toISOString().split("T")[0],
    description: "Canone struttura",
    amount: "",
    status: "In attesa" as PaymentStatus,
  });

  const patch = (next: Partial<ClubStructure>) =>
    onChange({ ...structure, ...next });

  const patchRent = (next: Partial<NonNullable<ClubStructure["rent"]>>) =>
    patch({ rent: { ...(structure.rent || {}), ...next } });

  const addPayment = () => {
    const amount = Number(String(paymentForm.amount).replace(",", "."));
    if (!paymentForm.date || !paymentForm.description || Number.isNaN(amount)) {
      return;
    }

    const nextPayment: StructurePayment = {
      id: uid("payment"),
      date: paymentForm.date,
      description: paymentForm.description,
      type: "Quota",
      amount,
      status: paymentForm.status,
    };

    patch({ payments: [...structure.payments, nextPayment] });
    setPaymentForm({
      date: new Date().toISOString().split("T")[0],
      description: "Canone struttura",
      amount: "",
      status: "In attesa",
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pagamenti / Fitti</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">Contratto di affitto</p>
              <p className="text-sm text-muted-foreground">
                Gestisci canone, frequenza e scadenze della struttura.
              </p>
            </div>
            <Switch
              checked={Boolean(structure.rent?.enabled || structure.isRentable)}
              onCheckedChange={(checked) =>
                patch({
                  isRentable: checked,
                  rent: { ...(structure.rent || {}), enabled: checked },
                })
              }
            />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Canone</Label>
              <Input
                type="number"
                step="0.01"
                value={structure.rent?.amount ?? 0}
                onChange={(event) =>
                  patchRent({ amount: Number(event.target.value || 0) })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Frequenza</Label>
              <Input
                value={structure.rent?.frequency || "mensile"}
                onChange={(event) => patchRent({ frequency: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Giorno scadenza</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={structure.rent?.dueDay ?? 1}
                onChange={(event) =>
                  patchRent({ dueDay: Number(event.target.value || 1) })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Inizio contratto</Label>
              <Input
                type="date"
                value={structure.rent?.contractStart || ""}
                onChange={(event) =>
                  patchRent({ contractStart: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Fine contratto</Label>
              <Input
                type="date"
                value={structure.rent?.contractEnd || ""}
                onChange={(event) => patchRent({ contractEnd: event.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-3">
              <Label>Note contratto</Label>
              <Textarea
                rows={3}
                value={structure.rent?.notes || ""}
                onChange={(event) => patchRent({ notes: event.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_160px_auto]">
            <div className="space-y-2">
              <Label>Data</Label>
              <Input
                type="date"
                value={paymentForm.date}
                onChange={(event) =>
                  setPaymentForm((current) => ({
                    ...current,
                    date: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Descrizione</Label>
              <Input
                value={paymentForm.description}
                onChange={(event) =>
                  setPaymentForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Importo</Label>
              <Input
                type="number"
                step="0.01"
                value={paymentForm.amount}
                onChange={(event) =>
                  setPaymentForm((current) => ({
                    ...current,
                    amount: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Stato</Label>
              <Select
                value={paymentForm.status}
                onValueChange={(value) =>
                  setPaymentForm((current) => ({
                    ...current,
                    status: value as PaymentStatus,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pagato">Pagato</SelectItem>
                  <SelectItem value="In attesa">In attesa</SelectItem>
                  <SelectItem value="Scaduto">Scaduto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="button" onClick={addPayment}>
                <Plus className="mr-2 h-4 w-4" />
                Aggiungi
              </Button>
            </div>
          </div>
        </div>

        <div className="divide-y rounded-lg border">
          {structure.payments.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              Nessun pagamento registrato.
            </div>
          ) : (
            structure.payments.map((payment) => (
              <div
                key={payment.id}
                className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-medium">{payment.description}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(payment.date)} - EUR {payment.amount.toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={statusClassName(payment.status)}>
                    {payment.status}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      patch({
                        payments: structure.payments.filter(
                          (item) => item.id !== payment.id,
                        ),
                      })
                    }
                    title="Elimina pagamento"
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

