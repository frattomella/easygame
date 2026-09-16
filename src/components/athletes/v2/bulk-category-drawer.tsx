"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import { DataChip } from "@/components/web/primitives/StatusPill";
import { AlertBlock } from "@/components/web/page/Alerts";
import { Field, FieldSizeProvider, SearchableSelect, Select } from "@/components/web/forms/Field";
import type { MembershipTargetIndex } from "@/lib/categories/placement";
import { MEMBERSHIP_WARNING_LABELS } from "@/lib/categories/membership-change";
import {
  applyMembershipChange,
  previewMembershipChange,
  type MembershipChangeAthleteReport,
  type MembershipChangeCommandInput,
  type MembershipChangeReport,
} from "@/lib/athletes/memberships-client";
import { formatInteger } from "@/lib/web/format";

/**
 * «Cambia categoria» in blocco (ADR-0194 §7–§8, §27): il cassetto 480 con
 * la squadra di destinazione, il ruolo, la politica sulla primaria attuale e
 * sulle altre secondarie — tutte visibili, nessuna nascosta — e **prima di
 * scrivere** l'anteprima calcolata dal server: quanti cambiano primaria,
 * quante appartenenze escono, quante restano, chi chiede attenzione. Il
 * comando lo esegue il server con lo stesso piano dell'anteprima: cio che si
 * legge e cio che succede.
 *
 * La sede non si sceglie: e quella della squadra. Il selettore di sede che
 * stava qui (con la sede lasciata com'era) era il modo in cui quattro ragazzi
 * sono finiti in «Pulcini» con la sede di S. Cosma, dove Pulcini non si
 * svolge.
 */
export function BulkCategoryDrawer({
  open,
  onOpenChange,
  index,
  athleteIds,
  resolvingTargets,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  index: MembershipTargetIndex;
  /** Gli atleti su cui il comando girera, gia risolti dalla pagina (selezione o «tutti»). */
  athleteIds: string[];
  /** Vero mentre la pagina sta ancora contando «tutti». */
  resolvingTargets?: boolean;
  onApplied: (report: MembershipChangeReport) => void;
}) {
  const [targetId, setTargetId] = React.useState("");
  const [role, setRole] = React.useState<"primary" | "secondary">("primary");
  const [previousPrimaryPolicy, setPreviousPrimaryPolicy] = React.useState<"remove" | "keep_as_secondary">("remove");
  const [otherSecondariesPolicy, setOtherSecondariesPolicy] = React.useState<"keep" | "remove">("keep");
  const [preview, setPreview] = React.useState<MembershipChangeReport | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [errore, setErrore] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setTargetId("");
      setRole("primary");
      setPreviousPrimaryPolicy("remove");
      setOtherSecondariesPolicy("keep");
      setPreview(null);
      setErrore(null);
      setBusy(false);
    }
  }, [open]);

  const options = React.useMemo(() => index.targets.map((t) => ({ value: t.id, label: t.label })), [index]);
  const selectedCount = new Set(athleteIds).size;
  const command: MembershipChangeCommandInput = {
    kind: "assign",
    targetId,
    role,
    previousPrimaryPolicy,
    otherSecondariesPolicy,
  };

  const calcola = async () => {
    if (!targetId || !athleteIds.length) return;
    setBusy(true);
    setErrore(null);
    try {
      setPreview(await previewMembershipChange(athleteIds, command));
    } catch (error: any) {
      setErrore(String(error?.message || "Impossibile calcolare l'anteprima"));
    } finally {
      setBusy(false);
    }
  };

  const conferma = async () => {
    if (!preview) return;
    setBusy(true);
    setErrore(null);
    try {
      const expected = Object.fromEntries(preview.athletes.map((a) => [a.athleteId, a.signature]));
      const report = await applyMembershipChange(athleteIds, command, preview.batchId, expected);
      onApplied(report);
      onOpenChange(false);
    } catch (error: any) {
      setErrore(String(error?.message || "Cambio di categoria non riuscito"));
    } finally {
      setBusy(false);
    }
  };

  const target = index.byId(targetId);
  const totali = preview?.totals;
  const daAggiornare = preview?.athletes.filter((a) => a.status === "planned") || [];
  const giaAPosto = preview?.athletes.filter((a) => a.status === "unchanged") || [];
  const bloccati = preview?.athletes.filter((a) => a.status === "blocked") || [];
  const conAvvisi = preview?.athletes.filter((a) => a.status !== "blocked" && a.warnings.length) || [];

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow={`Cambia categoria per ${formatInteger(selectedCount)} ${selectedCount === 1 ? "atleta" : "atleti"}`}
      title="Cambia categoria"
      description="Modifica l'appartenenza alle categorie degli atleti selezionati. Le presenze e lo storico già registrati non verranno modificati."
      dirty={Boolean(targetId)}
      locked={busy}
      data-test="bulk-category-drawer"
      footer={
        preview ? (
          <>
            <Button
              variant="primary"
              id="bulk-category-confirm"
              onClick={() => void conferma()}
              loading={busy}
              disabled={!totali || totali.updated === 0}
            >
              Conferma cambio
            </Button>
            <Button variant="secondary" onClick={() => setPreview(null)} disabled={busy}>
              Indietro
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="primary"
              id="bulk-category-continue"
              disabled={!targetId || !athleteIds.length || Boolean(resolvingTargets)}
              loading={busy}
              onClick={() => void calcola()}
            >
              Continua
            </Button>
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
              Annulla
            </Button>
          </>
        )
      }
    >
      <FieldSizeProvider size="sm">
        {errore ? (
          <AlertBlock severity="danger" title="Operazione non riuscita" className="mb-4">
            {errore}
          </AlertBlock>
        ) : null}

        {!preview ? (
          <>
            <DrawerSection eyebrow="Nuova categoria">
              <Field label="Squadra di destinazione" htmlFor="bulk-category-target" required helper="La sede è quella della squadra scelta.">
                {options.length > 8 ? (
                  <SearchableSelect
                    id="bulk-category-target"
                    value={targetId}
                    onValueChange={(next) => setTargetId(next || "")}
                    options={options}
                    placeholder="Seleziona una squadra"
                    searchPlaceholder="Cerca categoria"
                  />
                ) : (
                  <Select
                    id="bulk-category-target"
                    value={targetId}
                    onValueChange={setTargetId}
                    options={options}
                    placeholder="Seleziona una squadra"
                  />
                )}
              </Field>
            </DrawerSection>

            <DrawerSection eyebrow="Imposta come">
              <RadioList
                name="bulk-role"
                value={role}
                onChange={(v) => setRole(v as "primary" | "secondary")}
                options={[
                  ["primary", "Categoria primaria"],
                  ["secondary", "Categoria secondaria"],
                ]}
              />
            </DrawerSection>

            {role === "primary" ? (
              <DrawerSection eyebrow="Cosa fare della categoria primaria attuale?">
                <RadioList
                  name="bulk-previous-primary"
                  value={previousPrimaryPolicy}
                  onChange={(v) => setPreviousPrimaryPolicy(v as "remove" | "keep_as_secondary")}
                  options={[
                    ["remove", "Rimuovila"],
                    ["keep_as_secondary", "Mantienila come categoria secondaria"],
                  ]}
                />
              </DrawerSection>
            ) : null}

            <DrawerSection eyebrow="Altre categorie secondarie">
              <RadioList
                name="bulk-other-secondaries"
                value={otherSecondariesPolicy}
                onChange={(v) => setOtherSecondariesPolicy(v as "keep" | "remove")}
                options={[
                  ["keep", "Mantieni le altre categorie associate"],
                  ["remove", "Rimuovi tutte le altre categorie"],
                ]}
              />
            </DrawerSection>
          </>
        ) : (
          <>
            <DrawerSection eyebrow="Anteprima">
              <p className="font-brand text-[13px] text-egw-ink">
                Destinazione: <span className="font-semibold">{preview.target?.label || target?.label}</span>
                {preview.target?.siteName ? <span className="text-egw-ink-62"> · sede {preview.target.siteName}</span> : null}
              </p>
              <ul className="mt-3 flex flex-col gap-1 font-brand text-[13px] text-egw-ink" data-test="bulk-category-summary">
                <li>
                  <span className="font-semibold">{formatInteger(totali!.updated)}</span> {totali!.updated === 1 ? "atleta verrà aggiornato" : "atleti verranno aggiornati"}
                </li>
                {totali!.newPrimaries ? <li>{formatInteger(totali!.newPrimaries)} {totali!.newPrimaries === 1 ? "nuova categoria primaria" : "nuove categorie primarie"}</li> : null}
                {totali!.removedMemberships ? <li>{formatInteger(totali!.removedMemberships)} {totali!.removedMemberships === 1 ? "vecchia appartenenza rimossa" : "vecchie appartenenze rimosse"}</li> : null}
                {totali!.promoted ? <li>{formatInteger(totali!.promoted)} {totali!.promoted === 1 ? "appartenenza già esistente verrà promossa a primaria" : "appartenenze già esistenti verranno promosse a primarie"}</li> : null}
                {totali!.keptAsSecondary ? <li>{formatInteger(totali!.keptAsSecondary)} {totali!.keptAsSecondary === 1 ? "vecchia primaria mantenuta come secondaria" : "vecchie primarie mantenute come secondarie"}</li> : null}
                {totali!.keptSecondaries ? <li>{formatInteger(totali!.keptSecondaries)} {totali!.keptSecondaries === 1 ? "altra categoria secondaria verrà mantenuta" : "altre categorie secondarie verranno mantenute"}</li> : null}
                {totali!.unchanged ? <li className="text-egw-ink-62">{formatInteger(totali!.unchanged)} già {totali!.unchanged === 1 ? "a posto" : "a posto"}: nessuna modifica</li> : null}
                {totali!.blocked ? <li className="font-semibold text-egw-amber-ink">ATTENZIONE: {formatInteger(totali!.blocked)} {totali!.blocked === 1 ? "atleta non verrà toccato" : "atleti non verranno toccati"}</li> : null}
              </ul>
            </DrawerSection>

            {daAggiornare.length ? (
              <DrawerSection eyebrow="Cosa cambia, atleta per atleta">
                <AthleteList rows={daAggiornare} />
              </DrawerSection>
            ) : null}
            {conAvvisi.length ? (
              <DrawerSection eyebrow="Da guardare">
                <AthleteList rows={conAvvisi} showWarnings />
              </DrawerSection>
            ) : null}
            {bloccati.length ? (
              <DrawerSection eyebrow="Non verranno toccati">
                <AthleteList rows={bloccati} showWarnings />
              </DrawerSection>
            ) : null}
            {giaAPosto.length ? (
              <DrawerSection eyebrow="Già nella destinazione">
                <p className="font-brand text-[12.5px] text-egw-ink-62">{giaAPosto.map((a) => a.name).join(", ")}</p>
              </DrawerSection>
            ) : null}
          </>
        )}
      </FieldSizeProvider>
    </Drawer>
  );
}

function RadioList({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <div className="flex flex-col gap-2" role="radiogroup">
      {options.map(([valore, etichetta]) => (
        <label key={valore} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-egw-control border border-egw-hairline bg-white px-3 font-brand text-[13px] text-egw-ink">
          <input type="radio" className="h-4 w-4" name={name} value={valore} checked={value === valore} onChange={() => onChange(valore)} />
          {etichetta}
        </label>
      ))}
    </div>
  );
}

const riga = (rows: MembershipChangeAthleteReport["before"]) =>
  rows.length
    ? rows
        .slice()
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
        .map((r) => `${r.label} [${r.isPrimary ? "P" : "S"}]`)
        .join(", ")
    : "—";

function AthleteList({ rows, showWarnings }: { rows: MembershipChangeAthleteReport[]; showWarnings?: boolean }) {
  return (
    <ul className="flex flex-col gap-2" data-test="bulk-category-athletes">
      {rows.map((a) => (
        <li key={a.athleteId} className="rounded-egw-control border border-egw-hairline bg-egw-page-100 px-3 py-2 font-brand text-[12.5px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-egw-ink">{a.name}</span>
            {a.status === "blocked" ? (
              <DataChip size="sm" tone="amber">
                Attenzione
              </DataChip>
            ) : null}
          </div>
          <div className="mt-1 text-egw-ink-62">
            {riga(a.before)} <span aria-hidden>→</span>
            <span className="sr-only">diventa</span> <span className="text-egw-ink">{riga(a.after)}</span>
          </div>
          {showWarnings && a.warnings.length ? (
            <ul className="mt-1 text-egw-amber-ink">
              {a.warnings.map((w) => (
                <li key={w}>{MEMBERSHIP_WARNING_LABELS[w as keyof typeof MEMBERSHIP_WARNING_LABELS] || w}</li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
