"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { Button } from "@/components/web/primitives/Button";
import { DataChip } from "@/components/web/primitives/StatusPill";
import { Eyebrow, InsetBlock } from "@/components/web/primitives/Surface";
import { InfoCard } from "@/components/web/page/Cards";
import { AlertBlock } from "@/components/web/page/Alerts";
import { Drawer } from "@/components/web/overlays/Drawer";
import { ConfirmDialog } from "@/components/web/overlays/Modal";
import {
  CurrencyInput,
  DateInput,
  Field,
  FieldSizeProvider,
  FormGrid,
  Select,
  TextInput,
} from "@/components/web/forms/Field";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, FilterDef, RowActionDef } from "@/components/web/datagrid/types";
import { formatCents, formatDate, toDateInputValue } from "./accounting-view";

/**
 * La scheda **Previsti** (Web V2).
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
 * dentro un riquadro proprio, **tratteggiato** come la fascia economica del
 * riepilogo: e la separazione fra grandezze.
 *
 * ## Perche qui «Togli» esiste
 *
 * Sulla prima nota non c'e, e non e una svista: un fatto di cassa e accaduto, e
 * si storna. Una previsione non e accaduta — e un promemoria — e un promemoria
 * sbagliato si toglie. La conferma e un dialogo che dice **cosa** si sta per
 * togliere (`ConfirmDialog`, tono distruttivo), non un `confirm()` del browser.
 *
 * ## Il permesso arriva con le righe
 *
 * `canManage` viene dal servizio insieme all'elenco. Questo componente non
 * conosce il ruolo di chi guarda e non deve conoscerlo: e la lezione W3-14, per
 * cui la matrice della pagina e quella della rotta devono essere la stessa.
 * Senza permesso le azioni sono **assenti**, non disabilitate.
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
  const testo = value.trim();
  if (!testo) return null;
  const numero = testo.includes(",")
    ? Number(testo.replace(/\./g, "").replace(",", "."))
    : Number(testo);
  if (!Number.isFinite(numero) || numero <= 0) return null;
  return Math.round(numero * 100);
};

/*
  **Il colore non e quello della cassa.** Verde acceso e rosso sono i colori di
  entrate e uscite avvenute, in prima nota. Qui l'uscita prevista e ambra,
  perche due righe identiche in due schede diverse sarebbero lette come la
  stessa cosa.
*/
const amountClass = (direction: ExpectedDirection) =>
  cn(direction === "income" ? "text-egw-green" : "text-egw-amber-ink");

const rowId = (entry: ExpectedEntryView) => `${entry.direction}-${entry.id}`;

/* ========================================================================== */
/* Il cassetto di creazione                                                    */
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
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDirection("income");
    setDate(toDateInputValue(new Date()));
    setDescription("");
    setCategory("");
    setReference("");
    setAmount("");
    setDirty(false);
  }, [open]);

  const touch = <T,>(setter: (value: T) => void) => (value: T) => {
    setDirty(true);
    setter(value);
  };

  const amountCents = parseAmountCents(amount);
  const compilato = Boolean(description.trim() && date && amountCents);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow="Previsti"
      title="Nuova previsione"
      description="Una previsione e un impegno atteso, non un movimento: non entra in prima nota, non tocca nessun saldo e non conta come denaro incassato. Quando il denaro arriva davvero si registra un movimento."
      dirty={dirty}
      locked={saving}
      data-test="accounting-expected-drawer"
      footer={
        <>
          <Button
            variant="primary"
            disabled={!compilato || saving}
            loading={saving}
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
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <div className="flex flex-col gap-5">
          <FormGrid columns={2}>
            <Field label="Verso" htmlFor="previsione-verso" required>
              <Select
                id="previsione-verso"
                value={direction}
                onValueChange={(value) => touch(setDirection)(value as ExpectedDirection)}
                options={[
                  { value: "income", label: "Entrata prevista" },
                  { value: "expense", label: "Uscita prevista" },
                ]}
              />
            </Field>
            <Field label="Data attesa" htmlFor="previsione-data" required>
              <DateInput id="previsione-data" value={date} onChange={(event) => touch(setDate)(event.target.value)} />
            </Field>
          </FormGrid>

          <Field label="Descrizione" htmlFor="previsione-descrizione" required>
            <TextInput
              id="previsione-descrizione"
              value={description}
              onChange={(event) => touch(setDescription)(event.target.value)}
              placeholder="Quote di aprile ancora da incassare"
            />
          </Field>

          <FormGrid columns={2}>
            <Field
              label="Importo previsto"
              htmlFor="previsione-importo"
              required
              error={amount.trim() && !amountCents ? "L'importo deve essere un numero maggiore di zero." : undefined}
            >
              <CurrencyInput
                id="previsione-importo"
                value={amount}
                onChange={(event) => touch(setAmount)(event.target.value)}
                placeholder="820,00"
              />
            </Field>
            <Field label="Voce" htmlFor="previsione-categoria">
              <TextInput
                id="previsione-categoria"
                value={category}
                onChange={(event) => touch(setCategory)(event.target.value)}
                placeholder="Quote"
              />
            </Field>
          </FormGrid>

          <Field label="Riferimento" htmlFor="previsione-riferimento">
            <TextInput
              id="previsione-riferimento"
              value={reference}
              onChange={(event) => touch(setReference)(event.target.value)}
              placeholder="Delibera, preventivo, contratto"
            />
          </Field>
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}

/* ========================================================================== */
/* La conferma di rimozione                                                    */
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
    <ConfirmDialog
      open={Boolean(entry)}
      onOpenChange={onOpenChange}
      tone="danger"
      title="Togliere questa previsione?"
      description={
        entry
          ? `${DIRECTION_LABEL[entry.direction]} di ${formatCents(entry.amountCents)} — ${entry.description}.`
          : ""
      }
      confirmLabel={saving ? "Rimozione..." : "Togli la previsione"}
      loading={saving}
      onConfirm={onConfirm}
    >
      <p className="font-brand text-[13px] leading-[1.55] text-egw-ink-72">
        Non sparisce nessun movimento e nessun saldo cambia: una previsione non
        e mai stata denaro. Se l&apos;incasso o il pagamento e gia avvenuto,
        resta registrato in prima nota.
      </p>
    </ConfirmDialog>
  );
}

/* ========================================================================== */
/* I totali previsionali                                                       */
/* ========================================================================== */

const ForecastTile = ({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "green" | "amber";
}) => (
  <InsetBlock className="min-w-0">
    <Eyebrow>{label}</Eyebrow>
    <p
      className={cn(
        "egw-num mt-2 font-brand text-[24px] font-extrabold leading-none",
        tone === "green" && "text-egw-green",
        tone === "amber" && "text-egw-amber-ink",
        !tone && "text-egw-ink",
      )}
    >
      {value}
    </p>
    <p className="mt-1.5 font-brand text-[11.5px] leading-[1.45] text-egw-ink-62">{hint}</p>
  </InsetBlock>
);

/* ========================================================================== */
/* La scheda                                                                   */
/* ========================================================================== */

const EXPECTED_FILTERS: FilterDef<ExpectedEntryView>[] = [
  {
    id: "direction",
    label: "Verso",
    type: "select",
    pinned: true,
    options: [
      { value: "income", label: "Entrate previste" },
      { value: "expense", label: "Uscite previste" },
    ],
    apply: (row, value) => (typeof value === "string" && value ? row.direction === value : true),
  },
];

const EXPECTED_COLUMNS: ColumnDef<ExpectedEntryView>[] = [
  {
    id: "date",
    header: "Data attesa",
    kind: "date",
    width: "110px",
    locked: true,
    cell: (entry) => formatDate(entry.date),
    sortValue: (entry) => entry.date || null,
    exportValue: (entry) => entry.date || "",
  },
  {
    id: "description",
    header: "Descrizione",
    kind: "identity",
    locked: true,
    width: 2,
    cell: (entry) => (
      <span className="egw-ellipsis block font-brand text-[13px] font-semibold text-egw-ink">{entry.description}</span>
    ),
    sortValue: (entry) => entry.description.toLowerCase(),
    title: (entry) => entry.description,
    exportValue: (entry) => entry.description,
  },
  {
    id: "category",
    header: "Voce",
    kind: "classification",
    cell: (entry) => (entry.category ? <DataChip size="sm">{entry.category}</DataChip> : null),
    sortValue: (entry) => entry.category?.toLowerCase() || null,
    title: (entry) => entry.category || undefined,
    exportValue: (entry) => entry.category || "",
  },
  {
    id: "reference",
    header: "Riferimento",
    kind: "text",
    cell: (entry) => entry.reference || null,
    sortValue: (entry) => entry.reference?.toLowerCase() || null,
  },
  {
    id: "direction",
    header: "Tipo",
    kind: "classification",
    minWidth: 130,
    cell: (entry) => <DataChip size="sm" tone={entry.direction === "income" ? "green" : "amber"}>{DIRECTION_LABEL[entry.direction]}</DataChip>,
    sortValue: (entry) => entry.direction,
    exportValue: (entry) => DIRECTION_LABEL[entry.direction],
  },
  {
    id: "amount",
    header: "Importo previsto",
    kind: "amount",
    align: "right",
    width: "140px",
    cell: (entry) => <span className={amountClass(entry.direction)}>{formatCents(entry.amountCents)}</span>,
    sortValue: (entry) => entry.amountCents,
    exportValue: (entry) => entry.amountCents / 100,
  },
];

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

  /* Senza permesso l'azione non compare: nessun pulsante disabilitato. */
  const rowActions = useMemo<RowActionDef<ExpectedEntryView>[]>(
    () =>
      canManage
        ? [
            {
              id: "remove",
              label: "Togli",
              icon: <X />,
              tone: "danger",
              primary: true,
              onClick: (entry) => setToRemove(entry),
            },
          ]
        : [],
    [canManage],
  );


  return (
    <div className="flex flex-col gap-[18px]" data-test="accounting-expected">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <InfoCard eyebrow="Cosa sono le previsioni" className="max-w-3xl">
          Entrate e uscite <strong>previste</strong>: cose che il club si
          aspetta e che non sono ancora accadute. Non sono denaro, non entrano in
          prima nota e non toccano nessun saldo. Quando il denaro si muove
          davvero si registra un movimento, ed e quello a contare.
        </InfoCard>

        {canManage ? (
          <Button variant="primary" icon={<Plus />} className="shrink-0" onClick={() => setShowNew(true)}>
            Nuova previsione
          </Button>
        ) : null}
      </div>

      {/*
        Il bordo tratteggiato e lo stesso della fascia economica del riepilogo:
        e la separazione fra grandezze. Questi numeri non sono cassa, e non
        stanno nella stessa riga di un saldo.
      */}
      <section className="rounded-egw-panel border border-dashed border-[rgba(11,26,58,.22)] bg-transparent p-5">
        <div className="mb-3 flex flex-wrap items-baseline gap-2">
          <Eyebrow as="h2">Situazione previsionale</Eyebrow>
          <span className="font-brand text-[11.5px] text-egw-ink-62">
            attese, non ancora denaro — nessuno di questi numeri e un saldo
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ForecastTile
            label="Entrate previste"
            value={formatCents(data?.totals.expectedIncomeCents || 0)}
            hint="Attese, mai incassate. Fonte: le previsioni del club."
            tone="green"
          />
          <ForecastTile
            label="Uscite previste"
            value={formatCents(data?.totals.expectedExpenseCents || 0)}
            hint="Attese, mai pagate. Fonte: le previsioni del club."
            tone="amber"
          />
          <ForecastTile
            label="Differenza prevista"
            value={formatCents(data?.totals.expectedNetCents || 0)}
            hint="Differenza fra attese: non e liquidita, e non lo diventa sommandola a un saldo."
          />
        </div>
      </section>

      {error ? (
        <AlertBlock
          severity="danger"
          title="Le previsioni non sono state lette"
          actions={
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Riprova
            </Button>
          }
        >
          {error}
        </AlertBlock>
      ) : (
        <DataGrid<ExpectedEntryView>
          module="previsti"
          aria-label="Elenco delle previsioni"
          rows={entries}
          getRowId={rowId}
          columns={EXPECTED_COLUMNS}
          filters={EXPECTED_FILTERS}
          defaultSort={{ columnId: "date", direction: "asc" }}
          rowActions={rowActions}
          rowLabel={(entry) => entry.description}
          canSelect={false}
          state={loading ? "loading" : "ready"}
          noun={{ singular: "previsione", plural: "previsioni" }}
          hideViews
          empty={{
            icon: <CalendarClock />,
            title: "Nessuna previsione registrata per questo club.",
            description: "Una previsione e un impegno atteso: si registra qui e non tocca nessun saldo.",
            primary: canManage ? (
              <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setShowNew(true)}>
                Nuova previsione
              </Button>
            ) : undefined,
          }}
        />
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
