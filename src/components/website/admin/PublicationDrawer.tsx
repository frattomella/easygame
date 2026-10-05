"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import { Checkbox, SegmentedControl } from "@/components/web/primitives/Controls";
import { AlertBlock } from "@/components/web/page/Alerts";
import { InfoCard } from "@/components/web/page/Cards";
import { Field, TextInput, Textarea } from "@/components/web/forms/Field";
import { useToast } from "@/components/ui/toast-notification";
import type { NameDisplayMode, PublicationSettings } from "@/lib/website/people/policy";
import { websiteApi, type PublicationCandidateDto } from "@/lib/website/client";
import { MediaField } from "./MediaPicker";
import { CharCount, ToggleRow } from "./admin-ui";
import { ATTACHMENT_ENDPOINT } from "@/lib/attachments";

/**
 * **Come compare una persona sul sito** (ADR-0200 §7).
 *
 * La schermata spiega le regole ma non le applica: la policy vive sul server
 * (`src/lib/website/people/policy.ts`) e l'anteprima che si vede dopo il
 * salvataggio e quella che lei ha calcolato.
 */

export type PersonKind = "athlete" | "trainer" | "staff";

const NAME_MODES: Array<{ value: NameDisplayMode; label: string }> = [
  { value: "full", label: "Nome e cognome" },
  { value: "first_initial", label: "Nome e iniziale" },
  { value: "initials", label: "Iniziali" },
  { value: "custom", label: "Personalizzato" },
];

const ROLE_SUGGESTIONS: Record<PersonKind, string[]> = {
  athlete: ["Capitano", "Portiere", "Difensore", "Centrocampista", "Attaccante", "Playmaker", "Guardia", "Ala", "Centro", "Palleggiatore", "Schiacciatore", "Libero"],
  trainer: ["Allenatore", "Vice allenatore", "Preparatore atletico", "Preparatore dei portieri"],
  staff: ["Presidente", "Vicepresidente", "Direttore sportivo", "Segretario", "Team manager", "Responsabile settore giovanile"],
};

export function consentDescription(person: PublicationCandidateDto, imageConsentDefined: boolean) {
  if (person.imageConsent === "accepted") return "Consenso alle immagini accettato: la foto puo comparire.";
  if (person.imageConsent === "rejected") return "Consenso alle immagini rifiutato o revocato: la foto non compare mai.";
  if (person.isMinor) return "Consenso alle immagini non registrato: per un minore la foto non compare finche non viene accettato.";
  if (imageConsentDefined) return "Consenso alle immagini non registrato: la foto non compare finche non viene accettato nel registro dei consensi.";
  return "Il registro dei consensi non ha una voce «immagini»: la foto compare solo se dichiari di aver raccolto il consenso.";
}

export function PublicationDrawer({
  open,
  onOpenChange,
  kind,
  person,
  imageConsentDefined,
  disabled,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: PersonKind;
  person: PublicationCandidateDto | null;
  imageConsentDefined: boolean;
  disabled: boolean;
  onSaved: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [settings, setSettings] = React.useState<PublicationSettings | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedOnce, setSavedOnce] = React.useState(false);
  const personId = person?.id;

  React.useEffect(() => {
    if (open && person) {
      setSettings({ ...person.settings });
      setError(null);
      setSavedOnce(false);
    }
    // Si riparte solo quando cambia la persona o si riapre: un ricarico dopo il salvataggio non deve azzerare il modulo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, personId]);

  if (!person || !settings) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} title="Persona">
        <span />
      </Drawer>
    );
  }

  const dirty = JSON.stringify(settings) !== JSON.stringify(person.settings);
  const set = <K extends keyof PublicationSettings>(key: K, value: PublicationSettings[K]) => setSettings((current) => (current ? { ...current, [key]: value } : current));
  const minor = person.isMinor;
  const photoBlocked = minor && person.imageConsent !== "accepted";
  const adultNeedsDeclaration = !minor && !imageConsentDefined && person.imageConsent !== "rejected";

  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await websiteApi.savePublication(kind, person.id, settings);
    if (result.error) {
      setSaving(false);
      setError(result.error.message);
      return;
    }
    setSettings(result.data.settings);
    await onSaved();
    setSaving(false);
    setSavedOnce(true);
    showToast("success", "Impostazioni di pubblicazione salvate");
  };

  const preview = person.preview;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      title={person.name}
      eyebrow="Pubblicazione sul sito"
      description={person.categories.length ? person.categories.join(" · ") : person.role || undefined}
      dirty={dirty && !saving}
      locked={saving}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>Chiudi</Button>
          {!disabled ? (
            <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!dirty}>Salva</Button>
          ) : null}
        </div>
      }
    >
      {minor ? (
        <AlertBlock severity="info" title="Minorenne" className="mb-5">
          Per un minore il sito non mostra mai l&apos;anno di nascita, abbrevia il nome e mostra la foto solo con il consenso alle immagini accettato.
        </AlertBlock>
      ) : null}

      <DrawerSection eyebrow="Visibilita">
        <ToggleRow
          label="Pubblica sul sito"
          description="Senza questa spunta la persona non compare in nessuna pagina, rosa o organigramma."
          checked={settings.published}
          onChange={(value) => set("published", value)}
          disabled={disabled}
        />
      </DrawerSection>

      <DrawerSection eyebrow="Nome">
        <div className="space-y-3">
          <SegmentedControl mode="radio" wrap value={settings.nameDisplay} onChange={(value) => set("nameDisplay", value)} options={NAME_MODES.map((mode) => ({ ...mode, disabled }))} aria-label="Come mostrare il nome" />
          {minor && settings.nameDisplay === "full" ? (
            <p className="text-[12px] text-egw-amber-ink">Per un minore «Nome e cognome» viene mostrato come «Nome e iniziale». Per un nome diverso scegli «Personalizzato».</p>
          ) : null}
          {settings.nameDisplay === "custom" ? (
            <Field label="Nome da mostrare" htmlFor="pub-custom-name" helper="Es. un soprannome, o il nome con il cognome per esteso se la famiglia lo ha autorizzato.">
              <TextInput id="pub-custom-name" value={settings.customName} maxLength={80} onChange={(event) => set("customName", event.target.value)} disabled={disabled} />
            </Field>
          ) : null}
        </div>
      </DrawerSection>

      <DrawerSection eyebrow="Foto">
        <InfoCard className="mb-3">{consentDescription(person, imageConsentDefined)}</InfoCard>
        <ToggleRow label="Mostra la foto" checked={settings.showPhoto} onChange={(value) => set("showPhoto", value)} disabled={disabled}>
          {photoBlocked ? (
            <AlertBlock severity="warning" title="La foto non sara mostrata">
              Il consenso alle immagini di questo minore non e accettato. Puoi caricarla ora: comparira quando il consenso sara registrato.
            </AlertBlock>
          ) : null}
          <MediaField
            label="Foto"
            category="person-photo"
            value={settings.photoMediaId ? { mediaId: settings.photoMediaId } : null}
            onChange={(value) => set("photoMediaId", value?.mediaId ?? null)}
            disabled={disabled}
            help="Le foto delle persone restano fuori dalla libreria comune e sono pubbliche solo se la persona e pubblicata."
          />
          {adultNeedsDeclaration ? (
            <label className="flex items-start gap-2.5 text-[12.5px] text-egw-ink">
              <Checkbox checked={settings.photoConsentOutsideRegistry} onChange={(event) => set("photoConsentOutsideRegistry", event.target.checked)} disabled={disabled} />
              <span>Il consenso alle immagini e stato raccolto fuori dal registro</span>
            </label>
          ) : null}
        </ToggleRow>
      </DrawerSection>

      <DrawerSection eyebrow="Dati mostrati">
        <div className="space-y-2.5">
          {kind === "athlete" ? (
            <ToggleRow label="Numero di maglia" checked={settings.showNumber} onChange={(value) => set("showNumber", value)} disabled={disabled} />
          ) : null}
          <ToggleRow label="Ruolo" description={kind === "athlete" ? "Es. il ruolo in campo." : "Vuoto = il ruolo registrato nel gestionale."} checked={settings.showRole} onChange={(value) => set("showRole", value)} disabled={disabled}>
            <Field label="Etichetta del ruolo" htmlFor="pub-role" optional>
              <TextInput id="pub-role" list={`pub-role-suggestions-${kind}`} value={settings.roleLabel} maxLength={60} onChange={(event) => set("roleLabel", event.target.value)} disabled={disabled} placeholder={person.role || ""} />
            </Field>
            <datalist id={`pub-role-suggestions-${kind}`}>
              {ROLE_SUGGESTIONS[kind].map((role) => (
                <option key={role} value={role} />
              ))}
            </datalist>
          </ToggleRow>
          <ToggleRow
            label="Anno di nascita"
            description={minor ? "Non disponibile per i minori: non viene mai mostrato." : "Solo l'anno, mai la data completa."}
            checked={minor ? false : settings.showBirthYear}
            onChange={(value) => set("showBirthYear", value)}
            disabled={disabled || minor}
          />
          <ToggleRow label="Altezza" checked={settings.showHeight} onChange={(value) => set("showHeight", value)} disabled={disabled}>
            <Field label="Altezza (cm)" htmlFor="pub-height" helper="Tra 80 e 250 cm." width="16ch">
              <TextInput
                id="pub-height"
                type="number"
                inputMode="numeric"
                min={80}
                max={250}
                numeric
                value={settings.heightCm ?? ""}
                onChange={(event) => set("heightCm", event.target.value ? Number(event.target.value) : null)}
                disabled={disabled}
              />
            </Field>
          </ToggleRow>
          <ToggleRow label="Biografia" checked={settings.showBio} onChange={(value) => set("showBio", value)} disabled={disabled}>
            <Field label="Testo della biografia" htmlFor="pub-bio" helper={<CharCount value={settings.bio} max={1200} />}>
              <Textarea id="pub-bio" value={settings.bio} maxLength={1200} onChange={(event) => set("bio", event.target.value)} disabled={disabled} />
            </Field>
          </ToggleRow>
          {kind === "athlete" ? (
            <ToggleRow label="Statistiche" description="Presenze e statistiche registrate nelle gare." checked={settings.showStats} onChange={(value) => set("showStats", value)} disabled={disabled} />
          ) : null}
        </div>
      </DrawerSection>

      <DrawerSection eyebrow="Come appare sul sito">
        {preview ? (
          <div className="flex items-center gap-3 rounded-egw-field border border-egw-hairline bg-white p-3" aria-live="polite">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-egw-hairline bg-egw-page-100">
              {preview.photoMediaId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`${ATTACHMENT_ENDPOINT}/${preview.photoMediaId}`} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 text-[12.5px] text-egw-ink-72">
              <p className="text-[14px] font-bold text-egw-ink">
                {preview.jerseyNumber ? <span className="egw-num mr-1.5">#{preview.jerseyNumber}</span> : null}
                {preview.displayName}
              </p>
              {preview.role ? <p>{preview.role}</p> : null}
              <p>{[preview.birthYear ? `Nato nel ${preview.birthYear}` : "", preview.heightCm ? `${preview.heightCm} cm` : ""].filter(Boolean).join(" · ")}</p>
              {/* L'anteprima e quella salvata: con modifiche aperte non si attribuisce l'assenza della foto al consenso. */}
              {!preview.photoMediaId && settings.showPhoto ? (
                <p className="text-egw-amber-ink">
                  {dirty
                    ? "Salva per aggiornare l'anteprima."
                    : !settings.photoMediaId
                      ? "Nessuna foto scelta."
                      : "La foto non e mostrata (consenso)."}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-[12.5px] text-egw-ink-62" aria-live="polite">
            {!person.settings.published
              ? "La persona non e pubblicata: non compare sul sito."
              : savedOnce
                ? "L'anteprima di questo tipo di persona non e ancora disponibile."
                : "Salva per vedere l'anteprima calcolata dal server."}
          </p>
        )}
      </DrawerSection>

      {error ? <AlertBlock severity="danger" title="Il salvataggio non e riuscito">{error}</AlertBlock> : null}
    </Drawer>
  );
}
