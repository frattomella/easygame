"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, CheckCircle2, Undo2 } from "lucide-react";
import type { AccountingLine } from "@/lib/accounting/model";
import {
  activityScopeLabel,
  formatCents,
  formatDate,
  ownEntryId,
  reconciliationLabel,
  sourceLabel,
} from "./accounting-view";

/**
 * L'elenco dei movimenti.
 *
 * ---
 *
 * ## Le azioni vengono dalla riga, non dal ruolo
 *
 * Ogni pulsante nasce da `canReverse` / `canReconcile`, che il **servizio**
 * mette sulla riga insieme al resto. Questo componente non conosce il ruolo di
 * chi guarda e non deve conoscerlo: e la lezione W3-14, per cui la matrice
 * della pagina e quella della rotta devono essere **la stessa** — altrimenti
 * una porta risponde 200 e l'altra 403, e nessuno sa quale ha ragione.
 *
 * La conseguenza pratica e che una riga **proiettata** — un incasso, un
 * compenso, una liquidazione — non mostra nessuna azione, perche il servizio
 * le ha marcate tutte `false` passandola da `asProjectedLine`. Un compenso si
 * corregge dove i compensi si erogano.
 *
 * ## Non esiste «Elimina»
 *
 * E la regola della Wave, e chiude il difetto D-3: un movimento manuale di
 * 10.000 EUR in cassa si cancellava con un `confirm()` del browser, spariva
 * dall'array e nell'audit restava «qualcuno ha modificato il club» — con l'id
 * **del club**. Il denaro non si cancella: si storna, e restano visibili
 * entrambe le righe con il motivo.
 *
 * ## A 375 px
 *
 * Sotto `md` la tabella non c'e: ci sono schede, una per movimento. Una
 * tabella con nove colonne dentro un contenitore che scorre resta illeggibile
 * anche quando non allarga la pagina, e le due colonne che contano — data e
 * importo — finirebbero agli estremi opposti dello scorrimento.
 */

const DirectionMark = ({ line }: { line: AccountingLine }) =>
  line.direction === "IN" ? (
    <ArrowUp className="h-4 w-4 shrink-0 text-green-600" aria-hidden />
  ) : (
    <ArrowDown className="h-4 w-4 shrink-0 text-red-600" aria-hidden />
  );

const amountClass = (line: AccountingLine) =>
  cn(
    "font-semibold tabular-nums",
    line.reversedAt ? "text-slate-400 line-through" : null,
    line.direction === "IN" ? "text-green-700" : "text-red-700",
  );

const RowBadges = ({ line }: { line: AccountingLine }) => (
  <div className="flex flex-wrap gap-1">
    <Badge variant="outline" className="font-normal">
      {sourceLabel(line)}
    </Badge>
    {line.reconciliationStatus !== "unreconciled" ? (
      <Badge
        variant={
          line.reconciliationStatus === "reconciled" ? "default" : "destructive"
        }
        className="font-normal"
      >
        {reconciliationLabel(line)}
      </Badge>
    ) : null}
    {line.reversedAt ? (
      <Badge variant="destructive" className="font-normal">
        Stornato
      </Badge>
    ) : null}
    {line.activityScope === "unspecified" ? (
      <Badge variant="outline" className="font-normal text-amber-700">
        Da classificare
      </Badge>
    ) : (
      <Badge variant="outline" className="font-normal">
        {activityScopeLabel(line)}
      </Badge>
    )}
  </div>
);

function RowActions({
  line,
  onReverse,
  onReconcile,
  busy,
}: {
  line: AccountingLine;
  onReverse: (line: AccountingLine) => void;
  onReconcile: (line: AccountingLine) => void;
  busy: boolean;
}) {
  /*
    Una riga che non e nostra non ha un id da mandare alle rotte: i flag del
    servizio lo dicono gia, e questo e solo il presidio che impedisce di
    spedire `payment-transaction:...` a `/reverse` se un giorno un flag
    cambiasse senza che l'id cambi.
  */
  const id = ownEntryId(line);
  if (!id) return null;
  if (!line.canReverse && !line.canReconcile) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {line.canReconcile ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onReconcile(line)}
        >
          <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden />
          Riconcilia
        </Button>
      ) : null}
      {line.canReverse ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onReverse(line)}
        >
          <Undo2 className="mr-1 h-4 w-4" aria-hidden />
          Storna
        </Button>
      ) : null}
    </div>
  );
}

export function AccountingEntries({
  entries,
  total,
  limit,
  offset,
  loading,
  onPageChange,
  onReverse,
  onReconcile,
  busy = false,
}: {
  entries: readonly AccountingLine[];
  total: number;
  limit: number;
  offset: number;
  loading: boolean;
  onPageChange: (nextOffset: number) => void;
  onReverse: (line: AccountingLine) => void;
  onReconcile: (line: AccountingLine) => void;
  busy?: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Lettura della prima nota...
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
        Nessun movimento con questi filtri.
      </div>
    );
  }

  const primo = offset + 1;
  const ultimo = offset + entries.length;

  return (
    <div className="space-y-4">
      {/* Sotto md: una scheda per movimento. */}
      <div className="space-y-3 md:hidden">
        {entries.map((line) => (
          <div
            key={line.id}
            className="rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-slate-500">
                  {formatDate(line.entryDate)}
                </p>
                <p className="mt-0.5 break-words font-medium text-slate-900">
                  {line.description}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <DirectionMark line={line} />
                <span className={amountClass(line)}>
                  {formatCents(line.amountCents)}
                </span>
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-1 gap-1 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Conto</dt>
                <dd className="text-right text-slate-800">
                  {line.financialAccountName || "Non attribuito"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Causale</dt>
                <dd className="text-right text-slate-800">
                  {line.operationTypeLabel || "Nessuna"}
                </dd>
              </div>
              {line.counterpartyLabel ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Controparte</dt>
                  <dd className="text-right text-slate-800">
                    {line.counterpartyLabel}
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-3">
              <RowBadges line={line} />
            </div>

            {line.notes ? (
              <p className="mt-2 break-words text-sm text-slate-600">
                {line.notes}
              </p>
            ) : null}

            <div className="mt-3">
              <RowActions
                line={line}
                onReverse={onReverse}
                onReconcile={onReconcile}
                busy={busy}
              />
            </div>
          </div>
        ))}
      </div>

      {/*
        Da md in su la tabella, dentro un contenitore che scorre **per conto
        proprio**: `overflow-x-auto` qui evita che una riga lunga allarghi il
        documento, che e il difetto che `dashboardMainClassName` nasconde con
        `overflow-x-hidden` tagliando via il contenuto invece di mostrarlo.
      */}
      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Data</TableHead>
              <TableHead>Descrizione</TableHead>
              <TableHead>Causale</TableHead>
              <TableHead>Conto</TableHead>
              <TableHead className="text-right whitespace-nowrap">
                Importo
              </TableHead>
              <TableHead>Stato</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((line) => (
              <TableRow key={line.id}>
                <TableCell className="whitespace-nowrap align-top text-sm">
                  {formatDate(line.entryDate)}
                </TableCell>
                <TableCell className="align-top">
                  <p className="font-medium text-slate-900">
                    {line.description}
                  </p>
                  {line.counterpartyLabel ? (
                    <p className="text-xs text-slate-500">
                      {line.counterpartyLabel}
                    </p>
                  ) : null}
                  {line.notes ? (
                    <p className="mt-1 text-xs text-slate-500">{line.notes}</p>
                  ) : null}
                </TableCell>
                <TableCell className="align-top text-sm text-slate-700">
                  {line.operationTypeLabel || "-"}
                </TableCell>
                <TableCell className="align-top text-sm text-slate-700">
                  {line.financialAccountName || "-"}
                </TableCell>
                <TableCell className="align-top text-right">
                  <span className="inline-flex items-center gap-1">
                    <DirectionMark line={line} />
                    <span className={amountClass(line)}>
                      {formatCents(line.amountCents)}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="align-top">
                  <RowBadges line={line} />
                </TableCell>
                <TableCell className="align-top text-right">
                  <div className="flex justify-end">
                    <RowActions
                      line={line}
                      onReverse={onReverse}
                      onReconcile={onReconcile}
                      busy={busy}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-sm text-slate-600">
          Movimenti da {primo} a {ultimo} di {total}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={offset <= 0 || busy}
            onClick={() => onPageChange(Math.max(0, offset - limit))}
          >
            Precedenti
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={ultimo >= total || busy}
            onClick={() => onPageChange(offset + limit)}
          >
            Successivi
          </Button>
        </div>
      </div>
    </div>
  );
}
