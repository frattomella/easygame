import { prisma } from "./prisma";

/**
 * Il **registro delle consegne**: l'unico posto che sa cosa e uscito dal
 * gestionale verso una persona (Wave 2, ADR-0084).
 *
 * **Perche una tabella sola risponde a due domande.** «Gli ho gia scritto?» e
 * «cosa gli ho scritto?» sembrano due funzioni diverse e sono la stessa riga.
 * Prima della Wave 2 la prima era risposta da tre meccanismi divergenti — una
 * chiave permanente dentro la notifica, una finestra di sette giorni sulle
 * notifiche, una rivendicazione a sei ore dentro `athletes.data` — e la
 * seconda non era risposta affatto.
 *
 * **La deduplica e l'indice, non un controllo in memoria.** E proprio quando
 * due esecuzioni girano insieme — il cron invocato due volte, il doppio clic —
 * che un controllo applicativo non regge: entrambe leggono «nessuno e stato
 * ancora raggiunto» e mandano entrambe. Qui la rivendicazione e una scrittura
 * condizionata, e chi perde la corsa se ne accorge dal conteggio delle righe
 * toccate.
 *
 * **Perche esistono due politiche di ripetizione, e non una.**
 *
 * - Un'**automazione** parla di un'occorrenza precisa — «rata X, sette giorni
 *   prima della scadenza del 30 novembre». Quell'occorrenza capita una volta
 *   sola: la riga resta per sempre e il messaggio non si ripete mai.
 * - Un **sollecito a mano** lo decide una persona, e la stessa persona puo
 *   volerlo rifare la settimana dopo. La difesa serve contro il doppio clic,
 *   non contro la ripetizione: dopo la finestra di riguardo si puo riscrivere.
 *
 * `retryAfterMs` e la sola differenza fra i due casi, ed e un parametro invece
 * di due funzioni perche il resto — la corsa, la traccia, i motivi — e
 * identico.
 */

export type DeliverySourceKind = "automation" | "bulk" | "board" | "reminder";
export type DeliveryChannel = "email" | "in_app" | "board";
export type DeliveryStatus = "pending" | "sent" | "skipped" | "failed";

/** La finestra di riguardo del sollecito a mano: la stessa di Wave 1. */
export const MANUAL_REMINDER_WINDOW_MS = 6 * 60 * 60 * 1000;

const asText = (value: unknown) => String(value ?? "").trim();

const deliveryClient = () => (prisma as any).communicationDelivery;

/**
 * La chiave di deduplica.
 *
 * **Deterministica e leggibile.** Deve poter essere ricostruita da chi legge
 * il registro mesi dopo: `automation:AUT-01:rata-99:7` si capisce, un hash no.
 * I segmenti vuoti si scartano invece di produrre `::`, cosi la stessa
 * occorrenza scritta da due punti diversi non genera due chiavi.
 */
export const buildDedupKey = (...parts: Array<string | number | null | undefined>) =>
  parts
    .map((part) => asText(part))
    .filter(Boolean)
    .join(":");

export type DeliveryClaim = {
  id: string;
  recipientKey: string;
  claimed: boolean;
  /** Perche non e stato rivendicato: `already_sent` oppure `in_flight`. */
  reason: "already_sent" | "in_flight" | null;
};

type ClaimInput = {
  organizationId: string;
  sourceKind: DeliverySourceKind;
  sourceId: string;
  dedupKey: string;
  channel: DeliveryChannel;
  recipientKey: string;
  recipientUserId?: string | null;
  recipientName?: string | null;
  recipientEmail?: string | null;
  athleteIds?: string[];
  subject?: string | null;
  /**
   * Dopo quanto si puo riscrivere allo stesso destinatario per la stessa
   * chiave. `null` significa **mai**: e il caso delle automazioni, dove
   * l'occorrenza capita una volta sola.
   */
  retryAfterMs?: number | null;
  now: Date;
};

/**
 * Rivendica un destinatario **prima** di scrivergli.
 *
 * Tre esiti, e nessuno di loro e un'eccezione: chi chiama deve poter riferire
 * per destinatario invece di fallire per tutti.
 *
 * L'ordine delle operazioni conta. Si tenta prima l'aggiornamento condizionato
 * — che e atomico e riguarda le righe gia esistenti — e solo se non tocca
 * niente si tenta la creazione. Facendo il contrario, il caso piu frequente
 * («ho gia scritto a questa persona il mese scorso») passerebbe sempre da
 * un'eccezione di chiave duplicata.
 */
export const claimDelivery = async (
  input: ClaimInput,
): Promise<DeliveryClaim> => {
  const {
    organizationId,
    sourceKind,
    sourceId,
    dedupKey,
    channel,
    recipientKey,
    now,
  } = input;

  const retryAfterMs = input.retryAfterMs ?? null;
  const reclaimableBefore =
    retryAfterMs === null ? null : new Date(now.getTime() - retryAfterMs);

  const identity = {
    organization_id: organizationId,
    dedup_key: dedupKey,
    recipient_key: recipientKey,
    channel,
  };

  const payload = {
    source_kind: sourceKind,
    source_id: sourceId,
    recipient_user_id: input.recipientUserId || null,
    recipient_name: input.recipientName || null,
    recipient_email: input.recipientEmail || null,
    athlete_ids: input.athleteIds || [],
    subject: input.subject || null,
    status: "pending" as DeliveryStatus,
    reason: null,
    updated_at: now,
  };

  /*
    Una riga esistente si riprende in due casi soli:

      * ha **fallito** — un guasto SMTP non deve rendere una famiglia
        irraggiungibile: la finestra di riguardo esiste per non ripetersi, non
        per punire un guasto;
      * e **piu vecchia della finestra**, quando una finestra c'e.

    Una riga `pending` dentro la finestra e un invio **in volo**: e il doppio
    clic, e va lasciato in pace.
  */
  const reclaimed = await deliveryClient().updateMany({
    where: {
      ...identity,
      OR: [
        { status: "failed" },
        ...(reclaimableBefore ? [{ updated_at: { lt: reclaimableBefore } }] : []),
      ],
    },
    data: payload,
  });

  if (Number(reclaimed?.count || 0) > 0) {
    const row = await deliveryClient().findFirst({ where: identity });
    return {
      id: asText(row?.id),
      recipientKey,
      claimed: true,
      reason: null,
    };
  }

  try {
    const created = await deliveryClient().create({
      /*
        `read_at` si dichiara alla creazione e **non** nel payload di ripresa:
        riprendere una consegna fallita non deve cancellare il fatto che
        qualcuno l'avesse gia letta su un altro canale.
      */
      data: { ...identity, ...payload, read_at: null, created_at: now },
    });
    return {
      id: asText(created?.id),
      recipientKey,
      claimed: true,
      reason: null,
    };
  } catch (error: any) {
    /*
      Chiave duplicata: la riga c'e ma non era riprendibile. Non e un errore
      del chiamante, e la risposta corretta alla domanda «gli ho gia
      scritto?».
    */
    if (error?.code !== "P2002") throw error;

    const row = await deliveryClient().findFirst({ where: identity });

    return {
      id: asText(row?.id),
      recipientKey,
      claimed: false,
      reason: row?.status === "pending" ? "in_flight" : "already_sent",
    };
  }
};

/** Chiude una rivendicazione con l'esito vero. */
export const settleDelivery = async ({
  id,
  status,
  reason,
  now = new Date(),
}: {
  id: string;
  status: Exclude<DeliveryStatus, "pending">;
  reason?: string | null;
  now?: Date;
}) => {
  if (!asText(id)) return;

  await deliveryClient().update({
    where: { id },
    data: { status, reason: reason || null, updated_at: now },
  });
};

/**
 * La chiave composta con cui si riconosce «questo destinatario, per questa
 * occorrenza».
 *
 * **Perche composta e non il solo indirizzo.** Una lettura che tornasse i soli
 * indirizzi non saprebbe distinguere «gia avvisato per la rata di Luca» da
 * «gia avvisato per la rata di Marco»: la famiglia con due figli risulterebbe
 * gia raggiunta per il secondo appena avvisata per il primo, e il secondo
 * sollecito non partirebbe mai.
 */
/**
 * Il separatore della chiave composta.
 *
 * Una barra verticale, non uno spazio: un indirizzo email non puo contenerla e
 * una chiave di deduplica usa i due punti, quindi non c'e nessun valore che
 * possa spezzare la chiave in un punto sbagliato.
 */
const REACHED_SEPARATOR = "|";

export const reachedKey = (dedupKey: string, recipientKey: string) =>
  `${dedupKey}${REACHED_SEPARATOR}${recipientKey}`;

/**
 * Le chiavi gia raggiunte per questa occorrenza.
 *
 * Serve all'**anteprima**, che deve dire «questa famiglia l'hai gia avvisata»
 * prima che qualcuno prema, non dopo. Non rivendica niente: e una lettura.
 */
export const readAlreadyReached = async ({
  organizationId,
  dedupKeys,
  channel,
  retryAfterMs = null,
  now = new Date(),
}: {
  organizationId: string;
  dedupKeys: string[];
  channel: DeliveryChannel;
  retryAfterMs?: number | null;
  now?: Date;
}): Promise<Set<string>> => {
  const keys = Array.from(new Set(dedupKeys.filter(Boolean)));
  if (keys.length === 0) return new Set<string>();

  const reclaimableBefore =
    retryAfterMs === null ? null : new Date(now.getTime() - retryAfterMs);

  const rows = await deliveryClient().findMany({
    where: {
      organization_id: organizationId,
      dedup_key: { in: keys },
      channel,
      /*
        Una riga fallita non conta come «gia raggiunto»: il messaggio non e
        arrivato, e l'anteprima non deve dire il contrario.
      */
      status: { not: "failed" },
      ...(reclaimableBefore ? { updated_at: { gte: reclaimableBefore } } : {}),
    },
    select: { recipient_key: true, dedup_key: true },
  });

  return new Set<string>(
    rows
      .filter((row: any) => asText(row.recipient_key))
      .map((row: any) => reachedKey(asText(row.dedup_key), asText(row.recipient_key))),
  );
};

/** Le consegne di una sorgente, per la schermata «chi ha ricevuto cosa». */
export const listDeliveriesForSource = async ({
  organizationId,
  sourceKind,
  sourceId,
}: {
  organizationId: string;
  sourceKind: DeliverySourceKind;
  sourceId: string;
}) =>
  deliveryClient().findMany({
    where: {
      organization_id: organizationId,
      source_kind: sourceKind,
      source_id: sourceId,
    },
    orderBy: { created_at: "asc" },
  });

/**
 * Quante consegne e quante letture, per ogni sorgente di un tipo.
 *
 * Serve alla bacheca, che accanto a ogni avviso mostra «lo vedono in venti, lo
 * hanno aperto in tre»: due numeri, perche uno solo non direbbe se il canale
 * funziona.
 *
 * **Perche sta qui e non dove serve.** Chi ha bisogno di un conteggio chiede a
 * questo modulo invece di interrogare la tabella per conto proprio: e la
 * condizione perche il registro resti l'unico posto che sa cosa e uscito, e un
 * test strutturale la fa rispettare.
 */
export const countDeliveriesBySource = async ({
  organizationId,
  sourceKind,
}: {
  organizationId: string;
  sourceKind: DeliverySourceKind;
}): Promise<Map<string, { total: number; read: number }>> => {
  const rows = await deliveryClient().findMany({
    where: {
      organization_id: organizationId,
      source_kind: sourceKind,
      status: "sent",
    },
    select: { source_id: true, read_at: true },
  });

  const counts = new Map<string, { total: number; read: number }>();

  for (const row of rows) {
    const key = asText(row.source_id);
    const bucket = counts.get(key) || { total: 0, read: 0 };
    bucket.total += 1;
    if (row.read_at) bucket.read += 1;
    counts.set(key, bucket);
  }

  return counts;
};

/** Le consegne riuscite verso una persona, su un canale. */
export const listDeliveriesForRecipient = async ({
  organizationId,
  sourceKind,
  channel,
  userId,
}: {
  organizationId: string;
  sourceKind: DeliverySourceKind;
  channel: DeliveryChannel;
  userId: string;
}) =>
  deliveryClient().findMany({
    where: {
      organization_id: organizationId,
      source_kind: sourceKind,
      channel,
      recipient_user_id: userId,
      status: "sent",
    },
  });

/**
 * Segna letto.
 *
 * **Una volta sola**: una seconda apertura non sposta la data, altrimenti
 * «quando l'ha letto» diventerebbe «quando l'ha riletto l'ultima volta», che
 * e un'altra domanda e non quella che qualcuno si pone.
 */
export const markDeliveryRead = async ({
  organizationId,
  deliveryId,
  userId,
  now = new Date(),
}: {
  organizationId: string;
  deliveryId: string;
  userId: string;
  now?: Date;
}) => {
  const updated = await deliveryClient().updateMany({
    where: {
      id: deliveryId,
      organization_id: organizationId,
      recipient_user_id: userId,
      read_at: null,
    },
    data: { read_at: now, updated_at: now },
  });

  return Number(updated?.count || 0) > 0;
};
