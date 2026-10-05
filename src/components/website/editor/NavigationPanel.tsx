"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, GripVertical, Plus, Trash2 } from "lucide-react";
import {
  MAX_NAV_CHILDREN,
  MAX_NAV_ITEMS,
  MAX_NAV_LABEL,
  NAV_ITEM_KINDS,
  moveNavItem,
  reorderNavItems,
  validateNavigation,
  type NavItem,
  type NavItemKind,
  type SiteNavigation,
} from "@/lib/website/navigation";
import type { PageSummaryDto } from "@/lib/website/client";
import { Field, Select, TextInput } from "@/components/web/forms/Field";
import { SegmentedControl, Checkbox } from "@/components/web/primitives/Controls";
import { Button } from "@/components/web/primitives/Button";

/**
 * **I menu del sito**: intestazione e piede, un livello di sottomenu.
 *
 * La navigazione e un'entita propria (ADR-0200 §12), non una conseguenza
 * delle pagine: una voce punta a una pagina per identificativo — rinominarne
 * lo slug non rompe il menu — a un indirizzo esterno, a un'ancora, oppure e un
 * gruppo che apre un sottomenu. Le voci si riordinano trascinando o con le
 * frecce.
 */

const KIND_LABELS: Record<NavItemKind, string> = { page: "Pagina", url: "Indirizzo esterno", anchor: "Ancora", group: "Gruppo (sottomenu)" };

const newItemId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `nav-${Math.random().toString(36).slice(2, 12)}`;

const mapItem = (items: NavItem[], id: string, fn: (item: NavItem) => NavItem): NavItem[] =>
  items.map((item) => (item.id === id ? fn(item) : { ...item, children: mapItem(item.children, id, fn) }));

const removeItem = (items: NavItem[], id: string): NavItem[] =>
  items.filter((item) => item.id !== id).map((item) => ({ ...item, children: removeItem(item.children, id) }));

export function NavigationPanel({
  navigation,
  pages,
  onChange,
  readOnly,
}: {
  navigation: SiteNavigation;
  pages: PageSummaryDto[];
  onChange: (navigation: SiteNavigation, key: string) => void;
  readOnly: boolean;
}) {
  const [menu, setMenu] = React.useState<"header" | "footer">("header");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const dragId = React.useRef<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);
  const items = navigation[menu];
  const issues = validateNavigation(navigation, new Set(pages.map((page) => page.id)));
  const issueById = new Map(issues.map((issue) => [issue.itemId, issue.message]));
  const linkablePages = pages.filter((page) => !page.path.includes("*"));

  const setItems = (next: NavItem[], key: string) => onChange({ ...navigation, [menu]: next }, `nav:${menu}:${key}`);

  const addItem = (parentId?: string) => {
    const firstPage = linkablePages[0];
    const item: NavItem = {
      id: newItemId(),
      label: firstPage?.title.slice(0, MAX_NAV_LABEL) || "Nuova voce",
      kind: "page",
      link: { kind: "page", pageId: firstPage?.id || null },
      children: [],
    };
    if (parentId) setItems(mapItem(items, parentId, (parent) => ({ ...parent, children: [...parent.children, item].slice(0, MAX_NAV_CHILDREN) })), `add:${item.id}`);
    else setItems([...items, item].slice(0, MAX_NAV_ITEMS), `add:${item.id}`);
    setOpenId(item.id);
  };

  const update = (id: string, patch: Partial<NavItem>, key: string) => setItems(mapItem(items, id, (item) => ({ ...item, ...patch })), `${id}:${key}`);

  const renderItem = (item: NavItem, siblings: NavItem[], depth: number) => {
    const expanded = openId === item.id;
    const issue = issueById.get(item.id);
    const index = siblings.findIndex((entry) => entry.id === item.id);
    return (
      <li
        key={item.id}
        draggable={!readOnly}
        onDragStart={(event) => {
          event.stopPropagation();
          dragId.current = item.id;
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", item.id);
        }}
        onDragOver={(event) => {
          if (!dragId.current || !siblings.some((entry) => entry.id === dragId.current)) return;
          event.preventDefault();
          event.stopPropagation();
          setOverId(item.id);
        }}
        onDragLeave={() => setOverId((current) => (current === item.id ? null : current))}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const from = dragId.current;
          dragId.current = null;
          setOverId(null);
          if (from && from !== item.id) setItems(reorderNavItems(items, from, item.id), `reorder:${from}`);
        }}
        onDragEnd={() => {
          dragId.current = null;
          setOverId(null);
        }}
        className={`rounded-md border bg-white ${overId === item.id ? "border-egw-blue" : "border-egw-hairline"}`}
      >
        <div className="flex items-center gap-1 px-1.5 py-1">
          {!readOnly ? <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-egw-ink-42" aria-hidden="true" /> : null}
          <button
            type="button"
            onClick={() => setOpenId(expanded ? null : item.id)}
            aria-expanded={expanded}
            className="flex min-w-0 flex-1 items-center gap-1 text-left text-[12.5px] font-semibold text-egw-ink"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{item.label}</span>
            <span className="shrink-0 text-[10.5px] font-normal text-egw-ink-42">{KIND_LABELS[item.kind]}</span>
          </button>
          {!readOnly ? (
            <>
              <button
                type="button"
                className="rounded p-1 text-egw-ink-62 hover:text-egw-ink disabled:opacity-30"
                aria-label={`Sposta su ${item.label}`}
                disabled={index === 0}
                onClick={() => setItems(moveNavItem(items, item.id, -1), `move:${item.id}`)}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="rounded p-1 text-egw-ink-62 hover:text-egw-ink disabled:opacity-30"
                aria-label={`Sposta giu ${item.label}`}
                disabled={index === siblings.length - 1}
                onClick={() => setItems(moveNavItem(items, item.id, 1), `move:${item.id}`)}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button type="button" className="rounded p-1 text-egw-ink-62 hover:text-egw-red" aria-label={`Togli ${item.label}`} onClick={() => setItems(removeItem(items, item.id), `remove:${item.id}`)}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          ) : null}
        </div>
        {issue ? <p className="px-2 pb-1 text-[11px] text-egw-amber-ink">{issue}</p> : null}
        {expanded ? (
          <div className="space-y-2 border-t border-egw-hairline p-2">
            <Field label="Etichetta">
              <TextInput value={item.label} maxLength={MAX_NAV_LABEL} onChange={(event) => update(item.id, { label: event.target.value }, "label")} disabled={readOnly} aria-label="Etichetta della voce" />
            </Field>
            <Field label="Tipo">
              <Select
                value={item.kind}
                onValueChange={(kind) => {
                  const nextKind = kind as NavItemKind;
                  update(
                    item.id,
                    {
                      kind: nextKind,
                      link: nextKind === "group" ? { kind: "none" } : { ...item.link, kind: nextKind === "anchor" ? "anchor" : nextKind === "url" ? "url" : "page" },
                      children: nextKind === "group" ? item.children : [],
                    },
                    "kind",
                  );
                }}
                options={NAV_ITEM_KINDS.filter((kind) => depth === 0 || kind !== "group").map((kind) => ({ value: kind, label: KIND_LABELS[kind] }))}
                disabled={readOnly}
                aria-label="Tipo di voce"
              />
            </Field>
            {item.kind === "page" ? (
              <Select
                value={item.link.pageId || null}
                onValueChange={(pageId) => update(item.id, { link: { ...item.link, kind: "page", pageId } }, "page")}
                options={linkablePages.map((page) => ({ value: page.id, label: `${page.title} (${page.path})` }))}
                placeholder="Scegli la pagina"
                disabled={readOnly}
                aria-label="Pagina della voce"
              />
            ) : null}
            {item.kind === "url" ? (
              <>
                <TextInput
                  value={item.link.url || ""}
                  inputMode="url"
                  placeholder="https://"
                  onChange={(event) => update(item.id, { link: { ...item.link, kind: "url", url: event.target.value } }, "url")}
                  disabled={readOnly}
                  aria-label="Indirizzo esterno"
                />
                <label className="flex items-center gap-2 text-[12px] text-egw-ink-72">
                  <Checkbox
                    size={16}
                    checked={Boolean(item.link.newTab)}
                    onChange={(event) => update(item.id, { link: { ...item.link, newTab: event.target.checked } }, "newTab")}
                    disabled={readOnly}
                  />
                  Apri in una nuova scheda
                </label>
              </>
            ) : null}
            {item.kind === "anchor" ? (
              <>
                <Select
                  value={item.link.pageId || "__corrente"}
                  onValueChange={(pageId) => update(item.id, { link: { ...item.link, kind: "anchor", pageId: pageId === "__corrente" ? null : pageId } }, "anchor-page")}
                  options={[{ value: "__corrente", label: "La pagina in cui si trova il visitatore" }, ...linkablePages.map((page) => ({ value: page.id, label: page.title }))]}
                  disabled={readOnly}
                  aria-label="Pagina dell'ancora"
                />
                <TextInput
                  value={item.link.anchor || ""}
                  placeholder="iscrizioni"
                  onChange={(event) => update(item.id, { link: { ...item.link, kind: "anchor", anchor: event.target.value } }, "anchor")}
                  disabled={readOnly}
                  aria-label="Ancora (senza #)"
                />
              </>
            ) : null}
            {item.kind === "group" ? (
              <div className="space-y-1.5">
                <p className="text-[11.5px] font-semibold text-egw-ink-72">Voci del sottomenu</p>
                <ul className="space-y-1">{item.children.map((child) => renderItem(child, item.children, 1))}</ul>
                {!readOnly && item.children.length < MAX_NAV_CHILDREN ? (
                  <Button size="xs" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => addItem(item.id)}>
                    Aggiungi al sottomenu
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <div className="space-y-3 p-3">
      <SegmentedControl
        size="sm"
        value={menu}
        onChange={setMenu}
        options={[
          { value: "header", label: "Menu principale", count: navigation.header.length },
          { value: "footer", label: "Menu del piede", count: navigation.footer.length },
        ]}
        aria-label="Quale menu"
      />
      <p className="text-[11.5px] text-egw-ink-62">Trascina le voci per riordinarle. I modelli di dettaglio (una news, una squadra) non si mettono nel menu: ci si arriva dagli elenchi.</p>
      <ul className="space-y-1.5">{items.map((item) => renderItem(item, items, 0))}</ul>
      {!items.length ? <p className="text-[12.5px] text-egw-ink-62">Il menu e vuoto.</p> : null}
      {!readOnly && items.length < MAX_NAV_ITEMS ? (
        <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => addItem()}>
          Aggiungi una voce
        </Button>
      ) : null}
    </div>
  );
}
