import { prisma } from "@/lib/server/prisma";
import {
  buildClubCategoryOptions,
  resolveCategoryLabel,
  type NormalizedCategoryOption,
} from "@/lib/category-utils";
import { getAthleteDisplayName } from "@/lib/athlete-name-utils";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

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
    id: firstText(event?.id) || `${kind}-${eventDate?.getTime() || Date.now()}`,
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
      status: uploaded?.status || (uploaded ? "in_verifica" : "richiesto"),
      uploadedDocumentId: uploaded?.id || null,
      fileUrl: firstText(template?.fileUrl, template?.file_url, template?.url),
    };
  });

const normalizeUploadedDocuments = (athlete: any) => {
  const data = asRecord(athlete?.data);
  return [
    ...asArray(data.parentDocuments),
    ...asArray(data.parent_documents),
    ...asArray(data.documents).filter((document) =>
      ["parent", "guardian", "athlete"].includes(
        normalizeToken(document?.source || document?.scope),
      ),
    ),
  ].map((document, index) => ({
    id: firstText(document?.id) || `parent-document-${index}`,
    templateId: firstText(document?.templateId, document?.template_id),
    title: firstText(document?.title, document?.name) || "Documento caricato",
    fileName: firstText(document?.fileName, document?.file_name),
    status: firstText(document?.status) || "in_verifica",
    uploadedAt: toIso(document?.uploadedAt || document?.uploaded_at),
    assetId: firstText(document?.assetId, document?.asset_id),
  }));
};

const serializeAthleteCard = (athlete: any) => ({
  id: athlete.id,
  organization_id: athlete.organization_id,
  name: getAthleteDisplayName(athlete),
  first_name: athlete.first_name,
  last_name: athlete.last_name,
  birth_date: toIso(athlete.birth_date),
  category_id: athlete.category_id,
  category_name: athlete.category_name,
  status: athlete.status,
});

export const getParentLinkedAthletes = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
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
    if (athleteBelongsToParent(athlete, userId, user?.email)) {
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
  const attendanceTrainingIds = new Set(attendance.map((item) => item.training_id));

  const trainings = rawTrainings
    .filter(
      (training) =>
        recordMatchesAthlete(training, selectedAthlete, categoryOptions) ||
        attendanceTrainingIds.has(String(training?.id || "")),
    )
    .map((training) => summarizeEvent(training, categoryOptions, "training"))
    .sort(sortByStart);
  const matches = rawMatches
    .filter((match) => recordMatchesAthlete(match, selectedAthlete, categoryOptions))
    .map((match) => summarizeEvent(match, categoryOptions, "match"))
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
  const requiredDocuments = resolveDocumentTemplates(club, uploadedDocuments);
  const paidPayments = payments.filter(
    (payment) =>
      payment.paid_at ||
      ["paid", "pagato", "completed", "saldato"].includes(
        normalizeToken(payment.status),
      ),
  );
  const pendingPayments = payments.filter((payment) => !paidPayments.includes(payment));
  const totalDue = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const totalPaid = paidPayments.reduce(
    (sum, payment) => sum + Number(payment.amount || 0),
    0,
  );
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
      items: payments.map((payment) => ({
        ...payment,
        due_date: toIso(payment.due_date),
        paid_at: toIso(payment.paid_at),
        created_at: toIso(payment.created_at),
        updated_at: toIso(payment.updated_at),
      })),
      pending: pendingPayments.length,
      paid: paidPayments.length,
      totalDue,
      totalPaid,
      remaining: Math.max(totalDue - totalPaid, 0),
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
          date: toIso(appointment?.date),
          time: firstText(appointment?.time),
          status: firstText(appointment?.status) || "requested",
          notes: firstText(appointment?.notes),
        })),
      openingHours: club.opening_hours,
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
