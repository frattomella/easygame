"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Field, FieldSizeProvider, MultiSelect, SearchableSelect, Select } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { Avatar } from "@/components/web/primitives/Identity";
import { InsetBlock } from "@/components/web/primitives/Surface";
import type { AccessScopeEntry } from "@/lib/roles/access-scope";
import {
  nomeAssegnazione,
  opzioniRuoloAssegnabile,
  sostituisciAsse,
  valoriDiAsse,
  type Assegnazione,
  type OpzioniPerimetro,
  type RuoloDiClub,
} from "@/components/access-management/v2/access-model";

/**
 * Il ruolo e il perimetro di **una** persona, in un cassetto da 480 (tre
 * campi). Sostituisce l'`EditorAssegnazione` inline della V1 con lo stesso
 * corpo di scrittura: `{ user_id, role, scopes }`, dove il perimetro si scrive
 * per sostituzione e nessuna voce scelta significa «tutto il club» — la
 * stessa convenzione dell'archivio, dove zero righe non sono zero accessi ma
 * nessuna restrizione (ADR-0103).
 *
 * Sedi e categorie sono due selezioni multiple invece di due colonne di
 * caselle: sopra otto opzioni la ricerca e obbligatoria (guideline 08 §8.2), e
 * un club con venti categorie le ha.
 */
export function AssignmentDrawer({
  persona,
  ruoli,
  opzioni,
  onClose,
  onSave,
}: {
  persona: Assegnazione | null;
  ruoli: RuoloDiClub[];
  opzioni: OpzioniPerimetro;
  onClose: () => void;
  onSave: (persona: Assegnazione, ruolo: string, scopes: AccessScopeEntry[]) => Promise<boolean>;
}) {
  const [ruolo, setRuolo] = React.useState(persona?.role || "");
  const [scopes, setScopes] = React.useState<AccessScopeEntry[]>(persona?.scopes || []);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [apertoPer, setApertoPer] = React.useState<Assegnazione | null>(persona);
  if (persona !== apertoPer) {
    setApertoPer(persona);
    setRuolo(persona?.role || "");
    setScopes(persona?.scopes || []);
    setDirty(false);
  }

  const opzioniRuolo = React.useMemo(() => opzioniRuoloAssegnabile(ruoli), [ruoli]);
  /*
    Il ruolo corrente di una persona puo non essere fra gli assegnabili (un
    proprietario, un ruolo di club disattivato): resta nell'elenco come voce
    di sola lettura, cosi il campo non finge un valore diverso da quello vero.
  */
  const opzioniConCorrente = React.useMemo(() => {
    if (!persona || opzioniRuolo.some((voce) => voce.value === persona.role)) return opzioniRuolo;
    return [{ value: persona.role, label: persona.role_label, description: "Ruolo attuale, non riassegnabile da qui" }, ...opzioniRuolo];
  }, [opzioniRuolo, persona]);

  const submit = async () => {
    if (!persona) return;
    setSaving(true);
    try {
      const salvato = await onSave(persona, ruolo, scopes);
      if (salvato) setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const sedi = opzioni.site.map((sede) => ({ value: sede.id, label: sede.label }));
  const categorie = opzioni.category.map((categoria) => ({ value: categoria.id, label: categoria.label }));

  return (
    <Drawer
      open={Boolean(persona)}
      onOpenChange={(open) => !open && onClose()}
      width="default"
      eyebrow="Persone con accesso"
      title="Ruolo e perimetro"
      description={persona ? nomeAssegnazione(persona) : undefined}
      dirty={dirty}
      locked={saving}
      data-test="assignment-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} loading={saving}>
            Salva accesso
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      {persona ? (
        <FieldSizeProvider size="sm">
          <div className="flex flex-col gap-5">
            <InsetBlock className="flex items-center gap-3">
              <Avatar name={nomeAssegnazione(persona)} size={36} />
              <div className="min-w-0">
                <p className="egw-ellipsis font-brand text-[13px] font-semibold text-egw-ink">{nomeAssegnazione(persona)}</p>
                <p className="egw-ellipsis font-brand text-[11.5px] text-egw-ink-62">{persona.email || "—"}</p>
              </div>
            </InsetBlock>

            <DrawerSection eyebrow="Ruolo">
              <Field label="Ruolo" htmlFor="assegnazione-ruolo" helper="I ruoli del club sono un sottoinsieme del ruolo standard da cui partono.">
                {opzioniConCorrente.length > 8 ? (
                  <SearchableSelect id="assegnazione-ruolo" value={ruolo} options={opzioniConCorrente} onValueChange={(value) => { if (value) { setRuolo(value); setDirty(true); } }} searchPlaceholder="Cerca un ruolo" />
                ) : (
                  <Select id="assegnazione-ruolo" value={ruolo} options={opzioniConCorrente} onValueChange={(value) => { setRuolo(value); setDirty(true); }} />
                )}
              </Field>
            </DrawerSection>

            {sedi.length || categorie.length ? (
              <DrawerSection eyebrow="Perimetro">
                <div className="flex flex-col gap-4">
                  {sedi.length ? (
                    <Field label="Sedi" htmlFor="assegnazione-sedi">
                      <MultiSelect id="assegnazione-sedi" values={valoriDiAsse(scopes, "site")} options={sedi} onValuesChange={(values) => { setScopes((current) => sostituisciAsse(current, "site", values)); setDirty(true); }} placeholder="Tutte le sedi" searchPlaceholder="Cerca una sede" />
                    </Field>
                  ) : null}
                  {categorie.length ? (
                    <Field label="Categorie" htmlFor="assegnazione-categorie">
                      <MultiSelect id="assegnazione-categorie" values={valoriDiAsse(scopes, "category")} options={categorie} onValuesChange={(values) => { setScopes((current) => sostituisciAsse(current, "category", values)); setDirty(true); }} placeholder="Tutte le categorie" searchPlaceholder="Cerca una categoria" />
                    </Field>
                  ) : null}
                </div>
              </DrawerSection>
            ) : null}

            {/*
              **La promessa era senza riserve, e il perimetro non lo e ancora.**
              Il perimetro restringe atleti, allenamenti e gare, e i documenti.
              Su pagamenti, appuntamenti, comunicazioni, consensi, libro soci e
              lavoro sportivo non e ancora applicato (W6-D18). Chi assegna un
              perimetro deve saperlo **qui**, non scoprirlo dopo.
            */}
            <InsetBlock>
              <p className="font-brand text-[12.5px] leading-[1.5] text-egw-ink-72">
                Nessuna voce scelta significa <strong className="font-semibold text-egw-ink">tutto il club</strong>. Con una o più voci il perimetro vale su{" "}
                <strong className="font-semibold text-egw-ink">atleti</strong>, <strong className="font-semibold text-egw-ink">allenamenti e gare</strong> e{" "}
                <strong className="font-semibold text-egw-ink">documenti</strong>: gli altri elenchi del club restano completi.
              </p>
            </InsetBlock>
          </div>
        </FieldSizeProvider>
      ) : null}
    </Drawer>
  );
}
