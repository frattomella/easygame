"use client";

import * as React from "react";
import { FOOTER_STYLES, HEADER_LAYOUTS, HEADER_STYLES, type SiteFooter, type SiteHeader } from "@/lib/website/site-config";
import { Field, Select, TextInput } from "@/components/web/forms/Field";
import { SegmentedControl, Toggle } from "@/components/web/primitives/Controls";
import { LinkControl, type ControlContext } from "./ControlField";

/**
 * **Intestazione e piede del sito**: scelte di presentazione, non contenuto.
 * Logo, nome, contatti e social arrivano dall'identita del sito (che a sua
 * volta ripiega sull'anagrafica del club); qui si decide se e come mostrarli.
 */

const LAYOUT_LABELS: Record<string, string> = { "logo-left": "Logo a sinistra", "logo-center": "Logo al centro", split: "Menu ai due lati del logo" };
const HEADER_STYLE_LABELS: Record<string, string> = { solid: "Chiaro", transparent: "Trasparente sopra la prima sezione", primary: "Colore principale", dark: "Scuro" };
const FOOTER_STYLE_LABELS: Record<string, string> = { dark: "Scuro", light: "Chiaro", primary: "Colore principale" };

function Switch({ label, help, checked, onChange, disabled }: { label: string; help?: string; checked: boolean; onChange: (value: boolean) => void; disabled: boolean }) {
  const id = React.useId();
  return (
    <div className="flex items-start justify-between gap-3">
      <label htmlFor={id} className="text-[12.5px] font-semibold text-egw-ink-72">
        {label}
        {help ? <span className="block text-[11.5px] font-normal text-egw-ink-62">{help}</span> : null}
      </label>
      <Toggle id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  );
}

export function HeaderFooterPanel({
  header,
  footer,
  sponsorTiers,
  context,
  onHeader,
  onFooter,
}: {
  header: SiteHeader;
  footer: SiteFooter;
  sponsorTiers: Array<{ key: string; label: string }>;
  context: ControlContext;
  onHeader: (header: SiteHeader, key: string) => void;
  onFooter: (footer: SiteFooter, key: string) => void;
}) {
  const [part, setPart] = React.useState<"header" | "footer">("header");
  const readOnly = context.readOnly;
  const legalPages = context.pages.filter((page) => !page.path.includes("*"));
  const setHeader = (patch: Partial<SiteHeader>, key: string) => onHeader({ ...header, ...patch }, `header:${key}`);
  const setFooter = (patch: Partial<SiteFooter>, key: string) => onFooter({ ...footer, ...patch }, `footer:${key}`);

  return (
    <div className="space-y-4 p-3">
      <SegmentedControl
        size="sm"
        value={part}
        onChange={setPart}
        options={[
          { value: "header", label: "Intestazione" },
          { value: "footer", label: "Piede" },
        ]}
        aria-label="Intestazione o piede"
      />
      {part === "header" ? (
        <div className="space-y-3">
          <Field label="Disposizione">
            <Select
              value={header.layout}
              onValueChange={(layout) => setHeader({ layout: layout as SiteHeader["layout"] }, "layout")}
              options={HEADER_LAYOUTS.map((value) => ({ value, label: LAYOUT_LABELS[value] }))}
              disabled={readOnly}
              aria-label="Disposizione dell'intestazione"
            />
          </Field>
          <Field label="Aspetto">
            <Select
              value={header.style}
              onValueChange={(style) => setHeader({ style: style as SiteHeader["style"] }, "style")}
              options={HEADER_STYLES.map((value) => ({ value, label: HEADER_STYLE_LABELS[value] }))}
              disabled={readOnly}
              aria-label="Aspetto dell'intestazione"
            />
          </Field>
          <Switch label="Resta in alto scorrendo" checked={header.sticky} onChange={(sticky) => setHeader({ sticky }, "sticky")} disabled={readOnly} />
          <Switch label="Nome accanto al logo" checked={header.showName} onChange={(showName) => setHeader({ showName }, "showName")} disabled={readOnly} />
          <Switch label="Icone dei social" checked={header.showSocial} onChange={(showSocial) => setHeader({ showSocial }, "showSocial")} disabled={readOnly} />
          <Switch label="Barra dei contatti sopra" help="Una riga sottile con telefono, email e social." checked={header.topBar} onChange={(topBar) => setHeader({ topBar }, "topBar")} disabled={readOnly} />
          <Switch
            label="Bottone in evidenza"
            help="Per esempio «Iscriviti» o «Prova gratuita»."
            checked={Boolean(header.cta)}
            onChange={(on) => setHeader({ cta: on ? { label: "Iscriviti", link: { kind: "none" } } : null }, "cta")}
            disabled={readOnly}
          />
          {header.cta ? (
            <div className="space-y-2 rounded-md border border-egw-hairline p-2">
              <Field label="Testo del bottone">
                <TextInput
                  value={header.cta.label}
                  maxLength={30}
                  onChange={(event) => setHeader({ cta: { ...(header.cta as NonNullable<SiteHeader["cta"]>), label: event.target.value } }, "cta:label")}
                  disabled={readOnly}
                  aria-label="Testo del bottone"
                />
              </Field>
              <LinkControl
                label="Dove porta"
                value={header.cta.link}
                context={context}
                onChange={(link) => setHeader({ cta: { ...(header.cta as NonNullable<SiteHeader["cta"]>), link } }, "cta:link")}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Aspetto">
            <Select
              value={footer.style}
              onValueChange={(style) => setFooter({ style: style as SiteFooter["style"] }, "style")}
              options={FOOTER_STYLES.map((value) => ({ value, label: FOOTER_STYLE_LABELS[value] }))}
              disabled={readOnly}
              aria-label="Aspetto del piede"
            />
          </Field>
          <Switch label="Logo" checked={footer.showLogo} onChange={(showLogo) => setFooter({ showLogo }, "showLogo")} disabled={readOnly} />
          <Switch label="Descrizione della societa" checked={footer.showDescription} onChange={(showDescription) => setFooter({ showDescription }, "showDescription")} disabled={readOnly} />
          <Switch label="Contatti" checked={footer.showContacts} onChange={(showContacts) => setFooter({ showContacts }, "showContacts")} disabled={readOnly} />
          <Switch label="Indirizzo" checked={footer.showAddress} onChange={(showAddress) => setFooter({ showAddress }, "showAddress")} disabled={readOnly} />
          <Switch label="Social" checked={footer.showSocial} onChange={(showSocial) => setFooter({ showSocial }, "showSocial")} disabled={readOnly} />
          <Switch label="Fascia degli sponsor" checked={footer.showSponsors} onChange={(showSponsors) => setFooter({ showSponsors }, "showSponsors")} disabled={readOnly} />
          {footer.showSponsors ? (
            <Field label="Livello sponsor">
              <Select
                value={footer.sponsorTier || "__tutti"}
                onValueChange={(tier) => setFooter({ sponsorTier: tier === "__tutti" ? "" : tier }, "sponsorTier")}
                options={[{ value: "__tutti", label: "Tutti quelli in vetrina" }, ...sponsorTiers.map((tier) => ({ value: tier.key, label: tier.label }))]}
                disabled={readOnly}
                aria-label="Livello sponsor del piede"
              />
            </Field>
          ) : null}
          <Switch
            label="Ragione sociale e partita IVA"
            help="I dati legali del club, presi dall'anagrafica."
            checked={footer.showLegalIdentity}
            onChange={(showLegalIdentity) => setFooter({ showLegalIdentity }, "showLegalIdentity")}
            disabled={readOnly}
          />
          <Field label="Pagina privacy">
            <Select
              value={footer.privacyPageId || "__nessuna"}
              onValueChange={(pageId) => setFooter({ privacyPageId: pageId === "__nessuna" ? null : pageId }, "privacyPageId")}
              options={[{ value: "__nessuna", label: "Nessuna" }, ...legalPages.map((page) => ({ value: page.id, label: page.title }))]}
              disabled={readOnly}
              aria-label="Pagina privacy"
            />
          </Field>
          <Field label="Pagina cookie">
            <Select
              value={footer.cookiePageId || "__nessuna"}
              onValueChange={(pageId) => setFooter({ cookiePageId: pageId === "__nessuna" ? null : pageId }, "cookiePageId")}
              options={[{ value: "__nessuna", label: "Nessuna" }, ...legalPages.map((page) => ({ value: page.id, label: page.title }))]}
              disabled={readOnly}
              aria-label="Pagina cookie"
            />
          </Field>
        </div>
      )}
    </div>
  );
}
