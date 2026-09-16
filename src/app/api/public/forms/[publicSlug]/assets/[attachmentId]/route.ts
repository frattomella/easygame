import { NextResponse } from "next/server";
import { readRequestId, reportServerError } from "@/lib/server/observability";
import { findPublicFormBySlug } from "@/lib/server/forms";
import { readAttachment } from "@/lib/server/attachments";
import { buildStoredFileResponse } from "@/lib/server/stored-file-response";
import {
  AUTH_RATE_LIMITS,
  consumeAuthRateLimit,
  getRequestIp,
  rateLimitHeaders,
} from "@/lib/server/auth-rate-limit";

/**
 * Le immagini dei blocchi di contenuto di un modulo pubblico (ADR-0190 §2).
 *
 *   GET /api/public/forms/:slug/assets/:attachmentId
 *
 * Serve **solo** un allegato che sia del modulo indicato dallo slug
 * (`owner_type = form`, `owner_id = modulo`), della categoria del contenuto
 * (`contenuto-modulo`) e che sia un'immagine. Tutto il resto — un allegato
 * di una compilazione, un certificato, un file di un altro modulo — e lo
 * stesso 404 del modulo. Non c'e nessun elenco: chi ha il link vede le
 * immagini che il club ha messo nel modulo, e nient'altro.
 */

export const runtime = "nodejs";

type Context = { params: { publicSlug: string; attachmentId: string } };

const CONTENT_CATEGORY = "contenuto-modulo";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const notFound = () =>
  NextResponse.json({ data: null, error: { message: "Modulo non disponibile" } }, { status: 404 });

export async function GET(request: Request, context: Context) {
  try {
    const limit = await consumeAuthRateLimit(AUTH_RATE_LIMITS.publicFormView, getRequestIp(request));
    if (!limit.allowed) {
      return NextResponse.json(
        { data: null, error: { message: "Troppe richieste. Riprova fra qualche minuto.", code: "RATE_LIMITED" } },
        { status: 429, headers: rateLimitHeaders(limit as any) },
      );
    }
    const id = String(context.params.attachmentId || "").trim();
    if (!UUID.test(id)) return notFound();

    const match = await findPublicFormBySlug(context.params.publicSlug);
    if (!match) return notFound();

    const attachment = await readAttachment(id);
    if (!attachment) return notFound();
    const meta = attachment.metadata;
    if (
      meta.organizationId !== match.organizationId ||
      meta.ownerType !== "form" ||
      meta.ownerId !== match.templateId ||
      meta.category !== CONTENT_CATEGORY ||
      !String(meta.mimeType || "").toLowerCase().startsWith("image/")
    ) {
      return notFound();
    }

    const response = buildStoredFileResponse({
      content: attachment.content,
      mimeType: meta.mimeType,
      fileName: meta.fileName,
    });
    /* Un'immagine di un modulo pubblico si puo tenere in cache: non e un dato di persona. */
    response.headers.set("Cache-Control", "public, max-age=3600");
    return response;
  } catch (error) {
    reportServerError(error, {
      requestId: readRequestId(request),
      route: "/api/public/forms/[publicSlug]/assets/[attachmentId]",
      method: "GET",
    });
    return notFound();
  }
}
