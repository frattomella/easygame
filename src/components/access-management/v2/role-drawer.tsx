"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Field, FieldSizeProvider, Select, TextInput, Textarea, ValidationSummary } from "@/components/web/forms/Field";
import { Checkbox } from "@/components/web/primitives/Controls";
import { Button } from "@/components/web/primitives/Button";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { CUSTOM_ROLE_BASE_ROLES, getAccessRoleLabel } from "@/lib/access-roles";
import { isDirectionPermission, listGrantablePermissions } from "@/lib/roles/custom-role";
import {
  ETICHETTE_DOMINIO,
  perimetroDelRuoloBase,
  raggruppaPerDominio,
  validaBozza,
  type Bozza,
  type ErroreBozza,
} from "@/components/access-management/v2/access-model";

/**
 * L'editor di un ruolo di club in un cassetto largo (guideline 08 §8.5: le
 * caselle sono decine, quindi 720). Sostituisce la card inline «Nuovo ruolo /
 * Modifica ruolo» della V1 con gli stessi campi: nome, base, descrizione e le
 * chiavi concedibili raggruppate per dominio.
 *
 * Le due regole della V1 restano: le caselle sono **solo** quelle che
 * `listGrantablePermissions(base)` disegna (nessuna casella che non faccia
 * niente), e cio che le caselle non governano si dice a parole (il perimetro
 * del ruolo base, in un blocco di piano 0). In modifica la base non si
 * cambia: e un campo in sola lettura con il perche, non un controllo
 * disabilitato senza spiegazione.
 */
export function RoleDrawer({
  bozza,
  onClose,
  onSave,
}: {
  /** La bozza aperta; `null` = cassetto chiuso. */
  bozza: Bozza | null;
  onClose: () => void;
  onSave: (bozza: Bozza) => Promise<boolean>;
}) {
  const idPrefix = "ruolo";
  const [valori, setValori] = React.useState<Bozza | null>(bozza);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [errori, setErrori] = React.useState<ErroreBozza[]>([]);

  /*
    I valori si rileggono dalla bozza nel render in cui il cassetto si apre
    (stesso schema di `StaffSectionDrawer`): una bozza nuova e un'apertura
    nuova, anche se il cassetto era gia aperto su un'altra.
  */
  const [apertoPer, setApertoPer] = React.useState<Bozza | null>(bozza);
  if (bozza !== apertoPer) {
    setApertoPer(bozza);
    setValori(bozza ? { ...bozza, permissions: [...bozza.permissions] } : null);
    setDirty(false);
    setErrori([]);
  }

  const aggiorna = (patch: Partial<Bozza>) => {
    setValori((current) => (current ? { ...current, ...patch } : current));
    setDirty(true);
    if (errori.length) setErrori([]);
  };

  const commuta = (chiave: string, attiva: boolean) => {
    if (!valori) return;
    aggiorna({
      permissions: attiva ? [...valori.permissions, chiave] : valori.permissions.filter((candidata) => candidata !== chiave),
    });
  };

  const submit = async () => {
    if (!valori) return;
    const trovati = validaBozza(valori, idPrefix);
    setErrori(trovati);
    if (trovati.length) return;
    setSaving(true);
    try {
      const salvato = await onSave(valori);
      if (salvato) setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const inModifica = Boolean(valori?.id);
  const chiaviConcedibili = React.useMemo(() => listGrantablePermissions(valori?.baseRole || "collaborator"), [valori?.baseRole]);
  const perDominio = React.useMemo(() => raggruppaPerDominio(chiaviConcedibili), [chiaviConcedibili]);
  const opzioniBase = React.useMemo(() => CUSTOM_ROLE_BASE_ROLES.map((ruolo) => ({ value: ruolo, label: getAccessRoleLabel(ruolo) })), []);

  return (
    <Drawer
      open={Boolean(bozza)}
      onOpenChange={(open) => !open && onClose()}
      width="wide"
      eyebrow="Ruoli del club"
      title={inModifica ? "Modifica ruolo" : "Nuovo ruolo"}
      description="Un ruolo del club porta al massimo i permessi del ruolo standard da cui parte: mai di più."
      dirty={dirty}
      locked={saving}
      data-test="role-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} loading={saving}>
            Salva ruolo
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      {valori ? (
        <FieldSizeProvider size="sm">
          <div className="flex flex-col gap-5">
            <ValidationSummary errors={errori} />

            <DrawerSection eyebrow="Identità del ruolo">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nome" htmlFor={`${idPrefix}-name`} required error={errori.find((e) => e.id === `${idPrefix}-name`) ? "Il nome del ruolo è obbligatorio" : undefined}>
                  <TextInput id={`${idPrefix}-name`} value={valori.name} onChange={(event) => aggiorna({ name: event.target.value })} placeholder="Segreteria" autoComplete="off" />
                </Field>
                {inModifica ? (
                  <Field label="Parte da" htmlFor={`${idPrefix}-base`} helper="Il ruolo di partenza non si cambia: cambierebbe i permessi di chi lo porta già. Si crea un ruolo nuovo.">
                    <TextInput id={`${idPrefix}-base`} value={getAccessRoleLabel(valori.baseRole)} readOnly />
                  </Field>
                ) : (
                  <Field label="Parte da" htmlFor={`${idPrefix}-base`} helper="Il ruolo personalizzato potrà avere al massimo i permessi di quello scelto qui.">
                    <Select
                      id={`${idPrefix}-base`}
                      value={valori.baseRole}
                      options={opzioniBase}
                      // Cambiare la base azzera le caselle, come in V1: le chiavi
                      // concedibili sono un insieme diverso.
                      onValueChange={(value) => aggiorna({ baseRole: value, permissions: [] })}
                    />
                  </Field>
                )}
              </div>
              <Field label="Descrizione" htmlFor={`${idPrefix}-description`} className="mt-4">
                <Textarea id={`${idPrefix}-description`} value={valori.description} onChange={(event) => aggiorna({ description: event.target.value })} placeholder="A cosa serve questo ruolo nel club" rows={2} />
              </Field>
            </DrawerSection>

            <DrawerSection eyebrow="Oltre alle caselle">
              <InsetBlock>
                <p className="font-brand text-[12.5px] leading-[1.5] text-egw-ink-72">
                  Il ruolo base <strong className="font-semibold text-egw-ink">{getAccessRoleLabel(valori.baseRole)}</strong> porta con sé: {perimetroDelRuoloBase(valori.baseRole)}
                </p>
              </InsetBlock>
            </DrawerSection>

            <DrawerSection eyebrow="Permessi" title={`${valori.permissions.length} ${valori.permissions.length === 1 ? "permesso concesso" : "permessi concessi"}`}>
              <div className="flex flex-col gap-5">
                {perDominio.map(([dominio, voci]) => (
                  <fieldset key={dominio}>
                    <legend className="mb-2 font-brand text-[12.5px] font-bold text-egw-ink">{ETICHETTE_DOMINIO[dominio] || dominio}</legend>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {voci.map((voce) => {
                        const attiva = valori.permissions.includes(voce.key);
                        const id = `${idPrefix}-perm-${voce.key.replace(/\./g, "-")}`;
                        return (
                          <label
                            key={voce.key}
                            htmlFor={id}
                            className="flex cursor-pointer items-start gap-3 rounded-egw-field border border-egw-hairline bg-white px-3 py-2.5 transition-colors duration-hover hover:border-[rgba(37,99,235,.32)]"
                          >
                            <span className="mt-0.5 inline-flex">
                              <Checkbox id={id} checked={attiva} onChange={(event) => commuta(voce.key, event.target.checked)} />
                            </span>
                            <span className="min-w-0">
                              <span className="block font-brand text-[12.5px] font-medium leading-[1.4] text-egw-ink">{voce.label}</span>
                              <span className="egw-num block font-brand text-[10.5px] text-egw-ink-42">
                                {voce.key}
                                {isDirectionPermission(voce.key) ? " · direzione" : ""}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
            </DrawerSection>
          </div>
        </FieldSizeProvider>
      ) : null}
    </Drawer>
  );
}
