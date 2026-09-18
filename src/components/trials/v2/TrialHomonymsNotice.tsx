"use client";

import * as React from "react";
import { AlertBlock } from "@/components/web/page/Alerts";
import { Button } from "@/components/web/primitives/Button";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { PERSON_STATUS } from "@/lib/web/status";
import { formatDateShort } from "@/lib/web/format";
import { findTrialHomonyms, type TrialAthlete, type TrialHomonym, type TrialHomonymsResult } from "@/lib/trials/client";
import { trialStatusSpec } from "@/components/trials/v2/trial-model";
import type { TrialStatus } from "@/lib/trials/client";

/**
 * **Gli omonimi in tutto il club, mentre si scrive** (ADR-0198 §5).
 *
 * Prima il modulo della persona in prova cercava solo fra le prove gia note
 * in memoria; una scheda atleta con lo stesso nome — di questa stagione o di
 * una passata, perche l'identita dell'atleta e del club — non compariva. Il
 * server cerca tutte e due (`/api/v1/trial-athletes/homonyms`), qui si
 * mostrano: «Atleta in prova» e «Atleta registrato», con la data di nascita
 * quando c'e per distinguere. Non blocca, non fonde, non collega: chi
 * registra decide, e puo dire «e lei» solo per una persona in prova.
 */
const VUOTO: TrialHomonymsResult = { trials: [], athletes: [], athletesSearched: false };
/** Il risultato piu «per chi e»: la chiave della ricerca che l'ha prodotto (revisione C12). */
export type TrialHomonymsState = TrialHomonymsResult & { query: string | null };
const NIENTE: TrialHomonymsState = { ...VUOTO, query: null };

export const useTrialHomonyms = (
  form: { firstName: string; lastName: string; birthDate: string },
  enabled: boolean,
) => {
  const [result, setResult] = React.useState<TrialHomonymsState>(NIENTE);
  const nome = form.firstName.trim();
  const cognome = form.lastName.trim();
  const nascita = form.birthDate.trim();
  const chiave = `${nome}|${cognome}|${nascita}`;

  React.useEffect(() => {
    /* Cambiato il nome, il vecchio avviso sparisce subito: mai «e lei» su una riga di un altro nome. */
    setResult(NIENTE);
    if (!enabled || nome.length < 2 || cognome.length < 2) return;
    let alive = true;
    const timer = setTimeout(() => {
      findTrialHomonyms({ firstName: nome, lastName: cognome, birthDate: nascita || null })
        .then((found) => {
          if (alive) setResult({ ...found, query: chiave });
        })
        .catch(() => {
          if (alive) setResult(NIENTE);
        });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [chiave, cognome, enabled, nascita, nome]);

  return result;
};

/** «nato il 3 mar 2014», o «data di nascita non nota». */
export const natoIl = (birthDate: string | null | undefined) =>
  birthDate ? `nato il ${formatDateShort(birthDate)}` : "data di nascita non nota";

const statoDi = (row: TrialHomonym) =>
  row.kind === "trial" ? trialStatusSpec(row.status as TrialStatus) : PERSON_STATUS[row.status as keyof typeof PERSON_STATUS] || PERSON_STATUS.active;

export function TrialHomonymsNotice({
  result,
  onPickTrial,
}: {
  result: TrialHomonymsState;
  /** Chi registra sceglie una persona gia in prova invece di crearne una seconda. */
  onPickTrial?: (trialId: string) => void;
}) {
  const righe = [...result.trials, ...result.athletes];
  /* Chi non puo convertire non riceve le schede atleta: il silenzio non e «nessun omonimo» (revisione C6). */
  if (!righe.length) {
    if (result.query && !result.athletesSearched) {
      return (
        <p className="mt-2 font-brand text-[11.5px] text-egw-ink-62" data-test="trial-homonyms-not-verified">
          Nessuna persona in prova con questo nome nel tuo perimetro. Le schede atleta del club non sono state verificate: chi puo iscrivere le vede alla conversione.
        </p>
      );
    }
    return null;
  }
  const esatta = righe.some((row) => row.match === "exact");
  const soloProve = result.athletes.length === 0;
  const soloAtleti = result.trials.length === 0;
  const title = esatta
    ? "Questa persona sembra gia nel club"
    : soloProve
      ? "C'e gia una persona in prova con questo nome"
      : soloAtleti
        ? "Esiste gia un atleta con lo stesso nome e cognome nel club"
        : "Esistono gia persone con lo stesso nome e cognome nel club";
  return (
    <AlertBlock severity="warning" title={title}>
      <ul className="mt-2 flex flex-col gap-2" aria-label="Persone del club con lo stesso nome" data-test="trial-homonyms">
        {righe.slice(0, 6).map((row) => (
          <li
            key={`${row.kind}:${row.id}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-egw-control border border-egw-hairline bg-white px-3 py-2"
            data-test={`trial-homonym-${row.kind}`}
          >
            <span className="min-w-0">
              <span className="block font-brand text-[12.5px] font-semibold text-egw-ink">{row.name}</span>
              <span className="egw-num block font-brand text-[11px] text-egw-ink-62">
                {[natoIl(row.birthDate), row.categoryLabel, row.match === "exact" ? "stessa data di nascita" : null].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <DataChip size="sm" tone={row.kind === "trial" ? "amber" : "blue"}>
                {row.kind === "trial" ? "Atleta in prova" : "Atleta registrato"}
              </DataChip>
              <StatusPill status={statoDi(row)} size="sm" />
              {onPickTrial && row.kind === "trial" && row.status === "in_trial" ? (
                <Button variant="secondary" size="xs" onClick={() => onPickTrial(row.id)}>
                  E lei
                </Button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 font-brand text-[11.5px] text-egw-ink-62">
        Se e un&apos;altra persona, prosegui: due omonimi possono esistere. Nessuna scheda viene unita o collegata da sola.
        {!result.athletesSearched ? " Le schede atleta del club non sono state verificate." : ""}
      </p>
    </AlertBlock>
  );
}

/** Per chi ha in mano l'elenco delle prove e vuole la riga intera dopo «e lei». */
export const trialById = (existing: readonly TrialAthlete[], id: string) => existing.find((trial) => trial.id === id) || null;
