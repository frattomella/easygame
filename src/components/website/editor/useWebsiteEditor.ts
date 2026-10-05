"use client";

import * as React from "react";
import {
  websiteApi,
  isConflict,
  type PageDto,
  type PageSummaryDto,
  type PublishIssueDto,
  type SiteDraftDto,
  type WebsiteOverviewDto,
} from "@/lib/website/client";
import { mergeSavedDocument } from "@/lib/website/document/operations";
import { canRedo, canUndo, emptyHistory, recordHistory, stepHistory, type EditorHistory } from "@/lib/website/document/history";
import type { WebsiteDevice, WebsitePageDocument } from "@/lib/website/document/types";
import type { EditorTarget } from "@/lib/website/editor-protocol";

/**
 * **Lo stato dell'editor visuale** (ADR-0200 §10-§11).
 *
 * Tre cose vivono qui e da nessun'altra parte:
 *
 * 1. **i documenti aperti**, uno per pagina, con la versione che il server ha
 *    confermato: il salvataggio manda quella versione e un conflitto (409) si
 *    ferma invece di sovrascrivere il lavoro di un altro;
 * 2. **la configurazione del sito** che l'editor tocca — tema, menu,
 *    intestazione, piede — con la versione della bozza;
 * 3. **una cronologia sola** per tutto, come l'operatore l'ha vissuta: una voce
 *    e lo stato prima di un'operazione, e annullare e una scrittura in avanti.
 *
 * Il salvataggio e automatico (un secondo dopo l'ultima modifica) e si puo
 * forzare. Cio che si scrive mentre un salvataggio e in volo non si perde:
 * `mergeSavedDocument` tiene il locale, che partira col giro dopo.
 */

export type SiteEditableConfig = Pick<SiteDraftDto, "theme" | "header" | "footer" | "navigation">;

type HistoryEntry =
  | { scope: "page"; pageId: string; doc: WebsitePageDocument }
  | { scope: "site"; config: SiteEditableConfig };

type OpenPage = {
  page: PageDto;
  doc: WebsitePageDocument;
  /** Il documento come il server l'ha confermato l'ultima volta. */
  savedJson: string;
  version: number;
};

export type EditorConflict =
  | { scope: "page"; pageId: string; currentVersion: number | null; message: string }
  | { scope: "site"; currentVersion: number | null; message: string };

export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

const AUTOSAVE_MS = 1000;

const pickConfig = (site: SiteDraftDto): SiteEditableConfig => ({
  theme: site.theme,
  header: site.header,
  footer: site.footer,
  navigation: site.navigation,
});

let opCounter = 0;
/** Una chiave che non si fonde con nessun'altra: le operazioni strutturali. */
export const uniqueOpKey = () => `op:${Date.now()}:${(opCounter += 1)}`;

export function useWebsiteEditor(initial: WebsiteOverviewDto) {
  const site = initial.site as SiteDraftDto;
  const [overview, setOverview] = React.useState(initial);
  const [pages, setPages] = React.useState<PageSummaryDto[]>(initial.pages);
  const [open, setOpen] = React.useState<Record<string, OpenPage>>({});
  const [currentPageId, setCurrentPageId] = React.useState<string | null>(
    initial.pages.find((page) => page.kind === "home")?.id || initial.pages[0]?.id || null,
  );
  const [config, setConfig] = React.useState<SiteEditableConfig>(() => pickConfig(site));
  const [configSavedJson, setConfigSavedJson] = React.useState(() => JSON.stringify(pickConfig(site)));
  const [draftVersion, setDraftVersion] = React.useState(site.draftVersion);
  const [history, setHistory] = React.useState<EditorHistory<HistoryEntry>>(emptyHistory);
  const [selection, setSelection] = React.useState<EditorTarget | null>(null);
  const [device, setDevice] = React.useState<WebsiteDevice>("desktop");
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState<EditorConflict | null>(null);
  const [issues, setIssues] = React.useState<Record<string, PublishIssueDto[]>>({});
  const [previewRevision, setPreviewRevision] = React.useState(0);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  /* Le ref tengono l'ultimo valore per il salvataggio, che gira fuori dal render. */
  const openRef = React.useRef(open);
  const configRef = React.useRef(config);
  const configSavedRef = React.useRef(configSavedJson);
  const draftVersionRef = React.useRef(draftVersion);
  const savingRef = React.useRef(false);
  const conflictRef = React.useRef(conflict);
  /* La versione confermata di ogni pagina, aggiornata subito: documento e metadati condividono la stessa. */
  const versionsRef = React.useRef<Record<string, number>>({});
  openRef.current = open;
  configRef.current = config;
  configSavedRef.current = configSavedJson;
  draftVersionRef.current = draftVersion;
  conflictRef.current = conflict;

  const current = currentPageId ? open[currentPageId] || null : null;

  /* ------------------------------------------------------------ apertura */

  const loadPage = React.useCallback(async (pageId: string) => {
    const result = await websiteApi.page(pageId);
    if (result.error) {
      setLoadError(result.error.message);
      return null;
    }
    setLoadError(null);
    const entry: OpenPage = {
      page: result.data,
      doc: result.data.document,
      savedJson: JSON.stringify(result.data.document),
      version: result.data.version,
    };
    versionsRef.current[pageId] = entry.version;
    setOpen((state) => ({ ...state, [pageId]: entry }));
    return entry;
  }, []);

  React.useEffect(() => {
    if (currentPageId && !openRef.current[currentPageId]) void loadPage(currentPageId);
  }, [currentPageId, loadPage]);

  const openPage = React.useCallback((pageId: string) => {
    setCurrentPageId(pageId);
    setSelection(null);
  }, []);

  /* ----------------------------------------------------------- modifiche */

  const applyDoc = React.useCallback(
    (fn: (doc: WebsitePageDocument) => WebsitePageDocument, key: string = uniqueOpKey(), pageId?: string) => {
      const id = pageId || currentPageId;
      if (!id) return;
      const entry = openRef.current[id];
      if (!entry) return;
      const next = fn(entry.doc);
      if (next === entry.doc) return;
      setHistory((state) => recordHistory(state, { scope: "page", pageId: id, doc: entry.doc }, `page:${id}:${key}`, Date.now()));
      setOpen((state) => (state[id] ? { ...state, [id]: { ...state[id], doc: next } } : state));
    },
    [currentPageId],
  );

  const applyConfig = React.useCallback((fn: (config: SiteEditableConfig) => SiteEditableConfig, key: string = uniqueOpKey()) => {
    const before = configRef.current;
    const next = fn(before);
    if (next === before) return;
    setHistory((state) => recordHistory(state, { scope: "site", config: before }, `site:${key}`, Date.now()));
    setConfig(next);
  }, []);

  const step = React.useCallback(
    (direction: "undo" | "redo") => {
      const result = stepHistory(history, direction, (entry): HistoryEntry | null => {
        if (entry.scope === "site") return { scope: "site", config: configRef.current };
        const live = openRef.current[entry.pageId];
        return live ? { scope: "page", pageId: entry.pageId, doc: live.doc } : null;
      });
      if (!result) return;
      setHistory(result.history);
      const restore = result.restore;
      if (restore.scope === "site") {
        setConfig(restore.config);
      } else {
        setOpen((state) =>
          state[restore.pageId] ? { ...state, [restore.pageId]: { ...state[restore.pageId], doc: restore.doc } } : state,
        );
        if (restore.pageId !== currentPageId) setCurrentPageId(restore.pageId);
      }
    },
    [history, currentPageId],
  );

  /* --------------------------------------------------------- salvataggio */

  const dirtyPageIds = Object.values(open)
    .filter((entry) => JSON.stringify(entry.doc) !== entry.savedJson)
    .map((entry) => entry.page.id);
  const configDirty = JSON.stringify(config) !== configSavedJson;
  const dirty = dirtyPageIds.length > 0 || configDirty;

  const saveNow = React.useCallback(
    async (force?: { scope: "page"; pageId: string; version: number } | { scope: "site"; version: number }) => {
      if (savingRef.current) return false;
      savingRef.current = true;
      setSaving(true);
      let ok = true;
      let changed = false;
      try {
        /* Le pagine. */
        for (const entry of Object.values(openRef.current)) {
          const pageForced = force?.scope === "page" && force.pageId === entry.page.id;
          if (!pageForced && conflictRef.current?.scope === "page" && conflictRef.current.pageId === entry.page.id) continue;
          const sentJson = JSON.stringify(entry.doc);
          if (sentJson === entry.savedJson) continue;
          const sent = entry.doc;
          const version = pageForced ? force.version : versionsRef.current[entry.page.id] ?? entry.version;
          const result = await websiteApi.savePageDocument(entry.page.id, version, sent);
          if (result.error) {
            ok = false;
            if (isConflict(result)) {
              setConflict({
                scope: "page",
                pageId: entry.page.id,
                currentVersion: (result.error as { currentVersion?: number }).currentVersion ?? null,
                message: result.error.message,
              });
            } else {
              setSaveError(result.error.message);
            }
            continue;
          }
          changed = true;
          const saved = result.data.page;
          versionsRef.current[saved.id] = saved.version;
          setIssues((state) => ({ ...state, [saved.id]: result.data.issues }));
          setOpen((state) => {
            const live = state[saved.id];
            if (!live) return state;
            return {
              ...state,
              [saved.id]: {
                page: { ...live.page, ...saved, document: saved.document },
                doc: mergeSavedDocument(sent, live.doc, saved.document),
                savedJson: JSON.stringify(saved.document),
                version: saved.version,
              },
            };
          });
          if (pageForced) setConflict(null);
        }

        /* La configurazione del sito. */
        const siteForced = force?.scope === "site";
        const sentConfig = configRef.current;
        const sentConfigJson = JSON.stringify(sentConfig);
        if (sentConfigJson !== configSavedRef.current && (siteForced || conflictRef.current?.scope !== "site")) {
          /* Solo le parti cambiate: ognuna ha il suo permesso (tema e menu sono due chiavi). */
          const savedConfig = JSON.parse(configSavedRef.current) as SiteEditableConfig;
          const patch: Partial<SiteEditableConfig> = {};
          for (const key of ["theme", "header", "footer", "navigation"] as const) {
            if (JSON.stringify(sentConfig[key]) !== JSON.stringify(savedConfig[key])) (patch as Record<string, unknown>)[key] = sentConfig[key];
          }
          const result = await websiteApi.updateConfig({ ...patch, expectedVersion: siteForced ? force.version : draftVersionRef.current });
          if (result.error) {
            ok = false;
            if (isConflict(result)) {
              setConflict({
                scope: "site",
                currentVersion: (result.error as { currentVersion?: number }).currentVersion ?? null,
                message: result.error.message,
              });
            } else {
              setSaveError(result.error.message);
            }
          } else {
            changed = true;
            const confirmed = pickConfig(result.data);
            draftVersionRef.current = result.data.draftVersion;
            configSavedRef.current = JSON.stringify(confirmed);
            setDraftVersion(result.data.draftVersion);
            setConfigSavedJson(JSON.stringify(confirmed));
            setConfig((live) => (JSON.stringify(live) === sentConfigJson ? confirmed : live));
            setOverview((state) => (state.site ? { ...state, site: result.data } : state));
            if (siteForced) setConflict(null);
          }
        }
        if (ok) setSaveError(null);
        if (changed) setPreviewRevision((value) => value + 1);
        return ok;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [],
  );

  /* Il salvataggio automatico: un secondo dopo l'ultima modifica. */
  React.useEffect(() => {
    /* Durante un conflitto `saveNow` salta la parte in conflitto e salva il resto. */
    if (!dirty) return;
    const timer = window.setTimeout(() => void saveNow(), AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [dirty, config, open, saveNow]);

  /* Uscire con modifiche non salvate chiede conferma al browser. */
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  /* ----------------------------------------------------------- conflitti */

  const reloadAfterConflict = React.useCallback(async () => {
    const active = conflictRef.current;
    if (!active) return;
    if (active.scope === "page") {
      await loadPage(active.pageId);
    } else {
      const result = await websiteApi.overview();
      if (result.error || !result.data.site) {
        setSaveError(result.error?.message || "Il sito non si puo ricaricare");
        return;
      }
      const fresh = pickConfig(result.data.site);
      setOverview(result.data);
      setPages(result.data.pages);
      setConfig(fresh);
      setConfigSavedJson(JSON.stringify(fresh));
      setDraftVersion(result.data.site.draftVersion);
    }
    setConflict(null);
    setPreviewRevision((value) => value + 1);
  }, [loadPage]);

  const forceAfterConflict = React.useCallback(async () => {
    const active = conflictRef.current;
    if (!active) return;
    let version = active.currentVersion;
    if (version === null) {
      if (active.scope === "page") {
        const fresh = await websiteApi.page(active.pageId);
        version = fresh.data?.version ?? null;
      } else {
        const fresh = await websiteApi.overview();
        version = fresh.data?.site?.draftVersion ?? null;
      }
    }
    if (version === null) return;
    await saveNow(active.scope === "page" ? { scope: "page", pageId: active.pageId, version } : { scope: "site", version });
  }, [saveNow]);

  /* --------------------------------------------------------------- pagine */

  const refreshOverview = React.useCallback(async () => {
    const result = await websiteApi.overview();
    if (result.error) return;
    setOverview(result.data);
    setPages(result.data.pages);
    if (result.data.site) {
      /* Una pagina cancellata tocca menu e piede: la versione della bozza cambia. */
      setDraftVersion(result.data.site.draftVersion);
      if (JSON.stringify(configRef.current) === configSavedRef.current) {
        const fresh = pickConfig(result.data.site);
        setConfig(fresh);
        setConfigSavedJson(JSON.stringify(fresh));
      }
    }
  }, []);

  /** Aggiorna la pagina aperta dopo un cambio di titolo, slug o SEO. */
  const replacePageMeta = React.useCallback((page: PageDto) => {
    versionsRef.current[page.id] = page.version;
    setOpen((state) => (state[page.id] ? { ...state, [page.id]: { ...state[page.id], page: { ...state[page.id].page, ...page }, version: page.version } } : state));
    setPages((state) => state.map((item) => (item.id === page.id ? { ...item, ...page } : item)));
    setPreviewRevision((value) => value + 1);
  }, []);

  const forgetPage = React.useCallback((pageId: string) => {
    setOpen((state) => {
      const next = { ...state };
      delete next[pageId];
      return next;
    });
    setHistory((state) => ({
      past: state.past.filter((entry) => !(entry.scope === "page" && entry.pageId === pageId)),
      future: state.future.filter((entry) => !(entry.scope === "page" && entry.pageId === pageId)),
      last: null,
    }));
  }, []);

  let saveState: SaveState = "saved";
  if (conflict) saveState = "conflict";
  else if (saving) saveState = "saving";
  else if (saveError) saveState = "error";
  else if (dirty) saveState = "dirty";

  return {
    site: overview.site as SiteDraftDto,
    overview,
    permissions: new Set(overview.permissions),
    canEdit: overview.access.canEdit,
    pages,
    setPages,
    current,
    currentPageId,
    openPage,
    loadPage,
    loadError,
    config,
    applyDoc,
    applyConfig,
    undo: () => step("undo"),
    redo: () => step("redo"),
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    selection,
    setSelection,
    device,
    setDevice,
    saveState,
    saveError,
    dirty,
    dirtyPageIds,
    saveNow: () => saveNow(),
    conflict,
    reloadAfterConflict,
    forceAfterConflict,
    issues: currentPageId ? issues[currentPageId] || [] : [],
    previewRevision,
    bumpPreview: () => setPreviewRevision((value) => value + 1),
    refreshOverview,
    replacePageMeta,
    forgetPage,
    draftVersion,
    pageVersion: (pageId: string) => versionsRef.current[pageId] ?? null,
  };
}

export type WebsiteEditorState = ReturnType<typeof useWebsiteEditor>;
