"use client";

import * as React from "react";
import { Monitor, RotateCcw, Smartphone, Tablet } from "lucide-react";
import {
  ALIGN_TOKENS,
  ANIMATION_TOKENS,
  BACKGROUND_KINDS,
  COLUMN_COUNTS,
  GUTTER_TOKENS,
  RADIUS_OVERRIDE_TOKENS,
  SPACING_TOKENS,
  TEXT_SIZE_TOKENS,
  TONE_TOKENS,
  WIDTH_TOKENS,
  type ElementStyle,
  type MediaRef,
  type ResponsiveStyleKey,
  type StaticStyle,
  type WebsiteDevice,
} from "@/lib/website/document/types";
import { resetDeviceOverrides, resetResponsiveToken, setResponsiveToken, setStaticStyle } from "@/lib/website/document/operations";
import { resolveResponsive, responsiveSource, type ResponsiveDefaults } from "@/lib/website/style-classes";
import { Field, Select, TextInput } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { MediaField } from "@/components/website/admin/MediaPicker";

/**
 * **Lo stile di una sezione o di un blocco**: solo token, mai CSS.
 *
 * I token di impaginazione cambiano per dispositivo: si scrivono sul
 * dispositivo scelto in alto, e l'inspector dice da dove arriva il valore che
 * si vede («ereditato da desktop») con il bottone per tornare a ereditare. Il
 * resto — fondo, tono, larghezza, animazione — vale per tutti i dispositivi.
 */

const DEVICE_LABELS: Record<WebsiteDevice, string> = { desktop: "desktop", tablet: "tablet", mobile: "mobile" };
const DEVICE_ICONS = { desktop: Monitor, tablet: Tablet, mobile: Smartphone } as const;

const SPACING_LABELS: Record<string, string> = { none: "Nessuno", xs: "Minimo", sm: "Piccolo", md: "Medio", lg: "Grande", xl: "Molto grande" };
const GUTTER_LABELS: Record<string, string> = { none: "Nessuno", sm: "Piccolo", md: "Medio", lg: "Grande" };
const ALIGN_LABELS: Record<string, string> = { left: "Sinistra", center: "Centro", right: "Destra" };
const TEXT_LABELS: Record<string, string> = { sm: "Piccolo", md: "Normale", lg: "Grande", xl: "Molto grande" };

const RESPONSIVE_FIELDS: Record<ResponsiveStyleKey, { label: string; options: ReadonlyArray<{ value: string; label: string }> }> = {
  paddingTop: { label: "Spazio sopra", options: SPACING_TOKENS.map((token) => ({ value: token, label: SPACING_LABELS[token] })) },
  paddingBottom: { label: "Spazio sotto", options: SPACING_TOKENS.map((token) => ({ value: token, label: SPACING_LABELS[token] })) },
  paddingX: { label: "Margini laterali", options: GUTTER_TOKENS.map((token) => ({ value: token, label: GUTTER_LABELS[token] })) },
  gap: { label: "Spazio fra gli elementi", options: GUTTER_TOKENS.map((token) => ({ value: token, label: GUTTER_LABELS[token] })) },
  align: { label: "Allineamento", options: ALIGN_TOKENS.map((token) => ({ value: token, label: ALIGN_LABELS[token] })) },
  textSize: { label: "Dimensione del testo", options: TEXT_SIZE_TOKENS.map((token) => ({ value: token, label: TEXT_LABELS[token] })) },
  columns: { label: "Colonne affiancate", options: COLUMN_COUNTS.map((count) => ({ value: String(count), label: String(count) })) },
};

const BACKGROUND_LABELS: Record<string, string> = {
  none: "Nessuno",
  surface: "Fondo del sito",
  muted: "Tenue",
  primary: "Colore principale",
  secondary: "Colore secondario",
  accent: "Accento",
  dark: "Scuro",
  image: "Immagine",
};
const TONE_LABELS: Record<string, string> = { auto: "Automatico", light: "Testo chiaro", dark: "Testo scuro" };
const WIDTH_LABELS: Record<string, string> = { full: "Tutta la larghezza", wide: "Larga", container: "Standard", narrow: "Stretta" };
const RADIUS_LABELS: Record<string, string> = { theme: "Come il tema", none: "Squadrati", sm: "Poco arrotondati", lg: "Molto arrotondati" };
const ANIMATION_LABELS: Record<string, string> = { none: "Nessuna", fade: "Dissolvenza", slide: "Scorrimento", scale: "Ingrandimento", reveal: "Rivelazione" };

export const SECTION_STYLE = {
  responsive: ["paddingTop", "paddingBottom", "paddingX", "gap", "align", "columns"] as const satisfies readonly ResponsiveStyleKey[],
  static: ["background", "backgroundImage", "overlay", "tone", "width", "animation"] as const satisfies ReadonlyArray<keyof StaticStyle>,
};

export function StyleEditor({
  style,
  device,
  responsiveKeys,
  staticKeys,
  defaults,
  onChange,
  readOnly,
  columnCount,
}: {
  style: ElementStyle | undefined;
  device: WebsiteDevice;
  responsiveKeys: readonly ResponsiveStyleKey[];
  staticKeys: ReadonlyArray<keyof StaticStyle>;
  defaults?: ResponsiveDefaults;
  onChange: (style: ElementStyle, key: string) => void;
  readOnly: boolean;
  /** Per le sezioni: quante colonne ha il layout (le colonne affiancate non lo superano). */
  columnCount?: number;
}) {
  const DeviceIcon = DEVICE_ICONS[device];
  const hasOverrides = device !== "desktop" && Boolean(style?.responsive?.[device] && Object.keys(style.responsive[device] || {}).length);
  const keys = responsiveKeys.filter((key) => key !== "columns" || (columnCount || 1) > 1);
  const statics = style?.static || {};

  return (
    <div className="space-y-5">
      {keys.length ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-egw-ink-42">
              <DeviceIcon className="h-3.5 w-3.5" aria-hidden="true" /> Impaginazione su {DEVICE_LABELS[device]}
            </h3>
            {hasOverrides && !readOnly ? (
              <Button
                size="xs"
                variant="text"
                icon={<RotateCcw className="h-3.5 w-3.5" />}
                onClick={() => onChange(resetDeviceOverrides(style, device as Exclude<WebsiteDevice, "desktop">), `reset-all:${device}`)}
              >
                Ripristina {DEVICE_LABELS[device]}
              </Button>
            ) : null}
          </div>
          {device !== "desktop" ? (
            <p className="text-[11.5px] text-egw-ink-62">
              Le scelte fatte qui valgono solo su {DEVICE_LABELS[device]}. Cio che non cambi eredita da {device === "mobile" ? "tablet e desktop" : "desktop"}.
            </p>
          ) : null}
          {keys.map((key) => {
            const field = RESPONSIVE_FIELDS[key];
            const current = resolveResponsive(style?.responsive, key, device, defaults?.[key]);
            const source = responsiveSource(style?.responsive, key, device);
            const overridden = device !== "desktop" && source === device;
            const options = key === "columns" ? field.options.filter((option) => Number(option.value) <= (columnCount || 4)) : field.options;
            return (
              <div key={key}>
                <Field
                  label={field.label}
                  helper={
                    overridden
                      ? `Scelto per ${DEVICE_LABELS[device]}`
                      : source === "default"
                        ? key === "columns" && device !== "desktop"
                          ? device === "mobile"
                            ? "Predefinito: una colonna"
                            : "Predefinito: al massimo due"
                          : "Predefinito del blocco"
                        : device === "desktop" || source === "desktop"
                          ? device === "desktop"
                            ? undefined
                            : "Ereditato da desktop"
                          : `Ereditato da ${DEVICE_LABELS[source as WebsiteDevice]}`
                  }
                >
                  <div className="flex items-center gap-1">
                    <div className="min-w-0 flex-1">
                      <Select
                        value={current === undefined ? null : String(current)}
                        onValueChange={(next) =>
                          onChange(setResponsiveToken(style, device, key, (key === "columns" ? Number(next) : next) as never), `style:${device}:${key}`)
                        }
                        options={options}
                        placeholder="Predefinito"
                        disabled={readOnly}
                        aria-label={`${field.label} su ${DEVICE_LABELS[device]}`}
                      />
                    </div>
                    {overridden && !readOnly ? (
                      <button
                        type="button"
                        onClick={() => onChange(resetResponsiveToken(style, device as Exclude<WebsiteDevice, "desktop">, key), `reset:${device}:${key}`)}
                        className="rounded p-1.5 text-egw-ink-62 hover:bg-egw-page-100 hover:text-egw-ink"
                        aria-label={`Torna a ereditare ${field.label}`}
                        title="Torna a ereditare"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </Field>
              </div>
            );
          })}
        </section>
      ) : null}

      {staticKeys.length ? (
        <section className="space-y-3">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-egw-ink-42">Aspetto (tutti i dispositivi)</h3>
          {staticKeys.includes("background") ? (
            <Field label="Sfondo">
              <Select
                value={statics.background || "none"}
                onValueChange={(background) => onChange(setStaticStyle(style, { background: background as StaticStyle["background"] }), "static:background")}
                options={BACKGROUND_KINDS.map((kind) => ({ value: kind, label: BACKGROUND_LABELS[kind] }))}
                disabled={readOnly}
                aria-label="Sfondo"
              />
            </Field>
          ) : null}
          {staticKeys.includes("backgroundImage") && statics.background === "image" ? (
            <>
              <MediaField
                label="Immagine di sfondo"
                value={statics.backgroundImage as MediaRef | null}
                onChange={(backgroundImage) => onChange(setStaticStyle(style, { backgroundImage }), "static:backgroundImage")}
                disabled={readOnly}
              />
              {staticKeys.includes("overlay") ? (
                <Field label={`Oscuramento sopra l'immagine (${statics.overlay ?? 40}%)`}>
                  <input
                    type="range"
                    min={0}
                    max={80}
                    step={5}
                    value={statics.overlay ?? 40}
                    onChange={(event) => onChange(setStaticStyle(style, { overlay: Number(event.target.value) }), "static:overlay")}
                    disabled={readOnly}
                    className="w-full accent-egw-blue"
                    aria-label="Oscuramento sopra l'immagine"
                  />
                </Field>
              ) : null}
            </>
          ) : null}
          {staticKeys.includes("tone") ? (
            <Field label="Colore del testo" helper="Automatico sceglie il colore leggibile sullo sfondo.">
              <Select
                value={statics.tone || "auto"}
                onValueChange={(tone) => onChange(setStaticStyle(style, { tone: tone as StaticStyle["tone"] }), "static:tone")}
                options={TONE_TOKENS.map((token) => ({ value: token, label: TONE_LABELS[token] }))}
                disabled={readOnly}
                aria-label="Colore del testo"
              />
            </Field>
          ) : null}
          {staticKeys.includes("width") ? (
            <Field label="Larghezza del contenuto">
              <Select
                value={statics.width || "container"}
                onValueChange={(width) => onChange(setStaticStyle(style, { width: width as StaticStyle["width"] }), "static:width")}
                options={WIDTH_TOKENS.map((token) => ({ value: token, label: WIDTH_LABELS[token] }))}
                disabled={readOnly}
                aria-label="Larghezza del contenuto"
              />
            </Field>
          ) : null}
          {staticKeys.includes("radius") ? (
            <Field label="Angoli">
              <Select
                value={statics.radius || "theme"}
                onValueChange={(radius) => onChange(setStaticStyle(style, { radius: radius as StaticStyle["radius"] }), "static:radius")}
                options={RADIUS_OVERRIDE_TOKENS.map((token) => ({ value: token, label: RADIUS_LABELS[token] }))}
                disabled={readOnly}
                aria-label="Angoli"
              />
            </Field>
          ) : null}
          {staticKeys.includes("animation") ? (
            <Field label="Animazione all'ingresso" helper="Chi ha chiesto al sistema di ridurre il movimento la vede senza animazione.">
              <Select
                value={statics.animation || "none"}
                onValueChange={(animation) => onChange(setStaticStyle(style, { animation: animation as StaticStyle["animation"] }), "static:animation")}
                options={ANIMATION_TOKENS.map((token) => ({ value: token, label: ANIMATION_LABELS[token] }))}
                disabled={readOnly}
                aria-label="Animazione all'ingresso"
              />
            </Field>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/** Nome e ancora di una sezione: servono all'albero e ai collegamenti interni. */
export function SectionIdentityFields({
  label,
  anchor,
  onChange,
  readOnly,
}: {
  label: string;
  anchor: string;
  onChange: (patch: { label?: string; anchor?: string }) => void;
  readOnly: boolean;
}) {
  return (
    <div className="space-y-3">
      <Field label="Nome nella struttura" helper="Lo vedi solo tu, nell'editor.">
        <TextInput value={label} maxLength={60} onChange={(event) => onChange({ label: event.target.value })} disabled={readOnly} aria-label="Nome della sezione" />
      </Field>
      <Field label="Ancora" helper="Per i collegamenti a questa sezione: /pagina#ancora. Solo lettere minuscole, numeri e trattini.">
        <TextInput
          value={anchor}
          maxLength={60}
          onChange={(event) => onChange({ anchor: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
          disabled={readOnly}
          aria-label="Ancora della sezione"
        />
      </Field>
    </div>
  );
}
