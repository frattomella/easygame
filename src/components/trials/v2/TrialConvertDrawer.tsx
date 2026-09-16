"use client";

import * as React from "react";
import { UserCheck, UserPlus } from "lucide-react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { Skeleton } from "@/components/web/primitives/Controls";
import { Field, FieldSizeProvider, SearchableSelect } from "@/components/web/forms/Field";
import { AlertBlock } from "@/components/web/page/Alerts";
import { formatDateShort } from "@/lib/web/format";
import { findAthleteCandidates, type AthleteCandidate, type TrialAthlete } from "@/lib/trials/client";
import type { TrialCategoryOption } from "@/components/trials/v2/use-trial-catalog";

/**
 * «Converti in atleta» (ADR-0188). Prima di creare una scheda si guardano
 * quelle che esistono gia con lo stesso nome — la data di nascita distingue
 * la corrispondenza esatta — e si sceglie: **collegare** quella, o **creare**
 * la nuova con la categoria della prova come primaria. Lo storico delle
 * prove resta sulla persona; nessun tutore e nessun accesso nascono da qui.
 */
export function TrialConvertDrawer({
  open,
  onOpenChange,
  trial,
  categoryOptions,
  saving,
  onConvert,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trial: TrialAthlete | null;
  categoryOptions: readonly TrialCategoryOption[];
  saving: boolean;
  onConvert: (input: { athleteId?: string; create?: { categoryId?: string | null; siteId?: string | null } }) => void | Promise<void>;
}) {
  const [candidates, setCandidates] = React.useState<AthleteCandidate[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<"link" | "create">("create");
  const [athleteId, setAthleteId] = React.useState<string>("");
  const [categoryId, setCategoryId] = React.useState<string>("");

  React.useEffect(() => {
    if (!open || !trial) return;
    setCandidates(null);
    setError(null);
    setAthleteId("");
    setCategoryId(trial.categoryId || "");
    let annullato = false;
    findAthleteCandidates(trial.id)
      .then((rows) => {
        if (annullato) return;
        setCandidates(rows);
        const esatta = rows.find((row) => row.match === "exact");
        setMode(esatta ? "link" : "create");
        if (esatta) setAthleteId(esatta.id);
      })
      .catch((caught: any) => {
        if (annullato) return;
        setCandidates([]);
        setError(caught?.message || "Impossibile cercare le schede esistenti");
      });
    return () => {
      annullato = true;
    };
  }, [open, trial]);

  const submit = async () => {
    if (mode === "link") {
      if (!athleteId) return;
      await onConvert({ athleteId });
      return;
    }
    await onConvert({ create: { categoryId: categoryId || null, siteId: trial?.siteId || null } });
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow="Persona in prova"
      title={trial ? `Converti ${trial.name} in atleta` : "Converti in atleta"}
      description="La scheda atleta nasce da qui, o si collega a una che esiste gia. Le prove fatte restano nello storico."
      locked={saving}
      data-test="trial-convert-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} loading={saving} disabled={!trial || (mode === "link" && !athleteId)} icon={mode === "link" ? <UserCheck /> : <UserPlus />}>
            {mode === "link" ? "Collega la scheda" : "Crea la scheda atleta"}
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <div className="flex flex-col gap-6">
          {trial ? (
            <InsetBlock className="flex flex-wrap items-center gap-2">
              <span className="font-brand text-[13px] font-semibold text-egw-ink">{trial.name}</span>
              <span className="egw-num font-brand text-[12px] text-egw-ink-62">nato il {formatDateShort(trial.birthDate)}</span>
              {trial.categoryLabel ? <DataChip>{trial.categoryLabel}</DataChip> : null}
              <span className="egw-num font-brand text-[12px] text-egw-ink-62">
                {trial.trialsCount} {trial.trialsCount === 1 ? "prova" : "prove"}
              </span>
            </InsetBlock>
          ) : null}

          {error ? <AlertBlock severity="danger" title={error} /> : null}

          <DrawerSection eyebrow="Prima di creare" title="Esiste gia una scheda?">
            {candidates === null ? (
              <div className="flex flex-col gap-2" role="status" aria-busy>
                <span className="sr-only">Cerco le schede esistenti</span>
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
              </div>
            ) : candidates.length === 0 ? (
              <p className="font-brand text-[12.5px] text-egw-ink-62">Nessuna scheda atleta del club porta questo nome: si crea una scheda nuova.</p>
            ) : (
              <ul className="flex flex-col gap-2" aria-label="Schede atleta con lo stesso nome">
                {candidates.map((candidate) => {
                  const scelta = mode === "link" && athleteId === candidate.id;
                  return (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setMode("link");
                          setAthleteId(candidate.id);
                        }}
                        aria-pressed={scelta}
                        className={
                          scelta
                            ? "flex w-full flex-wrap items-center justify-between gap-2 rounded-egw-field border-[1.5px] border-egw-blue bg-white px-3 py-2.5 text-left shadow-egw-focus focus-visible:outline-none"
                            : "flex w-full flex-wrap items-center justify-between gap-2 rounded-egw-field border border-egw-hairline bg-egw-page-100 px-3 py-2.5 text-left hover:border-[rgba(37,99,235,.32)] hover:bg-white focus-visible:outline-none focus-visible:shadow-egw-focus"
                        }
                      >
                        <span className="min-w-0">
                          <span className="block font-brand text-[12.5px] font-semibold text-egw-ink">{candidate.name}</span>
                          <span className="egw-num block font-brand text-[11px] text-egw-ink-62">
                            {[candidate.birthDate ? `nato il ${formatDateShort(candidate.birthDate)}` : "data di nascita non registrata", candidate.categoryLabel].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          {candidate.match === "exact" ? (
                            <StatusPill size="sm" status={{ label: "STESSA DATA DI NASCITA", weight: "solid", hue: "green" }} />
                          ) : (
                            <StatusPill size="sm" status={{ label: "STESSO NOME", weight: "outline", hue: "amber" }} />
                          )}
                          <StatusPill size="sm" status={candidate.status} />
                        </span>
                      </button>
                    </li>
                  );
                })}
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("create");
                      setAthleteId("");
                    }}
                    aria-pressed={mode === "create"}
                    className={
                      mode === "create"
                        ? "flex w-full items-center gap-2 rounded-egw-field border-[1.5px] border-egw-blue bg-white px-3 py-2.5 text-left font-brand text-[12.5px] font-semibold text-egw-ink shadow-egw-focus focus-visible:outline-none"
                        : "flex w-full items-center gap-2 rounded-egw-field border border-dashed border-egw-hairline bg-transparent px-3 py-2.5 text-left font-brand text-[12.5px] font-semibold text-egw-ink-72 hover:border-[rgba(37,99,235,.32)] focus-visible:outline-none focus-visible:shadow-egw-focus"
                    }
                  >
                    <UserPlus className="h-4 w-4" aria-hidden />
                    E un&apos;altra persona: crea una scheda nuova
                  </button>
                </li>
              </ul>
            )}
          </DrawerSection>

          {mode === "create" ? (
            <DrawerSection eyebrow="La scheda nuova" title="Categoria primaria">
              <Field label="Categoria" htmlFor="trial-convert-category" optional helper="Diventa la squadra primaria della scheda. Vuota: la assegni dopo.">
                <SearchableSelect
                  id="trial-convert-category"
                  value={categoryId || null}
                  onValueChange={(value) => setCategoryId(value || "")}
                  options={categoryOptions.map((option) => ({ value: option.id, label: option.label }))}
                  placeholder="Nessuna categoria"
                  allowClear
                />
              </Field>
              <p className="mt-3 font-brand text-[11.5px] leading-[1.5] text-egw-ink-62">
                La scheda nasce senza tutori e senza accesso EasyGame: si aggiungono dalla scheda, come per ogni atleta. La data di iscrizione e oggi.
              </p>
            </DrawerSection>
          ) : null}
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}
