import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  createAttachment,
  listAttachments,
} from "@/lib/server/attachments";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";
import { MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import { canManageClubConfiguration } from "@/lib/access-roles";
import {
  attachmentDenied,
  canAccessAttachmentOwner,
} from "@/lib/server/attachment-permissions";
import { hasCommunicationPermission } from "@/lib/communications/permissions";
import { hasHealthPermission } from "@/lib/health/permissions";
import { isMedicalCertificateDocumentKind } from "@/lib/documents/request-model";

/**
 * Allegati: elenco e caricamento.
 *
 *   GET  /api/v1/attachments?owner_type=athlete&owner_id=…   metadati, mai byte
 *   POST /api/v1/attachments                                 multipart/form-data
 *
 * **Perche multipart e non JSON con base64.** Base64 costa il 33% in piu, e
 * caricare un PDF da 8 MB come stringa JSON vuol dire tenerne in memoria tre
 * copie fra parsing e decodifica. Il browser sa gia inviare un file: qui lo si
 * lascia fare.
 *
 * L'autorizzazione e quella di sempre: sessione valida, poi
 * `organization_id` risolto dallo scope. Un allegato non e mai «pubblico».
 */

export const runtime = "nodejs";

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

const failure = (error: any, fallback: string) => {
  const message = String(error?.message || fallback);
  const status = message.includes("Accesso negato") ? 403 : 400;
  return NextResponse.json({ data: null, error: { message } }, { status });
};

/**
 * Il testo di una parte del form, oppure `null` se non c'e.
 *
 * Un `File` in un campo che deve essere una data non e testo: trattarlo come
 * tale scriverebbe «[object File]» dentro un campo data e lo farebbe rifiutare
 * con un messaggio che non aiuta nessuno.
 */
const formText = (value: FormDataEntryValue | null) =>
  typeof value === "string" ? value : null;

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const url = new URL(request.url);
    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      url.searchParams.get("organization_id") ||
        request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    const ownerType = String(url.searchParams.get("owner_type") || "")
      .trim()
      .toLowerCase();

    /*
      Gli allegati di un annuncio seguono il **pubblico dell'annuncio**, non la
      sola appartenenza al club: `?owner_type=announcement` — anche **senza**
      `owner_id` — restituiva a qualunque membro i metadati di ogni allegato di
      ogni annuncio, bozze comprese, e da li si scaricava per identificativo.
    */
    const governaLaBacheca = hasCommunicationPermission(
      scope.activeRole,
      "board.publish",
    );

    if (ownerType === "announcement" && !governaLaBacheca) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Accesso negato: gli allegati della bacheca si elencano da chi la pubblica",
          },
        },
        { status: 403 },
      );
    }

    /*
      **E il permesso di cio a cui l'allegato appartiene.**

      Fuori dai due casi qui sopra non c'era nessun controllo di ruolo: un
      genitore elencava e scaricava le carte d'identita e i certificati medici
      di tutto il club, e senza filtro l'elenco li restituiva tutti insieme.
      La rotta dedicata degli atleti lo rifiutava gia; questa, che consegna gli
      stessi file, no.

      Senza `owner_type` l'elenco attraversa **tutti** i tipi: lo puo chiedere
      solo chi potrebbe chiederli uno per uno.
    */
    if (ownerType) {
      if (!canAccessAttachmentOwner(scope.activeRole, ownerType, "read")) {
        return failure(attachmentDenied(ownerType), "Accesso negato");
      }
    } else if (!canManageClubConfiguration(scope.activeRole)) {
      return failure(
        new Error(
          "Accesso negato: l'elenco di tutti gli allegati del club lo vede chi lo amministra; " +
            "per gli altri serve «owner_type»",
        ),
        "Accesso negato",
      );
    }

    const attachments = await listAttachments(
      {
        organizationId: url.searchParams.get("organization_id"),
        ownerType: url.searchParams.get("owner_type"),
        ownerId: url.searchParams.get("owner_id"),
        category: url.searchParams.get("category"),
      },
      scope,
    );

    /*
      **E l'elenco senza filtro non e una scorciatoia.** Rifiutare solo
      `owner_type=announcement` lasciava aperta la porta piu larga: `GET
      /api/v1/attachments` **senza** parametri restituiva tutto il club,
      annunci compresi, e da quegli identificativi si arrivava ai byte. Chi non
      governa la bacheca non li vede, punto.
    */
    const visibili = governaLaBacheca
      ? attachments
      : attachments.filter(
          (allegato: { ownerType?: string }) =>
            String(allegato?.ownerType || "").toLowerCase() !== "announcement",
        );

    /*
      **Il documento sanitario esce dall'elenco, non solo dai byte.**

      Il controllo per `owner_type` qui sopra non lo copre: la categoria di
      una riga la conosce la riga, non il parametro che il client ha
      mandato. Senza questo passaggio un allenatore, che gli atleti li legge
      legittimamente, otterrebbe l'elenco dei certificati medici del club —
      nome del file, data, identificativo — e da un identificativo si bussa
      alla porta dei byte. Il taglio di D-4 vale su ogni strada che porta al
      campo (ADR-0058), e questa e una strada.
    */
    const senzaDatoClinico = hasHealthPermission(
      scope.activeRole,
      "clinical.read",
    )
      ? visibili
      : visibili.filter(
          (allegato: { category?: string }) =>
            !isMedicalCertificateDocumentKind(allegato?.category),
        );

    return NextResponse.json({ data: senzaDatoClinico, error: null });
  } catch (error: any) {
    return failure(error, "Errore nella lettura degli allegati");
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    const form = await request.formData();
    const file = form.get("file");

    /*
      Un allegato con `owner_type: "club"` **e** configurazione del club — la
      firma del presidente e il timbro sono i primi, e finiscono dentro i
      documenti che la societa emette. Lo governa il permesso che gia governa
      la configurazione, non un permesso nuovo (FIRMA-01). Gli allegati delle
      persone non cambiano perimetro.
    */
    // `createAttachment` normalizza il proprietario in minuscolo: se la
    // guardia confrontasse la stringa cosi com'e, `owner_type=CLUB`
    // supererebbe il controllo e verrebbe salvato come `club`.
    /*
      L'allegato di un **annuncio** segue la stessa regola: lo carica chi puo
      pubblicare in bacheca, che oggi e lo stesso perimetro di
      `canManageClubConfiguration` (`src/lib/communications/permissions.ts`).
      Senza questa riga un allenatore potrebbe caricare un file e poi
      allegarlo a un annuncio che non puo pubblicare — un file orfano dentro
      l'archivio del club, senza nessuno che risponda di averlo messo li.
    */
    const ownerTypeCaricato = String(form.get("owner_type") || "other")
      .trim()
      .toLowerCase();

    if (
      (ownerTypeCaricato === "club" || ownerTypeCaricato === "announcement") &&
      !canManageClubConfiguration(scope.activeRole)
    ) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Accesso negato: gli allegati del club li gestisce chi ne gestisce la configurazione",
          },
        },
        { status: 403 },
      );
    }

    /*
      **E per tutti gli altri tipi, il permesso di cio a cui si attacca.**

      La correzione che ha chiuso lettura, modifica e cancellazione si era
      fermata a tre verbi su quattro: `POST` restava sorvegliato solo per i due
      tipi qui sopra. Un genitore poteva quindi depositare un file nella
      cartella di un atleta di un'altra famiglia — `owner_type=athlete`,
      `category=certificato-medico` — e quel file compariva alla segreteria
      fra i documenti di quel ragazzo, indistinguibile da uno vero.

      Non e un furto di dati ma un avvelenamento dell'archivio, ed e la stessa
      dimenticanza di sempre: la guardia messa sulle porte che si erano viste,
      non su tutte quelle che ci sono.
    */
    if (!canAccessAttachmentOwner(scope.activeRole, ownerTypeCaricato, "create")) {
      return NextResponse.json(
        {
          data: null,
          error: { message: attachmentDenied(ownerTypeCaricato).message },
        },
        { status: 403 },
      );
    }

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { data: null, error: { message: "Nessun file ricevuto." } },
        { status: 400 },
      );
    }

    /*
      Il controllo di dimensione si fa prima di leggere i byte: `arrayBuffer()`
      su un file da 200 MB li porta tutti in memoria prima che qualcuno possa
      rifiutarli.
    */
    if (Number(file.size || 0) > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: `Il file supera il limite di ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB.`,
          },
        },
        { status: 413 },
      );
    }

    const content = Buffer.from(await file.arrayBuffer());

    const metadata = await createAttachment(
      {
        organizationId: String(form.get("organization_id") || "") || null,
        ownerType: String(form.get("owner_type") || "other"),
        ownerId: String(form.get("owner_id") || ""),
        category: String(form.get("category") || "documento"),
        fileName: String(form.get("file_name") || file.name || "documento"),
        mimeType: String(form.get("mime_type") || file.type || ""),
        content,
        /*
          La validita del documento (Wave 3, W3-G). Due parti facoltative del
          form: chi non le manda carica un allegato senza scadenza, che e come
          si e sempre comportato ogni caricamento fino a qui. Le valida
          Attachment Core, che e anche l'unico posto in cui l'intervallo
          rovesciato viene rifiutato.
        */
        validFrom: formText(form.get("valid_from")),
        validUntil: formText(form.get("valid_until")),
      },
      scope,
    );

    await recordAuditEvent({
      action: AUDIT_ACTIONS.resourceCreated,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: scope.activeRole,
      organizationId: metadata.organizationId,
      resource: "attachments",
      resourceId: metadata.id,
      request,
      metadata: {
        ownerType: metadata.ownerType,
        ownerId: metadata.ownerId,
        category: metadata.category,
        sizeBytes: metadata.sizeBytes,
        mimeType: metadata.mimeType,
      },
    });

    return NextResponse.json({ data: metadata, error: null }, { status: 201 });
  } catch (error: any) {
    return failure(error, "Caricamento dell'allegato non riuscito");
  }
}
