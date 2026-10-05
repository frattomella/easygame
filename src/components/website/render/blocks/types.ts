import type { ReactNode } from "react";
import type { WebsiteBlock } from "@/lib/website/document/types";
import type { DatasourceResult } from "@/lib/website/public-dto";
import type { RenderContext } from "../context";

/**
 * La firma di un renderer di blocco. Riceve le props gia validate dal
 * registry e il risultato della sua sorgente dati gia risolto: non legge
 * niente da solo.
 */
export type BlockRendererProps<P = any> = {
  block: WebsiteBlock;
  props: P;
  context: RenderContext;
  data: DatasourceResult<any> | null;
};

export type BlockRenderer<P = any> = (props: BlockRendererProps<P>) => ReactNode;

/** I dati di un risultato `ok`/`empty`, o il ripiego. */
export const dataOf = <T,>(result: DatasourceResult<any> | null, fallback: T): T =>
  result && (result.status === "ok" || result.status === "empty") ? (result.data as T) : fallback;

/** Il motivo per cui non ci sono dati, per l'anteprima. */
export const reasonOf = (result: DatasourceResult<any> | null) =>
  !result
    ? "nessuna sorgente dati"
    : result.status === "unavailable" || result.status === "error"
      ? result.reason
      : result.status === "empty"
        ? "il gestionale non ha ancora questi dati"
        : "";
