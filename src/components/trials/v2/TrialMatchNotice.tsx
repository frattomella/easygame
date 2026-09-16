"use client";

import * as React from "react";
import { UserRoundSearch } from "lucide-react";
import { AlertBlock } from "@/components/web/page/Alerts";
import { Button } from "@/components/web/primitives/Button";
import { IdentityCell } from "@/components/web/primitives/Identity";
import { DataChip } from "@/components/web/primitives/StatusPill";
import { listTrialAthletes, type TrialAthlete } from "@/lib/trials/client";
import { formatDateShort } from "@/lib/web/format";

/**
 * «Possibile anagrafica già presente» (ADR-0188 §5 del secondo lotto).
 *
 * Un bambino viene ad allenarsi, l'allenatore lo registra come persona in
 * prova; giorni dopo il genitore passa in segreteria per iscriverlo, e chi
 * compila «Nuovo atleta» puo non sapere che quella persona esiste gia. Mentre
 * si scrivono nome, cognome e data di nascita questo blocco cerca fra le
 * persone in prova e mostra le corrispondenze: chi e, quando e nato, quante
 * prove ha fatto e l'ultima. Due strade, nessuna automatica:
 *
 * - **Usa questa anagrafica** → la pagina converte la prova con la stessa
 *   autorita canonica (`convertTrialAthlete`), non una seconda;
 * - **Continua come nuovo atleta** → gli omonimi esistono, e si va avanti.
 *
 * La ricerca la fa il server con `trials.read`: chi non puo leggere le prove
 * non vede questo blocco.
 */
export function TrialMatchNotice({
  firstName,
  lastName,
  birthDate,
  enabled,
  selectedTrialId,
  onUse,
  onDismiss,
  onClear,
}: {
  firstName: string;
  lastName: string;
  birthDate: string;
  enabled: boolean;
  selectedTrialId: string | null;
  onUse: (trial: TrialAthlete) => void;
  onDismiss: () => void;
  onClear: () => void;
}) {
  const [candidates, setCandidates] = React.useState<TrialAthlete[]>([]);
  const [dismissedKey, setDismissedKey] = React.useState<string | null>(null);
  const nome = firstName.trim();
  const cognome = lastName.trim();
  const chiave = `${nome.toLowerCase()}|${cognome.toLowerCase()}|${birthDate}`;

  React.useEffect(() => {
    if (!enabled || nome.length < 2 || cognome.length < 2) {
      setCandidates([]);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      listTrialAthletes({ status: "in_trial", q: `${nome} ${cognome}` })
        .then((rows) => {
          if (!alive) return;
          const normal = (s: string) => s.trim().toLowerCase();
          setCandidates(
            rows.filter(
              (row) =>
                normal(row.firstName) === normal(nome) && normal(row.lastName) === normal(cognome),
            ),
          );
        })
        .catch(() => {
          if (alive) setCandidates([]);
        });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [cognome, enabled, nome]);

  const selected = selectedTrialId ? candidates.find((c) => c.id === selectedTrialId) : null;

  if (selectedTrialId) {
    return (
      <AlertBlock severity="info" title="Questa iscrizione userà l'anagrafica della persona in prova" className="mt-4">
        <p className="text-[12.5px] leading-[1.5]">
          {selected ? `${selected.name}, ${selected.trialsCount} ${selected.trialsCount === 1 ? "prova" : "prove"} prima dell'iscrizione. ` : ""}
          Lo storico delle prove resta sulla scheda. Salvando, la persona in prova diventa questo atleta.
        </p>
        <div className="mt-2">
          <Button variant="secondary" size="sm" onClick={onClear}>
            Non usare la persona in prova
          </Button>
        </div>
      </AlertBlock>
    );
  }

  if (!enabled || candidates.length === 0 || dismissedKey === chiave) return null;

  return (
    <div
      role="region"
      aria-label="Possibile anagrafica già presente"
      data-test="trial-match-notice"
      className="mt-4 rounded-egw-panel border border-egw-tint-amber-bd bg-egw-tint-amber p-4"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-egw-chip bg-white text-egw-amber-ink">
          <UserRoundSearch className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-brand text-[10px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-amber-ink">
            Possibile anagrafica già presente
          </p>
          <p className="mt-1 text-[12.5px] leading-[1.5] text-egw-ink-72">
            {candidates.length === 1
              ? "Una persona in prova ha lo stesso nome e cognome."
              : `${candidates.length} persone in prova hanno lo stesso nome e cognome.`}{" "}
            Se è la stessa persona, usa la sua anagrafica: le prove fatte restano nello storico. Se è un omonimo, continua come nuovo atleta.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {candidates.map((trial) => {
              const stessaData = birthDate && trial.birthDate === birthDate;
              return (
                <li
                  key={trial.id}
                  className="flex flex-wrap items-center gap-3 rounded-egw-field border border-egw-panel-border bg-white px-3 py-2.5"
                >
                  <IdentityCell
                    name={trial.name}
                    meta={`${trial.birthDate ? `nato il ${formatDateShort(trial.birthDate)}` : "data di nascita non nota"}${
                      trial.categoryLabel ? ` · ${trial.categoryLabel}` : ""
                    }`}
                    className="min-w-0 flex-1"
                  />
                  <span className="flex flex-wrap items-center gap-1.5">
                    <DataChip size="sm" tone="amber">
                      {trial.trialsCount} {trial.trialsCount === 1 ? "prova" : "prove"}
                    </DataChip>
                    {trial.lastTrialAt ? (
                      <DataChip size="sm" tone="neutral">
                        ultima {formatDateShort(trial.lastTrialAt)}
                      </DataChip>
                    ) : null}
                    {birthDate ? (
                      <DataChip size="sm" tone={stessaData ? "green" : "red"}>
                        {stessaData ? "stessa data di nascita" : "data di nascita diversa"}
                      </DataChip>
                    ) : null}
                  </span>
                  <Button variant="primary" size="sm" onClick={() => onUse(trial)}>
                    Usa questa anagrafica
                  </Button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setDismissedKey(chiave);
                onDismiss();
              }}
            >
              Continua come nuovo atleta
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
