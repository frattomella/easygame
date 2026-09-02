import { NextResponse } from "next/server";
import { athleteWithinAccessScope } from "@/lib/server/access-scope-query";
import { canAccessClubResource } from "@/lib/access-roles";
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
/**
 * **Gli archivi verso cui questa rotta accetta di rimandare.**
 *
 * `avatar_url` e una colonna che la segreteria compila, e un `302` verso un
 * indirizzo arbitrario fa di questa rotta un rimando aperto ospitato dal
 * dominio dell'applicazione: il collegamento che gira e `easygame.../avatar`,
 * e chi lo apre finisce altrove. Chi lo riceve non e detto che sia del club.
 *
 * L'elenco e vuoto per difetto — oggi le foto caricate diventano `data:` e
 * non hanno bisogno di nessun rimando — e si allarga da
 * `EASYGAME_TRUSTED_MEDIA_HOSTS`, che elenca gli host separati da virgola. Le
 * foto degli account esterni (OAuth) stanno su Google, e sono l'unico caso
 * gia noto.
 */
const HOST_DI_MEDIA_FIDATI = new Set(
  [
    "lh3.googleusercontent.com",
    ...String(process.env.EASYGAME_TRUSTED_MEDIA_HOSTS || "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  ],
);

const isTrustedAvatarHost = (value: string) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return HOST_DI_MEDIA_FIDATI.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
};

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

    const athlete = await prisma.athlete.findUnique({
      where: { id: context.params.id },
      select: { id: true, organization_id: true, avatar_url: true, data: true, updated_at: true },
    });

    if (!athlete) return notFound();

    /*
      **Il club dell'atleta si passa come club preferito, e il ruolo si risolve
      per quello.**

      Un `<img src>` non manda `x-active-club-id`: autorizzare sul club attivo
      farebbe sparire le foto agli utenti multi-club, e il difetto si
      presenterebbe come «alcune foto non si caricano», che e la forma piu
      difficile da diagnosticare.

      Ma l'elenco dei club **da solo** non e un confine, ed e la lezione di
      questa Wave: il permesso si verifica con un ruolo, e quel ruolo deve
      essere il ruolo **in quel club**. Passando l'organizzazione dell'atleta
      come club preferito, `resolveOrganizationScopeForUser` risolve il ruolo
      li — e i due controlli parlano dello stesso club. E la stessa forma delle
      rotte che la revisione ha giudicato corrette: la firma del club, il libro
      soci, le causali fiscali.
    */
    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      athlete.organization_id,
    );

    if (!scope.allowedOrganizationIds.includes(athlete.organization_id)) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Accesso negato: l'atleta appartiene a un altro club" },
        },
        { status: 403 },
      );
    }

    if (!canAccessClubResource(scope.activeRole, "athletes", "read")) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Accesso negato per il ruolo attivo" },
        },
        { status: 403 },
      );
    }

    /*
      **Il perimetro vale anche per una foto.**

      La rotta appartiene al dominio `athletes`, ed era l'unica sua superficie
      a non consultare il perimetro di sede e categoria: il volto di un minore
      di un'altra sede usciva con un 200. La catena e completa e misurata —
      l'elenco degli allegati dava gli identificativi, questa rotta dava le
      facce.

      Il ramo `attachment:` sarebbe stato salvato da `readAttachment`; i rami
      `data:` (storico, e il commento di questa rotta dichiara che esiste
      ancora) e `https:` consegnano i byte direttamente.
    */
    const dentroIlPerimetro = await athleteWithinAccessScope(
      athlete.organization_id,
      athlete.id,
      scope,
    );
    if (!dentroIlPerimetro) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Accesso negato: questo atleta e fuori dal perimetro di sede o categoria del ruolo attivo",
          },
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

      /*
        **Questa rotta consegna una foto, e consegnava qualunque cosa.**

        L'identificativo arriva da `avatar_url` / `data.avatar`, cioe da un
        campo che chiunque possa scrivere l'anagrafica influenza. Poi finiva in
        `readAttachment`, che verifica il club e — da questa Wave — il
        perimetro, ma **non** la categoria: piantando li il riferimento a un
        certificato medico, un allenatore lo scaricava da qui mentre le due
        porte dei documenti gli rispondevano 403.

        Il difetto strutturale e a monte — ogni rotta che passa a
        `readAttachment` un identificativo influenzabile dal client aggira
        `attachment-permissions.ts` — e questa e oggi l'unica. Si chiude
        dicendo cosa questa rotta serve: **un'immagine**. Qualunque altra cosa
        e nel posto sbagliato, e il posto giusto ha le sue guardie.
      */
      const tipo = String(attachment.metadata.mimeType || "").toLowerCase();
      if (!tipo.startsWith("image/")) {
        return notFound();
      }

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

    /*
      **Un URL esterno: si rimanda li invece di fare da proxy — ma il valore
      lo scrive il club.**

      `avatar_url` e una colonna che la segreteria compila. Un `302` verso un
      indirizzo arbitrario fa di questa rotta un rimando aperto ospitato dal
      dominio dell'applicazione: il collegamento che si manda in giro e
      `easygame.../avatar`, e chi lo apre finisce altrove.

      Non e una vulnerabilita del club contro se stesso — la colonna la scrive
      chi ha gia accesso — ma il dominio che presta la sua faccia e quello del
      prodotto, e chi riceve il collegamento non e detto che sia del club.

      Si rimanda quindi solo verso gli archivi che l'applicazione usa davvero.
    */
    if (/^https?:\/\//i.test(stored)) {
      if (!isTrustedAvatarHost(stored)) {
        return notFound();
      }
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
