"use client";

import * as React from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel, Eyebrow } from "@/components/web/primitives/Surface";
import { IdentityTile, Avatar } from "@/components/web/primitives/Identity";
import { IconButton } from "@/components/web/primitives/Button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger, TooltipProvider } from "@/components/web/primitives/Overlays";
import { SegmentedControl } from "@/components/web/primitives/Controls";
import { usePreference } from "@/components/web/hooks/use-preference";

/**
 * La pagina di scheda (guideline 09 §9.8): intestazione con l'identita, chip
 * di classificazione e pillola di stato, al piu due azioni piu un `···` (le
 * distruttive stanno **solo** li), una striscia di avvisi sotto il nome, e da
 * tre a cinque aree invece di nove tab. Dentro un'area, le sezioni meno usate
 * sono righe chiuse che si aprono a richiesta e ricordano lo stato.
 */
export interface RecordAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
  /** Solo nel menu `···`. */
  overflow?: boolean;
  hidden?: boolean;
}

export function RecordHeader({
  eyebrow,
  name,
  identity,
  chips,
  status,
  meta,
  actions = [],
  areas,
  className,
  children,
}: {
  eyebrow?: React.ReactNode;
  name: React.ReactNode;
  identity: { number?: number | string | null; name: string; avatarSrc?: string | null; round?: boolean };
  chips?: React.ReactNode;
  status?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: RecordAction[];
  /** Lo switcher delle aree, nella riga bassa dell'intestazione. */
  areas?: React.ReactNode;
  className?: string;
  /** La striscia di avvisi (`RecordAlertStrip`). */
  children?: React.ReactNode;
}) {
  const visible = actions.filter((a) => !a.hidden);
  const inline = visible.filter((a) => !a.overflow && a.tone !== "danger").slice(0, 2);
  const overflow = visible.filter((a) => !inline.includes(a));
  return (
    <TooltipProvider>
      <Panel className={cn("p-5 lg:p-6", className)} as="header">
        <div className="flex flex-wrap items-start gap-5">
          {identity.round ? (
            <Avatar src={identity.avatarSrc} name={identity.name} size={72} />
          ) : (
            <IdentityTile number={identity.number} name={identity.name} size={72} radius="panel-sm" />
          )}
          <div className="min-w-0 flex-1">
            {eyebrow ? <Eyebrow className="mb-1.5">{eyebrow}</Eyebrow> : null}
            <h1 className="font-brand text-[28px] font-extrabold leading-[1.1] tracking-[var(--egw-track-display)] text-egw-ink">{name}</h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {chips}
              {status}
              {meta ? <span className="font-brand text-[12px] text-egw-ink-62">{meta}</span> : null}
            </div>
          </div>
          {inline.length || overflow.length ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {inline.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={action.onClick}
                  className="inline-flex h-9 items-center gap-2 rounded-egw-control border border-egw-control-border bg-white px-3.5 font-brand text-[12.5px] font-semibold text-egw-ink transition-colors duration-hover hover:border-[rgba(37,99,235,.32)] focus-visible:outline-none focus-visible:shadow-egw-focus [&>svg]:h-4 [&>svg]:w-4"
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
              {overflow.length ? (
                <Menu>
                  <MenuTrigger asChild>
                    <IconButton aria-label="Altre azioni" variant="secondary" size="md">
                      <MoreHorizontal />
                    </IconButton>
                  </MenuTrigger>
                  <MenuContent align="end" width={240}>
                    <MenuLabel>Altre azioni</MenuLabel>
                    {overflow.map((action) => (
                      <MenuItem key={action.id} tone={action.tone === "danger" ? "danger" : "default"} onSelect={action.onClick}>
                        {action.icon}
                        {action.label}
                      </MenuItem>
                    ))}
                  </MenuContent>
                </Menu>
              ) : null}
            </div>
          ) : null}
        </div>
        {children ? <div className="mt-4">{children}</div> : null}
        {areas ? <div className="mt-4 flex justify-end">{areas}</div> : null}
      </Panel>
    </TooltipProvider>
  );
}

/** Lo switcher delle aree (3–5), segmentato, con un contatore rosso quando un'area ha problemi. */
export function RecordAreaSwitcher<T extends string>({
  value,
  onChange,
  areas,
}: {
  value: T;
  onChange: (value: T) => void;
  areas: Array<{ value: T; label: string; problems?: number }>;
}) {
  return (
    <SegmentedControl
      aria-label="Aree della scheda"
      value={value}
      onChange={onChange}
      options={areas.map((a) => ({
        value: a.value,
        label: (
          <span className="inline-flex items-center gap-1.5">
            {a.label}
            {a.problems ? (
              <span className="egw-num inline-flex h-4 min-w-4 items-center justify-center rounded-egw-pill bg-egw-red px-1 text-[9.5px] font-bold text-white">{a.problems}</span>
            ) : null}
          </span>
        ),
      }))}
    />
  );
}

/** Una riga per ogni problema bloccante, con il verbo che lo risolve. Niente su una scheda pulita. */
export function RecordAlertStrip({
  items,
}: {
  items: Array<{ id: string; severity: "danger" | "warning"; text: React.ReactNode; action?: React.ReactNode }>;
}) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => (
        <li
          key={item.id}
          className={cn(
            "flex flex-wrap items-center gap-3 rounded-egw-field border px-3.5 py-2 font-brand text-[12.5px] font-medium text-egw-ink",
            item.severity === "danger" ? "border-egw-tint-red-bd bg-egw-tint-red" : "border-egw-tint-amber-bd bg-egw-tint-amber",
          )}
        >
          <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", item.severity === "danger" ? "bg-egw-red" : "bg-egw-amber")} />
          <span className="min-w-0 flex-1">{item.text}</span>
          {item.action}
        </li>
      ))}
    </ul>
  );
}

/**
 * Una sezione chiudibile della scheda: titolo, riepilogo in una riga, contatore;
 * il contenuto si monta all'apertura e lo stato persiste per tipo di record.
 */
export function CollapsedSection({
  id,
  recordType,
  title,
  summary,
  count,
  defaultOpen = false,
  children,
  actions,
  className,
}: {
  id: string;
  recordType: string;
  title: React.ReactNode;
  summary?: React.ReactNode;
  count?: number | null;
  defaultOpen?: boolean;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  const [openMap, setOpenMap] = usePreference<Record<string, boolean>>(recordType, "sections", {});
  const open = openMap[id] ?? defaultOpen;
  const contentId = `egw-section-${recordType}-${id}`;
  return (
    <Panel as="section" className={cn("p-0", className)} radius="sm">
      <div className="flex items-center gap-3 px-5 py-3.5">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpenMap((m) => ({ ...m, [id]: !open }))}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-egw-chip text-left focus-visible:outline-none focus-visible:shadow-egw-focus"
        >
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-egw-ink-62 transition-transform duration-panel", !open && "-rotate-90")} />
          <span className="min-w-0">
            <span className="block font-brand text-[14px] font-bold text-egw-ink">
              {title}
              {count != null ? <span className="egw-num ml-1.5 text-[12px] font-bold text-egw-ink-42">({count})</span> : null}
            </span>
            {summary && !open ? <span className="egw-ellipsis block font-brand text-[12px] text-egw-ink-62">{summary}</span> : null}
          </span>
        </button>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {open ? (
        <div id={contentId} className="border-t border-egw-hairline px-5 py-5">
          {children}
        </div>
      ) : null}
    </Panel>
  );
}

/** Il rail laterale di sezione (200px, appiccicoso) per un'area con molte sezioni. */
export function SectionNav({ items, activeId, onSelect }: { items: Array<{ id: string; label: string; problems?: number }>; activeId?: string; onSelect: (id: string) => void }) {
  return (
    <nav aria-label="Sezioni" className="sticky top-4 hidden w-[200px] shrink-0 self-start xl:block">
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-egw-chip px-3 py-2 text-left font-brand text-[12.5px] transition-colors duration-hover hover:bg-white focus-visible:outline-none focus-visible:shadow-egw-focus",
                  active ? "bg-white font-bold text-egw-ink shadow-[inset_2px_0_0_var(--egw-blue)]" : "font-medium text-egw-ink-72",
                )}
              >
                {item.label}
                {item.problems ? <span className="egw-num rounded-egw-pill bg-egw-red px-1.5 text-[9.5px] font-bold text-white">{item.problems}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
