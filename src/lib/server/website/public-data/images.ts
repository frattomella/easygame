import { prisma } from "../../prisma";
import { WEBSITE_MEDIA_ENDPOINT } from "@/lib/rich-text/sanitize";
import type { PublicImage } from "@/lib/website/public-dto";
import type { MediaRef } from "@/lib/website/document/types";

/**
 * **Le immagini pubbliche del sito**: da un identificativo di file a un
 * `PublicImage` con percorso, testo alternativo, dimensioni e punto focale.
 *
 * Un caricamento solo per pagina (`loadMediaMeta`): tutti gli identificativi
 * che i blocchi e i DTO citano si raccolgono e si leggono insieme, invece di
 * una query per immagine.
 */

export type MediaMeta = { alt: string; width: number | null; height: number | null; focalX: number; focalY: number };

export const mediaSrc = (mediaId: string) => `${WEBSITE_MEDIA_ENDPOINT}/${encodeURIComponent(mediaId)}`;

export const loadMediaMeta = async (organizationId: string, ids: Iterable<string>): Promise<Map<string, MediaMeta>> => {
  const unique = Array.from(new Set(Array.from(ids).filter((id) => /^[0-9a-f-]{36}$/i.test(id))));
  if (!unique.length) return new Map();
  const rows = await (prisma as any).websiteMediaMeta.findMany({
    where: { organization_id: organizationId, attachment_id: { in: unique } },
    select: { attachment_id: true, alt_text: true, width: true, height: true, focal_x: true, focal_y: true },
  });
  return new Map(
    rows.map((row: any) => [
      row.attachment_id,
      { alt: row.alt_text || "", width: row.width ?? null, height: row.height ?? null, focalX: row.focal_x ?? 50, focalY: row.focal_y ?? 50 },
    ]),
  );
};

/** Un'immagine dal suo identificativo e dai metadati; l'alt di ripiego descrive cio che e. */
export const toPublicImage = (
  mediaId: string | null | undefined,
  meta: Map<string, MediaMeta>,
  fallbackAlt = "",
  ref?: MediaRef | null,
): PublicImage | null => {
  if (!mediaId) return null;
  const info = meta.get(mediaId);
  return {
    mediaId,
    src: mediaSrc(mediaId),
    alt: String(ref?.alt || info?.alt || fallbackAlt || "").slice(0, 250),
    width: info?.width ?? null,
    height: info?.height ?? null,
    focalX: ref?.focalX ?? info?.focalX ?? 50,
    focalY: ref?.focalY ?? info?.focalY ?? 50,
  };
};

/** Un'immagine servita da una rotta dedicata (logo del club o di uno sponsor storico). */
export const toRouteImage = (src: string, alt: string): PublicImage => ({
  mediaId: "",
  src,
  alt,
  width: null,
  height: null,
  focalX: 50,
  focalY: 50,
});

/** Tutti gli identificativi di file citati in un valore (props, snapshot). */
export const collectMediaRefs = (value: unknown, out: Set<string> = new Set()) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectMediaRefs(item, out));
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.mediaId === "string" && record.mediaId) out.add(record.mediaId);
    Object.values(record).forEach((item) => collectMediaRefs(item, out));
  }
  return out;
};
