import { createHash } from "crypto";
import { prisma } from "./prisma";
import {
  isEmailDeliveryConfigured,
  sendTransactionalEmail,
} from "./email/email-service";
import {
  claimDelivery,
  buildDedupKey,
  reachedKey,
  readAlreadyReached,
  settleDelivery,
  type DeliveryChannel,
} from "./communication-deliveries";
import { resolveAudience, type AudienceScope } from "./audience";
import {
  renderMessageTemplate,
  validateMessageTemplate,
  type MessageTemplate,
} from "@/lib/messages/templates";
import type { AudienceRecipient } from "@/lib/audience/recipients";
import { assertCommunicationPermission } from "@/lib/communications/permissions";

/**
 * La **comunicazione massiva** alle famiglie (Wave 2, W2-C, G-07).
 *
 * **Cosa eredita, e da dove.** Il sollecito degli insoluti di Wave 1 aveva gia
 * risolto le tre cose difficili: l'anteprima a due elenchi con il motivo
 * dell'irraggiungibilita, l'invio per indirizzo anche a chi non ha un account,
 * e l'esito **per destinatario** invece di un conteggio ottimista. Questo
 * modulo non le riscrive: le generalizza, e il sollecito viene portato sopra
 * lo stesso motore invece di restare una seconda implementazione.
 *
 * **Le tre regole che non cambiano.**
 *
 * 1. Anteprima e invio partono dallo **stesso** calcolo. Due percorsi
 *    diversi mostrerebbero un elenco di destinatari diverso da quello che poi
 *    riceve il messaggio.
 * 2. **«Inviato» significa inviato.** Se SMTP non e configurato, o se la
 *    consegna fallisce, l'esito lo dice per destinatario e nessuno risulta
 *    `sent`.
 * 3. **Un fallimento non annulla il resto.** Chi e partito e partito: un
 *    indirizzo rifiutato non deve far risultare non inviato un messaggio che
 *    trecento famiglie hanno gia ricevuto.
 */

/** Quanti destinatari si servono in una chiamata sola. */
export const BULK_BATCH_SIZE = 200;

const asText = (value: unknown) => String(value ?? "").trim();

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

export type CommunicationMailer = {
  isConfigured: () => Promise<boolean>;
  send: (message: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }) => Promise<{ status: "sent" | "skipped"; reason?: string }>;
};

/**
 * Il postino, iniettabile.
 *
 * Non e un secondo punto di invio — l'unica implementazione vive in
 * `src/lib/server/email/` e questo modulo non ne conosce altre — ma l'unica
 * alternativa per collaudare «SMTP non configurato» e «la consegna fallisce»
 * sarebbe montare un server SMTP finto dentro i test.
 */
const defaultMailer: CommunicationMailer = {
  isConfigured: isEmailDeliveryConfigured,
  send: sendTransactionalEmail,
};

/**
 * I valori del club per i segnaposto.
 *
 * **Non e un secondo catalogo.** Le chiavi sono quelle del catalogo unico
 * (`src/lib/documents/placeholders.ts`); questa funzione ne produce il
 * **sottoinsieme** che un messaggio puo avere. Un messaggio non ha una
 * stagione, non ha un documento e non ha una firma: il risolutore documentale
 * chiede quei contesti e non li avrebbe.
 */
const buildClubValues = (club: any): Record<string, string> => {
  const settings = asRecord(club?.settings);

  return {
    "club.name": asText(club?.business_name || club?.name),
    "club.address": asText(club?.legal_address || club?.address),
    "club.city": asText(club?.legal_city || club?.city),
    "club.email": asText(club?.contact_email || settings.companyEmail),
    "club.phone": asText(club?.contact_phone),
    "club.fiscal_code": asText(club?.fiscal_code),
    "club.vat_number": asText(club?.vat_number),
    "club.website": asText(club?.website || settings.website),
  };
};

/**
 * I nomi degli atleti a cui il messaggio si riferisce, in una forma leggibile.
 *
 * **Perche una lista e non il primo.** Un messaggio a una famiglia con due
 * figli e **uno**: scriverne due sarebbe il difetto che l'insieme canonico
 * esiste per evitare. Quindi «Luca e Marco», non «Luca».
 *
 * **Perche solo i nomi.** Categoria, residuo e scadenza sono dati **per
 * atleta**: unirli produrrebbe una frase falsa per almeno uno dei due. In una
 * comunicazione massiva quei segnaposto restano irrisolti e l'anteprima lo
 * dice; nel sollecito, che parla di una posizione sola, ci sono.
 */
const joinAthleteNames = (values: string[]) => {
  const names = values.map((value) => asText(value)).filter(Boolean);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
};

const buildRecipientValues = (
  recipient: AudienceRecipient,
): Record<string, string> => {
  /*
    Nome e cognome arrivano **separati** dalla posizione, non da uno `split`
    del nome formattato: spezzare «Bianchi Luca» dava il cognome dove il
    modello chiedeva il nome, e sbagliava comunque su ogni cognome composto.
  */
  const firstNames = recipient.positions.map(
    (position) => position.athleteFirstName || position.athleteName,
  );
  const lastNames = recipient.positions.map(
    (position) => position.athleteLastName,
  );

  return {
    "recipient.name": recipient.name,
    "recipient.first_name": recipient.name.split(" ")[0] || recipient.name,
    "athlete.first_name": joinAthleteNames(firstNames),
    "athlete.last_name": joinAthleteNames(lastNames.filter(Boolean)),
  };
};

/**
 * L'identificativo della comunicazione, che e anche la sua idempotenza.
 *
 * **Perche lo puo dichiarare il client.** Due clic sullo stesso pulsante sono
 * lo stesso gesto e devono portare lo stesso identificativo; un reinvio
 * deliberato una settimana dopo e un gesto diverso e ne porta uno nuovo. Solo
 * chi preme sa distinguerli, e il modo piu semplice per dirlo e un
 * identificativo generato quando si apre la finestra di composizione.
 *
 * **Perche c'e comunque un ripiego, e perche non contiene l'ora.** Un chiamante
 * che non lo manda non deve perdere la protezione. La prima versione metteva
 * nella chiave il **numero d'ora** — `floor(now / 1h)` — e cosi due invii a un
 * secondo di distanza a cavallo delle 11:00 producevano due chiavi diverse:
 * nessuna esclusione, e tutti ricevevano una seconda volta. Un contatore a
 * scatti non e una finestra.
 *
 * Il ripiego deriva quindi dal **solo contenuto**, e la protezione temporale la
 * da la finestra scorrevole della rivendicazione
 * (`BULK_FALLBACK_WINDOW_MS`), che non ha confini da attraversare.
 */
export const resolveCommunicationId = ({
  declared,
  criteria,
  template,
}: {
  declared?: string | null;
  criteria: unknown;
  template: MessageTemplate;
}): { id: string; derived: boolean } => {
  const wanted = asText(declared);
  if (wanted) return { id: wanted, derived: false };

  return {
    id: createHash("sha256")
      .update(
        JSON.stringify({
          criteria,
          subject: template.subject,
          body: template.body,
        }),
      )
      .digest("hex")
      .slice(0, 32),
    derived: true,
  };
};

/**
 * Per quanto un invio **senza identificativo dichiarato** resta lo stesso invio.
 *
 * Un identificativo dichiarato descrive un gesto: l'occorrenza capita una volta
 * sola e non si ripete mai. Uno derivato dal contenuto non sa distinguere «ho
 * premuto due volte» da «rimando lo stesso testo la settimana prossima»: si
 * sceglie allora una finestra, larga abbastanza da coprire un doppio invio e un
 * ciclo a lotti, stretta abbastanza da non impedire un rinvio deliberato.
 */
export const BULK_FALLBACK_WINDOW_MS = 60 * 60 * 1000;

export type CommunicationDeliveryOutcome = {
  email: string;
  name: string;
  athleteNames: string[];
  channel: DeliveryChannel;
  status: "sent" | "skipped" | "failed";
  reason: string | null;
};

export type CommunicationPreview = {
  organizationId: string;
  clubName: string;
  communicationId: string;
  criteriaLabel: string;
  reachable: Array<{
    email: string;
    name: string;
    athleteNames: string[];
    hasAccount: boolean;
  }>;
  excluded: Array<{
    athleteName: string;
    guardianName: string | null;
    email: string | null;
    reason: string;
  }>;
  counts: { recipients: number; positions: number; excluded: number };
  /** Il messaggio come lo leggera il **primo** destinatario, non un esempio. */
  sample: { to: string; subject: string; text: string; unresolved: string[] } | null;
  /** Segnaposto fuori catalogo nel modello: bloccano l'invio. */
  invalidPlaceholders: string[];
  emailConfigured: boolean;
  canSend: boolean;
  blockedReason: string | null;
};

export type CommunicationOutcome = {
  organizationId: string;
  clubName: string;
  communicationId: string;
  deliveries: CommunicationDeliveryOutcome[];
  totals: { sent: number; skipped: number; failed: number };
  /** Quanti destinatari restano da servire: il chiamante richiama. */
  remaining: number;
  emailConfigured: boolean;
};

type CollectInput = {
  organizationId?: string | null;
  criteria: unknown;
  template: MessageTemplate;
  communicationId?: string | null;
  scope?: AudienceScope;
  actorRole?: string | null;
  now?: Date;
};

/**
 * Il lavoro comune ad anteprima e invio, in un punto solo.
 *
 * `alreadyReached` viene letto **anche** in anteprima: chi guarda deve sapere
 * che una famiglia e gia stata raggiunta da questa comunicazione prima di
 * premere, non dopo.
 */
const collect = async ({
  organizationId,
  criteria,
  template,
  communicationId,
  scope,
  actorRole,
  now = new Date(),
}: CollectInput) => {
  const role = actorRole ?? scope?.activeRole ?? null;
  assertCommunicationPermission(role, "communications.send");

  /*
    **L'anteprima restituisce nome ed email di ogni destinatario e di ogni
    escluso**: e il posto in cui l'elenco nominativo si vede davvero, e finora
    era l'unico che non chiedeva il permesso che lo governa. I due permessi
    coincidono oggi, quindi non cambia niente per nessuno — ma il giorno in cui
    si separassero questa riga sarebbe mancata **in silenzio**, che e la forma
    dell'errore trovato in Wave 1 su `seasons/permissions.ts` e che questo
    modulo dichiara di non ripetere.
  */
  assertCommunicationPermission(role, "communications.read_recipients");

  const { id, derived } = resolveCommunicationId({
    declared: communicationId,
    criteria,
    template,
  });

  const dedupKey = buildDedupKey("bulk", id);

  /*
    Un identificativo dichiarato descrive un gesto e non si ripete mai; uno
    derivato dal contenuto vale per una finestra scorrevole. Vedi
    `resolveCommunicationId`.
  */
  const retryAfterMs = derived ? BULK_FALLBACK_WINDOW_MS : null;

  const clubId = scope?.activeOrganizationId || asText(organizationId);

  /*
    Una comunicazione ha **una** occorrenza, quindi la chiave composta si
    riproietta sui soli indirizzi: e cio che l'insieme canonico si aspetta.
  */
  const reached = clubId
    ? await readAlreadyReached({
        organizationId: clubId,
        dedupKeys: [dedupKey],
        channel: "email",
        retryAfterMs,
        now,
      })
    : new Set<string>();

  const prefix = reachedKey(dedupKey, "");
  const alreadySent = new Set<string>(
    [...reached]
      .filter((composite) => composite.startsWith(prefix))
      .map((composite) => composite.slice(prefix.length)),
  );

  const audience = await resolveAudience({
    organizationId,
    criteria,
    scope,
    actorRole: role,
    now,
    alreadySent,
  });

  const club = await (prisma as any).club.findUnique({
    where: { id: audience.organizationId },
  });

  return {
    id,
    dedupKey,
    retryAfterMs,
    audience,
    club,
    clubValues: buildClubValues(club),
    invalidPlaceholders: validateMessageTemplate(template),
  };
};

/**
 * Il messaggio per un destinatario.
 *
 * `allowEconomic` e falso in una comunicazione massiva: i segnaposto economici
 * parlano di **una** posizione, e un messaggio che ne rappresenta due direbbe
 * il residuo sbagliato ad almeno una famiglia. Il sollecito, che parla di una
 * posizione sola, li usa.
 */
const renderFor = ({
  template,
  clubValues,
  recipient,
  allowEconomic = false,
}: {
  template: MessageTemplate;
  clubValues: Record<string, string>;
  recipient: AudienceRecipient;
  allowEconomic?: boolean;
}) =>
  renderMessageTemplate({
    template,
    values: { ...clubValues, ...buildRecipientValues(recipient) },
    allowEconomic,
  });

/**
 * L'anteprima: chi riceverebbe, chi no e perche, e **il messaggio vero**.
 *
 * Non scrive niente e non manda niente.
 */
export const buildCommunicationPreview = async (
  input: CollectInput & { mailer?: CommunicationMailer },
): Promise<CommunicationPreview> => {
  const mailer = input.mailer || defaultMailer;
  const [{ id, audience, clubValues, invalidPlaceholders }, emailConfigured] =
    await Promise.all([collect(input), mailer.isConfigured()]);

  const first = audience.recipients[0] || null;
  const sample = first
    ? (() => {
        const rendered = renderFor({
          template: input.template,
          clubValues,
          recipient: first,
        });
        return {
          to: first.email,
          subject: rendered.subject,
          text: rendered.text,
          unresolved: [...rendered.unresolved, ...rendered.denied],
        };
      })()
    : null;

  const canSend =
    audience.recipients.length > 0 &&
    invalidPlaceholders.length === 0 &&
    emailConfigured;

  return {
    organizationId: audience.organizationId,
    clubName: audience.clubName,
    communicationId: id,
    criteriaLabel: audience.criteriaLabel,
    reachable: audience.recipients.map((recipient) => ({
      email: recipient.email,
      name: recipient.name,
      athleteNames: recipient.positions.map((position) => position.athleteName),
      hasAccount: Boolean(recipient.userId),
    })),
    excluded: audience.exclusions.map((exclusion) => ({
      athleteName: exclusion.athleteName,
      guardianName: exclusion.guardianName,
      email: exclusion.email,
      reason: exclusion.reason,
    })),
    counts: {
      recipients: audience.counts.recipients,
      positions: audience.counts.positions,
      excluded: audience.counts.excluded,
    },
    sample,
    invalidPlaceholders,
    emailConfigured,
    canSend,
    blockedReason: canSend
      ? null
      : invalidPlaceholders.length > 0
        ? `Il messaggio contiene segnaposto che non esistono: ${invalidPlaceholders.join(", ")}`
        : !emailConfigured
          ? "L'invio email non e configurato: il messaggio non partirebbe."
          : audience.counts.excluded > 0
            ? "Nessun destinatario raggiungibile: controlla tutori e indirizzi email in anagrafica."
            : "Nessun destinatario per i criteri scelti.",
  };
};

/**
 * Manda, e riferisce **per destinatario**.
 *
 * Serve al piu `BULK_BATCH_SIZE` destinatari per chiamata e dichiara quanti ne
 * restano: un invio a quattrocento famiglie contro un SMTP lento supererebbe
 * il tempo massimo di una funzione, e il registro delle consegne rende la
 * ripresa sicura — chi e gia stato servito non viene servito due volte.
 */
export const sendCommunication = async (
  input: CollectInput & { mailer?: CommunicationMailer; batchSize?: number },
): Promise<CommunicationOutcome> => {
  const mailer = input.mailer || defaultMailer;
  const now = input.now || new Date();
  const batchSize = Math.max(1, input.batchSize || BULK_BATCH_SIZE);

  const [
    { id, dedupKey, retryAfterMs, audience, clubValues, invalidPlaceholders },
    emailConfigured,
  ] =
    await Promise.all([collect({ ...input, now }), mailer.isConfigured()]);

  if (invalidPlaceholders.length > 0) {
    throw new Error(
      `Il messaggio contiene segnaposto che non esistono: ${invalidPlaceholders.join(", ")}`,
    );
  }

  /*
    Chi resta fuori compare **nell'esito**, non solo nell'anteprima.

    E la regola di Wave 1 («chi non e raggiungibile si vede, con il motivo»)
    applicata al ritorno dell'invio: un secondo clic che escludesse in silenzio
    tutti i destinatari perche gia serviti risponderebbe «zero inviati» senza
    dire che era andato tutto bene la prima volta, e chi legge penserebbe a un
    guasto.
  */
  const deliveries: CommunicationDeliveryOutcome[] = audience.exclusions.map(
    (exclusion) => ({
      email: exclusion.email || "",
      name: exclusion.guardianName || "",
      athleteNames: [exclusion.athleteName],
      channel: "email" as DeliveryChannel,
      status: "skipped" as const,
      reason: exclusion.reason,
    }),
  );

  /*
    SMTP non configurato: non si rivendica niente e non si scrive niente nel
    registro. Ogni destinatario risulta `failed` con il motivo, cosi il
    conteggio non dice «inviato» per un messaggio che nessun server ha mai
    accettato. E la stessa scelta gia fatta dal sollecito di Wave 1.
  */
  if (!emailConfigured) {
    for (const recipient of audience.recipients) {
      deliveries.push({
        email: recipient.email,
        name: recipient.name,
        athleteNames: recipient.positions.map((position) => position.athleteName),
        channel: "email",
        status: "failed",
        reason: "email_not_configured",
      });
    }

    return {
      organizationId: audience.organizationId,
      clubName: audience.clubName,
      communicationId: id,
      deliveries,
      totals: countTotals(deliveries),
      remaining: 0,
      emailConfigured,
    };
  }

  const batch = audience.recipients.slice(0, batchSize);
  const remaining = Math.max(0, audience.recipients.length - batch.length);

  for (const recipient of batch) {
    const athleteNames = recipient.positions.map(
      (position) => position.athleteName,
    );
    const athleteIds = recipient.positions.map((position) => position.athleteId);
    const rendered = renderFor({
      template: input.template,
      clubValues,
      recipient,
    });

    const claim = await claimDelivery({
      organizationId: audience.organizationId,
      sourceKind: "bulk",
      sourceId: id,
      dedupKey,
      channel: "email",
      recipientKey: recipient.key,
      recipientUserId: recipient.userId,
      recipientName: recipient.name,
      recipientEmail: recipient.email,
      athleteIds,
      subject: rendered.subject,
      /*
        Un'occorrenza dichiarata non si ripete mai; una derivata dal contenuto
        vale per la finestra scorrevole.
      */
      retryAfterMs,
      now,
    });

    if (!claim.claimed) {
      deliveries.push({
        email: recipient.email,
        name: recipient.name,
        athleteNames,
        channel: "email",
        status: "skipped",
        reason: claim.reason,
      });
      continue;
    }

    try {
      const result = await mailer.send({
        to: recipient.email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });

      if (result.status !== "sent") {
        await settleDelivery({
          id: claim.id,
          organizationId: claim.organizationId,
          status: "failed",
          reason: result.reason || "delivery_failed",
          now,
        });
        deliveries.push({
          email: recipient.email,
          name: recipient.name,
          athleteNames,
          channel: "email",
          status: "failed",
          reason: result.reason || "delivery_failed",
        });
        continue;
      }

      await settleDelivery({ id: claim.id, organizationId: claim.organizationId, status: "sent", now });
      deliveries.push({
        email: recipient.email,
        name: recipient.name,
        athleteNames,
        channel: "email",
        status: "sent",
        reason: null,
      });

      /*
        La notifica in applicazione e un **canale in piu**, non un secondo
        messaggio: chi non ha un account non la riceve e non per questo e
        irraggiungibile. Un fallimento qui non annulla l'email gia partita.
      */
      if (recipient.userId) {
        await writeInAppCopy({
          organizationId: audience.organizationId,
          sourceId: id,
          recipient,
          subject: rendered.subject,
          text: rendered.text,
          athleteIds,
          now,
        });
      }
    } catch (error: any) {
      await settleDelivery({
        id: claim.id,
        organizationId: claim.organizationId,
        status: "failed",
        reason: "delivery_failed",
        now,
      });
      deliveries.push({
        email: recipient.email,
        name: recipient.name,
        athleteNames,
        channel: "email",
        status: "failed",
        reason: "delivery_failed",
      });
    }
  }

  return {
    organizationId: audience.organizationId,
    clubName: audience.clubName,
    communicationId: id,
    deliveries,
    totals: countTotals(deliveries),
    remaining,
    emailConfigured,
  };
};

const countTotals = (deliveries: CommunicationDeliveryOutcome[]) => ({
  sent: deliveries.filter((row) => row.status === "sent").length,
  skipped: deliveries.filter((row) => row.status === "skipped").length,
  failed: deliveries.filter((row) => row.status === "failed").length,
});

/**
 * La copia in applicazione.
 *
 * Passa dal registro come l'email — con il canale `in_app` — perche «l'ha
 * letta?» e una domanda che riguarda questo canale e non l'altro, e perche
 * senza la riga una seconda esecuzione scriverebbe una seconda notifica.
 */
const writeInAppCopy = async ({
  organizationId,
  sourceId,
  recipient,
  subject,
  text,
  athleteIds,
  now,
}: {
  organizationId: string;
  sourceId: string;
  recipient: AudienceRecipient;
  subject: string;
  text: string;
  athleteIds: string[];
  now: Date;
}) => {
  const claim = await claimDelivery({
    organizationId,
    sourceKind: "bulk",
    sourceId,
    dedupKey: buildDedupKey("bulk", sourceId),
    channel: "in_app",
    recipientKey: recipient.key,
    recipientUserId: recipient.userId,
    recipientName: recipient.name,
    recipientEmail: recipient.email,
    athleteIds,
    subject,
    retryAfterMs: null,
    now,
  });

  if (!claim.claimed) return;

  try {
    await (prisma as any).notification.create({
      data: {
        organization_id: organizationId,
        user_id: recipient.userId,
        title: subject,
        message: text,
        type: "club_communication",
        read: false,
        data: { source: "communication", communicationId: sourceId },
      },
    });
    await settleDelivery({ id: claim.id, organizationId: claim.organizationId, status: "sent", now });
  } catch {
    await settleDelivery({
      id: claim.id,
      organizationId: claim.organizationId,
      status: "failed",
      reason: "in_app_failed",
      now,
    });
  }
};
