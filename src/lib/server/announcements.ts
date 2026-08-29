import { prisma } from "./prisma";
import { resolveAudience, type AudienceScope } from "./audience";
import {
  buildDedupKey,
  claimDelivery,
  countDeliveriesBySource,
  listDeliveriesForRecipient,
  listDeliveriesForSource,
  markDeliveryRead,
  settleDelivery,
} from "./communication-deliveries";
import {
  ANNOUNCEMENT_RESOURCE_TYPE,
  announcementShelf,
  isAnnouncementDueForPublication,
  isAnnouncementVisible,
  normalizeAnnouncementDraft,
  readAnnouncement,
  sortAnnouncements,
  type Announcement,
} from "@/lib/announcements/model";
import {
  assertCommunicationPermission,
  hasCommunicationPermission,
} from "@/lib/communications/permissions";

/**
 * La bacheca del club (W2-D, gap G-08).
 *
 * **Perche `club_resource_items` e non una tabella nuova.** Un annuncio e una
 * risorsa di club come una categoria o un allenamento: ha un club, un nome, uno
 * stato, una data e un corpo libero. La tabella esiste, porta gia
 * `organization_id` con il suo indice, e non c'e niente in un annuncio che
 * chieda colonne proprie.
 *
 * **Perche pero non passa dal registro generico di `resources.ts`.**
 * Aggiungere un tipo a `CLUB_RESOURCE_TYPES` lo aggiunge anche a
 * `CLUB_JSON_FIELDS`, cioe pretende una colonna `Json?` su `clubs` da tenere
 * sincronizzata: e esattamente la duplicazione D-B gia registrata come debito.
 * Qui si scrivono le righe direttamente, con `organization_id` sempre nel
 * `where`, e il perimetro lo verifica questo modulo.
 *
 * **Il pubblico e lo stesso oggetto delle comunicazioni.** Un annuncio non ha
 * un suo modo di dire «Under 14»: riusa i criteri dell'audience engine
 * (ADR-0087). Cosi «chi lo legge» e «a chi ho scritto» si rispondono con la
 * stessa domanda.
 */

const asText = (value: unknown) => String(value ?? "").trim();

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

const itemClient = () => (prisma as any).clubResourceItem;

const resolveOrganizationId = (
  scope: AudienceScope | undefined,
  requested?: string | null,
) => {
  const wanted = asText(requested);

  if (!scope) {
    if (!wanted) throw new Error("Nessun club indicato");
    return wanted;
  }
  if (!scope.activeOrganizationId) {
    throw new Error("Nessun club attivo selezionato");
  }
  if (wanted && wanted !== scope.activeOrganizationId) {
    throw denied("si pubblica sul club attivo, non su un altro");
  }
  if (!scope.allowedOrganizationIds.includes(scope.activeOrganizationId)) {
    throw denied("il club indicato non e fra quelli a cui hai accesso");
  }

  return scope.activeOrganizationId;
};

const boardDedupKey = (announcementId: string) =>
  buildDedupKey("board", announcementId);

/** Legge una riga dell'annuncio **dentro il club**, o solleva. */
const requireAnnouncementRow = async (
  organizationId: string,
  announcementId: string,
) => {
  const row = await itemClient().findFirst({
    where: {
      id: announcementId,
      organization_id: organizationId,
      resource_type: ANNOUNCEMENT_RESOURCE_TYPE,
    },
  });

  /*
    Un annuncio di un altro club e un annuncio che non esiste: rispondere
    «non tuo» invece di «non trovato» direbbe a chi prova identificativi a caso
    quando ha indovinato.
  */
  if (!row) throw new Error("Annuncio non trovato");

  return row;
};

const persist = async ({
  organizationId,
  announcement,
  id,
}: {
  organizationId: string;
  announcement: Omit<Announcement, "id" | "createdAt" | "updatedAt">;
  id?: string;
}) => {
  const data = {
    organization_id: organizationId,
    resource_type: ANNOUNCEMENT_RESOURCE_TYPE,
    name: announcement.title,
    status: announcement.status,
    date: announcement.publishAt ? new Date(announcement.publishAt) : null,
    payload: {
      title: announcement.title,
      body: announcement.body,
      status: announcement.status,
      publishAt: announcement.publishAt,
      expiresAt: announcement.expiresAt,
      publishedAt: announcement.publishedAt,
      criteria: announcement.criteria,
      attachmentIds: announcement.attachmentIds,
      authorUserId: announcement.authorUserId,
    },
  };

  if (id) {
    /*
      L'aggiornamento passa da `updateMany` con il club nel `where`: un
      `update` per chiave primaria scriverebbe anche su una riga di un'altra
      societa se l'identificativo arrivasse da fuori.
    */
    const updated = await itemClient().updateMany({
      where: {
        id,
        organization_id: organizationId,
        resource_type: ANNOUNCEMENT_RESOURCE_TYPE,
      },
      data,
    });
    if (Number(updated?.count || 0) === 0) {
      throw new Error("Annuncio non trovato");
    }
    return readAnnouncement(await requireAnnouncementRow(organizationId, id));
  }

  return readAnnouncement(await itemClient().create({ data }));
};

export type AnnouncementView = Announcement & {
  shelf: ReturnType<typeof announcementShelf>;
  /** Quante persone lo vedranno o lo hanno visto in applicazione. */
  audienceCount: number;
  readCount: number;
};

/**
 * Gli annunci del club, **per chi li governa**.
 *
 * **Perche `board.publish` e non `board.read`.** Questa lettura non rispetta il
 * pubblico: restituisce ogni annuncio del club, bozze comprese, con il corpo
 * intero, i criteri scelti e i conteggi di lettura. `board.read` ce l'hanno
 * tutti i ruoli — e definito «leggere gli avvisi **destinati a se**» — quindi
 * proteggerla con quello significava che un genitore, chiamando la rotta senza
 * `?mine=1`, leggeva la bacheca intera della societa: le bozze mai pubblicate,
 * gli avvisi di altre categorie, e — quando il criterio scelto era «chi non ha
 * pagato» — il fatto che la segreteria avesse scritto alle famiglie in
 * arretrato, con quante fossero.
 *
 * Chi ha `board.read` e basta legge la **sua** bacheca, da
 * `readAnnouncementsForUser`, che filtra sulle consegne. Sono due domande
 * diverse e adesso hanno due permessi diversi.
 */
export const listAnnouncements = async ({
  organizationId,
  scope,
  now = new Date(),
}: {
  organizationId?: string | null;
  scope?: AudienceScope;
  now?: Date;
}): Promise<AnnouncementView[]> => {
  const clubId = resolveOrganizationId(scope, organizationId);
  assertCommunicationPermission(scope?.activeRole, "board.publish");

  const rows = await itemClient().findMany({
    where: {
      organization_id: clubId,
      resource_type: ANNOUNCEMENT_RESOURCE_TYPE,
    },
  });

  const announcements = sortAnnouncements(rows.map(readAnnouncement));

  const byAnnouncement = await countDeliveriesBySource({
    organizationId: clubId,
    sourceKind: "board",
  });

  return announcements.map((announcement) => {
    const counts = byAnnouncement.get(announcement.id) || { total: 0, read: 0 };
    return {
      ...announcement,
      shelf: announcementShelf(announcement, now),
      audienceCount: counts.total,
      readCount: counts.read,
    };
  });
};

export const createAnnouncement = async ({
  organizationId,
  draft,
  scope,
  actorUserId,
}: {
  organizationId?: string | null;
  draft: unknown;
  scope?: AudienceScope;
  actorUserId?: string | null;
}) => {
  const clubId = resolveOrganizationId(scope, organizationId);
  assertCommunicationPermission(scope?.activeRole, "board.publish");

  const normalized = normalizeAnnouncementDraft(draft);

  return persist({
    organizationId: clubId,
    announcement: {
      ...normalized,
      attachmentIds: normalized.attachmentIds || [],
      publishAt: normalized.publishAt ?? null,
      expiresAt: normalized.expiresAt ?? null,
      status: "draft",
      publishedAt: null,
      authorUserId: asText(actorUserId) || null,
    },
  });
};

export const updateAnnouncement = async ({
  organizationId,
  announcementId,
  draft,
  scope,
}: {
  organizationId?: string | null;
  announcementId: string;
  draft: unknown;
  scope?: AudienceScope;
}) => {
  const clubId = resolveOrganizationId(scope, organizationId);
  assertCommunicationPermission(scope?.activeRole, "board.publish");

  const existing = readAnnouncement(
    await requireAnnouncementRow(clubId, announcementId),
  );
  const normalized = normalizeAnnouncementDraft(draft);

  return persist({
    organizationId: clubId,
    announcement: {
      ...normalized,
      attachmentIds: normalized.attachmentIds || [],
      publishAt: normalized.publishAt ?? null,
      expiresAt: normalized.expiresAt ?? null,
      /*
        Modificare un annuncio gia pubblicato non lo ripubblica: le consegne
        restano quelle, e chi lo aveva letto lo ha letto. Ripubblicarlo
        rifarebbe suonare la campanella a tutto il club per una virgola.
      */
      status: existing.status,
      publishedAt: existing.publishedAt,
      authorUserId: existing.authorUserId,
    },
    id: announcementId,
  });
};

export type PublishOutcome = {
  announcementId: string;
  /** Quante persone lo vedranno in applicazione. */
  delivered: number;
  /** Chi non ha un account e quindi non ha un posto dove leggerlo. */
  withoutAccount: number;
  alreadyDelivered: number;
};

/**
 * Pubblica, e scrive **una consegna per lettore**.
 *
 * **Perche una riga per lettore e non un flag sull'annuncio.** «L'ha letto?» e
 * una domanda per persona, e il registro delle consegne la risponde gia per
 * ogni altro canale: un secondo meccanismo di letto/non letto solo per la
 * bacheca sarebbe il quarto dialetto che questa Wave esiste per eliminare.
 *
 * **Chi non ha un account non riceve una consegna, e lo si dichiara.** Non ha
 * un posto dove leggere: contarlo fra i raggiunti direbbe il falso. E il dato
 * che serve alla societa per decidere di invitare quelle famiglie.
 */
export const publishAnnouncement = async ({
  organizationId,
  announcementId,
  scope,
  now = new Date(),
  requirePermission = true,
}: {
  organizationId?: string | null;
  announcementId: string;
  scope?: AudienceScope;
  now?: Date;
  /** Falso quando a pubblicare e il giro notturno, che non ha un attore. */
  requirePermission?: boolean;
}): Promise<PublishOutcome> => {
  const clubId = resolveOrganizationId(scope, organizationId);
  if (requirePermission) {
    assertCommunicationPermission(scope?.activeRole, "board.publish");
  }

  const announcement = readAnnouncement(
    await requireAnnouncementRow(clubId, announcementId),
  );

  const audience = await resolveAudience({
    organizationId: clubId,
    criteria: announcement.criteria,
    scope,
    /*
      Il giro notturno non ha un attore: il permesso sul criterio economico e
      gia stato verificato quando l'annuncio e stato creato, ed e la ragione
      per cui i criteri si conservano insieme all'annuncio invece di essere
      ricalcolati da chi pubblica.
    */
    actorRole: requirePermission ? scope?.activeRole : "owner",
    now,
  });

  let delivered = 0;
  let alreadyDelivered = 0;
  let withoutAccount = 0;

  for (const recipient of audience.recipients) {
    if (!recipient.userId) {
      withoutAccount += 1;
      continue;
    }

    const claim = await claimDelivery({
      organizationId: clubId,
      sourceKind: "board",
      sourceId: announcementId,
      dedupKey: boardDedupKey(announcementId),
      channel: "board",
      recipientKey: recipient.key,
      recipientUserId: recipient.userId,
      recipientName: recipient.name,
      recipientEmail: recipient.email,
      athleteIds: recipient.positions.map((position) => position.athleteId),
      subject: announcement.title,
      /* Un annuncio si pubblica una volta: l'occorrenza non si ripete. */
      retryAfterMs: null,
      now,
    });

    if (!claim.claimed) {
      alreadyDelivered += 1;
      continue;
    }

    await settleDelivery({ id: claim.id,
      organizationId: claim.organizationId, status: "sent", now });
    delivered += 1;
  }

  await persist({
    organizationId: clubId,
    announcement: {
      ...announcement,
      status: "published",
      publishedAt: announcement.publishedAt || now.toISOString(),
    },
    id: announcementId,
  });

  return { announcementId, delivered, withoutAccount, alreadyDelivered };
};

/**
 * Il passo del giro notturno: pubblica cio che era **programmato** e maturo.
 *
 * Idempotente per costruzione: un annuncio gia pubblicato non e maturo, quindi
 * la seconda esecuzione della stessa notte non ripubblica niente e non scrive
 * nessuna consegna.
 */
export const publishScheduledAnnouncements = async ({
  organizationId,
  now = new Date(),
}: {
  organizationId: string;
  now?: Date;
}) => {
  const rows = await itemClient().findMany({
    where: {
      organization_id: organizationId,
      resource_type: ANNOUNCEMENT_RESOURCE_TYPE,
    },
  });

  const maturi = rows
    .map(readAnnouncement)
    .filter((announcement: Announcement) =>
      isAnnouncementDueForPublication(announcement, now),
    );

  const esiti: PublishOutcome[] = [];

  for (const announcement of maturi) {
    esiti.push(
      await publishAnnouncement({
        organizationId,
        announcementId: announcement.id,
        now,
        requirePermission: false,
      }),
    );
  }

  return esiti;
};

/**
 * La bacheca come la legge un destinatario.
 *
 * Restituisce **solo** cio che gli e stato consegnato, non tutto cio che il
 * club ha pubblicato: il pubblico di un annuncio e parte dell'annuncio, e una
 * lettura che lo ignorasse mostrerebbe a una famiglia gli avvisi di un'altra
 * categoria.
 */
export const readAnnouncementsForUser = async ({
  organizationId,
  userId,
  now = new Date(),
}: {
  organizationId: string;
  userId: string;
  now?: Date;
}) => {
  const deliveries = await listDeliveriesForRecipient({
    organizationId,
    sourceKind: "board",
    channel: "board",
    userId,
  });

  if (deliveries.length === 0) return [];

  const rows = await itemClient().findMany({
    where: {
      organization_id: organizationId,
      resource_type: ANNOUNCEMENT_RESOURCE_TYPE,
      id: { in: deliveries.map((row: any) => asText(row.source_id)) },
    },
  });

  const readAtById = new Map<string, string | null>(
    deliveries.map((row: any) => [
      asText(row.source_id),
      row.read_at ? new Date(row.read_at).toISOString() : null,
    ]),
  );
  const deliveryIdById = new Map<string, string>(
    deliveries.map((row: any) => [asText(row.source_id), asText(row.id)]),
  );

  return sortAnnouncements(rows.map(readAnnouncement))
    .filter((announcement) => isAnnouncementVisible(announcement, now))
    .map((announcement) => ({
      ...announcement,
      deliveryId: deliveryIdById.get(announcement.id) || "",
      readAt: readAtById.get(announcement.id) || null,
    }));
};

/**
 * Puo, questa persona, vedere l'allegato di questo annuncio?
 *
 * **Perche non basta appartenere al club.** Un allegato di annuncio vive su
 * Attachment Core, che autorizza sull'appartenenza: senza questa domanda, un
 * genitore dell'Under 16 che conoscesse l'identificativo scaricherebbe il
 * modulo allegato all'avviso dell'Under 14. Il pubblico e parte dell'annuncio,
 * e vale anche per i suoi allegati.
 *
 * Due sole risposte affermative: chi **governa** la bacheca, e chi ha una
 * consegna per quell'annuncio. La seconda e la stessa riga che decide se
 * l'annuncio compare nella sua bacheca, quindi non c'e modo che le due
 * risposte divergano.
 */
export const canReadAnnouncementAttachment = async ({
  organizationId,
  announcementId,
  userId,
  activeRole,
}: {
  organizationId: string;
  announcementId: string;
  userId: string;
  activeRole?: string | null;
}) => {
  if (hasCommunicationPermission(activeRole, "board.publish")) return true;
  if (!asText(userId) || !asText(announcementId)) return false;

  const deliveries = await listDeliveriesForRecipient({
    organizationId,
    sourceKind: "board",
    channel: "board",
    userId,
  });

  return deliveries.some(
    (row: any) => asText(row.source_id) === asText(announcementId),
  );
};

/** Segna letto. La regola «una volta sola» vive nel registro, non qui. */
export const markAnnouncementRead = async ({
  organizationId,
  deliveryId,
  userId,
  now = new Date(),
}: {
  organizationId: string;
  deliveryId: string;
  userId: string;
  now?: Date;
}) => markDeliveryRead({ organizationId, deliveryId, userId, now });

/** Chi ha ricevuto un annuncio, e chi lo ha aperto. */
export const readAnnouncementDeliveries = async ({
  organizationId,
  announcementId,
  scope,
}: {
  organizationId?: string | null;
  announcementId: string;
  scope?: AudienceScope;
}) => {
  const clubId = resolveOrganizationId(scope, organizationId);
  assertCommunicationPermission(
    scope?.activeRole,
    "communications.read_recipients",
  );

  await requireAnnouncementRow(clubId, announcementId);

  return listDeliveriesForSource({
    organizationId: clubId,
    sourceKind: "board",
    sourceId: announcementId,
  });
};

/**
 * Ritira un annuncio.
 *
 * **Non cancella le consegne.** Chi lo ha gia letto lo ha letto, e la prova di
 * averlo pubblicato e proprio cio per cui una bacheca esiste. Ritirare
 * significa toglierlo dalla bacheca, non riscrivere il passato.
 */
export const withdrawAnnouncement = async ({
  organizationId,
  announcementId,
  scope,
  now = new Date(),
}: {
  organizationId?: string | null;
  announcementId: string;
  scope?: AudienceScope;
  now?: Date;
}) => {
  const clubId = resolveOrganizationId(scope, organizationId);
  assertCommunicationPermission(scope?.activeRole, "board.publish");

  const announcement = readAnnouncement(
    await requireAnnouncementRow(clubId, announcementId),
  );

  return persist({
    organizationId: clubId,
    announcement: {
      ...announcement,
      expiresAt: now.toISOString(),
    },
    id: announcementId,
  });
};

/**
 * Un annuncio, **per chi lo governa**.
 *
 * Stesso permesso di `listAnnouncements` e per la stessa ragione: questa
 * lettura ignora il pubblico dell'annuncio, quindi con `board.read` un
 * destinatario dell'Under 14 poteva leggere per identificativo l'avviso
 * destinato all'Under 16, e una bozza mai pubblicata.
 */
export const readAnnouncementById = async ({
  organizationId,
  announcementId,
  scope,
}: {
  organizationId?: string | null;
  announcementId: string;
  scope?: AudienceScope;
}) => {
  const clubId = resolveOrganizationId(scope, organizationId);
  assertCommunicationPermission(scope?.activeRole, "board.publish");

  return readAnnouncement(await requireAnnouncementRow(clubId, announcementId));
};

export const __internals = { asRecord };
