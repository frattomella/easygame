"use client";

import * as React from "react";
import { Button } from "@/components/web/primitives/Button";
import { formatInteger } from "@/lib/web/format";
import { agree, type GridNoun } from "@/lib/web/nouns";

/**
 * Il piede di una griglia che mostra **una pagina del servizio** (`offset`,
 * `limit`): la griglia sa paginare cio che ha in mano, ma qui in mano c'e
 * solo quella pagina, quindi il suo piede resta spento (`hideFooter`) e
 * questa banda chiede al servizio la pagina prima o quella dopo. Le parole
 * («Movimenti da 1 a 100 di 1.240», «Precedenti · Successivi») si accordano
 * al nome della cosa.
 */
export function ServerPager({
  offset,
  limit,
  count,
  total,
  busy,
  onPageChange,
  noun = { singular: "riga", plural: "righe" },
}: {
  offset: number;
  limit: number;
  count: number;
  total: number;
  busy: boolean;
  onPageChange: (nextOffset: number) => void;
  noun?: GridNoun;
}) {
  if (count === 0) return null;
  const first = offset + 1;
  const last = offset + count;
  const label = noun.plural.charAt(0).toUpperCase() + noun.plural.slice(1);
  return (
    <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-3 border-t border-egw-hairline bg-egw-page-100 px-4 py-1.5 font-brand text-[12px] text-egw-ink-62">
      <span>
        {label} da <strong className="egw-num text-egw-ink">{formatInteger(first)}</strong> a{" "}
        <strong className="egw-num text-egw-ink">{formatInteger(last)}</strong> di{" "}
        <strong className="egw-num text-egw-ink">{formatInteger(total)}</strong>
      </span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={offset <= 0 || busy} onClick={() => onPageChange(Math.max(0, offset - limit))}>
          Precedenti
        </Button>
        <Button variant="secondary" size="sm" disabled={last >= total || busy} onClick={() => onPageChange(offset + limit)}>
          {agree(noun, 2, "Successiv")}
        </Button>
      </div>
    </div>
  );
}
