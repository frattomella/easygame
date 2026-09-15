"use client";

import React from "react";
import { Drawer } from "@/components/web/overlays/Drawer";
import { ConfirmDialog } from "@/components/web/overlays/Modal";
import { Button } from "@/components/web/primitives/Button";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { InfoCard } from "@/components/web/page/Cards";
import {
  CurrencyInput,
  DateInput,
  Field,
  FieldSizeProvider,
  FormGrid,
  Select,
  TextInput,
  Textarea,
} from "@/components/web/forms/Field";

/**
 * Le finestre dei pagamenti della scheda atleta, nella forma del Web V2: due
 * cassetti (modifica, aggiunta) e una conferma proporzionata al gesto.
 *
 * Estratte dalla route (WP-19) perche sono **payment-specific**: la scheda
 * atleta non deve crescere ogni volta che il dominio pagamenti cambia.
 *
 * Sono la parte «anagrafica» della rata — descrizione, importo, scadenza,
 * metodo, note — piu l'aggiunta di una voce a debito. **Lo stato non c'e**, ed
 * e la differenza che conta: si ricava dagli incassi, e per incassare si usa
 * «Registra pagamento» in Rate e incassi (ADR-0036).
 */

/**
 * `Select` non accetta `value=""`: serve un valore sentinella per «nessun
 * metodo indicato».
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

const NEW_PAYMENT_TYPES = ["Quota", "Iscrizione", "Abbigliamento", "Trasferta", "Altro"];

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
  const [editDirty, setEditDirty] = React.useState(false);
  const [addDirty, setAddDirty] = React.useState(false);
  React.useEffect(() => {
    if (!editingPayment) setEditDirty(false);
  }, [editingPayment]);
  React.useEffect(() => {
    if (!showAddPaymentModal) setAddDirty(false);
  }, [showAddPaymentModal]);

  const patchEdit = (changes: Partial<AthletePaymentEditForm>) => {
    setEditDirty(true);
    setPaymentEditForm((current) => ({ ...current, ...changes }));
  };
  const patchNew = (changes: Partial<AthleteNewPaymentForm>) => {
    setAddDirty(true);
    setNewPayment((current) => ({ ...current, ...changes }));
  };

  return (
    <>
      <Drawer
        open={Boolean(editingPayment)}
        onOpenChange={(open) => {
          if (!open) onCloseEdit();
        }}
        width="default"
        eyebrow="Rata"
        title="Modifica pagamento"
        dirty={editDirty}
        footer={
          <>
            <Button variant="primary" onClick={onRequestPaymentUpdate}>
              Salva modifiche
            </Button>
            <Button variant="secondary" onClick={onCloseEdit}>
              Annulla
            </Button>
          </>
        }
      >
        <FieldSizeProvider size="sm">
          <div className="flex flex-col gap-5">
            <Field label="Descrizione" htmlFor="payment-edit-description">
              <TextInput id="payment-edit-description" value={paymentEditForm.description} onChange={(event) => patchEdit({ description: event.target.value })} />
            </Field>
            <FormGrid columns={2}>
              <Field label="Importo" htmlFor="payment-edit-amount" width="14ch">
                <CurrencyInput id="payment-edit-amount" value={paymentEditForm.amount} onChange={(event) => patchEdit({ amount: event.target.value })} />
              </Field>
              <Field label="Scadenza" htmlFor="payment-edit-due">
                <DateInput id="payment-edit-due" value={paymentEditForm.dueDate} onChange={(event) => patchEdit({ dueDate: event.target.value })} />
              </Field>
            </FormGrid>
            {/*
              Lo stato non e piu un campo: era il gesto sbagliato che
              l'interfaccia chiedeva alla segreteria. Si ricava dagli incassi
              registrati, e per portarlo a «pagata» si registra un pagamento in
              «Rate e incassi» (ADR-0036).
            */}
            <InsetBlock>
              <p className="font-brand text-[13px] font-semibold text-egw-ink">
                Stato: {editingPayment?.status || "Da incassare"}
              </p>
              <p className="mt-1 font-brand text-[12px] text-egw-ink-62">
                Si aggiorna da solo quando registri un incasso. Usa «Registra pagamento» in Rate e incassi.
              </p>
            </InsetBlock>
            <Field
              label="Metodo"
              htmlFor="payment-edit-method"
              helper={clubPaymentMethodChoices.length === 0 ? "Nessun metodo configurato: aggiungili in Gestione iscrizioni." : undefined}
            >
              <Select
                id="payment-edit-method"
                value={paymentEditForm.method || PAYMENT_METHOD_UNSET}
                onValueChange={(value) => patchEdit({ method: value === PAYMENT_METHOD_UNSET ? "" : value })}
                options={[
                  { value: PAYMENT_METHOD_UNSET, label: "Non specificato" },
                  ...paymentMethodOptions.map((method) => ({ value: method, label: method })),
                ]}
              />
            </Field>
            <Field label="Note" htmlFor="payment-edit-notes">
              <Textarea id="payment-edit-notes" value={paymentEditForm.notes} onChange={(event) => patchEdit({ notes: event.target.value })} />
            </Field>
          </div>
        </FieldSizeProvider>
      </Drawer>

      {/*
        Conferma proporzionata al posto del PIN: e la conferma a proteggere dal
        gesto involontario. Chi puo davvero agire lo decide il server, dal ruolo.
      */}
      <ConfirmDialog
        open={Boolean(paymentAction)}
        onOpenChange={(open) => {
          if (!open && !isPaymentActionSaving) onClosePaymentAction();
        }}
        tone={paymentAction?.action === "update" ? "neutral" : "danger"}
        title={
          paymentAction?.action === "update"
            ? "Modificare il pagamento?"
            : paymentAction?.action === "delete"
              ? "Eliminare il pagamento in attesa?"
              : "Annullare il pagamento saldato?"
        }
        description="L'operazione viene registrata nello storico del pagamento con il tuo nome."
        confirmLabel={
          paymentAction?.action === "update" ? "Modifica" : paymentAction?.action === "delete" ? "Elimina" : "Annulla il pagamento"
        }
        loading={isPaymentActionSaving}
        onConfirm={onExecutePaymentAction}
      />

      <Drawer
        open={showAddPaymentModal}
        onOpenChange={onAddPaymentOpenChange}
        width="default"
        eyebrow="Piano di pagamento"
        title="Aggiungi voce"
        dirty={addDirty}
        footer={
          <>
            <Button variant="primary" onClick={onSavePayment}>
              Aggiungi
            </Button>
            <Button variant="secondary" onClick={() => onAddPaymentOpenChange(false)}>
              Annulla
            </Button>
          </>
        }
      >
        <FieldSizeProvider size="sm">
          <div className="flex flex-col gap-5">
            <Field label="Data" required htmlFor="payment-new-date">
              <DateInput id="payment-new-date" value={newPayment.date} onChange={(event) => patchNew({ date: event.target.value })} />
            </Field>
            <Field label="Descrizione" required htmlFor="payment-new-description">
              <TextInput id="payment-new-description" value={newPayment.description} onChange={(event) => patchNew({ description: event.target.value })} placeholder="Es: Quota mensile Gennaio" />
            </Field>
            <Field label="Tipo" required htmlFor="payment-new-type">
              <Select
                id="payment-new-type"
                value={newPayment.type}
                onValueChange={(value) => patchNew({ type: value })}
                options={NEW_PAYMENT_TYPES.map((type) => ({ value: type, label: type }))}
              />
            </Field>
            <Field label="Importo" required htmlFor="payment-new-amount" width="14ch">
              <CurrencyInput id="payment-new-amount" value={newPayment.amount} onChange={(event) => patchNew({ amount: event.target.value })} />
            </Field>
            {/*
              Questa finestra aggiunge una **voce a debito**, non un incasso:
              nasce sempre da incassare. Dichiararla «Pagato» qui creerebbe
              denaro senza un movimento che lo dimostri, cioe il difetto che
              ADR-0036 chiude. Per incassarla si usa «Registra pagamento».
            */}
            <InfoCard eyebrow="La voce nasce da incassare">
              Per registrarne l&apos;incasso usa «Registra pagamento» in Rate e incassi: l&apos;importo può essere anche parziale.
            </InfoCard>
          </div>
        </FieldSizeProvider>
      </Drawer>
    </>
  );
}
