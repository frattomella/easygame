"use client";

import { useParams } from "next/navigation";
import { WebsiteAreaShell } from "@/components/website/admin/WebsiteAreaShell";
import { ArticleEditor } from "@/components/website/admin/ArticleEditor";

/** `/website/news/[id]` — l'editor di una news del sito. */
export default function WebsiteArticlePage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
  return (
    <WebsiteAreaShell title="Modifica news">
      {id ? <ArticleEditor key={id} articleId={id} /> : null}
    </WebsiteAreaShell>
  );
}
