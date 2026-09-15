"use client";

import * as React from "react";
import { BarChart3, BookOpen, Calendar, Check, ExternalLink, FileText, Lightbulb, MessageSquare, Rocket, Shield, Users, Zap } from "lucide-react";
import { Button } from "@/components/web/primitives/Button";
import { DataChip, IconChip } from "@/components/web/primitives/StatusPill";
import { Eyebrow, InsetBlock, Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { InfoCard } from "@/components/web/page/Cards";
import { CollapsedSection } from "@/components/web/record/Record";
import { formatDateShort, formatMoney } from "@/lib/web/format";
import {
  CONTACT_LABEL,
  CONTACT_URL,
  FAQ_ITEMS,
  MARKETPLACE_ITEMS,
  NEWS_ITEMS,
  NEWS_TYPE_LABELS,
  TUTORIAL_ITEMS,
  type MarketplaceItem,
  type NewsItem,
} from "@/components/hub/v2/hub-content";

/**
 * Le cinque sezioni dell'HUB, composte con i pannelli del sistema.
 *
 * Nessuna card dentro una card: ogni voce di catalogo e un pannello di
 * piano 1, le righe di novita e tutorial stanno in un pannello solo e le
 * FAQ sono sezioni chiudibili con lo stato ricordato per utente.
 */
const MARKETPLACE_ICONS: Record<MarketplaceItem["id"], React.ReactNode> = {
  "premium-analytics": <BarChart3 />,
  "multi-club": <Users />,
  "advanced-calendar": <Calendar />,
  "document-manager": <FileText />,
};

const NEWS_ICONS: Record<NewsItem["type"], { icon: React.ReactNode; tone: "green" | "blue" | "neutral" }> = {
  feature: { icon: <Rocket />, tone: "green" },
  update: { icon: <Zap />, tone: "blue" },
  improvement: { icon: <Shield />, tone: "neutral" },
};

function SectionIntro({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="font-brand text-[20px] font-extrabold leading-6 tracking-[var(--egw-track-display)] text-egw-ink">{title}</h2>
      <p className="mt-1 font-brand text-[13.5px] leading-[1.5] text-egw-ink-62">{description}</p>
    </div>
  );
}

export function HubMarketplace() {
  return (
    <div className="flex flex-col gap-[18px]" data-test="hub-marketplace">
      <SectionIntro title="Potenzia il tuo club" description="Scopri i servizi extra per portare la gestione del tuo club al livello successivo." />
      <div className="grid gap-[18px] md:grid-cols-2">
        {MARKETPLACE_ITEMS.map((item) => (
          <Panel key={item.id} as="article" className="flex flex-col gap-4">
            <div className="flex items-start gap-3.5">
              <IconChip tone="blue" size={40} className="[&>svg]:h-5 [&>svg]:w-5">
                {MARKETPLACE_ICONS[item.id]}
              </IconChip>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-brand text-[15px] font-bold leading-5 text-egw-ink">{item.name}</h3>
                  {item.popular ? (
                    <DataChip size="sm" tone="amber">
                      Popolare
                    </DataChip>
                  ) : null}
                </div>
                <p className="mt-1 font-brand text-[12.5px] leading-[1.5] text-egw-ink-62">{item.description}</p>
              </div>
            </div>
            <ul className="flex flex-col gap-1.5">
              {item.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 font-brand text-[13px] text-egw-ink-72">
                  <Check className="h-3.5 w-3.5 shrink-0 text-egw-green" aria-hidden />
                  {feature}
                </li>
              ))}
            </ul>
            <div className="mt-auto flex items-baseline gap-1.5 border-t border-egw-hairline pt-4">
              <span className="egw-num font-brand text-[20px] font-extrabold text-egw-ink">{formatMoney(item.monthlyPrice)}</span>
              <span className="font-brand text-[11.5px] text-egw-ink-62">al mese</span>
            </div>
          </Panel>
        ))}
      </div>
      {/*
        Nella V1 ogni servizio aveva un «Acquista» senza gesto dietro.
        ADR-0014: il catalogo resta statico e non promette funzioni che non
        svolge — chi vuole un servizio lo chiede a chi lo fornisce.
      */}
      <InfoCard eyebrow="Come si attiva un servizio">
        I servizi extra si attivano su richiesta: scrivi a{" "}
        <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-egw-blue-700 underline">
          {CONTACT_LABEL}
        </a>{" "}
        indicando il club e il servizio che ti interessa.
      </InfoCard>
    </div>
  );
}

export function HubNews() {
  return (
    <div className="flex flex-col gap-[18px]" data-test="hub-news">
      <SectionIntro title="Ultime novità" description="Resta aggiornato sulle ultime funzionalità e miglioramenti." />
      <Panel flush>
        <ul className="divide-y divide-egw-rule">
          {NEWS_ITEMS.map((news) => {
            const { icon, tone } = NEWS_ICONS[news.type];
            return (
              <li key={news.id} className="flex items-start gap-3.5 px-6 py-4">
                <IconChip tone={tone} size={36}>
                  {icon}
                </IconChip>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="font-brand text-[14px] font-bold leading-5 text-egw-ink">{news.title}</h3>
                    <DataChip size="sm">{NEWS_TYPE_LABELS[news.type]}</DataChip>
                    <span className="egw-num font-brand text-[11.5px] text-egw-ink-62">{formatDateShort(news.date)}</span>
                  </div>
                  <p className="mt-1 font-brand text-[12.5px] leading-[1.5] text-egw-ink-62">{news.description}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}

export function HubTutorials() {
  return (
    <div className="flex flex-col gap-[18px]" data-test="hub-tutorials">
      <SectionIntro title="Video tutorial" description="Impara a usare EasyGame con i nostri tutorial guidati." />
      <Panel flush>
        <ul className="divide-y divide-egw-rule">
          {TUTORIAL_ITEMS.map((tutorial) => (
            <li key={tutorial.id} className="flex min-h-12 flex-wrap items-center gap-3 px-6 py-3">
              <IconChip tone="blue" size={32} className="[&>svg]:h-4 [&>svg]:w-4">
                <BookOpen />
              </IconChip>
              <span className="min-w-0 flex-1 font-brand text-[13px] font-semibold text-egw-ink">{tutorial.title}</span>
              <DataChip size="sm">{tutorial.category}</DataChip>
              <span className="egw-num font-brand text-[11.5px] text-egw-ink-62">{tutorial.duration}</span>
            </li>
          ))}
        </ul>
      </Panel>
      {/* I video non sono ancora collegati: nella V1 la card era cliccabile e non apriva niente. */}
      <InfoCard eyebrow="Video">I video dei tutorial sono in preparazione: qui trovi gli argomenti e la durata prevista.</InfoCard>

      <SectionIntro title="Domande frequenti" description="Trova risposte alle domande più comuni." />
      <div className="flex flex-col gap-2.5">
        {FAQ_ITEMS.map((faq) => (
          <CollapsedSection key={faq.id} id={faq.id} recordType="hub-faq" title={faq.question}>
            <p className="font-brand text-[13px] leading-[1.6] text-egw-ink-72">{faq.answer}</p>
          </CollapsedSection>
        ))}
      </div>
    </div>
  );
}

function ContactBlock({ eyebrow }: { eyebrow: string }) {
  return (
    <InsetBlock className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <Eyebrow className="mb-1.5">{eyebrow}</Eyebrow>
        <p className="font-brand text-[13px] font-semibold text-egw-ink">Contattaci direttamente</p>
        <p className="font-brand text-[12px] text-egw-ink-62">Per richieste urgenti o collaborazioni</p>
      </div>
      <Button asChild variant="secondary" size="sm">
        <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-[15px] w-[15px]" aria-hidden />
          {CONTACT_LABEL}
        </a>
      </Button>
    </InsetBlock>
  );
}

/*
  Feedback e proposte nella V1 erano due moduli che **fingevano** un invio:
  il pulsante mostrava «inviato» e non chiamava nessuno. ADR-0014 vieta di
  aggiungere una rotta per l'HUB, quindi qui restano il testo e il canale
  reale, non un modulo che non arriva a nessuno (GAP dichiarato).
*/
export function HubFeedback() {
  return (
    <div className="flex flex-col gap-[18px]" data-test="hub-feedback">
      <Panel as="section">
        <PanelHeader
          eyebrow="Feedback"
          title="Il tuo feedback conta"
          description="Aiutaci a migliorare EasyGame con i tuoi suggerimenti: un'osservazione, un difetto, un complimento."
          actions={
            <IconChip tone="green" size={40} className="[&>svg]:h-5 [&>svg]:w-5">
              <MessageSquare />
            </IconChip>
          }
        />
        <ContactBlock eyebrow="Dove scrivere" />
      </Panel>
    </div>
  );
}

export function HubProposals() {
  return (
    <div className="flex flex-col gap-[18px]" data-test="hub-proposals">
      <Panel as="section">
        <PanelHeader
          eyebrow="Proposte"
          title="Hai un'idea?"
          description="Proponi nuove funzionalità per EasyGame: raccontaci cosa ti manca e come lo useresti."
          actions={
            <IconChip tone="amber" size={40} className="[&>svg]:h-5 [&>svg]:w-5">
              <Lightbulb />
            </IconChip>
          }
        />
        <ContactBlock eyebrow="Dove scrivere" />
      </Panel>
    </div>
  );
}
