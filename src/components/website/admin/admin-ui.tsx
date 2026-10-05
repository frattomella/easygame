"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { Skeleton, Toggle } from "@/components/web/primitives/Controls";
import { Modal } from "@/components/web/overlays/Modal";
import { spec, type StatusSpec } from "@/lib/web/status";
import { DOMAIN_STATE_LABELS, TLS_STATE_LABELS, type DomainState, type TlsState } from "@/lib/website/domains/model";
import type { ArticleDto, InquiryDto, SiteDraftDto } from "@/lib/website/client";

/**
 * **Pezzi condivisi delle schermate dell'area «Sito web»** (ADR-0200).
 *
 * Solo presentazione: etichette di stato, la riga con interruttore, il
 * dialogo del conflitto di versione, il bottone «copia». Nessuna regola di
 * dominio vive qui — le decisioni le prende il server.
 */

/* ------------------------------------------------------------------ stati */

export const SITE_STATUS: Record<SiteDraftDto["status"], StatusSpec> = {
  draft: spec("BOZZA", "quiet", "neutral"),
  published: spec("PUBBLICATO", "solid", "green"),
  offline: spec("OFFLINE", "outline", "amber"),
};

export const ARTICLE_STATUS: Record<ArticleDto["status"], StatusSpec> = {
  draft: spec("BOZZA", "quiet", "neutral"),
  scheduled: spec("PROGRAMMATO", "outline", "blue"),
  published: spec("PUBBLICATO", "solid", "green"),
  archived: spec("ARCHIVIATO", "quiet", "neutral"),
};

export const ARTICLE_STATUS_LABELS: Record<ArticleDto["status"], string> = {
  draft: "Bozza",
  scheduled: "Programmato",
  published: "Pubblicato",
  archived: "Archiviato",
};

export const INQUIRY_STATUS: Record<InquiryDto["status"], StatusSpec> = {
  new: spec("NUOVA", "solid", "blue"),
  handled: spec("GESTITA", "outline", "green"),
  archived: spec("ARCHIVIATA", "quiet", "neutral"),
};

const DOMAIN_HUES: Record<DomainState, StatusSpec["hue"]> = {
  pending_dns: "amber",
  verifying: "blue",
  provisioning: "blue",
  active: "green",
  failed: "red",
  removed: "neutral",
};

export const domainStateSpec = (state: DomainState): StatusSpec =>
  spec(DOMAIN_STATE_LABELS[state].toUpperCase(), state === "active" ? "solid" : state === "removed" ? "quiet" : "outline", DOMAIN_HUES[state]);

const TLS_HUES: Record<TlsState, StatusSpec["hue"]> = { not_started: "neutral", pending: "blue", active: "green", failed: "red" };

export const tlsStateSpec = (state: TlsState): StatusSpec =>
  spec(`TLS · ${TLS_STATE_LABELS[state].toUpperCase()}`, state === "active" ? "solid" : state === "not_started" ? "quiet" : "outline", TLS_HUES[state]);

/* ---------------------------------------------------------------- utilita */

/** Lo slug di un'etichetta: minuscolo, senza accenti, trattini. */
export const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** ISO → valore di un `<input type="datetime-local">` nell'ora locale. */
export const toDateTimeLocal = (iso: string | null | undefined) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** Valore di un `datetime-local` → ISO; vuoto o non valido → null. */
export const fromDateTimeLocal = (value: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const websiteMediaUrl = (mediaId: string) => `/api/public/website/media/${mediaId}`;

export const thumbUrl = (url: string, width = 384) => `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=70`;

export const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
};

/* ------------------------------------------------------------ componenti */

/** Una riga «etichetta + spiegazione + interruttore», etichettata per i lettori di schermo. */
export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  children,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Campi che compaiono sotto la riga quando l'interruttore e acceso. */
  children?: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <div className="rounded-egw-field border border-egw-hairline bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <label htmlFor={id} className="block cursor-pointer text-[13px] font-semibold text-egw-ink">
            {label}
          </label>
          {description ? <p id={`${id}-d`} className="mt-0.5 text-[12px] leading-[1.5] text-egw-ink-62">{description}</p> : null}
        </div>
        <Toggle id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
      </div>
      {checked && children ? <div className="mt-3 space-y-3">{children}</div> : null}
    </div>
  );
}

/** Il dialogo del conflitto di versione: ricarica, o sovrascrivi se la schermata lo consente. */
export function ConflictDialog({
  open,
  onCancel,
  onReload,
  onOverwrite,
  busy,
  subject = "questo contenuto",
}: {
  open: boolean;
  onCancel: () => void;
  onReload: () => void;
  onOverwrite?: () => void;
  busy?: boolean;
  subject?: string;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && !busy && onCancel()}
      title="Qualcun altro ha modificato nel frattempo"
      description={`Mentre lavoravi, ${subject} e stato salvato da un'altra sessione. Puoi ricaricare la versione attuale (perdi le tue modifiche non salvate)${onOverwrite ? " oppure sovrascriverla con la tua" : ""}.`}
      strict
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Annulla</Button>
          <Button variant={onOverwrite ? "secondary" : "primary"} onClick={onReload} disabled={busy}>Ricarica</Button>
          {onOverwrite ? (
            <Button variant="danger" onClick={onOverwrite} loading={busy}>Sovrascrivi</Button>
          ) : null}
        </>
      }
    />
  );
}

/** Copia un valore negli appunti; conferma con un segno di spunta. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <IconButton aria-label={copied ? "Copiato" : label} size="xs" onClick={() => void copy()}>
      {copied ? <Check /> : <Copy />}
    </IconButton>
  );
}

/** Lo scheletro di un elenco in caricamento. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Caricamento in corso">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}

/** Contatore di caratteri accanto a un campo con limite. */
export function CharCount({ value, max }: { value: string; max: number }) {
  const over = value.length > max;
  return (
    <span className={over ? "font-semibold text-egw-red" : undefined}>
      {value.length}/{max}
    </span>
  );
}
