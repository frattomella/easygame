"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconChip } from "@/components/web/primitives/StatusPill";
import { SkyProvider } from "@/components/web/primitives/Surface";
import logoWhite from "@/../public/images/brand/logotipo-w.png";
import iconWhite from "@/../public/images/brand/icon-w.png";

/**
 * **Ambiente 3 — «fuori dal club»** (EGDS v3.1.0, guideline 05 §5.1;
 * pattern 9 di 09 §9.1).
 *
 * Accesso, registrazione, recupero password, invito, verifica, conferma,
 * onboarding, pagine di stato: cielo pieno senza orizzonte, filigrana del
 * marchio al 5%, il logotipo bianco in alto e **un solo** pannello bianco
 * centrato — 440px per un modulo, 560 per un percorso a passi. Il credito
 * «powered by CediSoft» vive qui, e solo qui: dentro l'applicazione non c'e
 * un piede (deprecated.md).
 *
 * Ogni testo che poggia direttamente sul cielo e bianco (100 / 80 / 60%):
 * niente inchiostro scuro su fondo scuro — e la regressione che questo file
 * chiude per tutte le schermate che lo montano.
 */
export interface OutsideShellProps {
  children: React.ReactNode;
  /** 440 per un modulo (accesso), 560 per una schermata di stato, 720 per una scheda pubblica, 960 per un percorso a passi con la colonna. */
  width?: "form" | "stepper" | "wide" | "full";
  /** Cosa mostrare sopra il pannello, sotto il logotipo (un occhiello bianco, un passo). */
  above?: React.ReactNode;
  /** Cosa mostrare sotto il pannello, sopra il credito (un collegamento «Torna all'accesso»). */
  below?: React.ReactNode;
  /** Il logotipo porta a questo indirizzo (default: la home). */
  logoHref?: string;
  className?: string;
  panelClassName?: string;
  /** Senza pannello: il contenuto disegna le proprie superfici (onboarding a piu pannelli). */
  bare?: boolean;
}

const widths = {
  form: "max-w-[440px]",
  stepper: "max-w-[560px]",
  wide: "max-w-[720px]",
  /** Un percorso con la colonna dei passi accanto al pannello (onboarding). */
  full: "max-w-[960px]",
};

export function OutsideShell({ children, width = "form", above, below, logoHref = "/", className, panelClassName, bare = false }: OutsideShellProps) {
  return (
    <SkyProvider>
    <div className={cn("egw-sky-full relative min-h-[100dvh] overflow-hidden px-4 py-8 font-brand sm:py-12", className)}>
      <Image
        src={iconWhite}
        alt=""
        aria-hidden
        className="pointer-events-none absolute -right-24 top-1/2 h-[520px] w-[520px] -translate-y-1/2 select-none object-contain opacity-[0.05]"
      />
      <div className={cn("relative mx-auto flex min-h-[calc(100dvh-4rem)] w-full flex-col items-center justify-center gap-6", widths[width])}>
        <Link href={logoHref} aria-label="EasyGame" className="rounded-egw-chip focus-visible:outline-none focus-visible:shadow-egw-focus-dark">
          <Image src={logoWhite} alt="EasyGame" width={168} height={40} className="h-auto w-[168px] object-contain" priority />
        </Link>
        {above ? <div className="w-full text-center text-white">{above}</div> : null}
        {bare ? (
          <div className={cn("w-full", panelClassName)}>{children}</div>
        ) : (
          <SkyProvider onSky={false}>
            <div className={cn("w-full rounded-egw-panel border border-white/60 bg-white p-6 shadow-egw-plane-2 sm:p-8", panelClassName)}>{children}</div>
          </SkyProvider>
        )}
        {below ? <div className="w-full text-center text-[13px] text-white/80 [&_a]:font-semibold [&_a]:text-white [&_a]:underline-offset-4 hover:[&_a]:underline">{below}</div> : null}
        <p className="text-center text-[11px] text-white/60">powered by CediSoft</p>
      </div>
    </div>
    </SkyProvider>
  );
}

/** L'intestazione dentro il pannello: titolo 800/24 e una riga che dice a cosa serve. */
export function OutsideHeading({ title, description, className }: { title: React.ReactNode; description?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-2 pb-5", className)}>
      <h1 className="text-[24px] font-extrabold leading-[1.1] tracking-[var(--egw-track-display)] text-egw-ink">{title}</h1>
      {description ? <p className="text-[13px] leading-[1.5] text-egw-ink-62">{description}</p> : null}
    </div>
  );
}

/**
 * Una schermata di stato: accesso confermato, invito accettato, account
 * verificato, reindirizzamento. Icona in un chip, titolo, descrizione, lo
 * stato (in corso o concluso) e al piu due azioni. Il fuoco va sul titolo
 * quando la schermata compare, cosi un lettore di schermo la annuncia.
 */
export function OutsideStatus({
  icon,
  tone = "blue",
  title,
  description,
  busy = false,
  busyLabel,
  primary,
  secondary,
}: {
  icon: React.ReactNode;
  tone?: "blue" | "green" | "amber" | "red" | "neutral";
  title: React.ReactNode;
  description?: React.ReactNode;
  busy?: boolean;
  busyLabel?: React.ReactNode;
  primary?: React.ReactNode;
  secondary?: React.ReactNode;
}) {
  const heading = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <div className="flex flex-col items-center text-center" role={busy ? "status" : undefined} aria-live={busy ? "polite" : undefined}>
      <IconChip tone={tone} size={48} className="mb-4 [&>svg]:h-[22px] [&>svg]:w-[22px]">
        {icon}
      </IconChip>
      <h1 ref={heading} tabIndex={-1} className="text-[22px] font-extrabold leading-[1.15] tracking-[var(--egw-track-display)] text-egw-ink outline-none">
        {title}
      </h1>
      {description ? <p className="mt-2 max-w-[46ch] text-[13px] leading-[1.5] text-egw-ink-62">{description}</p> : null}
      {busy ? (
        <p className="mt-4 inline-flex items-center gap-2 text-[12.5px] font-medium text-egw-ink-62">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {busyLabel || "Un momento…"}
        </p>
      ) : null}
      {primary || secondary ? (
        <div className="mt-6 flex w-full flex-col items-stretch gap-2.5 sm:flex-row sm:justify-center">
          {primary}
          {secondary}
        </div>
      ) : null}
    </div>
  );
}
