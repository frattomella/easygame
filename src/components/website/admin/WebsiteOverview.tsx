"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Circle, ExternalLink, Eye, Globe, LayoutTemplate, Newspaper, PenSquare, Settings } from "lucide-react";
import { Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { Button } from "@/components/web/primitives/Button";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { ProgressBar } from "@/components/web/primitives/Controls";
import { AlertBlock } from "@/components/web/page/Alerts";
import { InfoCard } from "@/components/web/page/Cards";
import { useToast } from "@/components/ui/toast-notification";
import { formatDateTime } from "@/lib/web/format";
import { cn } from "@/lib/utils";
import { isConflict, previewPath, websiteApi, type PublishStatusDto, type SiteDraftDto } from "@/lib/website/client";
import { useWebsiteArea } from "./WebsiteAreaShell";
import { OnboardingWizard } from "./OnboardingWizard";
import { PublishButton } from "./PublishDrawer";
import { SITE_STATUS, domainStateSpec } from "./admin-ui";

/**
 * **La panoramica dell'area «Sito web»**: crea il sito se non c'e, altrimenti
 * dice a che punto e — stato, ultima pubblicazione, dominio, cosa manca.
 *
 * La checklist si **ricava** dai dati; i passi dell'avvio guidato sono invece
 * spunte dell'operatore salvate su `site.onboarding`.
 */

const ONBOARDING_STEPS: Array<{ key: string; label: string; description: string; href: string; external?: boolean }> = [
  { key: "template", label: "Scegli il template", description: "Il punto di partenza: pagine, menu e stile.", href: "/website/impostazioni" },
  { key: "brand", label: "Logo e identita", description: "Nome, logo, favicon, contatti e social del sito.", href: "/website/impostazioni" },
  { key: "colors", label: "Colori e caratteri", description: "Lo stile del sito, dal tema dell'editor.", href: "/website/editor" },
  { key: "club", label: "Dati della societa", description: "Descrizione, indirizzo e contatti mostrati sul sito.", href: "/website/impostazioni" },
  { key: "pages", label: "Rivedi le pagine", description: "Testi, immagini e blocchi di ogni pagina.", href: "/website/editor" },
  { key: "preview", label: "Guarda l'anteprima", description: "Il sito come lo vedra il pubblico, solo per te.", href: "", external: true },
  { key: "domain", label: "Collega il dominio", description: "Il dominio della societa, con i record DNS.", href: "/website/domini" },
];

type ChecklistItem = { label: string; state: "done" | "todo" | "info"; hint: string; href?: string };

function ChecklistRow({ item }: { item: ChecklistItem }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      {item.state === "done" ? (
        <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-egw-green" aria-label="Fatto" />
      ) : (
        <Circle className={cn("mt-0.5 h-[18px] w-[18px] shrink-0", item.state === "todo" ? "text-egw-amber" : "text-egw-ink-42")} aria-label={item.state === "todo" ? "Da fare" : "Da verificare"} />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-egw-ink">{item.label}</p>
        <p className="text-[12px] text-egw-ink-62">{item.hint}</p>
      </div>
      {item.href ? (
        <Link href={item.href} className="shrink-0 text-[12.5px] font-semibold text-egw-blue-700 hover:underline">
          Apri
        </Link>
      ) : null}
    </li>
  );
}

function SiteOverview({ site }: { site: SiteDraftDto }) {
  const { overview, reload, can } = useWebsiteArea();
  const { showToast } = useToast();
  const [status, setStatus] = React.useState<PublishStatusDto | null>(null);
  const [publishedNews, setPublishedNews] = React.useState<number | null>(null);
  const [marking, setMarking] = React.useState<string | null>(null);

  const loadExtra = React.useCallback(async () => {
    const [statusResult, articlesResult] = await Promise.all([websiteApi.publishStatus(), websiteApi.articles({ status: "published" })]);
    if (!statusResult.error) setStatus(statusResult.data);
    setPublishedNews(articlesResult.error ? null : articlesResult.data.length);
  }, []);

  React.useEffect(() => {
    void loadExtra();
  }, [loadExtra, site.draftVersion]);

  const primary = overview.domains.find((domain) => domain.role === "primary") ?? null;
  const primaryActive = overview.domains.some((domain) => domain.role === "primary" && domain.state === "active");

  const checklist: ChecklistItem[] = [
    { label: "Template scelto", state: "done", hint: `Partito da «${site.templateKey}». Lo stile si cambia dalle impostazioni.`, href: "/website/impostazioni" },
    {
      label: "Logo e identita",
      state: site.settings.identity.logo || overview.clubHasLogo ? "done" : "todo",
      hint: site.settings.identity.logo
        ? "Il sito ha il suo logo."
        : overview.clubHasLogo
          ? "Il sito usa il logo dell'anagrafica del club."
          : "Ne il sito ne l'anagrafica del club hanno un logo: caricalo nelle impostazioni.",
      href: "/website/impostazioni",
    },
    {
      label: "Almeno una news pubblicata",
      state: publishedNews ? "done" : "todo",
      hint: publishedNews === null ? "Conteggio non disponibile." : publishedNews ? `${publishedNews} news pubblicate.` : "La pagina News e vuota.",
      href: "/website/news",
    },
    { label: "Persone sul sito", state: "info", hint: "Scegli quali atleti e membri dello staff compaiono, e con quali dati.", href: can("website.people.manage") ? "/website/persone" : undefined },
    { label: "Sponsor in vetrina", state: "info", hint: "Decidi quali sponsor mostrare e in quale livello.", href: "/website/sponsor" },
    {
      label: "Dominio collegato e attivo",
      state: primaryActive ? "done" : "todo",
      hint: primaryActive ? `${primary?.hostname} e attivo.` : primary ? `${primary.hostname}: in attesa di completare la verifica.` : "Nessun dominio collegato.",
      href: "/website/domini",
    },
    {
      label: "Sito pubblicato",
      state: site.status === "published" ? "done" : "todo",
      hint: site.status === "published" ? "Il pubblico vede la versione corrente." : site.status === "offline" ? "Il sito e stato ritirato." : "Il sito non e ancora pubblico.",
      href: "/website/versioni",
    },
  ];

  const doneSteps = ONBOARDING_STEPS.filter((step) => site.onboarding[step.key]).length;

  const markDone = async (key: string, value: boolean) => {
    setMarking(key);
    const result = await websiteApi.updateConfig({ onboarding: { [key]: value }, expectedVersion: site.draftVersion });
    setMarking(null);
    if (result.error) {
      showToast("error", isConflict(result) ? "Il sito e stato modificato nel frattempo: ho ricaricato, riprova" : result.error.message);
      if (isConflict(result)) await reload();
      return;
    }
    await reload();
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Panel as="section" className="lg:col-span-2">
          <PanelHeader eyebrow="Stato del sito" title="Pubblicazione" />
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={SITE_STATUS[site.status]} />
            {status?.hasUnpublishedChanges ? <DataChip tone="amber">Modifiche non pubblicate</DataChip> : null}
          </div>
          <p className="mt-3 text-[13px] text-egw-ink-72">
            {overview.publication
              ? `Ultima pubblicazione: versione ${overview.publication.revisionNumber} del ${formatDateTime(overview.publication.publishedAt)}.`
              : "Il sito non e mai stato pubblicato."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {can("website.publish") ? (
              <PublishButton
                onPublished={async () => {
                  await reload();
                  await loadExtra();
                }}
              />
            ) : null}
            <Button asChild variant="secondary">
              <a href={previewPath(site.id, "/")} target="_blank" rel="noopener noreferrer"><Eye className="h-4 w-4" aria-hidden />Anteprima</a>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/website/editor"><PenSquare className="h-4 w-4" aria-hidden />Apri l&apos;editor</Link>
            </Button>
          </div>
        </Panel>
        <Panel as="section">
          <PanelHeader eyebrow="Dominio" title={primary?.hostname ?? "Nessun dominio"} />
          {primary ? (
            <StatusPill status={domainStateSpec(primary.state)} />
          ) : (
            <p className="text-[12.5px] text-egw-ink-62">Finche non colleghi un dominio della societa, il sito si vede solo in anteprima.</p>
          )}
          <div className="mt-4">
            <Button asChild variant="secondary" size="sm">
              <Link href="/website/domini"><Globe className="h-4 w-4" aria-hidden />Gestisci il dominio</Link>
            </Button>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel as="section">
          <PanelHeader eyebrow="Cosa manca" title="Checklist del sito" description="Calcolata dai dati: si aggiorna da sola." />
          <ul className="divide-y divide-egw-hairline">
            {checklist.map((item) => (
              <ChecklistRow key={item.label} item={item} />
            ))}
          </ul>
        </Panel>
        <Panel as="section">
          <PanelHeader eyebrow="Avvio guidato" title="I primi passi" description="Spunta un passo quando l'hai completato." />
          <ProgressBar value={doneSteps} max={ONBOARDING_STEPS.length} label={`${doneSteps} di ${ONBOARDING_STEPS.length} completati`} tone="green" />
          <ul className="mt-4 divide-y divide-egw-hairline">
            {ONBOARDING_STEPS.map((step) => {
              const done = Boolean(site.onboarding[step.key]);
              const href = step.external ? previewPath(site.id, "/") : step.href;
              return (
                <li key={step.key} className="flex flex-wrap items-center gap-3 py-2.5">
                  {done ? <CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-egw-green" aria-label="Fatto" /> : <Circle className="h-[18px] w-[18px] shrink-0 text-egw-ink-42" aria-label="Da fare" />}
                  <div className="min-w-0 flex-1">
                    {step.external ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold text-egw-ink hover:text-egw-blue-700">
                        {step.label} <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    ) : (
                      <Link href={href} className="text-[13px] font-semibold text-egw-ink hover:text-egw-blue-700">{step.label}</Link>
                    )}
                    <p className="text-[12px] text-egw-ink-62">{step.description}</p>
                  </div>
                  <Button size="xs" variant={done ? "text" : "secondary"} loading={marking === step.key} onClick={() => void markDone(step.key, !done)}>
                    {done ? "Segna da fare" : "Segna come fatto"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <Panel as="section">
        <PanelHeader eyebrow="Scorciatoie" title="Vai a" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: "/website/editor", label: "Editor delle pagine", icon: <LayoutTemplate className="h-4 w-4" /> },
            { href: "/website/news", label: "News", icon: <Newspaper className="h-4 w-4" /> },
            { href: "/website/domini", label: "Dominio", icon: <Globe className="h-4 w-4" /> },
            { href: "/website/impostazioni", label: "Impostazioni", icon: <Settings className="h-4 w-4" /> },
          ].map((link) => (
            <Button key={link.href} asChild variant="secondary" className="justify-start">
              <Link href={link.href}>{link.icon}{link.label}</Link>
            </Button>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export function WebsiteOverview() {
  const { overview, reload, can } = useWebsiteArea();
  if (!overview.site) {
    if (!can("website.settings.manage")) {
      return (
        <InfoCard eyebrow="Sito non ancora creato">
          Il sito della societa non e ancora stato creato. Puo crearlo chi gestisce le impostazioni del sito (proprietario o gestore).
        </InfoCard>
      );
    }
    if (!overview.access.canEdit) {
      return <AlertBlock severity="warning" title="Servizio sospeso">Il sito non si puo creare mentre il servizio e sospeso.</AlertBlock>;
    }
    return <OnboardingWizard onCreated={reload} />;
  }
  return <SiteOverview site={overview.site} />;
}
