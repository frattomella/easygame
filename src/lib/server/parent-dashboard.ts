import { prisma } from "@/lib/server/prisma";
import { stripGuardianAccessTokens } from "@/lib/health/permissions";
import {
  buildClubCategoryOptions,
  resolveCategoryLabel,
  type NormalizedCategoryOption,
} from "@/lib/category-utils";
import { getAthleteDisplayName } from "@/lib/athlete-name-utils";
import { normalizeActiveClubSeason } from "@/lib/club-seasons";
import {
  getLatestMedicalCertificateExpiry,
  getMedicalCertificateAvailability,
  getMedicalCertificateAvailabilityLabel,
} from "@/lib/medical-certificates";
import { toFamilyFreeSlot } from "@/lib/appointments/projection";
import { getAthleteEnrollmentSummary } from "@/lib/athlete-enrollment-summary";
import { dedupeTrainings } from "@/lib/training-utils";
/*
  Percorso relativo come lo usa `document-requests.ts`: il servizio degli
  allegati e server-only, e `tests/ui/attachment-contract.test.mjs` presidia che
  nessuno lo raggiunga con l'alias `@/lib/server/**`, che e la forma che un
  componente client copierebbe.
*/
import { listAttachments } from "./attachments";
import {
  buildFamilyDocumentAreas,
  type FamilyDocumentAreas,
  type FamilyDossierFile,
  type FamilyDossierInput,
} from "@/lib/documents/family-dossier";
import { resolveDocumentKind } from "@/lib/documents/kind-catalog";
import { computeFreeAppointmentSlots } from "@/lib/appointments/model";
import { toFamilyAppointment } from "@/lib/appointments/projection";
import {
  getVisibleBookableStructures,
  type ClubStructure,
} from "@/lib/structures-utils";

/*
  Mancava il trattino fra la variante e il nodo: `[89ab][0-9a-f]{12}` sono
  tredici caratteri di fila dove lo UUID ne ha quattro, un trattino e dodici.
  Nessun identificativo reale corrispondeva mai — e siccome l'unico uso e
  «se **non** e uno UUID allora ricadi sul primo atleta collegato», la ricaduta
  scattava sempre: chiedere l'atleta di un altro non otteneva un rifiuto, ma il
  proprio primo figlio, e un genitore con figli in due club poteva vedersi
  presentare quello sbagliato. Il ramo del rifiuto era codice morto.
*/
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asRecord = (value: unknown): Record<string, any> =>
  isRecord(value) ? value : {};

const asArray = <T = any>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

const normalizeToken = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }

  return "";
};

const sameId = (left: unknown, right: unknown) =>
  normalizeToken(left) !== "" && normalizeToken(left) === normalizeToken(right);

const toIso = (value: unknown) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const getGuardianRows = (athlete: any) => {
  const data = asRecord(athlete?.data);
  const guardians = asArray(data.guardians).map((guardian, index) => ({
    id:
      firstText(
        guardian?.id,
        guardian?.guardianId,
        guardian?.email,
        guardian?.phone,
      ) || `guardian-${index}`,
    name: firstText(guardian?.name, guardian?.firstName, guardian?.first_name),
    surname: firstText(
      guardian?.surname,
      guardian?.lastName,
      guardian?.last_name,
    ),
    relationship: firstText(guardian?.relationship, guardian?.role),
    email: firstText(guardian?.email),
    phone: firstText(guardian?.phone),
    linkedUserId: firstText(guardian?.linkedUserId, guardian?.linked_user_id),
    linkedUserEmail: firstText(
      guardian?.linkedUserEmail,
      guardian?.linked_user_email,
    ),
  }));

  const legacyParents = [data.parent1, data.parent2]
    .filter(Boolean)
    .map((guardian, index) => ({
      id:
        firstText(guardian?.id, guardian?.email, guardian?.phone) ||
        `legacy-parent-${index + 1}`,
      name: firstText(guardian?.name, guardian?.firstName, guardian?.first_name),
      surname: firstText(
        guardian?.surname,
        guardian?.lastName,
        guardian?.last_name,
      ),
      relationship: firstText(guardian?.relationship) || "Genitore",
      email: firstText(guardian?.email),
      phone: firstText(guardian?.phone),
      linkedUserId: firstText(guardian?.linkedUserId, guardian?.linked_user_id),
      linkedUserEmail: firstText(
        guardian?.linkedUserEmail,
        guardian?.linked_user_email,
      ),
    }));

  return guardians.length > 0 ? guardians : legacyParents;
};

/**
 * **I campi che dimostrano un legame fra un tutore e un'utenza.**
 *
 * Vive qui, esportato, perche due posti devono guardare la **stessa** lista:
 * questo predicato, che apre il cruscotto della famiglia, e la guardia di
 * `resources.ts` che impedisce di scriversi un legame addosso. Una revisione
 * ha misurato la divergenza — la guardia sorvegliava due campi, il predicato
 * ne leggeva cinque — e da quella distanza si passava.
 */
export const GUARDIAN_LINK_FIELDS: readonly string[] = [
  "linkedUserId",
  "linked_user_id",
  "userId",
  "user_id",
  "linkedUserEmail",
  "linked_user_email",
  /*
    L'email di **contatto** e la settima, e non e un errore: e il campo con
    cui una famiglia entra senza riscattare un codice, e `U-06` lo verifica
    per nome. Sta in questa lista proprio perche scriverla concede accesso.
  */
  "email",
] as const;

const isGuardianLinkedToUser = (
  guardian: Record<string, any>,
  userId: string,
  userEmail?: string | null,
) => {
  const linkedUserId = firstText(
    guardian.linkedUserId,
    guardian.linked_user_id,
    guardian.userId,
    guardian.user_id,
  );
  /*
    **L'email di contatto vale come legame, ed e voluto.**

    E il modo in cui una famiglia entra senza riscattare un codice: la
    segreteria scrive l'indirizzo del genitore, e quel genitore — che a quel
    punto ha un'utenza con la **stessa email verificata** — trova il figlio.
    Una sonda lo verifica per nome (`U-06`), quindi non e un residuo: e una
    capability.

    Ma allora **scrivere quell'indirizzo e un atto che concede l'accesso
    clinico**, perche il cruscotto di famiglia mostra allergie, farmaci e
    visite. Il permesso che serve non e quello sull'anagrafica: e
    `clinical.read`, e la guardia sta in `resources.ts`, dove la scrittura
    passa. Qui si dice solo che il legame e questo.
  */
  const linkedUserEmail = firstText(
    guardian.linkedUserEmail,
    guardian.linked_user_email,
    guardian.email,
  );

  return (
    sameId(linkedUserId, userId) ||
    (!!userEmail && sameId(linkedUserEmail, userEmail))
  );
};

const athleteBelongsToParent = (
  athlete: any,
  userId: string,
  userEmail?: string | null,
) => {
  if (sameId(athlete?.user_id, userId)) {
    return true;
  }

  return getGuardianRows(athlete).some((guardian) =>
    isGuardianLinkedToUser(guardian, userId, userEmail),
  );
};

const getAthleteCategoryTokens = (
  athlete: any,
  categories: NormalizedCategoryOption[] = [],
) => {
  const data = asRecord(athlete?.data);
  const memberships = asArray(athlete?.category_memberships).concat(
    asArray(data.categoryMemberships),
    asArray(data.category_memberships),
  );
  const rawValues = [
    athlete?.category_id,
    athlete?.category_name,
    data.category,
    data.categoryId,
    data.category_id,
    data.categoryName,
    data.category_name,
    asArray(data.categories),
    memberships.map((membership) => [
      membership?.category_id,
      membership?.categoryId,
      membership?.category_name,
      membership?.categoryName,
    ]),
  ].flat(3);

  const tokens = new Set<string>();
  rawValues.forEach((value) => {
    const text =
      isRecord(value) ? firstText(value.id, value.name, value.label) : firstText(value);
    if (!text) return;

    tokens.add(normalizeToken(text));
    tokens.add(normalizeToken(resolveCategoryLabel(text, categories)));
  });

  return tokens;
};

const getRecordCategoryTokens = (
  record: any,
  categories: NormalizedCategoryOption[] = [],
) => {
  const source = asRecord(record);
  const data = asRecord(source.data);
  const rawValues = [
    source.category,
    source.categoryId,
    source.category_id,
    source.categoryName,
    source.category_name,
    source.categoryIds,
    source.category_ids,
    source.categories,
    data.category,
    data.categoryId,
    data.category_id,
    data.categoryName,
    data.category_name,
    data.categories,
  ].flatMap((value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string" && value.includes(",")) {
      return value.split(",").map((entry) => entry.trim());
    }
    return [value];
  });

  const tokens = new Set<string>();
  rawValues.forEach((value) => {
    const text =
      isRecord(value) ? firstText(value.id, value.name, value.label) : firstText(value);
    if (!text) return;

    tokens.add(normalizeToken(text));
    tokens.add(normalizeToken(resolveCategoryLabel(text, categories)));
  });

  return tokens;
};

const hasTokenIntersection = (left: Set<string>, right: Set<string>) =>
  Array.from(left).some((token) => right.has(token));

const getAthleteReferenceTokens = (athlete: any) => {
  const data = asRecord(athlete?.data);
  const tokens = [
    athlete?.id,
    athlete?.user_id,
    athlete?.jersey_number,
    athlete?.category_id,
    athlete?.category_name,
    getAthleteDisplayName(athlete),
    [athlete?.first_name, athlete?.last_name].filter(Boolean).join(" "),
    data.name,
    data.fullName,
    data.full_name,
    data.athleteName,
    data.athlete_name,
    data.jerseyNumber,
    data.jersey_number,
  ]
    .map(normalizeToken)
    .filter(Boolean);

  return new Set(tokens);
};

const valueReferencesAthlete = (value: unknown, tokens: Set<string>): boolean => {
  if (value === null || value === undefined) return false;

  if (Array.isArray(value)) {
    return value.some((entry) => valueReferencesAthlete(entry, tokens));
  }

  if (isRecord(value)) {
    const directTokens = [
      value.id,
      value.athleteId,
      value.athlete_id,
      value.userId,
      value.user_id,
      value.name,
      value.fullName,
      value.full_name,
      value.athleteName,
      value.athlete_name,
      [value.firstName, value.lastName].filter(Boolean).join(" "),
      [value.first_name, value.last_name].filter(Boolean).join(" "),
      value.jerseyNumber,
      value.jersey_number,
    ]
      .map(normalizeToken)
      .filter(Boolean);

    return directTokens.some((token) => tokens.has(token));
  }

  const normalized = normalizeToken(value);
  if (!normalized) return false;

  if (tokens.has(normalized)) return true;

  return normalized
    .split(",")
    .map((entry) => normalizeToken(entry))
    .some((entry) => tokens.has(entry));
};

const resolveMatchParticipationStatus = (match: any, athlete: any) => {
  const tokens = getAthleteReferenceTokens(athlete);
  const data = asRecord(match?.data);
  const payload = asRecord(match?.payload);
  const negativeSources = [
    match?.absentAthletes,
    match?.absent_athletes,
    match?.notCalledAthletes,
    match?.not_called_athletes,
    match?.unavailableAthletes,
    payload.absentAthletes,
    payload.notCalledAthletes,
    data.absentAthletes,
    data.notCalledAthletes,
  ];
  const participatedSources = [
    match?.participants,
    match?.participantIds,
    match?.participant_ids,
    match?.playedAthletes,
    match?.presentAthletes,
    payload.participants,
    payload.participantIds,
    payload.playedAthletes,
    data.participants,
    data.participantIds,
  ];
  const calledSources = [
    match?.calledAthletes,
    match?.calledAthleteIds,
    match?.called_athletes,
    match?.selectedAthletes,
    match?.selectedAthleteIds,
    match?.athletes,
    match?.athleteIds,
    match?.roster,
    match?.lineup,
    match?.convocations,
    payload.calledAthletes,
    payload.calledAthleteIds,
    payload.selectedAthletes,
    payload.athletes,
    payload.convocations,
    data.calledAthletes,
    data.calledAthleteIds,
    data.selectedAthletes,
    data.athletes,
    data.convocations,
  ];

  if (negativeSources.some((source) => valueReferencesAthlete(source, tokens))) {
    return "not_called";
  }

  if (participatedSources.some((source) => valueReferencesAthlete(source, tokens))) {
    return "participated";
  }

  if (calledSources.some((source) => valueReferencesAthlete(source, tokens))) {
    return "called";
  }

  return "unknown";
};

const normalizeAttendanceStatus = (status: unknown) => {
  const normalized = normalizeToken(status);
  if (["present", "presente", "late", "ritardo"].includes(normalized)) {
    return "present";
  }
  if (["absent", "assente", "justified", "giustificato"].includes(normalized)) {
    return "absent";
  }
  return "unknown";
};

const recordMatchesAthlete = (
  record: any,
  athlete: any,
  categories: NormalizedCategoryOption[],
) => {
  const recordTokens = getRecordCategoryTokens(record, categories);
  const athleteTokens = getAthleteCategoryTokens(athlete, categories);

  if (recordTokens.size === 0 && athleteTokens.size === 0) {
    return true;
  }

  return hasTokenIntersection(recordTokens, athleteTokens);
};

const getEventDate = (event: any) => {
  const value = firstText(
    event?.date,
    event?.matchDate,
    event?.match_date,
    event?.scheduled_at,
    event?.scheduledAt,
    event?.start,
    event?.startsAt,
  );
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const time = firstText(event?.time, event?.startTime, event?.start_time);
  const match = time.match(/\d{1,2}:\d{2}/);
  if (match) {
    const [hours, minutes] = match[0].split(":").map(Number);
    date.setHours(hours || 0, minutes || 0, 0, 0);
  }

  return date;
};

const resolveMatchStatus = (match: any) => {
  const status = normalizeToken(match?.status);
  if (["cancelled", "annullata", "annullato"].includes(status)) {
    return "cancelled";
  }

  if (["completed", "complete", "conclusa", "concluso"].includes(status)) {
    return "completed";
  }

  const eventDate = getEventDate(match);
  if (eventDate && eventDate < new Date()) {
    return "completed";
  }

  return "upcoming";
};

const resolveTrainingStatus = (training: any) => {
  const status = normalizeToken(training?.status);
  if (["cancelled", "annullato", "annullata"].includes(status)) {
    return "cancelled";
  }

  if (["completed", "concluded", "concluso", "conclusa"].includes(status)) {
    return "completed";
  }

  const eventDate = getEventDate(training);
  if (eventDate && eventDate < new Date()) {
    return "completed";
  }

  return "upcoming";
};

/**
 * I campi di un evento che una famiglia puo vedere.
 *
 * **Elenco chiuso, e non una lista di esclusioni.** Un evento porta anche le
 * convocazioni — cioe gli identificativi di altri minori — e le note interne
 * del club: dichiarare cosa **puo uscire** e l'unica forma in cui un campo
 * nuovo nasce invisibile invece che visibile.
 */
const CAMPI_EVENTO_VISIBILI_ALLA_FAMIGLIA = [
  "id",
  "legacy_id",
  "kind",
  "title",
  "name",
  "date",
  "time",
  "startTime",
  "start_time",
  "endTime",
  "end_time",
  "startsAt",
  "starts_at",
  "endsAt",
  "ends_at",
  "location",
  "locationName",
  "location_name",
  "field",
  "fieldName",
  "venue",
  "opponent",
  "homeAway",
  "home_away",
  "category",
  "categoryName",
  "category_name",
  "categoryId",
  "category_id",
  "categories",
  "status",
  "notes",
  "rsvpRequired",
  "rsvp_required",
  "rsvpDeadline",
  "rsvp_deadline",
  "timezone",
] as const;

const summarizeEvent = (
  event: any,
  categories: NormalizedCategoryOption[],
  kind: "training" | "match",
) => {
  const eventDate = getEventDate(event);
  const categoryReference = firstText(
    event?.category,
    event?.categoryName,
    event?.category_name,
    event?.categoryId,
    event?.category_id,
    asArray(event?.categories)[0],
  );
  const category =
    categoryReference && categoryReference !== "[object Object]"
      ? resolveCategoryLabel(categoryReference, categories)
      : "Categoria";

  /*
    **Un elenco chiuso, e non uno spread.**

    Qui c'era `{ ...event }`, e `event` e la proiezione grezza della riga di
    `club_events`. Il filtro sceglie **quali** eventi passano; non ha mai detto
    niente su **cosa** contengono.

    Misurato sulla home di un genitore: nel payload di una gara arrivavano
    `convocatedAthletes` e `convocationEntries` — cioe gli identificativi di
    **ogni altro minore convocato**, con il loro attributo di appartenenza
    («fuori quota») — e `noteInterne`, il campo libero che il club scrive per
    se. Gli identificativi sono spendibili su ogni superficie `[athleteId]`.

    L'area atleta, costruita nella stessa Wave, proietta con un elenco chiuso:
    e la forma giusta, e qui mancava. Un campo nuovo su `club_events` deve
    nascere **invisibile** alla famiglia, non visibile finche qualcuno se ne
    accorge.
  */
  const visibile: Record<string, any> = {};
  for (const campo of CAMPI_EVENTO_VISIBILI_ALLA_FAMIGLIA) {
    if (Object.prototype.hasOwnProperty.call(event ?? {}, campo)) {
      visibile[campo] = (event as Record<string, any>)[campo];
    }
  }

  return {
    ...visibile,
    id:
      firstText(event?.id) ||
      [
        kind,
        eventDate?.toISOString() || firstText(event?.date),
        firstText(event?.time, event?.startTime, event?.start_time),
        category,
        firstText(event?.title, event?.name),
      ]
        .map((value) => normalizeToken(value))
        .filter(Boolean)
        .join("-"),
    title:
      firstText(event?.title, event?.name) ||
      (kind === "training" ? "Allenamento" : "Gara"),
    startsAt: eventDate ? eventDate.toISOString() : null,
    date: toIso(eventDate || event?.date),
    time: firstText(event?.time, event?.startTime, event?.start_time),
    category,
    location: firstText(
      event?.location,
      event?.locationName,
      event?.location_name,
      event?.field,
      event?.fieldName,
      event?.venue,
    ),
    status:
      kind === "training" ? resolveTrainingStatus(event) : resolveMatchStatus(event),
  };
};

const sortByStart = (left: any, right: any) =>
  (left?.startsAt ? new Date(left.startsAt).getTime() : Number.MAX_SAFE_INTEGER) -
  (right?.startsAt ? new Date(right.startsAt).getTime() : Number.MAX_SAFE_INTEGER);

/**
 * **I moduli da stampare che il club pubblica**, quando nessuno li ha ancora
 * chiesti nel fascicolo.
 *
 * `clubs.document_templates` non e una richiesta: non ha un destinatario, non
 * ha una scadenza e non ha uno stato. E un modulo in bianco da scaricare. Fino
 * alla Wave 6 l'area famiglia lo mescolava con i caricamenti gia fatti — ed e
 * meta di W6-40 — presentando la stessa carta due volte con due stati diversi.
 *
 * Qui resta, perche un club che li usa non deve perderli, ma **cede il posto**
 * appena esiste una richiesta vera dello stesso tipo: quella ha una scadenza e
 * uno stato, e il modulo in bianco no.
 */
const resolveClubTemplateTodo = (
  club: any,
  entries: readonly FamilyDossierInput[],
): FamilyDocumentAreas["todo"] => {
  const tipiGiaChiesti = new Set(
    entries.map((entry) => resolveDocumentKind(entry.documentKind)),
  );

  return asArray(club?.document_templates)
    .map((template, index) => {
      const id =
        firstText(
          template?.id,
          template?.templateId,
          template?.name,
          template?.title,
        ) || `document-template-${index}`;
      const titolo = firstText(template?.title, template?.name) || "Documento";
      const kind = resolveDocumentKind(
        firstText(
          template?.documentType,
          template?.document_type,
          template?.type,
          titolo,
        ),
      );

      return { id, titolo, kind, template };
    })
    .filter((voce) => !tipiGiaChiesti.has(voce.kind))
    .map((voce) => ({
      id: voce.id,
      requestId: null,
      submissionId: null,
      documentKind: voce.kind,
      documentKindLabel: voce.titolo,
      title: voce.titolo,
      description: firstText(
        voce.template?.description,
        voce.template?.notes,
      ),
      state: "missing" as const,
      stateLabel: "Da caricare",
      required: true,
      dueDate: null,
      daysLeft: null,
      validUntil: null,
      submittedAt: null,
      decidedAt: null,
      rejectionReason: null,
      fileName: "",
      /* Il modulo in bianco da scaricare, compilare e ricaricare firmato. */
      fileUrl: firstText(
        voce.template?.fileUrl,
        voce.template?.file_url,
        voce.template?.url,
      ),
      mimeType: "",
      action: "upload" as const,
      actionLabel: "Carica",
      historyCount: 0,
    }));
};

/**
 * **Le due aree documentali della famiglia, lette dal fascicolo vero**
 * (W6-37, W6-38, W6-40).
 *
 * ---
 *
 * ## Cosa cambia
 *
 * Prima questa funzione non esisteva e l'area famiglia leggeva
 * `athletes.data.sharedDocuments` — l'array JSON dentro l'anagrafica. Una
 * richiesta creata dalla segreteria nel fascicolo nuovo **non arrivava alla
 * famiglia**: le quattro rotte della Wave 5 erano corrette e nessuno le
 * chiamava. Adesso la sorgente e `document_requests` / `document_submissions`,
 * cioe la stessa che vede il club.
 *
 * ## Il permesso e il legame, e passa dalla guardia del dominio
 *
 * Lo scope si costruisce con `activeRole: null` **di proposito**: cosi
 * `roleHasPermission` risponde `false` e l'unica strada aperta dentro
 * `getDocumentDossier` resta `canParentAccessAthlete`. E la stessa forma di
 * `resolveLinkedFamilyScope`, e la ragione e la stessa: un tutore puo non avere
 * nessuna appartenenza al club.
 *
 * ## Perche l'importazione e dinamica
 *
 * `document-requests.ts` importa `canParentAccessAthlete` da **questo** file.
 * Un import statico chiuderebbe il cerchio: funzionerebbe in Node, dove le due
 * funzioni si toccano solo a chiamata, ma metterebbe un ciclo dentro il grafo
 * che il bundler risolve — e il costo di scoprirlo e un `undefined` in
 * produzione. Una riga di `await import` costa meno.
 */
export const getFamilyDocumentAreas = async (
  userId: string,
  athlete: { id: string; organization_id: string },
  club: any,
  options: { now?: Date } = {},
): Promise<FamilyDocumentAreas> => {
  const organizationId = String(athlete?.organization_id || "");
  const scope = {
    userId: String(userId || ""),
    activeOrganizationId: organizationId,
    activeRole: null as string | null,
    allowedOrganizationIds: [organizationId],
  };

  const { getDocumentDossier } = await import("./document-requests");

  const entries = (await getDocumentDossier(
    scope,
    { subjectKind: "athlete", subjectId: athlete.id },
    { now: options.now },
  )) as unknown as FamilyDossierInput[];

  /*
    I metadati dei file in **una** lettura, da Attachment Core che ne e il
    proprietario: nome, tipo, indirizzo e validita. Il fascicolo porta
    l'identificativo dell'allegato e non sa niente del file, e chiederlo riga
    per riga sarebbe una lettura per documento.
  */
  const allegati = organizationId
    ? await listAttachments(
        { organizationId, ownerType: "athlete", ownerId: athlete.id },
        scope,
      )
    : [];

  /*
    **L'indirizzo e quello di famiglia, non quello generico degli allegati.**

    `allegato.url` e l'indirizzo della rotta generica degli allegati — quello
    che costruisce `buildAttachmentUrl` — e quella rotta chiede
    `canAccessClubResource(role, "athletes", "read")`. Un genitore non ha quel
    permesso, e un tutore senza riga in `organization_users` ha addirittura
    `activeRole: null` — lo scope qui sopra lo costruisce apposta cosi: la
    risposta e `false`, e il pulsante «Scarica» rispondeva **403** su un
    documento che la famiglia stava guardando elencato.

    La rotta di famiglia risolve i byte **per legame**
    (`resolveLinkedFamilyScope` + `resolveDossierAttachmentId`, che accetta
    anche l'identificativo dell'allegato) ed e la stessa che la card usava
    prima della Wave 6.
  */
  const urlDiFamiglia = (attachmentId: string) =>
    `/api/parent-dashboard/${encodeURIComponent(athlete.id)}` +
    `/documents/${encodeURIComponent(attachmentId)}?download=1`;

  const perAllegato = new Map<string, FamilyDossierFile>(
    allegati.map((allegato) => [
      allegato.id,
      {
        fileName: allegato.fileName,
        mimeType: allegato.mimeType,
        url: urlDiFamiglia(allegato.id),
        validUntil: allegato.validUntil,
      },
    ]),
  );

  const aree = buildFamilyDocumentAreas(entries, perAllegato, {
    now: options.now,
  });

  return {
    todo: [...aree.todo, ...resolveClubTemplateTodo(club, entries)],
    archive: aree.archive,
  };
};

const serializeAthleteCard = (athlete: any) => {
  const data = asRecord(athlete?.data);

  return {
    id: athlete.id,
    organization_id: athlete.organization_id,
    name: getAthleteDisplayName(athlete),
    first_name: athlete.first_name,
    last_name: athlete.last_name,
    birth_date: toIso(athlete.birth_date),
    category_id: athlete.category_id,
    category_name: athlete.category_name,
    /*
      W6-14. Tutte le appartenenze, con la primaria dichiarata invece che
      dedotta. La famiglia deve poterle vedere tutte: e la squadra del
      proprio figlio, non un dettaglio amministrativo.
    */
    categories: asArray(athlete.category_memberships).map(
      (membership: any) => ({
        id: membership.category_id,
        name: membership.category_name || membership.category_id,
        siteId: membership.site_id || null,
        isPrimary: Boolean(membership.is_primary),
      }),
    ),
    status: athlete.status,
    jersey_number: firstText(athlete.jersey_number, data.jerseyNumber, data.jersey_number),
    email: firstText(data.email, data.athleteEmail, data.athlete_email),
    phone: firstText(data.phone, data.mobile, data.athletePhone, data.athlete_phone),
    address: firstText(data.address),
    city: firstText(data.city),
    province: firstText(data.province),
    postal_code: firstText(data.postalCode, data.postal_code),
    fiscal_code: firstText(data.fiscalCode, data.fiscal_code),
    birth_place: firstText(data.birthPlace, data.birth_place),
    nationality: firstText(data.nationality),
    gender: firstText(data.gender),
  };
};

const serializeParentStructure = (structure: ClubStructure) => ({
  id: structure.id,
  name: structure.name,
  address: structure.address,
  city: structure.city || "",
  type: structure.type || "",
  isPublic: structure.isPublic,
  isVisibleToMembers: structure.isVisibleToMembers,
  fields: structure.fields.map((field) => ({
    id: field.id,
    name: field.name,
    ownership: field.ownership,
    isBookable: field.isBookable,
    isVisible: field.isVisible,
    availability: field.availability,
    pricing: field.pricing,
  })),
});

const serializeParentStructureBooking = (
  booking: any,
  structure: ClubStructure,
) => ({
  id: booking.id,
  structureId: structure.id,
  structureName: structure.name,
  fieldId: booking.fieldId || "",
  fieldName:
    booking.fieldName ||
    structure.fields.find((field) => sameId(field.id, booking.fieldId))?.name ||
    "",
  title: booking.title || "Prenotazione",
  start: booking.start,
  end: booking.end,
  status: booking.status || "pending",
  notes: booking.notes || "",
  amount: booking.amount,
  paymentStatus: booking.paymentStatus,
});

export const getParentLinkedAthletes = async (userId: string) => {
  /*
    **Tre domande su `userId`, e nessuna dipende dall'altra.**

    Erano tre `await` in fila. Su Neon da Vercel ogni lettura paga un giro di
    rete: in fila costano tre attese, insieme una. La misura del §27
    (`npm run wave6:perf`) conta le attese iniettando una latenza fissa, ed e
    li che si vedono — il conteggio delle interrogazioni non cambia, il tempo
    che una famiglia aspetta si.

    L'elenco degli atleti resta dopo, perche quello **dipende** davvero dalle
    prime due: e la quarta attesa, e non si puo togliere.
  */
  const [user, memberships, ownedClubs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, email_verified_at: true },
    }),
    prisma.organizationUser.findMany({
      where: { user_id: userId },
      select: { organization_id: true },
    }),
    prisma.club.findMany({
      where: { creator_id: userId },
      select: { id: true },
    }),
  ]);

  /*
    **L'indirizzo vale come legame solo se e verificato.**

    Un tutore si collega al suo account redimendo un token, e allora c'e
    `linked_user_id`. Finche non lo ha fatto vale anche la corrispondenza con
    l'indirizzo di contatto che la segreteria ha scritto sulla scheda — ed e
    quella corrispondenza che apriva la porta.

    `PATCH /api/v1/auth/user` lascia cambiare il proprio indirizzo con qualunque
    altro non ancora registrato. Chiunque avesse **una qualsiasi** tessera nel
    club — genitore di suo figlio, atleta, allenatore — poteva scrivere
    l'indirizzo del tutore di un'altra famiglia e leggere di quel minore
    pagamenti, fatture, **certificati medici** e documenti d'identita, poi
    rimettere il proprio.

    Il cambio azzera pero `email_verified_at`, e il login non rilascia sessioni
    a un indirizzo non verificato: pretendere qui la verifica chiude la strada
    senza toccare il tutore vero, che per avere una sessione ha gia dovuto
    dimostrare di leggere quella casella.
  */
  const verifiedEmail = user?.email_verified_at ? user.email : null;
  const organizationIds = Array.from(
    new Set(
      memberships
        .map((membership) => membership.organization_id)
        .concat(ownedClubs.map((club) => club.id)),
    ),
  );

  const candidateAthletes = await prisma.athlete.findMany({
    where: {
      OR: [
        { user_id: userId },
        ...(organizationIds.length
          ? [{ organization_id: { in: organizationIds } }]
          : []),
      ],
    },
    include: {
      organization: true,
      /*
        W6-14. **Le appartenenze non venivano nemmeno caricate.**

        Un atleta puo stare in piu categorie — la tabella esiste, ha
        `is_primary` e `site_id`, e il dominio sa gia leggerla — e la
        famiglia ne vedeva **una**: i due campi piatti `category_id` e
        `category_name`, cioe la primaria.

        Non era solo un'etichetta mancante: `getAthleteCategoryTokens`
        legge `athlete.category_memberships` per decidere quali allenamenti
        e quali gare riguardano questo figlio. Con la relazione mai
        popolata ricadeva sulla sola categoria primaria, quindi **il
        calendario perdeva le attivita della seconda squadra**. Un ragazzo
        che si allena con l'Under 15 e gioca con la prima squadra vedeva
        meta dei propri impegni.
      */
      category_memberships: true,
    },
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
  });

  const uniqueAthletes = new Map<string, (typeof candidateAthletes)[number]>();
  candidateAthletes.forEach((athlete) => {
    if (athleteBelongsToParent(athlete, userId, verifiedEmail)) {
      uniqueAthletes.set(athlete.id, athlete);
    }
  });

  return Array.from(uniqueAthletes.values());
};

/**
 * **Questo genitore puo accedere a questo atleta?**
 *
 * E l'unica funzione che risponde a quella domanda, e per questo la risposta
 * deve essere esattamente quella: la riga confrontava anche
 * `athlete.organization_id`, quindi rispondeva `true` a chi le passava
 * l'identificativo di un **club** invece di quello di un atleta.
 *
 * Nessuno dei dieci chiamanti ne era danneggiato — ognuno rilegge poi la riga
 * dell'atleta e fallisce — ma un contratto che risponde di si a una domanda
 * diversa da quella che gli e stata fatta e a un chiamante distratto
 * dall'essere un buco, ed e la funzione sbagliata su cui correre quel rischio.
 *
 * La forma storica `/parent-view/<idClub>` continua a funzionare: chi la
 * risolve e `getParentDashboardData`, che accetta esplicitamente l'uno o
 * l'altro e lo dice nel nome del parametro.
 */
export const canParentAccessAthlete = async (
  userId: string,
  athleteId: string,
) => {
  const linkedAthletes = await getParentLinkedAthletes(userId);
  return linkedAthletes.some((athlete) => sameId(athlete.id, athleteId));
};

export const getParentDashboardData = async (
  userId: string,
  requestedAthleteOrClubId: string,
) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      first_name: true,
      last_name: true,
    },
  });
  const linkedAthletes = await getParentLinkedAthletes(userId);
  const requestedId = String(requestedAthleteOrClubId || "").trim();
  const selectedAthlete =
    linkedAthletes.find((athlete) => sameId(athlete.id, requestedId)) ||
    linkedAthletes.find((athlete) => sameId(athlete.organization_id, requestedId)) ||
    (!UUID_PATTERN.test(requestedId) ? linkedAthletes[0] : null);

  if (!selectedAthlete) {
    return null;
  }

  const organizationId = selectedAthlete.organization_id;
  const [
    payments,
    receipts,
    invoices,
    medicalCertificates,
    attendance,
    notifications,
  ] = await Promise.all([
    prisma.athletePayment.findMany({
      where: { organization_id: organizationId, athlete_id: selectedAthlete.id },
      orderBy: [{ due_date: "asc" }, { created_at: "desc" }],
    }),
    prisma.receipt.findMany({
      where: { organization_id: organizationId, athlete_id: selectedAthlete.id },
      orderBy: { issue_date: "desc" },
    }),
    prisma.invoice.findMany({
      where: { organization_id: organizationId, athlete_id: selectedAthlete.id },
      orderBy: { issue_date: "desc" },
    }),
    prisma.medicalCertificate.findMany({
      where: { organization_id: organizationId, athlete_id: selectedAthlete.id },
      orderBy: { expiry_date: "asc" },
    }),
    /*
      La partecipazione a un evento e una riga sola (ADR-0099): la presenza sta
      accanto alla convocazione e alla risposta della famiglia, e la si legge da
      `club_event_participants`. L'identificativo storico dell'evento serve
      ancora a incrociare le collezioni JSON, e la relazione lo porta.
    */
    prisma.clubEventParticipant.findMany({
      where: { organization_id: organizationId, athlete_id: selectedAthlete.id },
      orderBy: { updated_at: "desc" },
    }),
    /*
      W6-13 e W6-20. Se ne leggono cinquanta e se ne mostrano venti, perche
      il vaglio per figlio avviene **dopo**: chiederne otto e poi scartarne
      meta significherebbe mostrarne quattro e chiamarle «le ultime otto».
      Prima erano otto secche, senza vaglio e senza modo di segnarle lette:
      la nona notifica di un club spingeva fuori la prima e nessuno se ne
      accorgeva.
    */
    prisma.notification.findMany({
      where: {
        organization_id: organizationId,
        OR: [{ user_id: userId }, { user_id: null }],
      },
      orderBy: { created_at: "desc" },
      take: 50,
    }),
  ]);

  /*
    W6-13. **Le notifiche sono del figlio scelto.**

    Un genitore con due figli le vedeva tutte mescolate: «Certificato in
    scadenza» senza dire di chi, su una schermata che nel titolo nomina un
    figlio solo. Alcune notifiche l'atleta lo nominano gia — i promemoria
    sui certificati scrivono `data.athleteId` — e nessuno lo leggeva.

    Quelle che **non** nominano nessun atleta restano: non parlano
    dell'altro figlio, parlano del club. Nasconderle scegliendo un figlio
    sarebbe una perdita, non un filtro.
  */
  const notificheDelFiglio = notifications.filter((notification) => {
    const citato = asRecord(notification.data).athleteId;
    if (!citato) return true;
    return sameId(String(citato), selectedAthlete.id);
  });

  const club = selectedAthlete.organization;

  /*
    Gli appuntamenti del figlio selezionato, la disponibilita configurata e cio
    che risulta gia occupato nel mese entrante. Sono tre letture e non una
    perche rispondono a tre domande diverse: cosa ho chiesto, quando si puo
    chiedere, e cosa e gia preso. La colonna `clubs.appointments` resta, in sola
    lettura, e non partecipa piu a nessuna di queste risposte.
  */
  const appointmentWindowStart = new Date();
  const appointmentWindowEnd = new Date(
    appointmentWindowStart.getTime() + 30 * 86400000,
  );
  const [appointmentRows, appointmentSlots, appointmentBusy] = await Promise.all([
    prisma.appointment.findMany({
      where: { organization_id: organizationId, athlete_id: selectedAthlete.id },
      orderBy: { starts_at: "desc" },
      take: 100,
    }),
    prisma.appointmentSlot.findMany({
      where: { organization_id: organizationId },
      orderBy: [{ weekday: "asc" }, { start_time: "asc" }],
    }),
    prisma.appointment.findMany({
      where: {
        organization_id: organizationId,
        status: { in: ["requested", "confirmed"] },
        starts_at: { gte: appointmentWindowStart, lte: appointmentWindowEnd },
      },
      select: {
        id: true,
        starts_at: true,
        status: true,
        assigned_to_user_id: true,
        slot_id: true,
      },
    }),
  ]);

  const categoryOptions = buildClubCategoryOptions({
    clubCategories: club.categories,
    athletes: linkedAthletes,
  });
  const rawTrainings = asArray(club.trainings);
  const rawMatches = asArray(club.matches);
  /*
    L'identificativo **storico** dell'evento e quello con cui le collezioni JSON
    incrociano le presenze. Si legge dalle righe degli eventi con una query in
    piu, invece che con una relazione: una relazione qui vorrebbe dire che ogni
    lettore delle presenze debba conoscere il modello dell'evento.
  */
  const eventiDellaPresenza = attendance.length
    ? await prisma.clubEvent.findMany({
        where: {
          organization_id: organizationId,
          id: { in: Array.from(new Set(attendance.map((item) => item.event_id))) },
        },
        select: { id: true, legacy_id: true },
      })
    : [];
  const legacyIdPerEvento = new Map(
    eventiDellaPresenza.map((evento) => [
      evento.id,
      String(evento.legacy_id || evento.id),
    ]),
  );
  const attendanceByTrainingId = new Map(
    attendance.map((item) => [
      legacyIdPerEvento.get(item.event_id) || String(item.event_id),
      item,
    ]),
  );
  const attendanceTrainingIds = new Set(attendanceByTrainingId.keys());

  const trainings = dedupeTrainings(
    rawTrainings
      .filter(
        (training) =>
          recordMatchesAthlete(training, selectedAthlete, categoryOptions) ||
          attendanceTrainingIds.has(String(training?.id || "")),
      )
      .map((training) => {
        const summary = summarizeEvent(training, categoryOptions, "training");
        const attendanceRecord = attendanceByTrainingId.get(String(summary.id || ""));
        return {
          ...summary,
          attendanceStatus: normalizeAttendanceStatus(attendanceRecord?.status),
          attendanceNotes: firstText(attendanceRecord?.notes),
        };
      }),
  )
    .sort(sortByStart);
  const matches = rawMatches
    .filter((match) => recordMatchesAthlete(match, selectedAthlete, categoryOptions))
    .map((match) => ({
      ...summarizeEvent(match, categoryOptions, "match"),
      participationStatus: resolveMatchParticipationStatus(match, selectedAthlete),
    }))
    .sort(sortByStart);
  const now = Date.now();
  const upcomingTrainings = trainings.filter(
    (training) =>
      training.status !== "cancelled" &&
      training.startsAt &&
      new Date(training.startsAt).getTime() >= now,
  );
  const trainingHistory = trainings.filter(
    (training) =>
      training.status === "completed" ||
      (training.startsAt && new Date(training.startsAt).getTime() < now),
  );
  const upcomingMatches = matches.filter(
    (match) =>
      match.status !== "cancelled" &&
      match.startsAt &&
      new Date(match.startsAt).getTime() >= now,
  );
  const matchHistory = matches.filter(
    (match) =>
      match.status === "completed" ||
      (match.startsAt && new Date(match.startsAt).getTime() < now),
  );
  const presentCount = attendance.filter((item) =>
    ["present", "presente", "late", "ritardo"].includes(
      normalizeToken(item.status),
    ),
  ).length;
  const absentCount = attendance.filter((item) =>
    ["absent", "assente", "justified", "giustificato"].includes(
      normalizeToken(item.status),
    ),
  ).length;
  const attendanceTotal = presentCount + absentCount;
  /*
    W6-37, W6-38, W6-40. **Il fascicolo vero, e due elenchi che non si
    ripetono.**

    Qui c'erano tre righe che producevano `requiredDocuments` come «i modelli di
    stampa del club **piu** i caricamenti gia fatti che risultano obbligatori»,
    e `uploadedDocuments` dallo stesso array JSON: la stessa carta compariva in
    tutte e due le card. E nessuna delle due leggeva `document_requests`, quindi
    una richiesta della segreteria non arrivava mai alla famiglia.
  */
  const documentAreas = await getFamilyDocumentAreas(
    userId,
    selectedAthlete,
    club,
    { now: new Date(now) },
  );
  const certificates = medicalCertificates.map((certificate) => ({
    ...certificate,
    issue_date: toIso(certificate.issue_date),
    expiry_date: toIso(certificate.expiry_date),
    created_at: toIso(certificate.created_at),
    updated_at: toIso(certificate.updated_at),
  }));
  /*
    W6-16 e W6-17. **Lo stato del certificato lo dice il dominio, e la data
    esce insieme allo stato.**

    Qui c'erano due `find` scritti a mano su un elenco ordinato per scadenza
    **crescente**, e producevano tre stati soli: valido, scaduto, mancante.
    Due conseguenze, entrambe visibili a una famiglia:

    - «in scadenza» non esisteva. Il club lo vede da sempre — c'e una
      finestra di preavviso in `src/lib/medical-certificates.ts` — e la
      famiglia, che e quella che deve **andare a rifarlo**, scopriva la
      scadenza il giorno dopo;
    - `certificates[0]` e il certificato che scade **prima**, cioe
      tipicamente quello vecchio. La Home accostava «Certificato valido»
      alla data di uno gia scaduto.

    Il dominio sa gia rispondere a tutte e due le domande, e ha la finestra
    di preavviso in un posto solo. Ricostruirla qui l'avrebbe fatta
    divergere: e appena successo.
  */
  const scadenzaCertificato =
    getLatestMedicalCertificateExpiry(certificates) || null;
  const disponibilitaCertificato = getMedicalCertificateAvailability(
    scadenzaCertificato,
    new Date(now),
  );
  const athleteData = asRecord(selectedAthlete.data);
  const enrollmentSummary = getAthleteEnrollmentSummary({
    athlete: selectedAthlete,
    athleteId: selectedAthlete.id,
    paymentPlans: asArray(club.payment_plans),
    discounts: asArray(club.discounts),
    payments: asArray(athleteData.payments),
    athletePayments: payments,
    expectedIncomeEntries: asArray(club.expected_income),
  });
  const normalizedPayments = enrollmentSummary.payments.map((payment) => ({
    ...payment,
    due_date: payment.dueDate,
    paid_at: payment.paidAt,
    status: payment.status,
    statusKey: payment.statusKey,
  }));
  const pendingPayments = normalizedPayments.filter(
    (payment) => payment.statusKey === "pending",
  );
  const paidPayments = normalizedPayments.filter(
    (payment) => payment.statusKey === "paid",
  );
  const visibleStructures = getVisibleBookableStructures(asArray(club.structures));
  /*
    W6-13. Le prenotazioni erano «del figlio **oppure** fatte da me», e la
    seconda meta portava dentro le prenotazioni fatte per **un altro figlio**:
    la schermata di Marco elencava il campo prenotato per Giulia.

    Restano le proprie prenotazioni **senza** atleta indicato — quelle le ha
    fatte questo genitore per se, e non appartengono a nessun figlio.
  */
  const parentStructureBookings = visibleStructures.flatMap((structure) =>
    asArray(structure.bookings)
      .filter((booking) => {
        if (booking?.athleteId) {
          return sameId(booking.athleteId, selectedAthlete.id);
        }
        return (
          sameId(booking?.parentId, userId) ||
          sameId(booking?.bookedById, userId)
        );
      })
      .map((booking) => serializeParentStructureBooking(booking, structure)),
  );

  return {
    user: {
      id: user?.id || userId,
      email: user?.email || "",
      name:
        [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim() ||
        user?.email ||
        "Account EasyGame",
    },
    club: {
      id: club.id,
      name: club.name,
      logo_url: club.logo_url,
      contact_email: club.contact_email,
      contact_phone: club.contact_phone,
      address: club.address,
      city: club.city,
      province: club.province,
      /*
        W6-09 e W6-10. **La stagione si risolve qui, e `settings` non esce.**

        Fino alla Wave 6 questo oggetto portava `settings` intero — stagioni,
        categorie, sconti, piani, e qualunque cosa un club ci scriva domani —
        nel browser di ogni genitore, per un campo solo: l'indirizzo del sito.
        E la stagione, che pure e li dentro, non la normalizzava nessuno:
        l'etichetta arrivava dal `localStorage`, e per un tutore legato
        attraverso `athletes.data.guardians` — senza riga di membership —
        quel `localStorage` non l'aveva mai vista. Da qui «Nessuna stagione
        attiva» su un club che ne ha una.

        Adesso e un elenco chiuso di campi: cio che serve alla famiglia si
        dichiara, e un campo nuovo su `settings` nasce **non** visibile. E la
        stessa regola della lane 5I sull'anagrafica dei colleghi.

        `normalizeClubSeasons` non restituisce mai vuoto: sintetizza una
        stagione di ripiego. Quindi se questa etichetta e assente il difetto e
        nel trasporto, non nel dominio delle stagioni.
      */
      ...normalizeActiveClubSeason(club),
      website:
        String(
          asRecord(club.settings).website ?? asRecord(club.settings).site ?? "",
        ).trim() || null,
      opening_hours: club.opening_hours,
    },
    athlete: {
      ...serializeAthleteCard(selectedAthlete),
      user_id: selectedAthlete.user_id,
      /*
        **`data` usciva grezza, accanto ai tutori gia sanificati.**

        `getGuardianRows` e una proiezione chiusa e non porta credenziali; una
        riga sotto, `data` le portava tutte. Misurato: una madre che apriva il
        cruscotto riceveva nel proprio browser il **codice d'accesso vivo del
        padre** — e con esso quello di ogni altro tutore: un nonno, un ex
        coniuge, un assistente sociale.

        Il dato clinico del **proprio** figlio resta: e suo, ed e il motivo
        per cui questa schermata esiste. Le credenziali no: chi ne ha una la
        ha gia in mano, e le altre non sono sue.
      */
      data: stripGuardianAccessTokens(selectedAthlete.data),
      guardians: getGuardianRows(selectedAthlete),
      linkedAthletes: linkedAthletes.map(serializeAthleteCard),
    },
    health: {
      certificates,
      /** `valid` | `expiring` | `expired` | `missing` (W6-16). */
      status: disponibilitaCertificato,
      statusLabel: getMedicalCertificateAvailabilityLabel(
        disponibilitaCertificato,
      ),
      /*
        La data del certificato che governa, non del primo dell'elenco. E
        `null` quando nessun certificato ne dichiara una: la schermata deve
        poter dire «Data di scadenza non disponibile» invece di tacere.
      */
      expiryDate: scadenzaCertificato,
      allergies: asArray(athleteData.allergies).concat(asArray(athleteData.allergie)),
      notes: firstText(
        athleteData.medicalNotes,
        athleteData.medical_notes,
        athleteData.healthNotes,
        athleteData.health_notes,
      ),
    },
    payments: {
      items: normalizedPayments,
      pending: pendingPayments.length,
      paid: paidPayments.length,
      totalDue: enrollmentSummary.income.expectedTotal,
      totalPaid: enrollmentSummary.income.recordedPaid,
      remaining: enrollmentSummary.income.residual,
      summary: enrollmentSummary.income,
      receipts: receipts.map((receipt) => ({
        ...receipt,
        issue_date: toIso(receipt.issue_date),
        created_at: toIso(receipt.created_at),
        updated_at: toIso(receipt.updated_at),
      })),
      invoices: invoices.map((invoice) => ({
        ...invoice,
        issue_date: toIso(invoice.issue_date),
        created_at: toIso(invoice.created_at),
        updated_at: toIso(invoice.updated_at),
      })),
    },
    enrollment: enrollmentSummary,
    /*
      **Le due chiavi restano, e il significato cambia** (W6-40).

      `required` non e piu «l'elenco di tutto cio che e obbligatorio»: e cio che
      la famiglia deve **ancora fare**. `uploaded` non e piu «tutto cio che sta
      nell'array JSON»: e l'archivio dei file consegnati che non chiedono
      niente. Una voce sta in uno dei due, mai in tutti e due — la regola vive in
      `src/lib/documents/family-dossier.ts`, dove un test la interroga.

      I nomi non cambiano perche il contratto verso l'area famiglia e gia
      pubblicato e la lane 6D lo legge: cambiarli qui avrebbe voluto dire
      toccare file di un'altra lane per una rinomina.
    */
    documents: {
      required: documentAreas.todo,
      uploaded: documentAreas.archive,
    },
    trainings: {
      upcoming: upcomingTrainings,
      history: trainingHistory.slice().reverse(),
      all: trainings,
    },
    matches: {
      upcoming: upcomingMatches,
      history: matchHistory.slice().reverse(),
      all: matches,
    },
    attendance: {
      items: attendance.map((item) => ({
        ...item,
        created_at: toIso(item.created_at),
        updated_at: toIso(item.updated_at),
      })),
      present: presentCount,
      absent: absentCount,
      total: attendanceTotal,
      rate: attendanceTotal
        ? Math.round((presentCount / attendanceTotal) * 100)
        : 0,
    },
    /*
      **Gli appuntamenti si leggono dalle righe, non piu dalla colonna JSON.**

      Il filtro qui era un OR — l'atleta **oppure** l'utente richiedente — e
      mostrava alla famiglia anche le richieste nate per un altro figlio, che e
      il verso di lettura dello stesso difetto che 5E chiude in scrittura
      (W5-54). Il legame che vale in questa pagina e uno solo: il figlio
      selezionato.

      La proiezione e quella della famiglia, e non ha `internal_notes`: le note
      della segreteria non sono nascoste dall'interfaccia, non ci sono.
    */
    appointments: {
      items: appointmentRows.map((row) =>
        toFamilyAppointment(row as any, {
          athleteName: getAthleteDisplayName(selectedAthlete),
          person:
            `${user?.first_name || ""} ${user?.last_name || ""}`.trim() ||
            user?.email ||
            "",
        }),
      ),
      /*
        Gli slot liberi del mese entrante: la famiglia sceglie **uno slot**, non
        una data qualunque. Quando il club non ne ha configurato nessuno si
        ricade sugli orari di apertura, che restano qui accanto perche e quello
        che le schermate leggono oggi.
      */
      availableSlots: computeFreeAppointmentSlots({
        rules: appointmentSlots as any,
        openingHours: club.opening_hours,
        busy: appointmentBusy,
        from: appointmentWindowStart,
        to: appointmentWindowEnd,
        now: appointmentWindowStart,
        /*
          W6-57. Vedi la gemella in
          `api/parent-dashboard/[athleteId]/appointments/route.ts`: lo spread
          faceva uscire gli identificativi interni degli operatori.
        */
      }).map(toFamilyFreeSlot),
      openingHours: club.opening_hours,
    },
    structures: {
      items: visibleStructures.map(serializeParentStructure),
      bookings: parentStructureBookings,
    },
    notifications: notificheDelFiglio.slice(0, 20).map((notification) => ({
      ...notification,
      created_at: toIso(notification.created_at),
      updated_at: toIso(notification.updated_at),
    })),
    notificationsUnread: notificheDelFiglio.filter(
      (notification) => !notification.read,
    ).length,
    analytics: {
      attendanceRate: attendanceTotal
        ? Math.round((presentCount / attendanceTotal) * 100)
        : 0,
      lastAttendance: attendance.slice(0, 5).map((item) => ({
        training_id:
          legacyIdPerEvento.get(item.event_id) || String(item.event_id),
        event_id: item.event_id,
        status: item.status,
        notes: item.notes,
        updated_at: toIso(item.updated_at),
      })),
      nextTraining: upcomingTrainings[0] || null,
      nextMatch: upcomingMatches[0] || null,
    },
  };
};

/**
 * **I figli fra cui un genitore sceglie.**
 *
 * W6-12. La schermata di scelta deve poter esistere **prima** che un figlio sia
 * stato scelto, quindi non puo passare da `getParentDashboardData`, che di un
 * figlio ha bisogno per definizione.
 *
 * E un elenco chiuso di campi, non una scheda ridotta: qui serve riconoscere il
 * proprio figlio in una lista: nome, club, categoria. Non serve — e non deve
 * uscire — niente di clinico, niente di economico, niente di documentale. Un
 * campo nuovo sulla riga dell'atleta nasce cosi **invisibile** a questa
 * schermata, che e la regola con cui la lane 5I ha chiuso l'anagrafica dei
 * colleghi.
 */
export const listParentChildren = async (userId: string) => {
  const athletes = await getParentLinkedAthletes(userId);

  return athletes.map((athlete) => ({
    id: athlete.id,
    name: getAthleteDisplayName(athlete),
    clubId: athlete.organization_id,
    clubName: (athlete as any).organization?.name || "",
    clubLogoUrl: (athlete as any).organization?.logo_url || null,
    categoryName: athlete.category_name || null,
    avatarUrl: athlete.avatar_url || null,
  }));
};
