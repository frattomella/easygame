"use client";

import { useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-notification";
import { addClubData, updateClubDataArray } from "@/lib/simplified-db";
import type {
  ClubEntityOption,
  ClubEntityType,
} from "@/lib/club-entity-directory";

type AdvancedTransactionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubId: string;
  bankAccounts: any[];
  entities: ClubEntityOption[];
  onSaved: () => Promise<void> | void;
};

type MovementDirection = "income" | "expense";
type MovementStatus = "paid" | "pending" | "overdue";

const entityTypeLabels: Record<ClubEntityType, string> = {
  athlete: "Atleta",
  staff: "Staff",
  member: "Socio",
  sponsor: "Sponsor",
  trainer: "Allenatore",
  supplier: "Fornitore",
  structure: "Struttura",
  club: "Club",
  external: "Esterno/manuale",
};

const today = () => new Date().toISOString().split("T")[0];

const newTransactionId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }

  return "";
};

const currencyLabel = (value: unknown) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value) || 0);

export function AdvancedTransactionDialog({
  open,
  onOpenChange,
  clubId,
  bankAccounts,
  entities,
  onSaved,
}: AdvancedTransactionDialogProps) {
  const { showToast } = useToast();
  const [direction, setDirection] = useState<MovementDirection>("income");
  const [status, setStatus] = useState<MovementStatus>("paid");
  const [paidAt, setPaidAt] = useState(today());
  const [dueDate, setDueDate] = useState(today());
  const [entityType, setEntityType] = useState<ClubEntityType>("athlete");
  const [entitySearch, setEntitySearch] = useState("");
  const [entityId, setEntityId] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptRequested, setReceiptRequested] = useState(false);
  const [invoiceRequested, setInvoiceRequested] = useState(false);
  const [saving, setSaving] = useState(false);

  const filteredEntities = useMemo(() => {
    const query = entitySearch.trim().toLowerCase();
    return entities
      .filter((entity) => entity.type === entityType)
      .filter((entity) => {
        if (!query) return true;
        return [
          entity.label,
          entity.subtitle,
          entity.email,
          entity.phone,
          entity.category,
          entity.fiscalCode,
          entity.vatNumber,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      });
  }, [entities, entitySearch, entityType]);

  const selectedEntity = useMemo(
    () =>
      entities.find(
        (entity) => entity.type === entityType && entity.id === entityId,
      ) || null,
    [entities, entityId, entityType],
  );

  const effectiveName =
    selectedEntity?.label || manualName.trim() || "Soggetto manuale";
  const effectiveEmail = selectedEntity?.email || manualEmail.trim();
  const effectivePhone = selectedEntity?.phone || manualPhone.trim();
  const effectiveCategory = selectedEntity?.category || selectedEntity?.subtitle || "";
  const effectiveReference = firstText(
    reference,
    selectedEntity?.fiscalCode,
    selectedEntity?.vatNumber,
    selectedEntity?.id,
    effectiveName,
  );
  const isExternal = entityType === "external" || !selectedEntity;

  const reset = () => {
    setDirection("income");
    setStatus("paid");
    setPaidAt(today());
    setDueDate(today());
    setEntityType("athlete");
    setEntitySearch("");
    setEntityId("");
    setManualName("");
    setManualEmail("");
    setManualPhone("");
    setDescription("");
    setCategory("");
    setAmount("");
    setPaymentMethod("");
    setBankAccountId("");
    setReference("");
    setNotes("");
    setReceiptRequested(false);
    setInvoiceRequested(false);
  };

  const handleEntityTypeChange = (value: ClubEntityType) => {
    setEntityType(value);
    setEntityId("");
    setEntitySearch("");
  };

  const handleEntityChange = (value: string) => {
    setEntityId(value);
    const entity = entities.find(
      (item) => item.type === entityType && item.id === value,
    );

    if (entity) {
      setManualName(entity.label);
      setManualEmail(entity.email || "");
      setManualPhone(entity.phone || "");
      setReference(
        firstText(entity.fiscalCode, entity.vatNumber, entity.id, entity.label),
      );
      setCategory((current) => current || entity.category || entity.subtitle || "");
    }
  };

  const close = () => {
    onOpenChange(false);
    reset();
  };

  const save = async () => {
    if (!clubId) {
      showToast("error", "Nessun club attivo trovato");
      return;
    }

    const amountValue = Number(amount);
    if (!description.trim() || !category.trim() || amountValue <= 0) {
      showToast("error", "Compila descrizione, categoria e importo");
      return;
    }

    if (status === "paid" && !bankAccountId) {
      showToast("error", "Seleziona un conto per i movimenti pagati");
      return;
    }

    if (isExternal && !manualName.trim()) {
      showToast("error", "Inserisci il nome del soggetto manuale");
      return;
    }

    const createdAt = new Date().toISOString();
    const commonPayload = {
      dueDate,
      paidAt: status === "paid" ? paidAt : undefined,
      description: description.trim(),
      category: category.trim(),
      amount: amountValue,
      type: direction,
      direction,
      status,
      paymentMethod: paymentMethod.trim(),
      method: paymentMethod.trim(),
      reference: effectiveReference,
      bankAccountId,
      originEntityType: isExternal ? "external" : selectedEntity?.type,
      originEntityId: selectedEntity?.id || "",
      originEntityName: effectiveName,
      subjectName: effectiveName,
      subjectEmail: effectiveEmail,
      subjectPhone: effectivePhone,
      subjectCategory: effectiveCategory,
      notes: notes.trim(),
      documentRequest: {
        receiptRequested,
        invoiceRequested,
      },
      source:
        selectedEntity?.type === "athlete"
          ? "manual_athlete_payment"
          : "manual_transaction",
      createdAt,
    };

    try {
      setSaving(true);

      if (status === "paid") {
        const transaction = {
          ...commonPayload,
          id: newTransactionId("transaction"),
          date: paidAt,
        };

        await addClubData(clubId, "transactions", transaction);

        const updatedAccounts = bankAccounts.map((account) => {
          if (String(account.id) !== String(bankAccountId)) return account;

          const delta = direction === "income" ? amountValue : -amountValue;
          return {
            ...account,
            current_balance: Number(account.current_balance || 0) + delta,
            updated_at: createdAt,
          };
        });

        await updateClubDataArray(clubId, "bank_accounts", updatedAccounts);
      } else {
        const expected = {
          ...commonPayload,
          id: newTransactionId("expected"),
          date: dueDate,
          dueDate,
        };

        await addClubData(
          clubId,
          direction === "income" ? "expected_income" : "expected_expenses",
          expected,
        );
      }

      await onSaved();
      close();
      showToast("success", "Movimento registrato correttamente");
    } catch (error) {
      console.error("Error saving advanced transaction:", error);
      showToast("error", "Errore nel salvare il movimento");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          close();
          return;
        }
        onOpenChange(true);
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Nuova Transazione</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <section className="rounded-lg border p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase text-slate-500">
              Tipo movimento
            </h3>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Direzione *</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2"
                  value={direction}
                  onChange={(event) =>
                    setDirection(event.target.value as MovementDirection)
                  }
                >
                  <option value="income">Entrata</option>
                  <option value="expense">Uscita</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Stato *</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2"
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as MovementStatus)
                  }
                >
                  <option value="paid">Pagato</option>
                  <option value="pending">In attesa</option>
                  <option value="overdue">Scaduto</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Data pagamento</Label>
                <Input
                  type="date"
                  value={paidAt}
                  disabled={status !== "paid"}
                  onChange={(event) => setPaidAt(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Data scadenza</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="rounded-lg border p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase text-slate-500">
              Soggetto collegato
            </h3>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Tipo soggetto</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2"
                  value={entityType}
                  onChange={(event) =>
                    handleEntityTypeChange(event.target.value as ClubEntityType)
                  }
                >
                  {Object.entries(entityTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Soggetto registrato</Label>
                <div className="grid gap-2 md:grid-cols-[1fr_1.2fr]">
                  <Input
                    value={entitySearch}
                    onChange={(event) => setEntitySearch(event.target.value)}
                    placeholder="Cerca nome, email o categoria"
                    disabled={entityType === "external"}
                  />
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2"
                    value={entityId}
                    disabled={entityType === "external"}
                    onChange={(event) => handleEntityChange(event.target.value)}
                  >
                    <option value="">
                      {entityType === "external"
                        ? "Inserimento manuale"
                        : "Seleziona soggetto"}
                    </option>
                    {filteredEntities.map((entity) => (
                      <option key={`${entity.type}-${entity.id}`} value={entity.id}>
                        {entity.label}
                        {entity.subtitle ? ` - ${entity.subtitle}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Nome soggetto manuale *</Label>
                <Input
                  value={manualName}
                  onChange={(event) => setManualName(event.target.value)}
                  placeholder="Nome o ragione sociale"
                />
              </div>
              <div className="space-y-2">
                <Label>Email manuale</Label>
                <Input
                  value={manualEmail}
                  onChange={(event) => setManualEmail(event.target.value)}
                  placeholder="email@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Telefono manuale</Label>
                <Input
                  value={manualPhone}
                  onChange={(event) => setManualPhone(event.target.value)}
                  placeholder="+39..."
                />
              </div>
            </div>
          </section>

          <section className="rounded-lg border p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase text-slate-500">
              Dettagli economici
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Descrizione *</Label>
                <Input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Es. Quota iscrizione, rimborso, acquisto materiale"
                />
              </div>
              <div className="space-y-2">
                <Label>Categoria contabile *</Label>
                <Input
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="Es. Quote, Sponsor, Fornitori"
                />
              </div>
              <div className="space-y-2">
                <Label>Importo *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Metodo pagamento</Label>
                <Input
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                  placeholder="Bonifico, contanti, carta..."
                />
              </div>
              <div className="space-y-2">
                <Label>Conto</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2"
                  value={bankAccountId}
                  onChange={(event) => setBankAccountId(event.target.value)}
                >
                  <option value="">Seleziona conto</option>
                  {bankAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name || account.bank_name || account.id} -{" "}
                      {currencyLabel(account.current_balance)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Riferimento</Label>
                <Input
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder={effectiveName || "Codice, tessera, causale"}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Note</Label>
                <Textarea
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="rounded-lg border p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase text-slate-500">
              Opzioni documento
            </h3>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={receiptRequested}
                  onCheckedChange={(checked) =>
                    setReceiptRequested(Boolean(checked))
                  }
                />
                Richiedi ricevuta
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={invoiceRequested}
                  onCheckedChange={(checked) =>
                    setInvoiceRequested(Boolean(checked))
                  }
                />
                Richiedi fattura
              </label>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Annulla
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "Salvataggio..." : "Salva movimento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
