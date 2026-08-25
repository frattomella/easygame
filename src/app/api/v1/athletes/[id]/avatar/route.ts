import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import { readAttachment } from "@/lib/server/attachments";
import { parseAttachmentReference } from "@/lib/attachments";

/**
 * La foto di un atleta, come immagine.
 *
 * **Perche esiste** (Blocco 8, punto E). Portati gli allegati fuori dai
 * record, la lista Atleti di 200 tesserati e stata rimisurata: **23,7 MB**,
 * praticamente identica a prima. Il motivo e che `view=summary` (WP-31)
 * toglieva tutti gli allegati **tranne l'avatar**, che la lista mostra e che
 * quindi viaggiava come data URL base64 — 90 kB per atleta, 18 MB per club,
 * dentro una risposta JSON che il browser deve scaricare tutta prima di
 * disegnare la prima riga.
 *
 * Un'immagine non e un dato: e una risorsa. Servita da qui diventa un normale
 * `<img src>` — il browser la scarica in parallelo alle altre, la mette in
 * cache, e la lista arriva in poche centinaia di kB.
 *
 * **Legge tutte e tre le forme** in cui una foto puo esistere oggi, perche
 * nessun archivio esistente deve smettere di mostrare i volti:
 *
 * 1. un riferimento ad allegato (`attachment:<id>`), la forma nuova;
 * 2. un data URL base64 in `avatar_url` o in `data.avatar`, la forma legacy;
 * 3. un URL http, per chi l'ha caricata altrove.
 */

export const runtime = "nodejs";

type Context = { params: { id: string } };

const notFound = () =>
  NextResponse.json(
    { data: null, error: { message: "Foto non trovata" } },
    { status: 404 },
  );

/** Da data URL a byte, oppure `null`. */
const decodeDataUrl = (value: string) => {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/is.exec(value);
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  const body = match[3];

  try {
    return {
      mimeType,
      content: match[2]
        ? Buffer.from(body, "base64")
        : Buffer.from(decodeURIComponent(body), "utf8"),
    };
  } catch {
    return null;
  }
};

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: null, error: { message: "Accesso negato: sessione assente" } },
        { status: 401 },
      );
    }

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    const athlete = await prisma.athlete.findUnique({
      where: { id: context.params.id },
      select: { id: true, organization_id: true, avatar_url: true, data: true, updated_at: true },
    });

    if (!athlete) return notFound();

    if (!scope.allowedOrganizationIds.includes(athlete.organization_id)) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Accesso negato: l'atleta appartiene a un altro club" },
        },
        { status: 403 },
      );
    }

    const inlineAvatar =
      athlete.data && typeof athlete.data === "object" && !Array.isArray(athlete.data)
        ? String((athlete.data as Record<string, any>).avatar || "")
        : "";
    const stored = String(athlete.avatar_url || "").trim() || inlineAvatar;

    if (!stored) return notFound();

    /*
      La cache e privata e validata: `private` perche e un dato di club,
      l'ETag perche una foto non cambia quasi mai e ricaricarla a ogni
      apertura della lista e proprio il costo che questo endpoint elimina.
    */
    const etag = `"${athlete.id}-${athlete.updated_at.getTime()}"`;
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers: { ETag: etag } });
    }

    const headers = (mimeType: string, length: number) => ({
      "Content-Type": mimeType,
      "Content-Length": String(length),
      "Cache-Control": "private, max-age=300, must-revalidate",
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
    });

    const attachmentId = parseAttachmentReference(stored);
    if (attachmentId) {
      const attachment = await readAttachment(attachmentId, scope);
      if (!attachment) return notFound();

      return new NextResponse(new Uint8Array(attachment.content), {
        status: 200,
        headers: headers(attachment.metadata.mimeType, attachment.content.length),
      });
    }

    const decoded = decodeDataUrl(stored);
    if (decoded) {
      return new NextResponse(new Uint8Array(decoded.content), {
        status: 200,
        headers: headers(decoded.mimeType, decoded.content.length),
      });
    }

    // Un URL esterno: si rimanda li invece di fare da proxy.
    if (/^https?:\/\//i.test(stored)) {
      return NextResponse.redirect(stored, 302);
    }

    return notFound();
  } catch (error: any) {
    const message = String(error?.message || "Errore nella lettura della foto");
    return NextResponse.json(
      { data: null, error: { message } },
      { status: message.includes("Accesso negato") ? 403 : 400 },
    );
  }
}
