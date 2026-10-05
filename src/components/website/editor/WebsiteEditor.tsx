"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CloudOff,
  ExternalLink,
  FileStack,
  Layers,
  Loader2,
  Menu as MenuIcon,
  Monitor,
  Palette,
  PanelBottom,
  PanelRight,
  Plus,
  Redo2,
  Settings2,
  Smartphone,
  Tablet,
  Undo2,
  X,
} from "lucide-react";
import { websiteApi, previewPath, type EditorOptionsDto, type WebsiteOverviewDto } from "@/lib/website/client";
import {
  createSection,
  duplicateBlock,
  duplicateSection,
  insertSection,
  moveBlockBy,
  moveSectionBy,
  removeBlock,
  removeSection,
  toggleBlockVisibility,
  toggleSectionVisibility,
} from "@/lib/website/document/operations";
import { PREVIEW_SAMPLE_ITEM, type EditorAction, type EditorTarget } from "@/lib/website/editor-protocol";
import type { WebsiteDevice, WebsitePageDocument } from "@/lib/website/document/types";
import type { PageKind } from "@/lib/website/registry";
import { Button } from "@/components/web/primitives/Button";
import { useToast } from "@/components/ui/toast-notification";
import { PublishDrawer } from "@/components/website/admin/PublishDrawer";
import { useWebsiteEditor, type SaveState } from "./useWebsiteEditor";
import { EditorDragProvider } from "./editor-drag";
import { PreviewFrame } from "./PreviewFrame";
import { LayersPanel } from "./LayersPanel";
import { PalettePanel } from "./PalettePanel";
import { PagesPanel } from "./PagesPanel";
import { Inspector } from "./Inspector";
import { ThemePanel } from "./ThemePanel";
import { NavigationPanel } from "./NavigationPanel";
import { HeaderFooterPanel } from "./HeaderFooterPanel";
import { PageSettingsDrawer } from "./PageSettingsDrawer";
import { ConflictDialog } from "./ConflictDialog";
import type { ControlContext } from "./ControlField";

/**
 * **L'editor visuale del sito** (ADR-0200 §3).
 *
 * A tutto schermo: a sinistra pagine, struttura, blocchi, tema, menu,
 * intestazione e piede; al centro l'anteprima vera nell'iframe, larga quanto
 * il dispositivo scelto; a destra l'inspector dell'elemento selezionato.
 * Sotto i 1024 pixel i due pannelli diventano fogli che si aprono sopra
 * l'anteprima, cosi l'editor resta usabile da tablet e telefono.
 *
 * Le scorciatoie: Ctrl+Z / Ctrl+Shift+Z (o Ctrl+Y) per annullare e
 * ripristinare, Ctrl+S per salvare subito, Ctrl+D per duplicare, Canc per
 * eliminare, Esc per togliere la selezione.
 */

type LeftTab = "pages" | "layers" | "add" | "theme" | "menu" | "chrome";

const LEFT_TABS: Array<{ value: LeftTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: "pages", label: "Pagine", icon: FileStack },
  { value: "layers", label: "Struttura", icon: Layers },
  { value: "add", label: "Blocchi", icon: Plus },
  { value: "theme", label: "Tema", icon: Palette },
  { value: "menu", label: "Menu", icon: MenuIcon },
  { value: "chrome", label: "Intestazione e piede", icon: PanelBottom },
];

const DEVICES: Array<{ value: WebsiteDevice; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: "desktop", label: "Desktop (1280 px)", icon: Monitor },
  { value: "tablet", label: "Tablet (768 px)", icon: Tablet },
  { value: "mobile", label: "Telefono (375 px)", icon: Smartphone },
];

const SAVE_LABELS: Record<SaveState, string> = {
  saved: "Salvato",
  dirty: "Modifiche da salvare",
  saving: "Salvataggio…",
  error: "Non salvato",
  conflict: "Conflitto",
};

const isTyping = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
};

export function WebsiteEditor({ initial, initialPageId }: { initial: WebsiteOverviewDto; initialPageId?: string | null }) {
  const editor = useWebsiteEditor(initial);
  const { showToast } = useToast();
  const [leftTab, setLeftTab] = React.useState<LeftTab>("layers");
  const [leftOpen, setLeftOpen] = React.useState(false);
  const [rightOpen, setRightOpen] = React.useState(false);
  const [hover, setHover] = React.useState<EditorTarget | null>(null);
  const [options, setOptions] = React.useState<EditorOptionsDto | null>(null);
  const [settingsPageId, setSettingsPageId] = React.useState<string | null>(null);
  const [publishOpen, setPublishOpen] = React.useState(false);
  const selectionFromPreview = React.useRef(false);

  const permissions = editor.permissions;
  const canEditPages = editor.canEdit && permissions.has("website.edit");
  const canTheme = editor.canEdit && permissions.has("website.theme.manage");
  const canNavigation = editor.canEdit && permissions.has("website.navigation.manage");
  const canManagePages = editor.canEdit && permissions.has("website.pages.manage");
  const canPublish = editor.canEdit && permissions.has("website.publish");
  const current = editor.current;
  const doc = current?.doc || null;
  const kind = (current?.page.kind || "standard") as PageKind;

  React.useEffect(() => {
    void websiteApi.options().then((result) => {
      if (result.data) setOptions(result.data);
    });
  }, []);

  /* `?page=<id>` (dai problemi di pubblicazione) apre quella pagina. */
  React.useEffect(() => {
    if (initialPageId && editor.pages.some((page) => page.id === initialPageId)) editor.openPage(initialPageId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPageId]);

  const applyDoc = editor.applyDoc;
  const onDocChange = React.useCallback(
    (fn: (doc: WebsitePageDocument) => WebsitePageDocument, key?: string) => {
      if (!canEditPages) return;
      applyDoc(fn, key);
    },
    [applyDoc, canEditPages],
  );

  const select = React.useCallback(
    (target: EditorTarget | null) => {
      editor.setSelection(target);
      if (target) setRightOpen(true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor.setSelection],
  );

  /* --------------------------------------------- azioni dalla barra dell'anteprima */
  const onPreviewAction = React.useCallback(
    (action: EditorAction, target: EditorTarget) => {
      if (!canEditPages) return;
      const isSection = target.kind === "section";
      switch (action) {
        case "up":
          onDocChange((d) => (isSection ? moveSectionBy(d, target.id, -1) : moveBlockBy(d, target.id, -1)));
          break;
        case "down":
          onDocChange((d) => (isSection ? moveSectionBy(d, target.id, 1) : moveBlockBy(d, target.id, 1)));
          break;
        case "duplicate": {
          let newId: string | null = null;
          onDocChange((d) => {
            const result = isSection ? duplicateSection(d, target.id) : duplicateBlock(d, target.id);
            newId = result.newId;
            return result.doc;
          });
          if (newId) select({ kind: target.kind, id: newId });
          break;
        }
        case "toggle":
          onDocChange((d) => (isSection ? toggleSectionVisibility(d, target.id) : toggleBlockVisibility(d, target.id)));
          break;
        case "delete":
          onDocChange((d) => (isSection ? removeSection(d, target.id) : removeBlock(d, target.id)));
          select(null);
          break;
        case "add-after": {
          const section = createSection("one");
          onDocChange((d) => insertSection(d, section, d.sections.findIndex((item) => item.id === target.id) + 1));
          select({ kind: "section", id: section.id });
          setLeftTab("add");
          setLeftOpen(true);
          break;
        }
        default:
          break;
      }
    },
    [canEditPages, onDocChange, select],
  );

  /* Un collegamento interno cliccato nell'anteprima apre la pagina giusta. */
  const onPreviewNavigate = React.useCallback(
    (path: string) => {
      const clean = path.split(/[?#]/)[0] || "/";
      const exact = editor.pages.find((page) => page.path === clean);
      if (exact) {
        editor.openPage(exact.id);
        return;
      }
      const base = clean.split("/").filter(Boolean)[0];
      const detail = editor.pages.find((page) => page.path === `/${base}/*`);
      if (detail) editor.openPage(detail.id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor.pages, editor.openPage],
  );

  /* ---------------------------------------------------------------- tastiera */
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void editor.saveNow();
        return;
      }
      if (isTyping(event.target)) return;
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) editor.redo();
        else editor.undo();
        return;
      }
      if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        editor.redo();
        return;
      }
      const selection = editor.selection;
      if (!selection) return;
      if (mod && event.key.toLowerCase() === "d") {
        event.preventDefault();
        onPreviewAction("duplicate", selection);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        onPreviewAction("delete", selection);
      } else if (event.key === "Escape") {
        select(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor, onPreviewAction, select]);

  const context: ControlContext = { options, pages: editor.pages, readOnly: !canEditPages };
  const previewSrc = current
    ? previewPath(editor.site.id, current.page.path.replace("*", PREVIEW_SAMPLE_ITEM))
    : previewPath(editor.site.id, "/");
  const settingsPage = settingsPageId ? editor.current?.page.id === settingsPageId ? editor.current.page : null : null;

  const leftContent = (() => {
    switch (leftTab) {
      case "pages":
        return (
          <PagesPanel
            pages={editor.pages}
            currentPageId={editor.currentPageId}
            dirtyPageIds={editor.dirtyPageIds}
            canManage={canManagePages}
            onOpen={(pageId) => {
              editor.openPage(pageId);
              setLeftTab("layers");
            }}
            onSettings={(pageId) => {
              editor.openPage(pageId);
              setSettingsPageId(pageId);
            }}
            onCreated={(page) => {
              void editor.refreshOverview().then(() => editor.openPage(page.id));
              showToast("success", `Pagina «${page.title}» creata`);
            }}
            onDeleted={(pageId) => {
              editor.forgetPage(pageId);
              if (editor.currentPageId === pageId) {
                const home = editor.pages.find((page) => page.kind === "home");
                if (home) editor.openPage(home.id);
              }
              void editor.refreshOverview();
              showToast("success", "Pagina eliminata");
            }}
            onReordered={editor.setPages}
          />
        );
      case "layers":
        return doc ? (
          <LayersPanel doc={doc} selection={editor.selection} onSelect={select} onHover={setHover} onChange={onDocChange} readOnly={!canEditPages} />
        ) : (
          <PanelLoading />
        );
      case "add":
        return <PalettePanel pageKind={kind} selection={editor.selection} onChange={onDocChange} onSelect={select} readOnly={!canEditPages} />;
      case "theme":
        return <ThemePanel theme={editor.config.theme} readOnly={!canTheme} onChange={(theme, key) => editor.applyConfig((config) => ({ ...config, theme }), key)} />;
      case "menu":
        return (
          <NavigationPanel
            navigation={editor.config.navigation}
            pages={editor.pages}
            readOnly={!canNavigation}
            onChange={(navigation, key) => editor.applyConfig((config) => ({ ...config, navigation }), key)}
          />
        );
      case "chrome":
        return (
          <HeaderFooterPanel
            header={editor.config.header}
            footer={editor.config.footer}
            sponsorTiers={options?.sponsorTiers || []}
            context={{ ...context, readOnly: !canTheme }}
            onHeader={(header, key) => editor.applyConfig((config) => ({ ...config, header }), key)}
            onFooter={(footer, key) => editor.applyConfig((config) => ({ ...config, footer }), key)}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <EditorDragProvider>
      <div className="fixed inset-0 z-40 flex flex-col bg-egw-page-050 font-brand">
        {/* ------------------------------------------------------------ barra */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-egw-hairline bg-white px-2 sm:px-3">
          <Link href="/website" className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[12.5px] font-semibold text-egw-ink-62 hover:bg-egw-page-100 hover:text-egw-ink" aria-label="Torna all'area Sito web">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden md:inline">Sito web</span>
          </Link>
          <div className="hidden min-w-0 flex-col sm:flex">
            <span className="truncate text-[13px] font-semibold text-egw-ink">{current?.page.title || "…"}</span>
            <span className="truncate text-[11px] text-egw-ink-42">{current?.page.path}</span>
          </div>
          {current ? (
            <button
              type="button"
              className="hidden rounded p-1.5 text-egw-ink-62 hover:bg-egw-page-100 hover:text-egw-ink sm:inline-flex"
              onClick={() => setSettingsPageId(current.page.id)}
              aria-label="Impostazioni della pagina"
              title="Titolo, indirizzo e SEO della pagina"
            >
              <Settings2 className="h-4 w-4" />
            </button>
          ) : null}

          <div className="mx-auto flex items-center gap-0.5 rounded-lg bg-egw-page-100 p-0.5" role="group" aria-label="Dispositivo dell'anteprima">
            {DEVICES.map((item) => {
              const Icon = item.icon;
              const active = editor.device === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => editor.setDevice(item.value)}
                  aria-pressed={active}
                  aria-label={item.label}
                  title={item.label}
                  className={`rounded-md p-1.5 ${active ? "bg-white text-egw-blue-700 shadow-sm" : "text-egw-ink-62 hover:text-egw-ink"}`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-0.5">
            <button type="button" onClick={editor.undo} disabled={!editor.canUndo} className="rounded p-1.5 text-egw-ink-62 hover:bg-egw-page-100 disabled:opacity-30" aria-label="Annulla" title="Annulla (Ctrl+Z)">
              <Undo2 className="h-4 w-4" />
            </button>
            <button type="button" onClick={editor.redo} disabled={!editor.canRedo} className="rounded p-1.5 text-egw-ink-62 hover:bg-egw-page-100 disabled:opacity-30" aria-label="Ripristina" title="Ripristina (Ctrl+Shift+Z)">
              <Redo2 className="h-4 w-4" />
            </button>
          </div>

          <SaveIndicator state={editor.saveState} error={editor.saveError} onRetry={() => void editor.saveNow()} />

          <a
            href={previewSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1 rounded-md px-2 py-1.5 text-[12.5px] font-semibold text-egw-ink-62 hover:bg-egw-page-100 hover:text-egw-ink lg:inline-flex"
          >
            <ExternalLink className="h-4 w-4" /> Anteprima
          </a>
          {canPublish ? (
            <Button
              size="sm"
              variant="primary"
              onClick={async () => {
                await editor.saveNow();
                setPublishOpen(true);
              }}
            >
              Pubblica
            </Button>
          ) : null}
        </header>

        {!editor.canEdit ? (
          <div className="flex items-center gap-2 border-b border-egw-hairline bg-egw-tint-amber px-3 py-1.5 text-[12px] text-egw-amber-ink">
            <AlertTriangle className="h-4 w-4" /> {editor.overview.access.message || "Il servizio e sospeso: l'editor e in sola lettura."}
          </div>
        ) : !canEditPages ? (
          <div className="border-b border-egw-hairline bg-egw-page-100 px-3 py-1.5 text-[12px] text-egw-ink-62">Il tuo ruolo puo vedere il sito ma non modificarne le pagine.</div>
        ) : null}

        <div className="relative flex min-h-0 flex-1">
          {/* --------------------------------------------- pannello sinistro */}
          <nav aria-label="Strumenti dell'editor" className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-egw-hairline bg-white py-2">
            {LEFT_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = leftTab === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => {
                    if (active) setLeftOpen((value) => !value);
                    else {
                      setLeftTab(tab.value);
                      setLeftOpen(true);
                    }
                  }}
                  aria-pressed={active}
                  aria-label={tab.label}
                  title={tab.label}
                  className={`rounded-md p-2 ${active ? "bg-egw-tint-blue text-egw-blue-700" : "text-egw-ink-62 hover:bg-egw-page-100 hover:text-egw-ink"}`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </button>
              );
            })}
          </nav>
          <aside
            aria-label={LEFT_TABS.find((tab) => tab.value === leftTab)?.label}
            className={`${leftOpen ? "flex" : "hidden"} absolute bottom-0 left-12 top-0 z-20 w-[min(300px,calc(100vw-3rem))] flex-col border-r border-egw-hairline bg-egw-page-050 shadow-xl lg:static lg:flex lg:w-72 lg:shadow-none`}
          >
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-egw-hairline px-3">
              <h2 className="text-[12.5px] font-semibold text-egw-ink">{LEFT_TABS.find((tab) => tab.value === leftTab)?.label}</h2>
              <button type="button" className="rounded p-1 text-egw-ink-62 lg:hidden" onClick={() => setLeftOpen(false)} aria-label="Chiudi il pannello">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="egw-scroll min-h-0 flex-1 overflow-y-auto">{leftContent}</div>
          </aside>

          {/* --------------------------------------------------- anteprima */}
          <main className="relative min-w-0 flex-1">
            {editor.loadError ? (
              <div className="p-6 text-[13px] text-egw-red" role="alert">
                {editor.loadError}
              </div>
            ) : (
              <PreviewFrame
                src={previewSrc}
                device={editor.device}
                selection={editor.selection}
                selectionFromPreview={selectionFromPreview}
                hover={hover}
                revision={editor.previewRevision}
                onSelect={(target) => {
                  selectionFromPreview.current = true;
                  select(target);
                }}
                onAction={onPreviewAction}
                onNavigate={onPreviewNavigate}
              />
            )}
            <button
              type="button"
              onClick={() => setRightOpen((value) => !value)}
              className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-[12px] font-semibold text-egw-ink shadow lg:hidden"
              aria-expanded={rightOpen}
            >
              <PanelRight className="h-4 w-4" /> Proprieta
            </button>
          </main>

          {/* ------------------------------------------------- inspector */}
          <aside
            aria-label="Proprieta dell'elemento selezionato"
            className={`${rightOpen ? "flex" : "hidden"} absolute bottom-0 right-0 top-0 z-20 w-[min(340px,100vw)] flex-col border-l border-egw-hairline bg-white shadow-xl lg:static lg:flex lg:w-80 lg:shadow-none`}
          >
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-egw-hairline px-3 lg:hidden">
              <h2 className="text-[12.5px] font-semibold text-egw-ink">Proprieta</h2>
              <button type="button" className="rounded p-1 text-egw-ink-62" onClick={() => setRightOpen(false)} aria-label="Chiudi le proprieta">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="egw-scroll min-h-0 flex-1 overflow-y-auto">
              {doc ? (
                <Inspector doc={doc} selection={editor.selection} device={editor.device} issues={editor.issues} context={context} onChange={onDocChange} onSelect={select} />
              ) : (
                <PanelLoading />
              )}
            </div>
          </aside>
        </div>
      </div>

      <PageSettingsDrawer
        page={settingsPage}
        open={Boolean(settingsPage)}
        onClose={() => setSettingsPageId(null)}
        beforeSave={editor.saveNow}
        getVersion={editor.pageVersion}
        onSaved={(page) => {
          editor.replacePageMeta(page);
          showToast("success", "Impostazioni della pagina salvate");
        }}
        readOnly={!canManagePages && !(editor.canEdit && permissions.has("website.seo.manage"))}
      />
      <PublishDrawer open={publishOpen} onOpenChange={setPublishOpen} onPublished={() => void editor.refreshOverview()} />
      <ConflictDialog
        conflict={editor.conflict}
        localDoc={editor.conflict?.scope === "page" ? editor.current?.doc || null : null}
        localConfig={editor.config}
        pageTitle={editor.pages.find((page) => editor.conflict?.scope === "page" && page.id === editor.conflict.pageId)?.title || ""}
        onReload={editor.reloadAfterConflict}
        onForce={editor.forceAfterConflict}
      />
    </EditorDragProvider>
  );
}

function PanelLoading() {
  return (
    <div className="flex items-center gap-2 p-4 text-[12.5px] text-egw-ink-62" role="status">
      <Loader2 className="h-4 w-4 animate-spin" /> Carico la pagina…
    </div>
  );
}

function SaveIndicator({ state, error, onRetry }: { state: SaveState; error: string | null; onRetry: () => void }) {
  const icon =
    state === "saving" ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
    ) : state === "saved" ? (
      <Check className="h-3.5 w-3.5 text-egw-green" />
    ) : state === "error" || state === "conflict" ? (
      <CloudOff className="h-3.5 w-3.5 text-egw-red" />
    ) : (
      <span className="h-2 w-2 rounded-full bg-egw-amber" />
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-egw-ink-62" role="status" aria-live="polite" title={error || undefined}>
      {icon}
      <span className="hidden md:inline">{SAVE_LABELS[state]}</span>
      {state === "error" ? (
        <button type="button" onClick={onRetry} className="text-egw-blue-700 underline">
          Riprova
        </button>
      ) : null}
    </span>
  );
}
