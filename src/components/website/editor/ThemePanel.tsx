"use client";

import * as React from "react";
import { Check, AlertTriangle } from "lucide-react";
import {
  BUTTON_SHAPES,
  BUTTON_TRANSFORMS,
  LINK_STYLES,
  THEME_COLOR_KEYS,
  THEME_CONTAINER,
  THEME_RADIUS,
  THEME_SPACING,
  type SiteTheme,
  type ThemeColorKey,
} from "@/lib/website/theme/theme";
import { checkPaletteContrast, isHexColor } from "@/lib/website/theme/palette";
import { listWebsiteFontsForRole, type WebsiteFontKey } from "@/lib/website/theme/fonts";
import { Field, Select, TextInput } from "@/components/web/forms/Field";

/**
 * **Il tema del sito**: colori, caratteri, forme. Tutto e un token: i blocchi
 * leggono le variabili del tema e nessuno scrive un colore dentro un blocco.
 *
 * Accanto ai colori, le coppie che il sito usa davvero misurate secondo WCAG:
 * un avviso, non un divieto — il renderer sceglie comunque il testo leggibile
 * sui bottoni, ma un colore principale troppo chiaro come testo resta un
 * problema che l'operatore deve vedere.
 */

const COLOR_LABELS: Record<ThemeColorKey, string> = {
  primary: "Principale",
  secondary: "Secondario",
  accent: "Accento",
  background: "Sfondo",
  foreground: "Testo",
  muted: "Fondo tenue",
  success: "Conferma",
  warning: "Attenzione",
  danger: "Errore",
};

const RADIUS_LABELS: Record<string, string> = { none: "Squadrati", sm: "Leggeri", md: "Medi", lg: "Morbidi", xl: "Molto morbidi" };
const CONTAINER_LABELS: Record<string, string> = { narrow: "Stretta", standard: "Standard", wide: "Larga" };
const SPACING_LABELS: Record<string, string> = { compact: "Compatta", comfortable: "Equilibrata", spacious: "Ariosa" };
const SHAPE_LABELS: Record<string, string> = { square: "Squadrati", rounded: "Arrotondati", pill: "A pillola" };
const TRANSFORM_LABELS: Record<string, string> = { none: "Come scritto", uppercase: "Maiuscolo" };
const LINK_LABELS: Record<string, string> = { always: "Sempre sottolineati", hover: "Sottolineati al passaggio", none: "Mai sottolineati" };

function ColorInput({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-8 w-10 shrink-0 cursor-pointer rounded border border-egw-hairline bg-white p-0.5"
        aria-label={`${label}: scegli il colore`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-egw-ink-72">{label}</p>
        <TextInput
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (isHexColor(event.target.value)) onChange(event.target.value.toLowerCase());
          }}
          disabled={disabled}
          maxLength={7}
          className="h-7 font-mono text-[12px]"
          aria-label={`${label}: codice esadecimale`}
        />
      </div>
    </div>
  );
}

export function ThemePanel({ theme, onChange, readOnly }: { theme: SiteTheme; onChange: (theme: SiteTheme, key: string) => void; readOnly: boolean }) {
  const checks = checkPaletteContrast(theme.colors);
  const set = (patch: Partial<SiteTheme>, key: string) => onChange({ ...theme, ...patch }, key);
  return (
    <div className="space-y-5 p-3">
      <section className="space-y-3">
        <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-egw-ink-42">Colori</h3>
        <div className="grid grid-cols-1 gap-3">
          {THEME_COLOR_KEYS.map((key) => (
            <ColorInput
              key={key}
              label={COLOR_LABELS[key]}
              value={theme.colors[key]}
              disabled={readOnly}
              onChange={(value) => set({ colors: { ...theme.colors, [key]: value } }, `theme:color:${key}`)}
            />
          ))}
        </div>
        <div className="rounded-md border border-egw-hairline bg-white p-2">
          <p className="mb-1.5 text-[11.5px] font-semibold text-egw-ink-72">Leggibilita (WCAG AA)</p>
          <ul className="space-y-1">
            {checks.map((check) => (
              <li key={check.pair} className={`flex items-center gap-1.5 text-[11.5px] ${check.passes ? "text-egw-ink-62" : "text-egw-amber-ink"}`}>
                {check.passes ? <Check className="h-3.5 w-3.5 text-egw-green" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
                <span className="min-w-0 flex-1">{check.label}</span>
                <span className="font-mono">
                  {check.ratio.toFixed(2)}:1{check.passes ? "" : ` (min ${check.target})`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-egw-ink-42">Caratteri</h3>
        <Field label="Titoli">
          <Select
            value={theme.fonts.heading}
            onValueChange={(heading) => set({ fonts: { ...theme.fonts, heading: heading as WebsiteFontKey } }, "theme:font:heading")}
            options={listWebsiteFontsForRole("heading").map((font) => ({ value: font.key, label: font.label }))}
            disabled={readOnly}
            aria-label="Carattere dei titoli"
          />
        </Field>
        <Field label="Testo">
          <Select
            value={theme.fonts.body}
            onValueChange={(body) => set({ fonts: { ...theme.fonts, body: body as WebsiteFontKey } }, "theme:font:body")}
            options={listWebsiteFontsForRole("body").map((font) => ({ value: font.key, label: font.label }))}
            disabled={readOnly}
            aria-label="Carattere del testo"
          />
        </Field>
      </section>

      <section className="space-y-3">
        <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-egw-ink-42">Forme e spazi</h3>
        <Field label="Angoli">
          <Select
            value={theme.radius}
            onValueChange={(radius) => set({ radius: radius as SiteTheme["radius"] }, "theme:radius")}
            options={THEME_RADIUS.map((value) => ({ value, label: RADIUS_LABELS[value] }))}
            disabled={readOnly}
            aria-label="Angoli"
          />
        </Field>
        <Field label="Larghezza della pagina">
          <Select
            value={theme.container}
            onValueChange={(container) => set({ container: container as SiteTheme["container"] }, "theme:container")}
            options={THEME_CONTAINER.map((value) => ({ value, label: CONTAINER_LABELS[value] }))}
            disabled={readOnly}
            aria-label="Larghezza della pagina"
          />
        </Field>
        <Field label="Spaziatura" helper="Allarga o stringe tutti gli spazi delle sezioni, senza toccarle una per una.">
          <Select
            value={theme.spacing}
            onValueChange={(spacing) => set({ spacing: spacing as SiteTheme["spacing"] }, "theme:spacing")}
            options={THEME_SPACING.map((value) => ({ value, label: SPACING_LABELS[value] }))}
            disabled={readOnly}
            aria-label="Spaziatura"
          />
        </Field>
        <Field label="Bottoni">
          <Select
            value={theme.buttons.shape}
            onValueChange={(shape) => set({ buttons: { ...theme.buttons, shape: shape as SiteTheme["buttons"]["shape"] } }, "theme:buttons:shape")}
            options={BUTTON_SHAPES.map((value) => ({ value, label: SHAPE_LABELS[value] }))}
            disabled={readOnly}
            aria-label="Forma dei bottoni"
          />
        </Field>
        <Field label="Testo dei bottoni">
          <Select
            value={theme.buttons.transform}
            onValueChange={(transform) => set({ buttons: { ...theme.buttons, transform: transform as SiteTheme["buttons"]["transform"] } }, "theme:buttons:transform")}
            options={BUTTON_TRANSFORMS.map((value) => ({ value, label: TRANSFORM_LABELS[value] }))}
            disabled={readOnly}
            aria-label="Testo dei bottoni"
          />
        </Field>
        <Field label="Collegamenti nel testo">
          <Select
            value={theme.links.underline}
            onValueChange={(underline) => set({ links: { underline: underline as SiteTheme["links"]["underline"] } }, "theme:links")}
            options={LINK_STYLES.map((value) => ({ value, label: LINK_LABELS[value] }))}
            disabled={readOnly}
            aria-label="Collegamenti nel testo"
          />
        </Field>
      </section>
    </div>
  );
}
