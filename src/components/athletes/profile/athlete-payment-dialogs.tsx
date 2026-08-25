"use client";

import React from "react";
import { Plus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * Le finestre di dialogo dei pagamenti della scheda atleta.
 *
 * Estratte dalla route (WP-19) perche sono **payment-specific**: la scheda
 * atleta non deve crescere ogni volta che il dominio pagamenti cambia, e il
 * Workstream A la stava facendo crescere.
 *
 * Sono la parte «anagrafica» della rata — descrizione, importo, scadenza,
 * metodo, note — piu l'aggiunta di una voce a debito. **Lo stato non c'e**, ed
 * e la differenza che conta: si ricava dagli incassi, e per incassare si usa
 * «Registra pagamento» in Rate e incassi (ADR-0036).
 */

/**
 * `Select` di Radix non accetta `value=""`: serve un valore sentinella per
 * «nessun metodo indicato».
 */
export const PAYMENT_METHOD_UNSET = "__nessun_metodo__";

export type AthletePaymentEditForm = {
  description: string;
  amount: string;
  dueDate: string;
  status: string;
  method: string;
  notes: string;
};

export type AthleteNewPaymentForm = {
  date: string;
  description: string;
  type: string;
  amount: string;
  status: string;
};

export type AthletePaymentDialogsProps = {
  editingPayment: any | null;
  onCloseEdit: () => void;
  paymentEditForm: AthletePaymentEditForm;
  setPaymentEditForm: React.Dispatch<
    React.SetStateAction<AthletePaymentEditForm>
  >;
  paymentMethodOptions: string[];
  clubPaymentMethodChoices: string[];
  onRequestPaymentUpdate: () => void;

  paymentAction: { action: string } | null;
  isPaymentActionSaving: boolean;
  onClosePaymentAction: () => void;
  onExecutePaymentAction: () => void;

  showAddPaymentModal: boolean;
  onAddPaymentOpenChange: (open: boolean) => void;
  newPayment: AthleteNewPaymentForm;
  setNewPayment: React.Dispatch<React.SetStateAction<AthleteNewPaymentForm>>;
  onSavePayment: () => void;
};

export function AthletePaymentDialogs({
  editingPayment,
  onCloseEdit,
  paymentEditForm,
  setPaymentEditForm,
  paymentMethodOptions,
  clubPaymentMethodChoices,
  onRequestPaymentUpdate,
  paymentAction,
  isPaymentActionSaving,
  onClosePaymentAction,
  onExecutePaymentAction,
  showAddPaymentModal,
  onAddPaymentOpenChange,
  newPayment,
  setNewPayment,
  onSavePayment,
}: AthletePaymentDialogsProps) {
  return (
    <>
      <Dialog
        open={Boolean(editingPayment)}
        onOpenChange={(open) => {
          if (!open) {
            onCloseEdit();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifica pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Descrizione</Label>
              <Input
                value={paymentEditForm.description}
                onChange={(event) =>
                  setPaymentEditForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                className="mt-2"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Importo</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentEditForm.amount}
                  onChange={(event) =>
                    setPaymentEditForm((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
                  }
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Scadenza</Label>
                <Input
                  type="date"
                  value={paymentEditForm.dueDate}
                  onChange={(event) =>
                    setPaymentEditForm((current) => ({
                      ...current,
                      dueDate: event.target.value,
                    }))
                  }
                  className="mt-2"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {/*
                Lo stato non e piu un campo: era il gesto sbagliato che
                l'interfaccia chiedeva alla segreteria. Si ricava dagli
                incassi registrati, e per portarlo a «pagata» si registra un
                pagamento in «Rate e incassi» (ADR-0036).
              */}
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/40">
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  Stato: {editingPayment?.status || "Da incassare"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Si aggiorna da solo quando registri un incasso. Usa «Registra
                  pagamento» in Rate e incassi.
                </p>
              </div>
              <div>
                <Label>Metodo</Label>
                <Select
                  value={paymentEditForm.method || PAYMENT_METHOD_UNSET}
                  onValueChange={(value) =>
                    setPaymentEditForm((current) => ({
                      ...current,
                      method: value === PAYMENT_METHOD_UNSET ? "" : value,
                    }))
                  }
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Seleziona metodo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PAYMENT_METHOD_UNSET}>
                      Non specificato
                    </SelectItem>
                    {paymentMethodOptions.map((method) => (
                      <SelectItem key={method} value={method}>
                        {method}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {clubPaymentMethodChoices.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Nessun metodo configurato: aggiungili in Gestione
                    iscrizioni.
                  </p>
                ) : null}
              </div>
            </div>
            <div>
              <Label>Note</Label>
              <Textarea
                value={paymentEditForm.notes}
                onChange={(event) =>
                  setPaymentEditForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onCloseEdit}>
              Annulla
            </Button>
            <Button onClick={onRequestPaymentUpdate}>Salva modifiche</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*
        Conferma normale al posto del PIN: e la conferma a proteggere dal gesto
        involontario. Chi puo davvero agire lo decide il server, dal ruolo.
      */}
      <AlertDialog
        open={Boolean(paymentAction)}
        onOpenChange={(open) => {
          if (!open && !isPaymentActionSaving) {
            onClosePaymentAction();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {paymentAction?.action === "update"
                ? "Modificare il pagamento?"
                : paymentAction?.action === "delete"
                  ? "Eliminare il pagamento in attesa?"
                  : "Annullare il pagamento saldato?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;operazione viene registrata nello storico del pagamento con
              il tuo nome.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPaymentActionSaving}>
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isPaymentActionSaving}
              className={
                paymentAction?.action === "update"
                  ? undefined
                  : "bg-red-600 hover:bg-red-700"
              }
              onClick={(event) => {
                event.preventDefault();
                onExecutePaymentAction();
              }}
            >
              Conferma
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showAddPaymentModal} onOpenChange={onAddPaymentOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aggiungi Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Data *</Label>
              <Input
                type="date"
                value={newPayment.date}
                onChange={(event) =>
                  setNewPayment((current) => ({
                    ...current,
                    date: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <Label>Descrizione *</Label>
              <Input
                value={newPayment.description}
                onChange={(event) =>
                  setNewPayment((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Es: Quota mensile Gennaio"
              />
            </div>
            <div>
              <Label>Tipo *</Label>
              <Select
                value={newPayment.type}
                onValueChange={(value) =>
                  setNewPayment((current) => ({ ...current, type: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Quota">Quota</SelectItem>
                  <SelectItem value="Iscrizione">Iscrizione</SelectItem>
                  <SelectItem value="Abbigliamento">Abbigliamento</SelectItem>
                  <SelectItem value="Trasferta">Trasferta</SelectItem>
                  <SelectItem value="Altro">Altro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Importo (EUR) *</Label>
              <Input
                type="number"
                step="0.01"
                value={newPayment.amount}
                onChange={(event) =>
                  setNewPayment((current) => ({
                    ...current,
                    amount: event.target.value,
                  }))
                }
                placeholder="0.00"
              />
            </div>
            {/*
              Questa finestra aggiunge una **voce a debito**, non un incasso:
              nasce sempre da incassare. Dichiararla «Pagato» qui creerebbe
              denaro senza un movimento che lo dimostri, cioe il difetto che
              ADR-0036 chiude. Per incassarla si usa «Registra pagamento».
            */}
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/40">
              <p className="font-medium text-slate-900 dark:text-slate-100">
                La voce nasce da incassare
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Per registrarne l&apos;incasso usa «Registra pagamento» in Rate
                e incassi: l&apos;importo puo essere anche parziale.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onAddPaymentOpenChange(false)}
            >
              Annulla
            </Button>
            <Button
              onClick={onSavePayment}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Aggiungi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
