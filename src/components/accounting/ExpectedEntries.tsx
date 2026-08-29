"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, CalendarClock, Plus, X } from "lucide-react";
import { formatCents, formatDate, toDateInputValue } from "./accounting-view";

/**
 * La scheda **Previsti**.
 *
 * ---
 *
 * ## Cosa mostra, e cosa non deve mai mostrare
 *
 * Entrate e uscite che il club **si aspetta**, e che non sono ancora accadute.
 * Ogni etichetta lo dice — «Previsto», «previsione», «non e denaro» — perche il
 * difetto che questa Wave ha tolto era esattamente il contrario: «Entrate» con
 * sotto «Previste», due grandezze diverse nella stessa scheda, e nessuno sapeva
 * piu se quel numero fosse denaro incassato o denaro atteso.
 *
 * Per la stessa ragione questa scheda **non** mostra saldi, liquidita, ne i
 * totali di cassa del periodo: quelli stanno nella fascia finanziaria della
 * prima nota, e una previsione non deve comparire accanto a loro. Qui i due
 * totali si chiamano «previsto», arrivano gia sommati dal servizio, e vivono
 * dentro un riquadro proprio, separato da un bordo.
 *
 * ## Perche qui «Elimina» esiste
 *
 * Sulla prima nota non c'e, e non e una svista: un fatto di cassa e accaduto, e
 * si storna. Una previsione non e accaduta — e un promemoria — e un promemoria
 * sbagliato si toglie. La conferma e un dialogo che dice **cosa** si sta per
 * togliere, non un `confirm()` del browser.
 *
 * ## Il permesso arriva con le righe
 *
 * `canManage` viene dal servizio insieme all'elenco. Questo componente non
 * conosce il ruolo di chi guarda e non deve conoscerlo: e la lezione W3-14, per
 * cui la matrice della pagina e quella della rotta devono essere la stessa.
 *
 * ## A 375 px
 *
 * Sotto `md` una scheda per previsione; da `md` in su la tabella, dentro un
 * contenitore che scorre per conto proprio.
 */

type ExpectedDirection = "income" | "expense";

export type ExpectedEntryView = {
  id: string;
  direction: ExpectedDirection;
  date: string | null;
  description: string;
  category: string | null;
  reference: string | null;
  amountCents: number;
  seasonId: string | null;
  createdAt: string | null;
};

type ExpectedEntriesResponse = {
  entries: ExpectedEntryView[];
  totals: {
    expectedIncomeCents: number;
    expectedExpenseCents: number;
    expectedNetCents: number;
  };
  canManage: boolean;
};

const DIRECTION_LABEL: Record<ExpectedDirection, string> = {
  income: "Entrata prevista",
  expense: "Uscita prevista",
};

/**
 * Da euro digitati a centesimi.
 *
 * Accetta la virgola perche in Italia si scrive cosi, e restituisce `null` se
 * quello che c'e nel campo non e un numero: mandare `NaN` al server darebbe un
 * errore che parla di un problema diverso da quello vero.
 */
const parseAmountCents = (value: string): number | null => {
  const testo = value.trim().replace(/\./g, "").replace(",", ".");
  if (!testo) return null;
  const numero = Number(testo);
  if (!Number.isFinite(numero) || numero <= 0) return null;
  return Math.round(numero * 100);
};

const DirectionMark = ({ direction }: { direction: ExpectedDirection }) =>
  direction === "income" ? (
    <ArrowUp className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
  ) : (
    <ArrowDown className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
  );

/*
  **Il colore non e quello della cassa.** Verde acceso e rosso sono i colori di
  entrate e uscite avvenute, in prima nota. Qui sono tonalita smorzate, perche
  due righe identiche in due schede diverse sarebbero lette come la stessa cosa.
*/
const amountClass = (direction: ExpectedDirection) =>
  cn(
    "font-semibold tabular-nums",
    direction === "income" ? "text-emerald-700" : "text-amber-700",
  );

/* ========================================================================== */
/* La finestra di creazione                                                    */
/* ========================================================================== */

function NewExpectedDialog({
  open,
  onOpenChange,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  onSubmit: (payload: {
    direction: ExpectedDirection;
    date: string;
    description: string;
    category: string;
    reference: string;
    amount_cents: number;
  }) => void;
}) {
  const [direction, setDirection] = useState<ExpectedDirection>("income");
  const [date, setDate] = useState(() => toDateInputValue(new Date()));
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (!open) return;
    setDirection("income");
    setDate(toDateInputValue(new Date()));
    setDescription("");
    setCategory("");
    setReference("");
    setAmount("");
  }, [open]);

  const amountCents = parseAmountCents(amount);
  const compilato = Boolean(description.trim() && date && amountCents);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuova previsione</DialogTitle>
          <DialogDescription>
            Una previsione e un impegno atteso, non un movimento: non entra in
            prima nota, non tocca nessun saldo e non conta come denaro
            incassato. Quando il denaro arriva davvero si registra un movimento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="previsione-verso">Verso</Label>
              <Select
                value={direction}
                onValueChange={(value) =>
                  setDirection(value as ExpectedDirection)
                }
              >
                <SelectTrigger id="previsione-verso">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Entrata prevista</SelectItem>
                  <SelectItem value="expense">Uscita prevista</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="previsione-data">Data attesa</Label>
              <Input
                id="previsione-data"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="previsione-descrizione">Descrizione</Label>
            <Input
              id="previsione-descrizione"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Quote di aprile ancora da incassare"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="previsione-importo">Importo previsto</Label>
              <Input
                id="previsione-importo"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="820,00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="previsione-categoria">
                Voce (facoltativa)
              </Label>
              <Input
                id="previsione-categoria"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="Quote"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="previsione-riferimento">
              Riferimento (facoltativo)
            </Label>
            <Input
              id="previsione-riferimento"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Delibera, preventivo, contratto"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Annulla
          </Button>
          <Button
            type="button"
            disabled={!compilato || saving}
            onClick={() =>
              onSubmit({
                direction,
                date,
                description: description.trim(),
                category: category.trim(),
                reference: reference.trim(),
                amount_cents: amountCents as number,
              })
            }
          >
            {saving ? "Salvataggio..." : "Registra previsione"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ========================================================================== */
/* La finestra di cancellazione                                                */
/* ========================================================================== */

function RemoveExpectedDialog({
  entry,
  saving,
  onOpenChange,
  onConfirm,
}: {
  entry: ExpectedEntryView | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={Boolean(entry)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Togliere questa previsione?</DialogTitle>
          <DialogDescription>
            {entry
              ? `${DIRECTION_LABEL[entry.direction]} di ${formatCents(
                  entry.amountCents,
                )} — ${entry.description}.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <p className="text-sm text-slate-600">
          Non sparisce nessun movimento e nessun saldo cambia: una previsione non
          e mai stata denaro. Se l&apos;incasso o il pagamento e gia avvenuto,
          resta registrato in prima nota.
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Annulla
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={saving}
            onClick={onConfirm}
          >
            {saving ? "Rimozione..." : "Togli la previsione"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ========================================================================== */
/* La scheda                                                                   */
/* ========================================================================== */

export function ExpectedEntries({ clubId }: { clubId: string | null }) {
  const { showToast } = useToast();

  const [data, setData] = useState<ExpectedEntriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [toRemove, setToRemove] = useState<ExpectedEntryView | null>(null);

  const load = useCallback(async () => {
    if (!clubId) return;

    setLoading(true);
    const response = await apiRequest<ExpectedEntriesResponse>(
      "/api/v1/accounting/expected",
    );

    if (response.error) {
      /*
        L'errore si **mostra**. Inghiottirlo e disegnare una scheda vuota e il
        difetto che faceva credere a un club di non avere previsioni.
      */
      setError(response.error.message);
      setData(null);
    } else {
      setError(null);
      setData(response.data || null);
    }

    setLoading(false);
  }, [clubId]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy(true);
      const response = await apiRequest("/api/v1/accounting/expected", {
        method: "POST",
        body: payload,
      });
      setBusy(false);

      if (response.error) {
        showToast("error", response.error.message);
        return;
      }

      showToast("success", "Previsione registrata");
      setShowNew(false);
      await load();
    },
    [load, showToast],
  );

  const remove = useCallback(async () => {
    const entry = toRemove;
    if (!entry) return;

    setBusy(true);
    const response = await apiRequest(
      `/api/v1/accounting/expected/${encodeURIComponent(
        entry.id,
      )}?direction=${entry.direction}`,
      { method: "DELETE" },
    );
    setBusy(false);

    if (response.error) {
      showToast("error", response.error.message);
      return;
    }

    showToast("success", "Previsione rimossa");
    setToRemove(null);
    await load();
  }, [load, showToast, toRemove]);

  const entries = useMemo(() => data?.entries || [], [data]);
  const canManage = Boolean(data?.canManage);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-3xl text-sm text-slate-600">
          Entrate e uscite <strong>previste</strong>: cose che il club si
          aspetta e che non sono ancora accadute. Non sono denaro, non entrano in
          prima nota e non toccano nessun saldo. Quando il denaro si muove
          davvero si registra un movimento, ed e quello a contare.
        </p>

        {canManage ? (
          <Button
            type="button"
            className="shrink-0"
            onClick={() => setShowNew(true)}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            Nuova previsione
          </Button>
        ) : null}
      </div>

      {/*
        Il bordo tratteggiato e lo stesso della fascia economica del riepilogo:
        e la separazione fra grandezze. Questi due numeri non sono cassa, e non
        stanno nella stessa riga di un saldo.
      */}
      <div className="space-y-3 rounded-lg border border-dashed border-slate-300 bg-white p-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            Situazione previsionale
          </h2>
          <span className="text-xs text-slate-500">
            attese, non ancora denaro — nessuno di questi numeri e un saldo
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500">
                  Entrate previste
                </p>
                <ArrowUp
                  className="h-4 w-4 shrink-0 text-emerald-600"
                  aria-hidden
                />
              </div>
              <p className="mt-1 text-xl font-bold text-emerald-700">
                {formatCents(data?.totals.expectedIncomeCents || 0)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Attese, mai incassate. Fonte: le previsioni del club.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500">
                  Uscite previste
                </p>
                <ArrowDown
                  className="h-4 w-4 shrink-0 text-amber-600"
                  aria-hidden
                />
              </div>
              <p className="mt-1 text-xl font-bold text-amber-700">
                {formatCents(data?.totals.expectedExpenseCents || 0)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Attese, mai pagate. Fonte: le previsioni del club.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500">
                  Differenza prevista
                </p>
                <CalendarClock
                  className="h-4 w-4 shrink-0 text-slate-400"
                  aria-hidden
                />
              </div>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {formatCents(data?.totals.expectedNetCents || 0)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Differenza fra attese: non e liquidita, e non lo diventa
                sommandola a un saldo.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-medium">Le previsioni non sono state lette</p>
          <p className="mt-1">{error}</p>
        </div>
      ) : loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Lettura delle previsioni...
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          Nessuna previsione registrata per questo club.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Sotto md: una scheda per previsione. */}
          <div className="space-y-3 md:hidden">
            {entries.map((entry) => (
              <div
                key={`${entry.direction}-${entry.id}`}
                className="rounded-lg border border-dashed border-slate-300 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">
                      {formatDate(entry.date)}
                    </p>
                    <p className="mt-0.5 break-words font-medium text-slate-900">
                      {entry.description}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <DirectionMark direction={entry.direction} />
                    <span className={amountClass(entry.direction)}>
                      {formatCents(entry.amountCents)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1">
                  <Badge variant="outline" className="font-normal">
                    {DIRECTION_LABEL[entry.direction]}
                  </Badge>
                  {entry.category ? (
                    <Badge variant="outline" className="font-normal">
                      {entry.category}
                    </Badge>
                  ) : null}
                </div>

                {entry.reference ? (
                  <p className="mt-2 break-words text-sm text-slate-600">
                    {entry.reference}
                  </p>
                ) : null}

                {canManage ? (
                  <div className="mt-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={busy}
                      onClick={() => setToRemove(entry)}
                    >
                      <X className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                      Togli
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {/* Da md in su la tabella, dentro un contenitore che scorre da solo. */}
          <div className="hidden overflow-x-auto rounded-lg border border-dashed border-slate-300 bg-white md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">
                    Data attesa
                  </TableHead>
                  <TableHead>Descrizione</TableHead>
                  <TableHead>Voce</TableHead>
                  <TableHead>Riferimento</TableHead>
                  <TableHead className="whitespace-nowrap">Tipo</TableHead>
                  <TableHead className="whitespace-nowrap text-right">
                    Importo previsto
                  </TableHead>
                  {canManage ? (
                    <TableHead className="w-24 text-right">Azione</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={`${entry.direction}-${entry.id}`}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDate(entry.date)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {entry.description}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {entry.category || "-"}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {entry.reference || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">
                        {DIRECTION_LABEL[entry.direction]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={amountClass(entry.direction)}>
                        {formatCents(entry.amountCents)}
                      </span>
                    </TableCell>
                    {canManage ? (
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8"
                          disabled={busy}
                          onClick={() => setToRemove(entry)}
                        >
                          <X className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                          Togli
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <NewExpectedDialog
        open={showNew}
        onOpenChange={setShowNew}
        saving={busy}
        onSubmit={(payload) => void create(payload)}
      />

      <RemoveExpectedDialog
        entry={toRemove}
        saving={busy}
        onOpenChange={(open) => {
          if (!open) setToRemove(null);
        }}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
