"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  toPaymentAmount,
  validatePaymentTransactionInput,
  type InstallmentLedger,
} from "@/lib/payments/installment-ledger";

/**
 * «Registra pagamento»: **l'unica** finestra con cui si incassa una rata.
 *
 * Sostituisce il gesto che la segreteria era costretta a fare — aprire la
 * rata e spostare uno stato da «In attesa» a «Pagata» — con quello che sta
 * davvero succedendo: e arrivato del denaro, in una certa data, con un certo
 * metodo. Lo stato lo ricava il registro (ADR-0036).
 *
 * **L'importo e precompilato con il residuo e resta modificabile.** Il caso
 * comune e il saldo, e chiedere di ridigitarlo ogni volta e attrito inutile;
 * il caso che prima non esisteva — 50 su una rata da 130 — si ottiene
 * cambiando un campo gia a fuoco.
 *
 * Lo stesso componente serve la scheda atleta e l'area Movimenti: una seconda
 * finestra «quasi uguale» e il modo in cui i due percorsi tornano a divergere.
 */

const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

export type RegisterPaymentSubmission = {
  amount: number;
  paymentMethod: string;
  paidAt: string;
  notes: string;
  /**
   * **Su quale conto il denaro e arrivato.**
   *
   * Questa finestra non lo chiedeva e non lo mandava: ogni incasso di una
   * famiglia nasceva senza conto. Il registro lo mostra e il rendiconto lo
   * conta, ma i **saldi** si sommano per conto, e una riga senza conto non
   * entra in nessuno. Il riquadro «Saldo cassa e banca» — che dichiara di
   * essere il saldo di apertura piu tutti i movimenti registrati — sbagliava
   * dell'intero incassato quote del club.
   */
  financialAccountId: string | null;
  /**
   * **La causale, che nessuna schermata chiedeva.**
   *
   * `activity_scope_snapshot` esiste sull'incasso, il servizio sa risolverlo
   * dal catalogo, e la classificazione fiscale e cio per cui meta della Wave 4
   * e stata costruita. Ma l'unica schermata che registra un incasso di una
   * famiglia non mandava `operation_type_code`, quindi ogni incasso reale
   * nasceva **non classificato** — e il rendiconto dichiarava non classificato
   * il cento per cento delle entrate delle famiglie, mentre il documento
   * emesso per lo stesso incasso diceva «commerciale».
   *
   * Resta facoltativa, ed e una scelta: una causale obbligatoria su una
   * finestra che una segreteria apre trenta volte di fila diventa un campo che
   * si compila a caso, e una classificazione inventata e peggio di una
   * mancante. Il rendiconto dichiara quante righe nessuno ha classificato, ed
   * e cosi che un club capisce che ha del lavoro da fare.
   */
  operationTypeCode: string | null;
};

export type RegisterPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** La rata da incassare. `null` finche non se ne apre una. */
  ledger: InstallmentLedger | null;
  athleteName?: string | null;
  /** I metodi configurati dal club. Mai testo libero (ADR-0036). */
  methodChoices?: string[];
  isSaving?: boolean;
  /**
   * Le causali attive del club, gia lette da chi monta la finestra.
   *
   * Vuoto significa «il club non ne ha configurate», e la finestra lo dice
   * invece di mostrare un elenco vuoto senza spiegazione.
   */
  operationTypeChoices?: Array<{ code: string; label: string }>;
  /**
   * I conti attivi del club. Vuoto significa «il club non ne ha ancora
   * configurati», e allora l'incasso si registra lo stesso: il rendiconto lo
   * raggruppa sotto «Senza conto», che e un'assenza dichiarata.
   */
  accountChoices?: Array<{ id: string; name: string }>;
  onSubmit: (submission: RegisterPaymentSubmission) => void | Promise<void>;
};

export function RegisterPaymentDialog({
  open,
  onOpenChange,
  ledger,
  athleteName,
  methodChoices = [],
  isSaving = false,
  operationTypeChoices = [],
  accountChoices = [],
  onSubmit,
}: RegisterPaymentDialogProps) {
  const [amount, setAmount] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState("");
  const [paidAt, setPaidAt] = React.useState(todayIsoDate());
  const [notes, setNotes] = React.useState("");
  const [operationTypeCode, setOperationTypeCode] = React.useState("");
  const [financialAccountId, setFinancialAccountId] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  /*
    **Si preseleziona il primo conto attivo.**

    Chiedere alla segreteria di scegliere il conto a ogni incasso significa che
    prima o poi non lo scegliera, e la riga tornera a non entrare in nessun
    saldo. Quasi tutti i club ne hanno uno solo; resta cambiabile.
  */
  const contoScelto = React.useRef(false);
  React.useEffect(() => {
    /*
      **Si preseleziona una volta sola.**

      Con `financialAccountId` fra le dipendenze, scegliere «Senza conto» —
      che azzera il valore — faceva ripartire subito l effetto e ripristinava
      il primo conto: l opzione era offerta e inerte. Ora la preselezione vale
      finche l operatore non ha scelto, e dopo tace.
    */
    if (contoScelto.current || !accountChoices.length) return;
    contoScelto.current = true;
    setFinancialAccountId(accountChoices[0].id);
  }, [accountChoices]);

  /*
    I campi si ripopolano ogni volta che la finestra si apre su una rata:
    tenerli fra due aperture porterebbe l'importo della rata precedente su
    quella nuova, che e il tipo di errore che si scopre a fine mese.
  */
  React.useEffect(() => {
    if (!open || !ledger) return;

    setAmount(ledger.residualAmount > 0 ? ledger.residualAmount.toFixed(2) : "");
    setPaymentMethod(methodChoices[0] || "");
    setPaidAt(todayIsoDate());
    setNotes("");
    setOperationTypeCode("");
    /*
      **Anche il conto torna alla preselezione a ogni apertura.**

      Il riferimento che impedisce alla preselezione di ripartire vale per la
      vita del componente, e questa finestra non viene mai smontata: solo
      `open` cambia. Scegliere «Senza conto» una volta lasciava quindi il
      campo vuoto per **tutti gli incassi successivi** della sessione, e ognuno
      nasceva senza conto — cioe fuori da ogni saldo, che e esattamente il
      guasto che la preselezione esiste per evitare.

      «Una volta sola» vuol dire una volta per apertura, non una per sessione.
    */
    contoScelto.current = false;
    setFinancialAccountId("");
    setTouched(false);
    // `methodChoices` e un array ricostruito a ogni render: dipendere dal suo
    // contenuto rimetterebbe a zero i campi mentre si scrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ledger?.installmentId]);

  const parsedAmount = toPaymentAmount(amount);
  const validationError = ledger
    ? validatePaymentTransactionInput({
        amount,
        paymentMethod,
        ledger,
      })
    : null;

  const residualAfter = ledger
    ? Math.max(0, Number((ledger.residualAmount - parsedAmount).toFixed(2)))
    : 0;

  const handleSubmit = async () => {
    setTouched(true);
    if (!ledger || validationError) return;

    await onSubmit({
      amount: parsedAmount,
      paymentMethod,
      paidAt,
      notes: notes.trim(),
      operationTypeCode: operationTypeCode || null,
      financialAccountId: financialAccountId || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registra pagamento</DialogTitle>
          <DialogDescription>
            {ledger ? ledger.label : "Rata"}
            {athleteName ? ` — ${athleteName}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="registra-pagamento-importo">Importo (EUR) *</Label>
              <Input
                id="registra-pagamento-importo"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => {
                  setTouched(true);
                  setAmount(event.target.value);
                }}
              />
              {ledger && ledger.residualAmount > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Precompilato con il residuo della rata. Modificalo per
                  registrare un acconto.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="registra-pagamento-data">Data incasso *</Label>
              <Input
                id="registra-pagamento-data"
                type="date"
                value={paidAt}
                onChange={(event) => setPaidAt(event.target.value)}
              />
            </div>
          </div>

          {/*
            **La causale, facoltativa e dichiarata.**

            Il posto della classificazione fiscale e questo: e qui che qualcuno
            sa cosa sta incassando. Restava vuota su ogni incasso reale perche
            la finestra non la chiedeva, e il rendiconto dichiarava non
            classificato il cento per cento delle entrate delle famiglie.
          */}
          <div className="space-y-2">
            <Label htmlFor="registra-pagamento-causale">Causale</Label>
            <Select
              value={operationTypeCode || "__nessuna__"}
              onValueChange={(value) =>
                setOperationTypeCode(value === "__nessuna__" ? "" : value)
              }
            >
              <SelectTrigger id="registra-pagamento-causale">
                <SelectValue placeholder="Non classificato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__nessuna__">Non classificato</SelectItem>
                {operationTypeChoices.map((causale) => (
                  <SelectItem key={causale.code} value={causale.code}>
                    {causale.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {operationTypeChoices.length === 0
                ? "Il club non ha ancora configurato le causali: configurale in Organizzazione per classificare le entrate."
                : "Decide come l'incasso compare nel rendiconto, e si congela adesso: correggere la causale domani non cambia questo incasso."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="registra-pagamento-conto">Conto</Label>
            <Select
              value={financialAccountId || "__nessuno__"}
              onValueChange={(value) =>
                setFinancialAccountId(value === "__nessuno__" ? "" : value)
              }
            >
              <SelectTrigger id="registra-pagamento-conto">
                <SelectValue placeholder="Senza conto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__nessuno__">Senza conto</SelectItem>
                {accountChoices.map((conto) => (
                  <SelectItem key={conto.id} value={conto.id}>
                    {conto.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {accountChoices.length === 0
                ? "Il club non ha ancora configurato i conti: configurali in Contabilita, altrimenti questo incasso non entrera in nessun saldo."
                : "Dove il denaro e arrivato. Senza, l'incasso resta in prima nota e fuori dai saldi di cassa e banca."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="registra-pagamento-metodo">
              Metodo di pagamento *
            </Label>
            <Select
              value={paymentMethod}
              onValueChange={(value) => {
                setTouched(true);
                setPaymentMethod(value);
              }}
            >
              <SelectTrigger id="registra-pagamento-metodo">
                <SelectValue placeholder="Seleziona un metodo" />
              </SelectTrigger>
              <SelectContent>
                {methodChoices.map((method) => (
                  <SelectItem key={method} value={method}>
                    {method}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {methodChoices.length === 0 ? (
              <p className="text-xs text-amber-600">
                Nessun metodo di incasso configurato: aggiungine uno nelle
                impostazioni del club prima di registrare un pagamento.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="registra-pagamento-note">Note</Label>
            <Textarea
              id="registra-pagamento-note"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Es. acconto consegnato in segreteria"
            />
          </div>

          {ledger ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-900/50">
              <p className="mb-2 font-semibold text-slate-900 dark:text-slate-100">
                Riepilogo
              </p>
              <dl className="space-y-1">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Importo dovuto</dt>
                  <dd className="font-medium">
                    {formatCurrency(ledger.dueAmount)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Gia incassato</dt>
                  <dd className="font-medium">
                    {formatCurrency(ledger.paidAmount)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Questo pagamento</dt>
                  <dd className="font-medium">{formatCurrency(parsedAmount)}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-slate-200 pt-1 dark:border-slate-800">
                  <dt className="font-medium">Residuo dopo</dt>
                  <dd className="font-semibold">
                    {formatCurrency(residualAfter)}
                  </dd>
                </div>
              </dl>
              {residualAfter > 0 && parsedAmount > 0 ? (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  La rata restera parzialmente pagata.
                </p>
              ) : null}
            </div>
          ) : null}

          {touched && validationError ? (
            <p className="text-sm font-medium text-red-600">{validationError}</p>
          ) : null}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Annulla
          </Button>
          <Button
            className="w-full sm:w-auto"
            onClick={() => void handleSubmit()}
            disabled={isSaving || Boolean(validationError)}
          >
            {isSaving ? "Registrazione..." : "Registra pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
