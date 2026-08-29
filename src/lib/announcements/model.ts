/**
 * La **bacheca** del club: il dominio, senza interfaccia e senza database.
 *
 * **Perche un annuncio non e una notifica.** Una notifica avvisa e poi si
 * dimentica: `/notifications` mostra gli ultimi sei giorni e si ferma a
 * cinquanta righe. «Domenica il campo e chiuso» deve **restare**, si consulta,
 * ha un allegato, e chi arriva dopo lo deve trovare. Sono due oggetti diversi,
 * e il secondo non si ottiene allungando il primo.
 *
 * **Cosa non e, e non deve diventare.** Non ci sono commenti, reazioni,
 * thread ne un ordinamento che decide qualcun altro. Un annuncio ha un autore,
 * dei destinatari, una finestra di validita, e finisce li: aggiungere una
 * conversazione aprirebbe una moderazione che nessuno presidia, su una
 * piattaforma che tratta dati di minori.
 *
 * Modulo **puro**: si prova senza database.
 */

export type AnnouncementStatus = "draft" | "published";

export const ANNOUNCEMENT_RESOURCE_TYPE = "announcements";

export type Announcement = {
  id: string;
  title: string;
  body: string;
  status: AnnouncementStatus;
  /** Quando deve comparire. `null` = subito, alla pubblicazione. */
  publishAt: string | null;
  /** Quando smette di comparire in cima. `null` = non scade. */
  expiresAt: string | null;
  /** Quando e stato **effettivamente** pubblicato. */
  publishedAt: string | null;
  /** I criteri dell'audience engine: il pubblico e lo stesso oggetto. */
  criteria: unknown[];
  attachmentIds: string[];
  authorUserId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

const asText = (value: unknown) => String(value ?? "").trim();

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const toIsoOrNull = (value: unknown) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const asIdList = (value: unknown): string[] =>
  Array.isArray(value)
    ? Array.from(new Set(value.map((entry) => asText(entry)).filter(Boolean)))
    : [];

export const normalizeAnnouncementStatus = (
  value: unknown,
): AnnouncementStatus => (asText(value) === "published" ? "published" : "draft");

/** Da riga di `club_resource_items` ad annuncio. */
export const readAnnouncement = (row: any): Announcement => {
  const payload = asRecord(row?.payload);

  return {
    id: asText(row?.id),
    title: asText(payload.title || row?.name),
    body: asText(payload.body),
    status: normalizeAnnouncementStatus(payload.status || row?.status),
    publishAt: toIsoOrNull(payload.publishAt ?? row?.date),
    expiresAt: toIsoOrNull(payload.expiresAt),
    publishedAt: toIsoOrNull(payload.publishedAt),
    criteria: Array.isArray(payload.criteria) ? payload.criteria : [],
    attachmentIds: asIdList(payload.attachmentIds),
    authorUserId: asText(payload.authorUserId) || null,
    createdAt: toIsoOrNull(row?.created_at),
    updatedAt: toIsoOrNull(row?.updated_at),
  };
};

export type AnnouncementDraft = {
  title: string;
  body: string;
  criteria: unknown[];
  attachmentIds?: string[];
  publishAt?: string | null;
  expiresAt?: string | null;
};

/**
 * Valida una bozza.
 *
 * **La scadenza prima della pubblicazione fa fallire.** Un annuncio che nasce
 * gia scaduto non compare mai, e chi lo ha scritto non ha nessun modo di
 * accorgersene: non e un caso limite, e un errore di battitura sulle date che
 * il prodotto puo intercettare.
 */
export const normalizeAnnouncementDraft = (
  input: unknown,
): AnnouncementDraft => {
  const record = asRecord(input);
  const title = asText(record.title);
  const body = asText(record.body);

  if (!title) throw new Error("Un annuncio senza titolo non si pubblica");
  if (!body) throw new Error("Un annuncio senza testo non si pubblica");

  const criteria = Array.isArray(record.criteria) ? record.criteria : [];
  if (criteria.length === 0) {
    throw new Error("Nessun destinatario: scegli chi deve leggere l'annuncio");
  }

  const publishAt = toIsoOrNull(record.publishAt ?? record.publish_at);
  const expiresAt = toIsoOrNull(record.expiresAt ?? record.expires_at);

  if (publishAt && expiresAt && new Date(expiresAt) <= new Date(publishAt)) {
    throw new Error(
      "La scadenza deve venire dopo la pubblicazione: cosi l'annuncio non comparirebbe mai",
    );
  }

  return {
    title,
    body,
    criteria,
    attachmentIds: asIdList(record.attachmentIds ?? record.attachment_ids),
    publishAt,
    expiresAt,
  };
};

/**
 * L'annuncio e **visibile adesso**?
 *
 * Tre condizioni, e sono tre e non una perche rispondono a tre domande diverse
 * che una segreteria si pone davvero: «l'ho pubblicato?», «e gia uscito?», «e
 * ancora valido?».
 */
export const isAnnouncementVisible = (
  announcement: Announcement,
  now: Date = new Date(),
) => {
  if (announcement.status !== "published") return false;

  const from = announcement.publishAt ? new Date(announcement.publishAt) : null;
  if (from && !Number.isNaN(from.getTime()) && from.getTime() > now.getTime()) {
    return false;
  }

  const until = announcement.expiresAt ? new Date(announcement.expiresAt) : null;
  if (
    until &&
    !Number.isNaN(until.getTime()) &&
    until.getTime() <= now.getTime()
  ) {
    return false;
  }

  return true;
};

/**
 * L'annuncio e **programmato e maturo**, cioe da pubblicare adesso.
 *
 * Serve al giro notturno. Un annuncio gia pubblicato non e maturo: e la
 * ragione per cui la seconda esecuzione della stessa notte non ripubblica
 * niente e non riscrive nessuna consegna.
 */
export const isAnnouncementDueForPublication = (
  announcement: Announcement,
  now: Date = new Date(),
) => {
  if (announcement.status === "published") return false;
  if (!announcement.publishAt) return false;

  const from = new Date(announcement.publishAt);
  return !Number.isNaN(from.getTime()) && from.getTime() <= now.getTime();
};

/**
 * Come si presenta un annuncio a chi guarda la bacheca.
 *
 * Un annuncio scaduto **non si cancella**: smette di comparire in cima e resta
 * in archivio. Cancellarlo perderebbe la prova di averlo pubblicato, che e
 * esattamente cio per cui una bacheca esiste.
 */
export type AnnouncementShelf = "scheduled" | "current" | "expired" | "draft";

export const announcementShelf = (
  announcement: Announcement,
  now: Date = new Date(),
): AnnouncementShelf => {
  if (announcement.status !== "published") return "draft";
  if (isAnnouncementDueForPublication({ ...announcement, status: "draft" }, now))
    return "current";

  const from = announcement.publishAt ? new Date(announcement.publishAt) : null;
  if (from && !Number.isNaN(from.getTime()) && from.getTime() > now.getTime()) {
    return "scheduled";
  }

  const until = announcement.expiresAt ? new Date(announcement.expiresAt) : null;
  if (
    until &&
    !Number.isNaN(until.getTime()) &&
    until.getTime() <= now.getTime()
  ) {
    return "expired";
  }

  return "current";
};

/** L'ordine con cui una bacheca si legge: prima il piu recente. */
export const sortAnnouncements = (announcements: Announcement[]) =>
  [...announcements].sort((left, right) => {
    const leftAt = left.publishedAt || left.publishAt || left.createdAt || "";
    const rightAt = right.publishedAt || right.publishAt || right.createdAt || "";
    return rightAt.localeCompare(leftAt);
  });
