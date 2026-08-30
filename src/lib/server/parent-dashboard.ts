import { prisma } from "@/lib/server/prisma";
import {
  buildClubCategoryOptions,
  resolveCategoryLabel,
  type NormalizedCategoryOption,
} from "@/lib/category-utils";
import { getAthleteDisplayName } from "@/lib/athlete-name-utils";
import { getAthleteEnrollmentSummary } from "@/lib/athlete-enrollment-summary";
import { dedupeTrainings } from "@/lib/training-utils";
import { getSharedDocumentsFromAthlete } from "@/lib/shared-documents";
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

  return {
    ...event,
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

const resolveDocumentTemplates = (club: any, uploadedDocuments: any[]) =>
  asArray(club?.document_templates).map((template, index) => {
    const templateId =
      firstText(template?.id, template?.templateId, template?.name, template?.title) ||
      `document-template-${index}`;
    const uploaded = uploadedDocuments.find(
      (document) =>
        sameId(document.templateId, templateId) ||
        sameId(document.template_id, templateId),
    );

    return {
      id: templateId,
      title: firstText(template?.title, template?.name) || "Documento",
      description: firstText(template?.description, template?.notes),
      status: uploaded?.status || (uploaded ? "under_review" : "required"),
      uploadedDocumentId: uploaded?.id || null,
      assetId: uploaded?.assetId || null,
      fileName: uploaded?.fileName || "",
      dueDate: uploaded?.dueDate || "",
      rejectionReason: uploaded?.rejectionReason || "",
      fileUrl: firstText(template?.fileUrl, template?.file_url, template?.url),
      required: true,
      documentType: uploaded?.documentType || "other",
    };
  });

const normalizeUploadedDocuments = (athlete: any) => {
  return getSharedDocumentsFromAthlete(athlete)
    .filter((document) => document.visibleToParent)
    .map((document) => ({
      id: document.id,
      templateId: firstText(document.data?.templateId, document.data?.template_id),
      title: document.title || "Documento caricato",
      description: document.description || "",
      documentType: document.documentType,
      fileName: document.fileName || "",
      status: document.status,
      uploadedAt: toIso(document.uploadedAt),
      assetId: document.assetId || "",
      dueDate: document.dueDate || "",
      rejectionReason: document.rejectionReason || "",
      required: document.required,
      uploadedByRole: document.uploadedByRole,
    }));
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
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, email_verified_at: true },
  });

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
  const memberships = await prisma.organizationUser.findMany({
    where: {
      user_id: userId,
    },
    select: {
      organization_id: true,
    },
  });
  const ownedClubs = await prisma.club.findMany({
    where: { creator_id: userId },
    select: { id: true },
  });
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

export const canParentAccessAthlete = async (
  userId: string,
  athleteId: string,
) => {
  const linkedAthletes = await getParentLinkedAthletes(userId);
  return linkedAthletes.some(
    (athlete) =>
      sameId(athlete.id, athleteId) || sameId(athlete.organization_id, athleteId),
  );
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
    prisma.trainingAttendance.findMany({
      where: { organization_id: organizationId, athlete_id: selectedAthlete.id },
      orderBy: { updated_at: "desc" },
    }),
    prisma.notification.findMany({
      where: {
        organization_id: organizationId,
        OR: [{ user_id: userId }, { user_id: null }],
      },
      orderBy: { created_at: "desc" },
      take: 8,
    }),
  ]);

  const club = selectedAthlete.organization;
  const categoryOptions = buildClubCategoryOptions({
    clubCategories: club.categories,
    athletes: linkedAthletes,
  });
  const rawTrainings = asArray(club.trainings);
  const rawMatches = asArray(club.matches);
  const attendanceByTrainingId = new Map(
    attendance.map((item) => [String(item.training_id || ""), item]),
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
  const uploadedDocuments = normalizeUploadedDocuments(selectedAthlete);
  const templateRequiredDocuments = resolveDocumentTemplates(club, uploadedDocuments);
  const requiredDocuments = [
    ...templateRequiredDocuments,
    ...uploadedDocuments.filter(
      (document) =>
        document.required &&
        !templateRequiredDocuments.some(
          (template) =>
            sameId(template.id, document.id) ||
            sameId(template.id, document.templateId),
        ),
    ),
  ];
  const certificates = medicalCertificates.map((certificate) => ({
    ...certificate,
    issue_date: toIso(certificate.issue_date),
    expiry_date: toIso(certificate.expiry_date),
    created_at: toIso(certificate.created_at),
    updated_at: toIso(certificate.updated_at),
  }));
  const validCertificate = certificates.find((certificate) => {
    if (!certificate.expiry_date) return false;
    return new Date(certificate.expiry_date).getTime() >= now;
  });
  const expiredCertificate = certificates.find((certificate) => {
    if (!certificate.expiry_date) return false;
    return new Date(certificate.expiry_date).getTime() < now;
  });
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
  const parentStructureBookings = visibleStructures.flatMap((structure) =>
    asArray(structure.bookings)
      .filter(
        (booking) =>
          sameId(booking?.athleteId, selectedAthlete.id) ||
          sameId(booking?.parentId, userId) ||
          sameId(booking?.bookedById, userId),
      )
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
      settings: club.settings,
      opening_hours: club.opening_hours,
    },
    athlete: {
      ...serializeAthleteCard(selectedAthlete),
      user_id: selectedAthlete.user_id,
      data: selectedAthlete.data,
      guardians: getGuardianRows(selectedAthlete),
      linkedAthletes: linkedAthletes.map(serializeAthleteCard),
    },
    health: {
      certificates,
      status: validCertificate
        ? "valid"
        : expiredCertificate
          ? "expired"
          : "missing",
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
    documents: {
      required: requiredDocuments,
      uploaded: uploadedDocuments,
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
    appointments: {
      items: asArray(club.appointments)
        .filter(
          (appointment) =>
            sameId(appointment?.athlete_id, selectedAthlete.id) ||
            sameId(appointment?.athleteId, selectedAthlete.id) ||
            sameId(appointment?.requested_by_user_id, userId),
        )
        .map((appointment, index) => ({
          id: firstText(appointment?.id) || `appointment-${index}`,
          title: firstText(appointment?.title, appointment?.reason) || "Appuntamento",
          reason: firstText(appointment?.reason, appointment?.title),
          date: toIso(appointment?.date),
          time: firstText(appointment?.time),
          status: firstText(appointment?.status) || "pending",
          notes: firstText(appointment?.notes),
          person: firstText(appointment?.person, appointment?.parent_name),
          athlete_name: firstText(appointment?.athlete_name, appointment?.athlete),
          requested_by_user_id: firstText(appointment?.requested_by_user_id),
          created_at: toIso(appointment?.created_at),
          updated_at: toIso(appointment?.updated_at),
        })),
      openingHours: club.opening_hours,
    },
    structures: {
      items: visibleStructures.map(serializeParentStructure),
      bookings: parentStructureBookings,
    },
    notifications: notifications.map((notification) => ({
      ...notification,
      created_at: toIso(notification.created_at),
      updated_at: toIso(notification.updated_at),
    })),
    analytics: {
      attendanceRate: attendanceTotal
        ? Math.round((presentCount / attendanceTotal) * 100)
        : 0,
      lastAttendance: attendance.slice(0, 5).map((item) => ({
        training_id: item.training_id,
        status: item.status,
        notes: item.notes,
        updated_at: toIso(item.updated_at),
      })),
      nextTraining: upcomingTrainings[0] || null,
      nextMatch: upcomingMatches[0] || null,
    },
  };
};
