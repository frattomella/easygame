"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Newspaper, Plus, Search, Star } from "lucide-react";
import { Panel } from "@/components/web/primitives/Surface";
import { Button } from "@/components/web/primitives/Button";
import { SegmentedControl } from "@/components/web/primitives/Controls";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { AlertBlock } from "@/components/web/page/Alerts";
import { EmptyStateCard } from "@/components/web/page/Cards";
import { TextInput } from "@/components/web/forms/Field";
import { useToast } from "@/components/ui/toast-notification";
import { formatDateTime } from "@/lib/web/format";
import { websiteApi, type ArticleDto } from "@/lib/website/client";
import { useWebsiteArea } from "./WebsiteAreaShell";
import { ARTICLE_STATUS, ListSkeleton, thumbUrl, websiteMediaUrl } from "./admin-ui";

/** L'elenco delle news del sito, con filtro per stato e ricerca. */

type StatusFilter = "all" | ArticleDto["status"];

const FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Tutte" },
  { value: "draft", label: "Bozze" },
  { value: "scheduled", label: "Programmate" },
  { value: "published", label: "Pubblicate" },
  { value: "archived", label: "Archiviate" },
];

const dateLine = (article: ArticleDto) => {
  if (article.status === "published" && article.publishedAt) return `Pubblicata il ${formatDateTime(article.publishedAt)}`;
  if (article.status === "scheduled" && article.publishAt) return `Uscira il ${formatDateTime(article.publishAt)}`;
  return article.updatedAt ? `Modificata il ${formatDateTime(article.updatedAt)}` : "";
};

export function NewsList() {
  const router = useRouter();
  const { showToast } = useToast();
  const { overview, can, canEdit } = useWebsiteArea();
  const [filter, setFilter] = React.useState<StatusFilter>("all");
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [articles, setArticles] = React.useState<ArticleDto[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const canWrite = can("website.blog.manage") && canEdit;
  const categories = overview.site?.settings.articleCategories ?? [];

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  React.useEffect(() => {
    let cancelled = false;
    setArticles(null);
    void websiteApi.articles({ status: filter === "all" ? undefined : filter, q: debounced || undefined }).then((result) => {
      if (cancelled) return;
      if (result.error) setError(result.error.message);
      else {
        setError(null);
        setArticles(result.data);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [filter, debounced]);

  const create = async () => {
    setCreating(true);
    const result = await websiteApi.createArticle({ title: "Nuova news" });
    setCreating(false);
    if (result.error) {
      showToast("error", result.error.message);
      return;
    }
    router.push(`/website/news/${result.data.id}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-1 overflow-x-auto px-1">
          <SegmentedControl value={filter} onChange={setFilter} options={FILTERS} aria-label="Filtra per stato" />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 sm:w-72">
            <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca per titolo" aria-label="Cerca nelle news" leading={<Search />} />
          </div>
          {canWrite ? (
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => void create()} loading={creating}>
              Nuova news
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <AlertBlock severity="danger" title="Le news non si possono caricare">{error}</AlertBlock>
      ) : !articles ? (
        <ListSkeleton />
      ) : !articles.length ? (
        <EmptyStateCard
          icon={<Newspaper className="h-6 w-6" />}
          title={debounced || filter !== "all" ? "Nessuna news corrisponde ai filtri" : "Ancora nessuna news"}
          description="Le news compaiono nella pagina News del sito e nei blocchi «Ultime news» delle altre pagine."
          primary={
            canWrite && !debounced && filter === "all" ? (
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => void create()} loading={creating}>
                Scrivi la prima news
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Panel flush>
          <ul className="divide-y divide-egw-hairline">
            {articles.map((article) => (
              <li key={article.id}>
                <Link href={`/website/news/${article.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-egw-page-050 focus-visible:outline-none focus-visible:shadow-egw-focus sm:px-5">
                  <div className="hidden h-14 w-20 shrink-0 overflow-hidden rounded-md border border-egw-hairline bg-egw-page-100 sm:block">
                    {article.cover?.mediaId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbUrl(websiteMediaUrl(article.cover.mediaId), 256)} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 break-words text-[13.5px] font-semibold text-egw-ink">{article.title}</span>
                      {article.featured ? <Star className="h-3.5 w-3.5 shrink-0 fill-egw-amber text-egw-amber" aria-label="In evidenza" /> : null}
                    </div>
                    <p className="mt-0.5 truncate text-[12px] text-egw-ink-62">/news/{article.slug}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <StatusPill status={ARTICLE_STATUS[article.status]} size="sm" />
                      {article.categorySlug ? (
                        <DataChip size="sm">{categories.find((category) => category.slug === article.categorySlug)?.label ?? article.categorySlug}</DataChip>
                      ) : null}
                      <span className="text-[11.5px] text-egw-ink-62">{dateLine(article)}</span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
