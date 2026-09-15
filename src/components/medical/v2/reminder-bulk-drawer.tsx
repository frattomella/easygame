"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { IdentityCell } from "@/components/web/primitives/Identity";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { ProgressBar } from "@/components/web/primitives/Controls";
import { formatInteger } from "@/lib/web/format";
import { csvFileName, downloadCsv, toCsv } from "@/lib/csv";
import {
  CERTIFICATE_ROW_LABELS,
  CERTIFICATE_ROW_PILL,
  isReminderEligible,
  type CertificateRow,
  type ReminderOutcome,
} from "@/components/medical/v2/certificate-grid-model";

/**
 * L'azione di massa «Invia promemoria» (guideline 07 §7.7: un cassetto da
 * 480, mai un menu che scrive al primo clic).
 *
 * I passi: **Record interessati** — con gli esclusi barrati e il motivo
 * (`Certificato valido`: la V1 non mostrava il pulsante a chi e coperto) —
 * poi **Conferma**, poi **Avanzamento** con la barra determinata, poi
 * **Esito** riga per riga: chi ha ricevuto, chi aveva gia un promemoria non
 * letto, chi non ha un tutore collegato, chi e fallito. Un fallimento
 * parziale e un esito, non un errore generico: le riuscite non si annullano.
 *
 * Il promemoria e la stessa porta della V1 — `POST
 * /api/medical-certificate-reminders`, un atleta alla volta — e la chiama
 * chi monta il cassetto (`send`).
 */
export type ReminderResult = { row: CertificateRow; outcome: ReminderOutcome };

type Step = "review" | "running" | "done";

const OUTCOME_LABELS: Record<ReminderOutcome["kind"], string> = {
  sent: "inviati",
  already: "già presenti",
  no_recipients: "senza tutore collegato",
  failed: "non riusciti",
};

const countOf = (results: readonly ReminderResult[], kind: ReminderOutcome["kind"]) =>
  results.filter((result) => result.outcome.kind === kind).length;

export function ReminderBulkDrawer({
  open,
  onOpenChange,
  rows,
  send,
  onFinished,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: CertificateRow[];
  send: (row: CertificateRow) => Promise<ReminderOutcome>;
  /** Chiamato a fine giro con l'esito, per il toast della pagina. */
  onFinished?: (results: ReminderResult[]) => void;
}) {
  const [step, setStep] = React.useState<Step>("review");
  const [targets, setTargets] = React.useState<CertificateRow[]>([]);
  const [progress, setProgress] = React.useState(0);
  const [results, setResults] = React.useState<ReminderResult[]>([]);
  const stopRequested = React.useRef(false);

  const eligible = React.useMemo(() => rows.filter(isReminderEligible), [rows]);
  const excluded = React.useMemo(() => rows.filter((row) => !isReminderEligible(row)), [rows]);

  React.useEffect(() => {
    if (!open) return;
    setStep("review");
    setTargets(eligible);
    setProgress(0);
    setResults([]);
    stopRequested.current = false;
  }, [open, eligible]);

  const run = async (list: CertificateRow[]) => {
    setTargets(list);
    setStep("running");
    setProgress(0);
    stopRequested.current = false;
    const collected: ReminderResult[] = [];
    for (let index = 0; index < list.length; index += 1) {
      if (stopRequested.current) {
        for (const rest of list.slice(index)) {
          collected.push({ row: rest, outcome: { kind: "failed", reason: "Interrotto" } });
        }
        break;
      }
      const row = list[index];
      try {
        const outcome = await send(row);
        collected.push({ row, outcome });
      } catch (error) {
        collected.push({
          row,
          outcome: {
            kind: "failed",
            reason: error instanceof Error && error.message ? error.message : "Errore imprevisto",
          },
        });
      }
      setProgress(index + 1);
    }
    setResults(collected);
    setStep("done");
    onFinished?.(collected);
  };

  const failed = results.filter((result) => result.outcome.kind === "failed");
  const running = step === "running";

  const exportOutcome = () => {
    const text = toCsv(
      [
        { key: "atleta", label: "Atleta" },
        { key: "stato", label: "Stato certificato" },
        { key: "esito", label: "Esito" },
        { key: "motivo", label: "Motivo" },
      ],
      results.map((result) => ({
        atleta: result.row.athleteName,
        stato: CERTIFICATE_ROW_LABELS[result.row.status],
        esito: OUTCOME_LABELS[result.outcome.kind],
        motivo: result.outcome.reason || "",
      })),
    );
    downloadCsv(csvFileName("esito-promemoria-certificati"), text);
  };

  const noun = (count: number) => (count === 1 ? "atleta" : "atleti");

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow={`Azione su ${formatInteger(rows.length)} ${noun(rows.length)}`}
      title="Invia promemoria"
      description="Le famiglie collegate ricevono un promemoria sul certificato medico. Chi ha già un promemoria non letto non ne riceve un secondo."
      locked={running}
      data-test="medical-reminder-bulk-drawer"
      footer={
        step === "review" ? (
          <>
            <Button variant="primary" onClick={() => void run(eligible)} disabled={!eligible.length}>
              {eligible.length === 1
                ? "Invia 1 promemoria"
                : `Invia ${formatInteger(eligible.length)} promemoria`}
            </Button>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
          </>
        ) : step === "running" ? (
          <Button
            variant="text"
            onClick={() => {
              stopRequested.current = true;
            }}
          >
            Interrompi
          </Button>
        ) : (
          <>
            {failed.length ? (
              <Button variant="primary" onClick={() => void run(failed.map((result) => result.row))}>
                {failed.length === 1
                  ? "Riprova su 1 non riuscito"
                  : `Riprova sui ${formatInteger(failed.length)} non riusciti`}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={exportOutcome}>
              Esporta esito CSV
            </Button>
            <Button variant={failed.length ? "secondary" : "primary"} onClick={() => onOpenChange(false)}>
              Chiudi
            </Button>
          </>
        )
      }
    >
      {step === "review" ? (
        <>
          <DrawerSection eyebrow="Record interessati">
            <p className="mb-2 font-brand text-[12px] text-egw-ink-62">
              <strong className="egw-num text-egw-ink">{formatInteger(eligible.length)}</strong>{" "}
              {eligible.length === 1 ? "riceverà il promemoria" : "riceveranno il promemoria"}
              {excluded.length ? (
                <>
                  {" · "}
                  <strong className="egw-num text-egw-ink">{formatInteger(excluded.length)}</strong>{" "}
                  {excluded.length === 1 ? "escluso" : "esclusi"}
                </>
              ) : null}
            </p>
            <InsetBlock className="egw-scroll max-h-[280px] overflow-y-auto p-2">
              <ul className="flex flex-col">
                {rows.map((row) => {
                  const out = !isReminderEligible(row);
                  return (
                    <li
                      key={row.id}
                      className="flex min-h-11 items-center gap-2 border-b border-egw-rule px-2 py-1 last:border-0"
                    >
                      <span className={out ? "min-w-0 flex-1 line-through opacity-60" : "min-w-0 flex-1"}>
                        <IdentityCell
                          name={row.athleteName}
                          round
                          avatarSrc={row.avatar || null}
                          meta={row.categoryLabel}
                        />
                      </span>
                      {out ? (
                        <DataChip size="sm" tone="green">
                          Certificato valido
                        </DataChip>
                      ) : (
                        <StatusPill status={CERTIFICATE_ROW_PILL[row.status]} size="sm" />
                      )}
                    </li>
                  );
                })}
              </ul>
            </InsetBlock>
          </DrawerSection>
          {eligible.length ? (
            <DrawerSection eyebrow="Conferma">
              <InsetBlock>
                <p className="font-brand text-[12.5px] leading-[1.5] text-egw-ink">
                  Le famiglie di <strong className="egw-num">{formatInteger(eligible.length)}</strong>{" "}
                  {noun(eligible.length)} ricevono un promemoria sul certificato medico scaduto,
                  mancante o in scadenza. Chi ha già un promemoria non letto viene saltato.
                </p>
              </InsetBlock>
            </DrawerSection>
          ) : (
            <DrawerSection eyebrow="Conferma">
              <InsetBlock>
                <p className="font-brand text-[12.5px] leading-[1.5] text-egw-ink-62">
                  Nessun atleta selezionato ha bisogno di un promemoria: i certificati sono tutti validi.
                </p>
              </InsetBlock>
            </DrawerSection>
          )}
        </>
      ) : step === "running" ? (
        <DrawerSection eyebrow="Avanzamento">
          <ProgressBar
            value={progress}
            max={Math.max(1, targets.length)}
            label={`${formatInteger(progress)} di ${formatInteger(targets.length)}`}
          />
          <p className="mt-3 font-brand text-[12px] leading-[1.5] text-egw-ink-62">
            I promemoria già inviati restano inviati anche se interrompi o chiudi il browser.
          </p>
        </DrawerSection>
      ) : (
        <>
          <DrawerSection eyebrow="Esito">
            <InsetBlock>
              <p className="egw-num font-brand text-[13px] font-semibold text-egw-ink">
                {formatInteger(countOf(results, "sent"))} inviati
                {" · "}
                {formatInteger(countOf(results, "already"))} già presenti
                {" · "}
                {formatInteger(countOf(results, "no_recipients"))} senza tutore collegato
                {" · "}
                {formatInteger(failed.length)} non riusciti
              </p>
            </InsetBlock>
          </DrawerSection>
          {results.some((result) => result.outcome.kind !== "sent") ? (
            <DrawerSection eyebrow="Da rivedere">
              <InsetBlock className="egw-scroll max-h-[280px] overflow-y-auto p-2">
                <ul className="flex flex-col">
                  {results
                    .filter((result) => result.outcome.kind !== "sent")
                    .map((result) => (
                      <li
                        key={result.row.id}
                        className="flex min-h-11 flex-wrap items-center gap-2 border-b border-egw-rule px-2 py-1 last:border-0"
                      >
                        <span className="min-w-0 flex-1">
                          <IdentityCell name={result.row.athleteName} round avatarSrc={result.row.avatar || null} meta={result.outcome.reason} />
                        </span>
                        <DataChip size="sm" tone={result.outcome.kind === "failed" ? "red" : "amber"}>
                          {OUTCOME_LABELS[result.outcome.kind]}
                        </DataChip>
                      </li>
                    ))}
                </ul>
              </InsetBlock>
            </DrawerSection>
          ) : null}
        </>
      )}
    </Drawer>
  );
}
