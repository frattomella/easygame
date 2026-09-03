import { prisma } from "./prisma";
import { createClubNotifications as scriviNotificaDiSocieta } from "./club-notifications";
import { formatAthleteNameLastFirst } from "@/lib/athlete-name-utils";
import {
  isEmailDeliveryConfigured,
  sendTransactionalEmail,
} from "./email/email-service";
import { renderEmailLayout } from "./email/layout";
import { claimDelivery, settleDelivery } from "./communication-deliveries";
import { resolveAudience, type AudienceScope } from "./audience";
import { listPendingRsvpForAthlete } from "./rsvp";
import {
  issuePaymentLink,
  resolveAbsolutePaymentLink,
} from "./payment-links";
import { AUDIT_ACTIONS, recordAuditEvent } from "./audit";
import {
  AUTOMATION_TRIGGERS,
  getAutomationTrigger,
  type AutomationTriggerKind,
} from "@/lib/automations/catalog";
import {
  buildAutomationDedupKey,
  buildAutomationDigestDedupKey,
  buildDefaultAutomationRules,
  daysBetween,
  normalizeAutomationRule,
  normalizeAutomationRules,
  selectFiringOffset,
  startOfDay,
  toDayKey,
  type AutomationRule,
} from "@/lib/automations/rules";
import {
  buildDailyDigest,
  type DigestEntry,
} from "@/lib/automations/digest";
import {
  economicPlaceholdersUsed,
  renderMessageTemplate,
  validateMessageTemplate,
} from "@/lib/messages/templates";
import { formatAmountValue, formatDate } from "@/lib/documents/document-view";
import {
  buildInstallmentLedgers,
  findNextInstallment,
  summarizeLedgers,
  type InstallmentLedger,
} from "@/lib/payments/installment-ledger";
import {
  getLatestMedicalCertificateExpiry,
  getMedicalCertificateAvailability,
  getMedicalCertificateAvailabilityLabel,
} from "@/lib/medical-certificates";
import { listExpiringAttachments } from "./attachments";
import {
  isMedicalCertificateAttachmentCategory,
  type AttachmentMetadata,
} from "@/lib/attachments";
import {
  assertCommunicationPermission,
  hasCommunicationPermission,
} from "@/lib/communications/permissions";

/**
 * Il **motore di automazioni** (Wave 2, W2-A, G-03/G-04/G-58).
 *
 * ## Cos'e, e soprattutto cosa non e
 *
 * Non e un motore di eventi. In EasyGame **non esistono eventi di dominio**:
 * nessun modulo ne emette, e ADR-0036 vieta di materializzare lo stato
 * derivato — lo stato di una rata non si imposta, si ricava. Un motore
 * *event-driven* richiederebbe di introdurre prima un bus e delle proiezioni,
 * cioe esattamente la copia dello stato derivato che il prodotto ha deciso di
 * non avere.
 *
 * E quindi un **valutatore periodico**: ogni notte, per ogni club, per ogni
 * regola accesa, chiede al proprietario del dominio «chi rientra oggi in
 * questa condizione?».
 *
 *     TRIGGER -> CONDITIONS -> AUDIENCE -> CONTENT -> ACTION -> DELIVERY -> AUDIT
 *
 * ## L'invariante che vale piu di tutte
 *
 * **Un'automazione non tocca il dominio.** Non segna una rata, non scrive una
 * presenza, non scade un certificato, non archivia niente. Legge stato e
 * produce comunicazioni. Il giorno in cui lo facesse, un difetto notturno
 * riscriverebbe l'archivio di un club senza che nessuno abbia premuto niente —
 * e trecento email sbagliate almeno si possono spiegare, un archivio riscritto
 * no. Un test lo verifica byte per byte dopo un giro.
 *
 * L'unica riga che questo modulo scrive fuori dal registro delle consegne e
 * l'eventuale **link di pagamento** dentro un sollecito: e un artefatto di
 * comunicazione — un token opaco che apre il checkout gia esistente — non un
 * dato di dominio, e non cambia ne la rata ne il suo stato.
 *
 * ## Cosa delega, e a chi
 *
 * Le rate a `buildInstallmentLedgers`, i certificati a
 * `getMedicalCertificateAvailability`, gli inviti a
 * `listPendingRsvpForAthlete`, il pubblico a `resolveAudience`, il testo a
 * `renderMessageTemplate`, la deduplica al registro delle consegne, l'invio a
 * `src/lib/server/email/`. **Non interroga mai le rate per conto proprio**:
 * sarebbe la terza interpretazione del denaro, e
 * `tests/lib/reports-cash-invariant.test.mjs` esiste per impedirlo.
 */

/* ------------------------------------------------------ le regole in archivio */

/**
 * Il tipo di riga in `club_resource_items` che porta le regole.
 *
 * **Perche non passa dal registro generico di `resources.ts`.** Aggiungere un
 * tipo a `CLUB_RESOURCE_TYPES` non aggiunge solo una stringa: quel registro
 * proietta ogni tipo anche su una colonna `Json?` di `clubs`, cioe farebbe
 * crescere il debito D-B di una colonna che nessuno legge. Le regole sono
 * poche righe di configurazione con un proprietario unico — questo file — e
 * non hanno bisogno di una superficie REST generica.
 *
 * Il perimetro resta quello di sempre: `organization_id` sta **in ogni**
 * `where`, senza eccezioni.
 */
const AUTOMATION_RESOURCE_TYPE = "automation_rules";

const resourceClient = () => (prisma as any).clubResourceItem;

const asText = (value: unknown) => String(value ?? "").trim();

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

/** Le regole del club, sempre tutte quelle del catalogo. */
export const readAutomationRules = async (
  organizationId: string,
): Promise<AutomationRule[]> => {
  const clubId = asText(organizationId);
  if (!clubId) return buildDefaultAutomationRules();

  const rows = await resourceClient().findMany({
    where: {
      organization_id: clubId,
      resource_type: AUTOMATION_RESOURCE_TYPE,
    },
  });

  return normalizeAutomationRules(
    rows.map((row: any) => ({
      ...asRecord(row.payload),
      trigger: asRecord(row.payload).trigger || asText(row.name),
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : asText(row.updated_at),
    })),
  );
};

/**
 * Scrive **una** regola.
 *
 * La riga si riconosce da `(organization_id, resource_type, name)` dove `name`
 * e il tipo di trigger: non c'e un indice unico su quella terna, quindi la si
 * cerca prima e la si aggiorna per id. E accettabile qui e non lo sarebbe su
 * una consegna: due segretarie che salvano la stessa regola nello stesso
 * istante scrivono l'una sopra l'altra — l'ultima vince, che e cio che ci si
 * aspetta da una schermata di configurazione — mentre due consegne concorrenti
 * significherebbero due email, e per quelle la difesa e l'indice unico.
 */
export const saveAutomationRule = async ({
  organizationId,
  rule,
  scope,
  actorUserId,
  actorEmail,
  actorRole,
  now = new Date(),
}: {
  organizationId: string;
  rule: unknown;
  scope?: AudienceScope;
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  now?: Date;
}): Promise<AutomationRule> => {
  const role = actorRole ?? scope?.activeRole ?? null;
  assertCommunicationPermission(role, "automations.manage");

  const clubId = resolveClubId(scope, organizationId);
  const normalized = normalizeAutomationRule(rule);

  const invalid = validateMessageTemplate(normalized.template);
  if (invalid.length > 0) {
    throw new Error(
      `Il messaggio contiene segnaposto che non esistono: ${invalid.join(", ")}`,
    );
  }

  const payload = {
    trigger: normalized.trigger,
    enabled: normalized.enabled,
    offsetDays: normalized.offsetDays,
    audience: normalized.audience,
    delivery: normalized.delivery,
    template: normalized.template,
    categories: normalized.categories,
  };

  const existing = await resourceClient().findFirst({
    where: {
      organization_id: clubId,
      resource_type: AUTOMATION_RESOURCE_TYPE,
      name: normalized.trigger,
    },
  });

  if (existing) {
    await resourceClient().update({
      where: { id: existing.id },
      data: { payload, status: normalized.enabled ? "enabled" : "disabled" },
    });
  } else {
    await resourceClient().create({
      data: {
        organization_id: clubId,
        resource_type: AUTOMATION_RESOURCE_TYPE,
        name: normalized.trigger,
        status: normalized.enabled ? "enabled" : "disabled",
        payload,
      },
    });
  }

  await recordAuditEvent({
    action: AUDIT_ACTIONS.automationRuleChanged,
    actorUserId: actorUserId || scope?.userId || null,
    actorEmail: actorEmail || null,
    actorRole: role,
    organizationId: clubId,
    resource: "automation_rules",
    resourceId: normalized.trigger,
    metadata: {
      trigger: normalized.trigger,
      enabled: normalized.enabled,
      offsetDays: normalized.offsetDays,
      audience: normalized.audience,
      delivery: normalized.delivery,
      categories: normalized.categories,
    },
  });

  return { ...normalized, updatedAt: now.toISOString() };
};

/**
 * Il club su cui si opera e **quello attivo**.
 *
 * Stessa regola di `audience.ts` e di `payment-reminders.ts`: il ruolo con cui
 * si decide e il club su cui si scrive devono parlare dello stesso club,
 * altrimenti chi e proprietario del proprio club e genitore in un altro
 * configurerebbe le automazioni del secondo.
 */
const resolveClubId = (
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
    throw new Error(
      "Accesso negato: si opera sul club attivo, non su un altro fra quelli a cui hai accesso",
    );
  }
  if (!scope.allowedOrganizationIds.includes(scope.activeOrganizationId)) {
    throw new Error(
      "Accesso negato: il club indicato non e fra quelli a cui hai accesso",
    );
  }

  return scope.activeOrganizationId;
};

/* --------------------------------------------------------- la valutazione */

/**
 * Un'occorrenza che scatta **oggi**: una regola, una persona, un fatto, un
 * anticipo.
 */
type AutomationHit = {
  trigger: AutomationTriggerKind;
  athleteId: string;
  athleteFirstName: string;
  athleteLastName: string;
  /** Cio che rende unica l'occorrenza: la rata, la scadenza, l'evento. */
  occurrenceId: string;
  offsetDays: number;
  /** I segnaposto specifici dell'occorrenza. */
  values: Record<string, string>;
  /** La riga del riepilogo alla societa. */
  detail: string;
  when: string;
  /** La rata a cui il messaggio si riferisce, quando ce n'e una. */
  paymentId: string | null;
};

const athleteFullName = (athlete: any) =>
  [asText(athlete?.first_name), asText(athlete?.last_name)]
    .filter(Boolean)
    .join(" ") || "Atleta";

const euro = (value: unknown) => `${formatAmountValue(value)} euro`;

/**
 * Le rate: **AUT-01** in scadenza e **AUT-02** scadute.
 *
 * Tre interrogazioni in tutto — atleti, rate, incassi — e poi tutto il resto
 * accade in memoria: una query per atleta dentro il ciclo trasformerebbe il
 * giro notturno di un club con trecento tesserati in novecento andate e
 * ritorno.
 */
const evaluateInstallments = async ({
  organizationId,
  athletes,
  rules,
  now,
}: {
  organizationId: string;
  athletes: any[];
  rules: AutomationRule[];
  now: Date;
}): Promise<AutomationHit[]> => {
  const interested = rules.filter(
    (rule) =>
      rule.enabled &&
      (rule.trigger === "installment_due" ||
        rule.trigger === "installment_overdue"),
  );
  if (interested.length === 0 || athletes.length === 0) return [];

  const athleteIds = athletes.map((athlete) => asText(athlete.id)).filter(Boolean);

  const charges = await (prisma as any).athletePayment.findMany({
    where: { organization_id: organizationId, athlete_id: { in: athleteIds } },
  });
  if (charges.length === 0) return [];

  const transactions = await (prisma as any).paymentTransaction.findMany({
    where: {
      organization_id: organizationId,
      payment_id: { in: charges.map((charge: any) => asText(charge.id)) },
    },
  });

  const chargesByAthlete = new Map<string, any[]>();
  for (const charge of charges) {
    const athleteId = asText(charge.athlete_id);
    if (!athleteId) continue;
    const bucket = chargesByAthlete.get(athleteId);
    if (bucket) bucket.push(charge);
    else chargesByAthlete.set(athleteId, [charge]);
  }

  const hits: AutomationHit[] = [];

  for (const athlete of athletes) {
    const athleteId = asText(athlete.id);
    const athleteCharges = chargesByAthlete.get(athleteId);
    if (!athleteCharges?.length) continue;

    const ledgers = buildInstallmentLedgers({
      charges: athleteCharges,
      transactions,
      now,
    });
    const totals = summarizeLedgers(ledgers);
    const next = findNextInstallment(ledgers);

    for (const ledger of ledgers) {
      if (ledger.residualAmount <= 0) continue;
      if (!ledger.dueDate) continue;

      const due = new Date(ledger.dueDate);
      if (Number.isNaN(due.getTime())) continue;

      const daysToDate = daysBetween(now, due);

      for (const rule of interested) {
        const trigger = AUTOMATION_TRIGGERS[rule.trigger];
        const offsetDays = selectFiringOffset({
          offsetDays: rule.offsetDays,
          direction: trigger.direction,
          daysToDate,
        });
        if (offsetDays === null) continue;

        hits.push(
          buildInstallmentHit({
            rule,
            athlete,
            ledger,
            offsetDays,
            totals,
            next,
          }),
        );
      }
    }
  }

  return hits;
};

const buildInstallmentHit = ({
  rule,
  athlete,
  ledger,
  offsetDays,
  totals,
  next,
}: {
  rule: AutomationRule;
  athlete: any;
  ledger: InstallmentLedger;
  offsetDays: number;
  totals: ReturnType<typeof summarizeLedgers>;
  next: InstallmentLedger | null;
}): AutomationHit => {
  const values: Record<string, string> = {
    "installment.description": ledger.label,
    "installment.due_date": formatDate(ledger.dueDate),
    "installment.residual_amount": euro(ledger.residualAmount),
  };

  /*
    **Il conteggio delle rate scadute si passa solo se c'e.** Un modello non ha
    condizionali (e non deve averne): la riga «Rate scadute: {{...}}» resta
    scritta anche quando il valore e zero, e «Rate scadute: 0» in un sollecito
    e una frase che si contraddice da sola. Passandolo solo quando e maggiore
    di zero il segnaposto finisce fra gli irrisolti e chi ha scritto il modello
    lo vede in anteprima.
  */
  if (totals.overdueCount > 0) {
    values["installment.overdue_count"] = String(totals.overdueCount);
  }
  if (next?.dueDate) {
    values["payment.next_due_date"] = formatDate(next.dueDate);
  }

  return {
    trigger: rule.trigger,
    athleteId: asText(athlete.id),
    athleteFirstName: asText(athlete.first_name),
    athleteLastName: asText(athlete.last_name),
    /*
      L'occorrenza e **la rata**, non la data: due rate che scadono lo stesso
      giorno sono due fatti, e una chiave sulla data ne farebbe partire uno
      solo.
    */
    occurrenceId: asText(ledger.installmentId) || asText(ledger.label),
    offsetDays,
    values,
    detail: `${ledger.label}: ${euro(ledger.residualAmount)} da versare`,
    when: formatDate(ledger.dueDate),
    paymentId: asText(ledger.installmentId) || null,
  };
};

/** I certificati: **AUT-03**, mancante, in scadenza o scaduto. */
const evaluateCertificates = ({
  athletes,
  rules,
  now,
}: {
  athletes: any[];
  rules: AutomationRule[];
  now: Date;
}): AutomationHit[] => {
  const rule = rules.find(
    (candidate) => candidate.enabled && candidate.trigger === "certificate",
  );
  if (!rule) return [];

  const hits: AutomationHit[] = [];

  for (const athlete of athletes) {
    const certificates = Array.isArray(athlete?.medical_certificates)
      ? athlete.medical_certificates
      : [];
    const expiry = getLatestMedicalCertificateExpiry(certificates);
    const availability = getMedicalCertificateAvailability(expiry || null, now);

    /*
      **La finestra e quella del club, non quella del prodotto.**
      `getMedicalCertificateAvailability` dice «in scadenza» a un mese dalla
      data, perche e la soglia con cui l'anagrafica colora una riga. Qui la
      soglia la dichiara la regola: se il club chiede trenta giorni, quel
      giorno il certificato e in scadenza **per lui**, e gli anticipi
      configurabili non servirebbero a niente se una soglia cablata altrove
      potesse annullarli. Il catalogo resta il proprietario dello **stato**, e
      lo si usa per scriverlo nel messaggio.
    */
    const label = getMedicalCertificateAvailabilityLabel(
      availability === "valid" ? "expiring" : availability,
    );

    if (availability === "missing") {
      /*
        Un certificato che **non c'e** non ha una data, quindi non ha nemmeno
        un anticipo: l'occorrenza e una sola e il messaggio parte una volta. Un
        promemoria ogni notte finche l'anagrafica non viene completata sarebbe
        il rumore che fa smettere di leggere i messaggi — e la segreteria il
        certificato mancante lo vede gia in anagrafica, dove puo farci qualcosa.
      */
      if (!rule.offsetDays.includes(0)) continue;

      hits.push({
        trigger: rule.trigger,
        athleteId: asText(athlete.id),
        athleteFirstName: asText(athlete.first_name),
        athleteLastName: asText(athlete.last_name),
        occurrenceId: "missing",
        offsetDays: 0,
        values: {
          "medical_certificate.status": label,
          /*
            Il segnaposto della scadenza non si lascia vuoto: il modello
            predefinito scrive «scadenza {{...}}, stato {{...}}» e un buco
            produrrebbe una frase monca. «non presente» e vero e si legge.
          */
          "medical_certificate.expiry_date": "non presente",
        },
        detail: label,
        when: "",
        paymentId: null,
      });
      continue;
    }

    const expiryDate = new Date(expiry);
    if (Number.isNaN(expiryDate.getTime())) continue;

    const distanza = daysBetween(now, expiryDate);

    /*
      **Il certificato gia scaduto e un'occorrenza a se, e deve partire.**

      Il catalogo promette a chi configura la regola «manca, sta per scadere o
      **e scaduto**». Con la sola corrispondenza esatta sugli anticipi quella
      terza meta non si verificava mai: gli anticipi guardano avanti
      (`direction: "before"` scarta ogni distanza negativa), quindi bastava che
      il giro notturno saltasse il giorno esatto della scadenza — una notte
      sola, un guasto, un deploy — perche quel certificato non producesse mai
      piu niente. Ed e proprio il caso che conta: un atleta con il certificato
      scaduto **non puo scendere in campo**.

      L'occorrenza si chiama `expired:<data>`: e distinta da quella del giorno
      della scadenza, quindi non ne e un doppione, e resta **una sola** perche
      la data non cambia piu.
    */
    /*
      **Il giorno della scadenza conta gia come scaduto**, e non e un dettaglio.

      La scadenza e mezzanotte UTC e il giro gira alle sei del mattino: quel
      giorno `getMedicalCertificateAvailability` dice gia «scaduto», e il
      messaggio lo scrive. Con `distanza < 0` il giorno 0 produceva pero
      l'occorrenza `<data>` e il giorno dopo l'occorrenza `expired:<data>` —
      **due chiavi per lo stesso fatto**, cioe due messaggi in due notti
      consecutive alla stessa famiglia, con gli anticipi predefiniti `[30, 7, 0]`
      che sono la configurazione normale.
    */
    const scaduto = distanza <= 0;
    if (scaduto && !rule.offsetDays.includes(0)) continue;

    const offsetDays = scaduto
      ? 0
      : selectFiringOffset({
          offsetDays: rule.offsetDays,
          direction: "before",
          daysToDate: distanza,
        });
    if (offsetDays === null) continue;

    hits.push({
      trigger: rule.trigger,
      athleteId: asText(athlete.id),
      athleteFirstName: asText(athlete.first_name),
      athleteLastName: asText(athlete.last_name),
      occurrenceId: scaduto
        ? `expired:${formatDate(expiryDate) || asText(expiry)}`
        : formatDate(expiryDate) || asText(expiry),
      offsetDays,
      values: {
        "medical_certificate.status": label,
        "medical_certificate.expiry_date": formatDate(expiryDate),
      },
      detail: label,
      when: formatDate(expiryDate),
      paymentId: null,
    });
  }

  return hits;
};

/**
 * Gli inviti a confermare: **AUT-04**.
 *
 * La domanda «chi non ha ancora risposto a questo evento» ha gia un
 * proprietario — `listPendingRsvpForAthlete` — e questo modulo non se la
 * riscrive. Il prezzo e che quella funzione carica il club a ogni chiamata:
 * per questo si controlla **prima**, con una lettura sola, se il club abbia
 * almeno un evento che chiede conferma nella finestra. Nella stragrande
 * maggioranza delle notti la risposta e no, e il ciclo non parte affatto.
 */
const evaluateRsvp = async ({
  organizationId,
  athletes,
  rules,
  now,
}: {
  organizationId: string;
  athletes: any[];
  rules: AutomationRule[];
  now: Date;
}): Promise<AutomationHit[]> => {
  const rule = rules.find(
    (candidate) => candidate.enabled && candidate.trigger === "event_rsvp",
  );
  if (!rule || athletes.length === 0) return [];

  const horizonDays = Math.max(...rule.offsetDays) + 1;

  /*
    **Il pre-controllo si fa sulle righe, non sulla proiezione.**

    Leggeva `clubs.trainings` — la proiezione in sola lettura — e da quando gli
    inviti si costruiscono dalle righe di `club_events` (ADR-0098) le due fonti
    potevano rispondere cose diverse: le gare non erano nemmeno nella colonna,
    quindi una convocazione a una gara non ha **mai** fatto partire un invito.

    Serve solo a evitare il giro per atleta quando nel club non c'e niente da
    confermare, quindi si chiede la cosa piu piccola possibile: esiste **almeno
    un** evento vivo con l'RSVP acceso nella finestra della regola.
  */
  const conRsvp = await (prisma as any).clubEvent.findFirst({
    where: {
      organization_id: organizationId,
      status: { not: "archived" },
      rsvp_required: true,
      starts_at: {
        gte: now,
        lte: new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000),
      },
    },
    select: { id: true },
  });
  if (!conRsvp) return [];

  const hits: AutomationHit[] = [];

  for (const athlete of athletes) {
    const athleteId = asText(athlete.id);
    if (!athleteId) continue;

    const invitations = await listPendingRsvpForAthlete({
      organizationId,
      athleteId,
      now,
      horizonDays,
    });

    for (const invitation of invitations) {
      if (!invitation.startsAt) continue;
      const startsAt = new Date(invitation.startsAt);
      if (Number.isNaN(startsAt.getTime())) continue;

      const offsetDays = selectFiringOffset({
        offsetDays: rule.offsetDays,
        direction: "before",
        daysToDate: daysBetween(now, startsAt),
      });
      if (offsetDays === null) continue;

      hits.push({
        trigger: rule.trigger,
        athleteId,
        athleteFirstName: asText(athlete.first_name),
        athleteLastName: asText(athlete.last_name),
        occurrenceId: invitation.trainingId,
        offsetDays,
        values: {
          "event.title": invitation.title,
          "event.date": formatDate(startsAt),
          "event.time": invitation.time,
        },
        detail: invitation.title,
        when: `${formatDate(startsAt)}${invitation.time ? ` ${invitation.time}` : ""}`,
        paymentId: null,
      });
    }
  }

  return hits;
};

/**
 * Il nome del documento, come lo legge una famiglia.
 *
 * La `category` e un identificativo tecnico (`primo-soccorso`), non una
 * etichetta: metterlo dentro una email costringerebbe chi legge a decifrarlo.
 * Le sigle restano sigle — un gruppo di lettere senza vocali e un acronimo, e
 * «Blsd» sarebbe una parola che non esiste.
 */
const documentTitle = (attachment: AttachmentMetadata) => {
  const category = asText(attachment.category);
  if (!category) return asText(attachment.fileName) || "Documento";

  const parole = category
    .replace(/[-_]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((parola) =>
      /[aeiou]/i.test(parola) ? parola : parola.toUpperCase(),
    );

  const testo = parole.join(" ");
  return testo ? testo.charAt(0).toUpperCase() + testo.slice(1) : "Documento";
};

/**
 * I documenti in scadenza: **AUT-05** (Wave 3, W3-G).
 *
 * ## Perche non e un secondo scheduler
 *
 * Non c'e niente di nuovo qui dentro: stessa finestra costruita dagli anticipi,
 * stessa corrispondenza esatta di `selectFiringOffset`, stessa deduplica per
 * occorrenza, stesso registro delle consegne, stesso pubblico, stesso
 * riepilogo. Fino alla Wave 3 mancava soltanto **il fatto su cui innescarsi**:
 * `attachments` non aveva una validita. Ora ce l'ha, e questo e tutto il
 * codice che serviva.
 *
 * ## Perche l'occorrenza porta anche la data di scadenza
 *
 * La chiave e `<id allegato>:<giorno di scadenza>`. Un documento **rinnovato**
 * ha lo stesso identificativo — si sostituisce il contenuto, non si crea una
 * riga nuova, proprio perche il riferimento nel record di dominio resti valido
 * — ma una scadenza diversa: senza la data in chiave il promemoria del rinnovo
 * dell'anno dopo risulterebbe «gia mandato» e non partirebbe mai piu.
 *
 * ## Perche solo gli allegati di un atleta
 *
 * Il motore risolve il pubblico **per atleta** (`resolveAudience` con
 * `athlete_ids`): un documento d'identita di un allenatore non ha una famiglia
 * a cui scrivere, e infilarne l'identificativo fra gli `athlete_ids` di una
 * consegna scriverebbe nel registro una riga che dice il falso. E un confine
 * dichiarato, non una dimenticanza: il giorno in cui serve, va aggiunto un
 * soggetto al motore, non un caso particolare qui.
 */
const evaluateDocumentExpiry = async ({
  organizationId,
  athletes,
  rules,
  now,
}: {
  organizationId: string;
  athletes: any[];
  rules: AutomationRule[];
  now: Date;
}): Promise<AutomationHit[]> => {
  const rule = rules.find(
    (candidate) => candidate.enabled && candidate.trigger === "document_expiry",
  );
  if (!rule || athletes.length === 0) return [];

  const perId = new Map<string, any>();
  for (const athlete of athletes) {
    const id = asText(athlete?.id);
    if (id) perId.set(id, athlete);
  }
  if (perId.size === 0) return [];

  /*
    La finestra e **una sola interrogazione**, larga quanto l'anticipo piu
    lontano: senza, il giro notturno chiederebbe alla tabella degli allegati una
    volta per atleta. Il filtro per anticipo esatto resta alle regole, che sono
    l'unico posto in cui «non si recupera all'indietro» e scritto.
  */
  const oggi = startOfDay(now);
  const orizzonte = Math.max(...rule.offsetDays);

  const attachments = await listExpiringAttachments({
    organizationId,
    from: oggi,
    to: new Date(oggi.getTime() + orizzonte * 86400000),
    ownerType: "athlete",
    ownerIds: [...perId.keys()],
    categories: rule.categories,
  });

  const hits: AutomationHit[] = [];

  for (const attachment of attachments) {
    /*
      **La seconda barriera contro il doppione del certificato medico.**

      La prima e in `listExpiringAttachments`, che quelle categorie non le
      restituisce affatto. Questa e qui lo stesso perche la promessa — «il
      certificato medico non produce mai due promemoria» — e di questo motore,
      e una promessa che dipende da come qualcun altro scrive una query e una
      promessa che un giorno non sara mantenuta.
    */
    if (isMedicalCertificateAttachmentCategory(attachment.category)) continue;

    const athlete = perId.get(asText(attachment.ownerId));
    if (!athlete) continue;

    if (!attachment.validUntil) continue;
    const scadenza = new Date(`${attachment.validUntil}T00:00:00.000Z`);
    if (Number.isNaN(scadenza.getTime())) continue;

    const offsetDays = selectFiringOffset({
      offsetDays: rule.offsetDays,
      direction: "before",
      daysToDate: daysBetween(now, scadenza),
    });
    if (offsetDays === null) continue;

    const titolo = documentTitle(attachment);

    hits.push({
      trigger: rule.trigger,
      athleteId: asText(athlete.id),
      athleteFirstName: asText(athlete.first_name),
      athleteLastName: asText(athlete.last_name),
      occurrenceId: `${attachment.id}:${attachment.validUntil}`,
      offsetDays,
      values: {
        "document.title": titolo,
        "document.date": formatDate(scadenza),
      },
      detail: `${titolo}: scade il ${formatDate(scadenza)}`,
      when: formatDate(scadenza),
      paymentId: null,
    });
  }

  return hits;
};

/* --------------------------------------------------------------- l'invio */

export type AutomationMailer = {
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
 * `src/lib/server/email/` — ma l'unico modo di provare «SMTP non configurato»
 * e «la consegna fallisce» senza montare un server di posta finto nei test.
 */
const defaultMailer: AutomationMailer = {
  isConfigured: isEmailDeliveryConfigured,
  send: sendTransactionalEmail,
};

/** L'emissione del link di pagamento, iniettabile per le stesse ragioni. */
export type AutomationLinkIssuer = typeof issuePaymentLink;

export type AutomationDeliveryOutcome = {
  /** `digest` non e un trigger: e il riepilogo che ne raccoglie molti. */
  trigger: AutomationTriggerKind | "digest";
  channel: "email" | "in_app";
  recipient: string;
  athleteName: string;
  status: "sent" | "skipped" | "failed";
  reason: string | null;
};

export type AutomationRunResult = {
  organizationId: string;
  clubName: string;
  /** Le occorrenze che scattano oggi, prima di risolvere il pubblico. */
  occurrences: number;
  rules: Array<{
    trigger: AutomationTriggerKind;
    enabled: boolean;
    occurrences: number;
  }>;
  deliveries: AutomationDeliveryOutcome[];
  digest: { entries: number; sent: boolean } | null;
  totals: { sent: number; skipped: number; failed: number };
  emailConfigured: boolean;
};

const countTotals = (deliveries: AutomationDeliveryOutcome[]) => ({
  sent: deliveries.filter((row) => row.status === "sent").length,
  skipped: deliveries.filter((row) => row.status === "skipped").length,
  failed: deliveries.filter((row) => row.status === "failed").length,
});

/**
 * I valori di club per i segnaposto.
 *
 * **Non e un secondo catalogo**: le chiavi sono quelle del catalogo unico di
 * `src/lib/documents/placeholders.ts`, e questa funzione ne produce il
 * sottoinsieme che un messaggio automatico puo avere. Un'automazione non ha
 * una stagione ne un documento, quindi il risolutore documentale — che quei
 * contesti li pretende — non serve.
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

/** L'indirizzo a cui scrive il riepilogo giornaliero. */
const clubDigestAddress = (club: any) =>
  asText(club?.contact_email || asRecord(club?.settings).companyEmail).toLowerCase();

/**
 * La chiave del destinatario «societa».
 *
 * Il registro delle consegne indicizza per indirizzo normalizzato; la societa
 * non e un indirizzo, e usare quello del club confonderebbe «l'ho scritto in
 * bacheca» con «l'ho mandato a questa persona». Una sentinella esplicita rende
 * la riga leggibile mesi dopo.
 */
const CLUB_RECIPIENT_KEY = "club";

/**
 * La notifica di societa del giro delle automazioni.
 *
 * Il perimetro e quello economico: il contenuto e nominativo — «Rata scaduta:
 * Mario Rossi — 130,00 EUR da versare» — e il riepilogo giornaliero e l elenco
 * completo delle famiglie in arretrato. Lo vede chi quel dato potrebbe gia
 * ottenerlo dal motore del pubblico, cioe chi ha
 * `communications.audience_economic`: altrimenti il permesso verrebbe aggirato
 * dal **canale di uscita** invece che dal criterio.
 *
 * La meccanica — un destinatario per riga, mai `user_id: null` — vive in
 * `club-notifications.ts`, che ne e il proprietario: la stessa regola era stata
 * scritta qui e nello scheduler del lavoro sportivo, e i due scrittori dell area
 * genitore non l avevano mai ricevuta.
 */
const createClubNotifications = async (input: {
  clubId: string;
  title: string;
  message: string;
  type: string;
  data: Record<string, unknown>;
}) =>
  scriviNotificaDiSocieta({
    ...input,
    audience: (role) =>
      hasCommunicationPermission(role, "communications.audience_economic"),
  });

/* -------------------------------------------------------------- il giro */

export const runAutomationsForClub = async ({
  organizationId,
  now = new Date(),
  scope,
  mailer = defaultMailer,
  issueLink = issuePaymentLink,
}: {
  organizationId: string;
  now?: Date;
  scope?: AudienceScope;
  mailer?: AutomationMailer;
  issueLink?: AutomationLinkIssuer;
}): Promise<AutomationRunResult> => {
  const clubId = resolveClubId(scope, organizationId);

  const [rules, club, emailConfigured] = await Promise.all([
    readAutomationRules(clubId),
    (prisma as any).club.findUnique({ where: { id: clubId } }),
    mailer.isConfigured(),
  ]);

  if (!club) throw new Error("Club non trovato");

  const clubName = asText(club.name) || "Il tuo club";
  const clubValues = buildClubValues(club);
  const enabled = rules.filter((rule) => rule.enabled);

  const deliveries: AutomationDeliveryOutcome[] = [];
  const digestEntries: DigestEntry[] = [];

  if (enabled.length === 0) {
    return {
      organizationId: clubId,
      clubName,
      occurrences: 0,
      rules: rules.map((rule) => ({
        trigger: rule.trigger,
        enabled: rule.enabled,
        occurrences: 0,
      })),
      deliveries,
      digest: null,
      totals: countTotals(deliveries),
      emailConfigured,
    };
  }

  const wantsCertificates = enabled.some(
    (rule) => rule.trigger === "certificate",
  );

  const athletes = await (prisma as any).athlete.findMany({
    where: { organization_id: clubId },
    ...(wantsCertificates
      ? { include: { medical_certificates: true } }
      : {}),
  });

  const hits = [
    ...(await evaluateInstallments({
      organizationId: clubId,
      athletes,
      rules: enabled,
      now,
    })),
    ...evaluateCertificates({ athletes, rules: enabled, now }),
    ...(await evaluateRsvp({
      organizationId: clubId,
      athletes,
      rules: enabled,
      now,
    })),
    ...(await evaluateDocumentExpiry({
      organizationId: clubId,
      athletes,
      rules: enabled,
      now,
    })),
  ];

  const hitsByTrigger = new Map<AutomationTriggerKind, AutomationHit[]>();
  for (const hit of hits) {
    const bucket = hitsByTrigger.get(hit.trigger);
    if (bucket) bucket.push(hit);
    else hitsByTrigger.set(hit.trigger, [hit]);
  }

  for (const rule of enabled) {
    const ruleHits = hitsByTrigger.get(rule.trigger) || [];
    if (ruleHits.length === 0) continue;

    if (rule.audience !== "club") {
      await deliverToFamilies({
        clubId,
        rule,
        hits: ruleHits,
        clubValues,
        now,
        scope,
        mailer,
        issueLink,
        emailConfigured,
        deliveries,
      });
    }

    if (rule.audience !== "family") {
      for (const hit of ruleHits) {
        const entry: DigestEntry = {
          triggerKind: hit.trigger,
          /*
            Il nome lo compone il proprietario canonico, non questo modulo:
            era la quarta copia privata della Wave, e le quattro non erano
            nemmeno d'accordo sull'ordine.
          */
          subjectName: formatAthleteNameLastFirst({
            first_name: hit.athleteFirstName,
            last_name: hit.athleteLastName,
          }),
          detail: hit.detail,
          when: hit.when,
        };

        if (rule.delivery === "digest") {
          digestEntries.push(entry);
          continue;
        }

        await notifyClub({ clubId, rule, hit, entry, now, deliveries });
      }
    }
  }

  const digest = await deliverDigest({
    clubId,
    club,
    clubName,
    entries: digestEntries,
    now,
    mailer,
    emailConfigured,
    deliveries,
  });

  const totals = countTotals(deliveries);

  await recordAuditEvent({
    action: AUDIT_ACTIONS.automationRun,
    actorUserId: scope?.userId || null,
    actorRole: scope?.activeRole || null,
    organizationId: clubId,
    resource: "automations",
    /*
      Un giro che aveva qualcosa da mandare e non ha mandato niente non e un
      successo: chi legge il registro deve poterlo distinguere senza aprire i
      metadati.
    */
    outcome: hits.length > 0 && totals.sent === 0 ? "failure" : "success",
    metadata: {
      occurrences: hits.length,
      rules: enabled.map((rule) => rule.trigger),
      sent: totals.sent,
      skipped: totals.skipped,
      failed: totals.failed,
      digestEntries: digestEntries.length,
      emailConfigured,
    },
  });

  return {
    organizationId: clubId,
    clubName,
    occurrences: hits.length,
    rules: rules.map((rule) => ({
      trigger: rule.trigger,
      enabled: rule.enabled,
      occurrences: (hitsByTrigger.get(rule.trigger) || []).length,
    })),
    deliveries,
    digest,
    totals,
    emailConfigured,
  };
};

/**
 * Il messaggio alla famiglia.
 *
 * **Un messaggio per occorrenza, non per destinatario.** Una comunicazione
 * massiva manda un messaggio solo a chi ha due figli, perche il testo li
 * riguarda entrambi; un'automazione parla di **una** posizione — questa rata,
 * questo certificato — e unire due posizioni direbbe un importo falso per
 * almeno una delle due. La chiave di deduplica porta per questo il soggetto e
 * l'occorrenza, e non solo la regola.
 */
const deliverToFamilies = async ({
  clubId,
  rule,
  hits,
  clubValues,
  now,
  scope,
  mailer,
  issueLink,
  emailConfigured,
  deliveries,
}: {
  clubId: string;
  rule: AutomationRule;
  hits: AutomationHit[];
  clubValues: Record<string, string>;
  now: Date;
  scope?: AudienceScope;
  mailer: AutomationMailer;
  issueLink: AutomationLinkIssuer;
  emailConfigured: boolean;
  deliveries: AutomationDeliveryOutcome[];
}) => {
  const hitsByAthlete = new Map<string, AutomationHit[]>();
  for (const hit of hits) {
    const bucket = hitsByAthlete.get(hit.athleteId);
    if (bucket) bucket.push(hit);
    else hitsByAthlete.set(hit.athleteId, [hit]);
  }

  /*
    **Il pubblico lo risolve l'audience engine**, anche quando gli atleti sono
    gia noti: le regole di raggiungibilita — una email un messaggio, i motivi
    dell'esclusione, l'account verificato in *questo* club — devono essere le
    stesse del sollecito e della comunicazione massiva. Un secondo risolutore
    sarebbe il difetto storico di questo repository, e un test strutturale lo
    vieta.
  */
  const audience = await resolveAudience({
    organizationId: clubId,
    criteria: [{ kind: "athlete_ids", values: [...hitsByAthlete.keys()] }],
    scope,
    now,
  });

  for (const exclusion of audience.exclusions) {
    deliveries.push({
      trigger: rule.trigger,
      channel: "email",
      recipient: exclusion.email || "",
      athleteName: exclusion.athleteName,
      status: "skipped",
      reason: exclusion.reason,
    });
  }

  const useEconomic = AUTOMATION_TRIGGERS[rule.trigger].allowEconomic;
  const wantsPaymentLink =
    useEconomic && economicPlaceholdersUsed(rule.template).includes("payment.link");

  for (const recipient of audience.recipients) {
    for (const position of recipient.positions) {
      for (const hit of hitsByAthlete.get(position.athleteId) || []) {
        const dedupKey = buildAutomationDedupKey({
          ruleId: AUTOMATION_TRIGGERS[rule.trigger].id,
          triggerKind: rule.trigger,
          subjectId: hit.athleteId,
          occurrenceId: hit.occurrenceId,
          offsetDays: hit.offsetDays,
        });

        const athleteName = [hit.athleteFirstName, hit.athleteLastName]
          .filter(Boolean)
          .join(" ");

        const baseValues: Record<string, string> = {
          ...clubValues,
          "recipient.name": recipient.name,
          "recipient.first_name":
            recipient.name.split(" ")[0] || recipient.name,
          "athlete.first_name": hit.athleteFirstName,
          "athlete.last_name": hit.athleteLastName,
          ...hit.values,
        };

        const preview = renderMessageTemplate({
          template: rule.template,
          values: baseValues,
          allowEconomic: useEconomic,
        });

        /*
          SMTP spento: non si rivendica niente e non si scrive niente nel
          registro. Ogni destinatario risulta `failed` con il motivo, cosi il
          conteggio non dice «inviato» per un messaggio che nessun server ha
          mai accettato — la stessa scelta gia fatta dal sollecito di Wave 1.
        */
        if (!emailConfigured) {
          deliveries.push({
            trigger: rule.trigger,
            channel: "email",
            recipient: recipient.email,
            athleteName,
            status: "failed",
            reason: "email_not_configured",
          });
          continue;
        }

        const claim = await claimDelivery({
          organizationId: clubId,
          sourceKind: "automation",
          sourceId: rule.trigger,
          dedupKey,
          channel: "email",
          recipientKey: recipient.key,
          recipientUserId: recipient.userId,
          recipientName: recipient.name,
          recipientEmail: recipient.email,
          athleteIds: [hit.athleteId],
          subject: preview.subject,
          /*
            `retryAfterMs: null` significa **mai**: l'occorrenza «rata 99,
            sette giorni prima del 30 novembre» capita una volta sola e il
            messaggio non si ripete. E la differenza con il sollecito a mano,
            che una persona puo volere rifare la settimana dopo.
          */
          retryAfterMs: null,
          now,
        });

        if (!claim.claimed) {
          deliveries.push({
            trigger: rule.trigger,
            channel: "email",
            recipient: recipient.email,
            athleteName,
            status: "skipped",
            reason: claim.reason,
          });
          continue;
        }

        let values = baseValues;

        if (wantsPaymentLink && hit.paymentId) {
          const link = await resolvePaymentLinkValue({
            clubId,
            paymentId: hit.paymentId,
            now,
            issueLink,
          });
          if (link) values = { ...baseValues, "payment.link": link };
        }

        const rendered =
          values === baseValues
            ? preview
            : renderMessageTemplate({
                template: rule.template,
                values,
                allowEconomic: useEconomic,
              });

        try {
          const result = await mailer.send({
            to: recipient.email,
            subject: rendered.subject,
            text: rendered.text,
            html: renderEmailLayout({ bodyHtml: rendered.html }),
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
              trigger: rule.trigger,
              channel: "email",
              recipient: recipient.email,
              athleteName,
              status: "failed",
              reason: result.reason || "delivery_failed",
            });
            continue;
          }

          await settleDelivery({ id: claim.id, organizationId: claim.organizationId, status: "sent", now });
          deliveries.push({
            trigger: rule.trigger,
            channel: "email",
            recipient: recipient.email,
            athleteName,
            status: "sent",
            reason: null,
          });

          if (recipient.userId) {
            await writeInAppCopy({
              clubId,
              rule,
              dedupKey,
              recipientKey: recipient.key,
              recipientUserId: recipient.userId,
              recipientName: recipient.name,
              recipientEmail: recipient.email,
              athleteId: hit.athleteId,
              athleteName,
              subject: rendered.subject,
              text: rendered.text,
              now,
              deliveries,
            });
          }
        } catch {
          await settleDelivery({
            id: claim.id,
            organizationId: claim.organizationId,
            status: "failed",
            reason: "delivery_failed",
            now,
          });
          deliveries.push({
            trigger: rule.trigger,
            channel: "email",
            recipient: recipient.email,
            athleteName,
            status: "failed",
            reason: "delivery_failed",
          });
        }
      }
    }
  }
};

/**
 * Il link di pagamento dentro il sollecito.
 *
 * **Si emette dopo la rivendicazione**, non prima: un token emesso e poi
 * scartato perche il messaggio era gia partito resterebbe valido trenta giorni
 * senza che nessuno lo abbia mai ricevuto.
 *
 * Un club senza l'entitlement `online_payments` non e un errore: il link non
 * si emette, il segnaposto resta irrisolto e il messaggio parte lo stesso —
 * meglio un sollecito senza link che nessun sollecito.
 */
const resolvePaymentLinkValue = ({
  clubId,
  paymentId,
  now,
  issueLink,
}: {
  clubId: string;
  paymentId: string;
  now: Date;
  issueLink: AutomationLinkIssuer;
}): Promise<string> =>
  /*
    La costruzione dell'indirizzo assoluto sta nel proprietario del link, non
    qui: la usa anche il sollecito a mano, e scritta due volte la prima
    divergenza sarebbe stata su cosa fare quando l'origine non e configurata.
  */
  resolveAbsolutePaymentLink({
    organizationId: clubId,
    paymentId,
    now,
    issueLink,
  });

/**
 * La copia in applicazione.
 *
 * Passa dal registro come l'email — con il canale `in_app` — perche senza la
 * riga una seconda esecuzione scriverebbe una seconda notifica, e perche «l'ha
 * letta?» riguarda questo canale e non l'altro. Un fallimento qui non annulla
 * l'email gia partita.
 */
const writeInAppCopy = async ({
  clubId,
  rule,
  dedupKey,
  recipientKey,
  recipientUserId,
  recipientName,
  recipientEmail,
  athleteId,
  athleteName,
  subject,
  text,
  now,
  deliveries,
}: {
  clubId: string;
  rule: AutomationRule;
  dedupKey: string;
  recipientKey: string;
  recipientUserId: string;
  recipientName: string;
  recipientEmail: string;
  athleteId: string;
  athleteName: string;
  subject: string;
  text: string;
  now: Date;
  deliveries: AutomationDeliveryOutcome[];
}) => {
  const claim = await claimDelivery({
    organizationId: clubId,
    sourceKind: "automation",
    sourceId: rule.trigger,
    dedupKey,
    channel: "in_app",
    recipientKey,
    recipientUserId,
    recipientName,
    recipientEmail,
    athleteIds: [athleteId],
    subject,
    retryAfterMs: null,
    now,
  });

  if (!claim.claimed) return;

  try {
    await (prisma as any).notification.create({
      data: {
        organization_id: clubId,
        user_id: recipientUserId,
        title: subject,
        message: text,
        type: `automation_${rule.trigger}`,
        read: false,
        data: { source: "automation", trigger: rule.trigger, dedupKey },
      },
    });
    await settleDelivery({ id: claim.id, organizationId: claim.organizationId, status: "sent", now });
    deliveries.push({
      trigger: rule.trigger,
      channel: "in_app",
      recipient: recipientEmail,
      athleteName,
      status: "sent",
      reason: null,
    });
  } catch {
    await settleDelivery({
      id: claim.id,
      organizationId: claim.organizationId,
      status: "failed",
      reason: "in_app_failed",
      now,
    });
    deliveries.push({
      trigger: rule.trigger,
      channel: "in_app",
      recipient: recipientEmail,
      athleteName,
      status: "failed",
      reason: "in_app_failed",
    });
  }
};

/**
 * L'avviso alla societa, uno per occorrenza.
 *
 * **La notifica e indirizzata, non «di club».** Questo commento diceva il
 * contrario, e il codice lo seguiva: `user_id: null` nel modello significa «di
 * club» e il prodotto lo interpreta come **di tutti** — l'area genitore legge
 * `user_id: null`. Il contenuto pero e economico e nominativo, quindi il giorno
 * dopo ogni famiglia leggeva la posizione delle altre. Il destinatario lo
 * sceglie `createClubNotifications`, e sono quelli che quel dato potrebbero gia
 * vederlo.
 */
const notifyClub = async ({
  clubId,
  rule,
  hit,
  entry,
  now,
  deliveries,
}: {
  clubId: string;
  rule: AutomationRule;
  hit: AutomationHit;
  entry: DigestEntry;
  now: Date;
  deliveries: AutomationDeliveryOutcome[];
}) => {
  const dedupKey = buildAutomationDedupKey({
    ruleId: AUTOMATION_TRIGGERS[rule.trigger].id,
    triggerKind: rule.trigger,
    subjectId: hit.athleteId,
    occurrenceId: hit.occurrenceId,
    offsetDays: hit.offsetDays,
  });

  const title = `${AUTOMATION_TRIGGERS[rule.trigger].label}: ${entry.subjectName}`;
  const message = entry.when ? `${entry.detail} (${entry.when})` : entry.detail;

  const claim = await claimDelivery({
    organizationId: clubId,
    sourceKind: "automation",
    sourceId: rule.trigger,
    dedupKey,
    channel: "in_app",
    recipientKey: CLUB_RECIPIENT_KEY,
    athleteIds: [hit.athleteId],
    subject: title,
    retryAfterMs: null,
    now,
  });

  if (!claim.claimed) {
    deliveries.push({
      trigger: rule.trigger,
      channel: "in_app",
      recipient: CLUB_RECIPIENT_KEY,
      athleteName: entry.subjectName,
      status: "skipped",
      reason: claim.reason,
    });
    return;
  }

  try {
    const raggiunti = await createClubNotifications({
      clubId,
      title,
      message,
      type: `automation_${rule.trigger}`,
      data: { source: "automation", trigger: rule.trigger, dedupKey },
    });

    if (raggiunti === 0) {
      /*
        Nessun account del club puo vedere questo dato. Non e un successo:
        dirlo `sent` significherebbe che la societa e stata avvisata quando non
        lo e stata.
      */
      await settleDelivery({
        id: claim.id,
        organizationId: claim.organizationId,
        status: "failed",
        reason: "no_club_recipient",
        now,
      });
      deliveries.push({
        trigger: rule.trigger,
        channel: "in_app",
        recipient: CLUB_RECIPIENT_KEY,
        athleteName: entry.subjectName,
        status: "failed",
        reason: "no_club_recipient",
      });
      return;
    }

    await settleDelivery({ id: claim.id, organizationId: claim.organizationId, status: "sent", now });
    deliveries.push({
      trigger: rule.trigger,
      channel: "in_app",
      recipient: CLUB_RECIPIENT_KEY,
      athleteName: entry.subjectName,
      status: "sent",
      reason: null,
    });
  } catch {
    await settleDelivery({
      id: claim.id,
      organizationId: claim.organizationId,
      status: "failed",
      reason: "in_app_failed",
      now,
    });
    deliveries.push({
      trigger: rule.trigger,
      channel: "in_app",
      recipient: CLUB_RECIPIENT_KEY,
      athleteName: entry.subjectName,
      status: "failed",
      reason: "in_app_failed",
    });
  }
};

/**
 * Il riepilogo giornaliero: **una** email alla societa con tutto dentro.
 *
 * La chiave di deduplica e il giorno, non l'occorrenza: due esecuzioni nello
 * stesso giorno producono un riepilogo solo, e un secondo giro non rimanda
 * niente. Il prezzo, dichiarato: cio che matura dopo il primo giro entra nel
 * riepilogo di domani.
 */
const deliverDigest = async ({
  clubId,
  club,
  clubName,
  entries,
  now,
  mailer,
  emailConfigured,
  deliveries,
}: {
  clubId: string;
  club: any;
  clubName: string;
  entries: DigestEntry[];
  now: Date;
  mailer: AutomationMailer;
  emailConfigured: boolean;
  deliveries: AutomationDeliveryOutcome[];
}) => {
  if (entries.length === 0) return null;

  const digest = buildDailyDigest({
    clubName,
    dayLabel: formatDate(now),
    entries,
  });
  if (!digest) return null;

  const dedupKey = buildAutomationDigestDedupKey(toDayKey(now));
  let sent = false;

  const inApp = await claimDelivery({
    organizationId: clubId,
    sourceKind: "automation",
    sourceId: "digest",
    dedupKey,
    channel: "in_app",
    recipientKey: CLUB_RECIPIENT_KEY,
    subject: digest.subject,
    retryAfterMs: null,
    now,
  });

  if (inApp.claimed) {
    try {
      /*
        Il riepilogo e l'elenco completo delle famiglie in arretrato, ordinato
        per cognome: e il contenuto piu sensibile che questa Wave produca.
        Indirizzato, mai «di club».
      */
      const raggiunti = await createClubNotifications({
        clubId,
        title: digest.subject,
        message: digest.text,
        type: "automation_digest",
        data: { source: "automation", digest: true, dedupKey },
      });

      if (raggiunti === 0) throw new Error("nessun destinatario di societa");

      await settleDelivery({ id: inApp.id, organizationId: inApp.organizationId, status: "sent", now });
      sent = true;
      deliveries.push({
        trigger: "digest",
        channel: "in_app",
        recipient: CLUB_RECIPIENT_KEY,
        athleteName: "",
        status: "sent",
        reason: null,
      });
    } catch {
      await settleDelivery({
        id: inApp.id,
        organizationId: inApp.organizationId,
        status: "failed",
        reason: "in_app_failed",
        now,
      });
    }
  }

  const address = clubDigestAddress(club);

  if (address && emailConfigured) {
    const claim = await claimDelivery({
      organizationId: clubId,
      sourceKind: "automation",
      sourceId: "digest",
      dedupKey,
      channel: "email",
      recipientKey: address,
      recipientEmail: address,
      recipientName: clubName,
      subject: digest.subject,
      retryAfterMs: null,
      now,
    });

    if (claim.claimed) {
      try {
        const result = await mailer.send({
          to: address,
          subject: digest.subject,
          text: digest.text,
          html: renderEmailLayout({ bodyHtml: digest.html }),
        });

        if (result.status === "sent") {
          await settleDelivery({ id: claim.id, organizationId: claim.organizationId, status: "sent", now });
          sent = true;
          deliveries.push({
            trigger: "digest",
            channel: "email",
            recipient: address,
            athleteName: "",
            status: "sent",
            reason: null,
          });
        } else {
          await settleDelivery({
            id: claim.id,
            organizationId: claim.organizationId,
            status: "failed",
            reason: result.reason || "delivery_failed",
            now,
          });
          deliveries.push({
            trigger: "digest",
            channel: "email",
            recipient: address,
            athleteName: "",
            status: "failed",
            reason: result.reason || "delivery_failed",
          });
        }
      } catch {
        await settleDelivery({
          id: claim.id,
          organizationId: claim.organizationId,
          status: "failed",
          reason: "delivery_failed",
          now,
        });
        deliveries.push({
          trigger: "digest",
          channel: "email",
          recipient: address,
          athleteName: "",
          status: "failed",
          reason: "delivery_failed",
        });
      }
    }
  }

  return { entries: digest.total, sent };
};

/**
 * Il giro su **tutti** i club: e cio che invoca il cron.
 *
 * Un club che fallisce non ferma gli altri, e il suo errore finisce nel
 * risultato **con il nome del club**: chi legge il log deve sapere quale
 * societa e rimasta senza promemoria, non solo che qualcosa non ha
 * funzionato.
 */
export const runAutomationsForAllClubs = async (
  now = new Date(),
  options: { mailer?: AutomationMailer; issueLink?: AutomationLinkIssuer } = {},
) => {
  const clubs = await prisma.club.findMany({ select: { id: true, name: true } });

  const results: Array<
    | (AutomationRunResult & { ok: true })
    | {
        organizationId: string;
        clubName: string;
        ok: false;
        error: string;
      }
  > = [];

  for (const club of clubs) {
    try {
      const result = await runAutomationsForClub({
        organizationId: club.id,
        now,
        ...options,
      });
      results.push({ ...result, clubName: club.name, ok: true });
    } catch (error: any) {
      results.push({
        organizationId: club.id,
        clubName: club.name,
        ok: false,
        error: String(error?.message || error),
      });
    }
  }

  return results;
};

/* ---------------------------------------------------------- l'anteprima */

export type AutomationRuleView = AutomationRule & {
  label: string;
  description: string;
  direction: "before" | "after";
  defaultOffsetDays: number[];
  /** Se la schermata deve offrire il filtro per categoria di documento. */
  supportsCategoryFilter: boolean;
  /** Il messaggio come lo leggerebbe una famiglia, con dati di esempio. */
  sample: { subject: string; text: string; unresolved: string[] };
};

/**
 * Le regole per la schermata, con l'anteprima del testo.
 *
 * **L'anteprima usa dati di esempio, e lo dice.** Un'automazione non ha ancora
 * un destinatario quando la si configura: mostrare il messaggio su una
 * famiglia vera richiederebbe di sceglierne una, e sceglierla sarebbe gia una
 * decisione. Cio che conta e che i segnaposto **senza valore** si vedano
 * prima, non dopo trecento invii.
 */
export const listAutomationRulesForClub = async ({
  organizationId,
  scope,
  actorRole,
}: {
  organizationId?: string | null;
  scope?: AudienceScope;
  actorRole?: string | null;
}): Promise<{
  organizationId: string;
  clubName: string;
  rules: AutomationRuleView[];
}> => {
  assertCommunicationPermission(
    actorRole ?? scope?.activeRole ?? null,
    "automations.manage",
  );

  const clubId = resolveClubId(scope, organizationId);

  const [rules, club] = await Promise.all([
    readAutomationRules(clubId),
    (prisma as any).club.findUnique({ where: { id: clubId } }),
  ]);

  if (!club) throw new Error("Club non trovato");

  const clubValues = buildClubValues(club);

  return {
    organizationId: clubId,
    clubName: asText(club.name) || "Il tuo club",
    rules: rules.map((rule) => {
      const definition = getAutomationTrigger(rule.trigger);
      const rendered = renderMessageTemplate({
        template: rule.template,
        values: { ...clubValues, ...SAMPLE_VALUES },
        allowEconomic: definition.allowEconomic,
      });

      return {
        ...rule,
        label: definition.label,
        description: definition.description,
        direction: definition.direction,
        defaultOffsetDays: [...definition.defaultOffsetDays],
        supportsCategoryFilter: definition.supportsCategoryFilter === true,
        sample: {
          subject: rendered.subject,
          text: rendered.text,
          unresolved: [...rendered.unresolved, ...rendered.denied],
        },
      };
    }),
  };
};

/**
 * I valori di esempio dell'anteprima.
 *
 * Sono dichiaratamente finti, e la schermata lo scrive. Un'anteprima su dati
 * inventati che si spaccia per vera e peggio di nessuna anteprima: qui serve a
 * far vedere **la forma** del messaggio e i segnaposto che restano vuoti.
 */
const SAMPLE_VALUES: Record<string, string> = {
  "recipient.name": "Maria Bianchi",
  "recipient.first_name": "Maria",
  "athlete.first_name": "Luca",
  "athlete.last_name": "Bianchi",
  "installment.description": "Rata di novembre",
  "installment.due_date": "30/11/2026",
  "installment.residual_amount": "130,00 euro",
  "installment.overdue_count": "2",
  "payment.next_due_date": "31/12/2026",
  "payment.link": "https://easygame.example/pay/xxxxxxxx",
  "medical_certificate.status": "Certificato in scadenza",
  "medical_certificate.expiry_date": "15/12/2026",
  "event.title": "Allenamento Under 14",
  "event.date": "12/11/2026",
  "event.time": "18:30",
  "document.title": "BLSD",
  "document.date": "20/12/2026",
};
