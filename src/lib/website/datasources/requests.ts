import { getBlockDefinition } from "../registry";
import {
  bindContext,
  datasourceRequestKey,
  parseDatasourceConfig,
  type DatasourceKey,
  type DatasourceRequest,
  type PageContext,
} from "./contracts";
import type { WebsiteBlock, WebsitePageDocument } from "../document/types";

/**
 * **Da un blocco alla sua richiesta di dati** (ADR-0200 §6, §30).
 *
 * Funzione pura, usata da due parti che devono dire la stessa cosa: il
 * risolutore di pagina (che raccoglie e carica) e il renderer (che cerca il
 * risultato del suo blocco). Una sola funzione, quindi una sola chiave.
 */

export const blockDatasourceRequest = (
  block: Pick<WebsiteBlock, "type" | "props">,
  context: PageContext,
): DatasourceRequest | null => {
  const definition = getBlockDefinition(block.type);
  if (!definition?.datasource) return null;
  const key = definition.datasource.key as DatasourceKey;
  const raw = { ...definition.datasource.config(block.props as never) } as Record<string, unknown>;
  /*
    L'archivio delle news legge categoria e pagina dall'indirizzo: e l'unico
    blocco il cui contenuto dipende dalla query, e la dipendenza e scritta qui
    e non nel renderer, cosi la chiave della richiesta la porta.
  */
  if (block.type === "article-list") {
    const perPage = Number(raw.limit) || 9;
    if (context.articleCategory) raw.category = context.articleCategory;
    const page = Math.max(1, Math.min(500, Number(context.articlePage) || 1));
    raw.offset = (page - 1) * perPage;
    raw.excludeContext = false;
  }
  const config = parseDatasourceConfig(key, raw);
  return bindContext({ key, config } as DatasourceRequest, context);
};

export const blockRequestKey = (block: Pick<WebsiteBlock, "type" | "props">, context: PageContext) => {
  const request = blockDatasourceRequest(block, context);
  return request ? datasourceRequestKey(request) : null;
};

/** Tutte le richieste di una pagina, gia deduplicate. */
export const collectPageRequests = (documents: readonly WebsitePageDocument[], context: PageContext) => {
  const byKey = new Map<string, DatasourceRequest>();
  for (const doc of documents) {
    for (const section of doc.sections) {
      for (const column of section.columns) {
        for (const block of column.blocks) {
          const request = blockDatasourceRequest(block, context);
          if (request) byKey.set(datasourceRequestKey(request), request);
        }
      }
    }
  }
  return byKey;
};
