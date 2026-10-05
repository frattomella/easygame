import { prisma } from "../prisma";
import { readClubResourceCollection } from "../resources";
import { readConsentEnforcement } from "../consents";
import { auditWebsite, requireWebsiteAccess, WEBSITE_AUDIT_ACTIONS, type WebsiteScope } from "./access";
import { invalidateWebsiteData } from "./cache";
import {
  DEFAULT_PUBLICATION,
  applyPublicationPolicy,
  isMinorAt,
  normalizePublicationSettings,
  type PublicationSettings,
} from "@/lib/website/people/policy";

/**
 * **Chi compare sul sito** (ADR-0200 §7): la gestione delle pubblicazioni.
 *
 * Unico scrittore di `website_person_publications`. Chi la usa ha
 * `website.people.manage` — una chiave di sola direzione, perche decidere che
 * un minore compare sul sito non e una scelta da collaboratore.
 *
 * L'elenco per l'editor mostra di ogni persona il necessario per decidere:
 * nome, categoria, se e minorenne, lo stato del consenso alle immagini e
 * l'anteprima di cio che il sito mostrerebbe (`applyPublicationPolicy`).
 * Nessun contatto, nessun documento, nessun dato sanitario.
 */

export type PersonKind = "athlete" | "trainer" | "staff";
const isPersonKind = (value: unknown): value is PersonKind => value === "athlete" || value === "trainer" || value === "staff";

const text = (value: unknown, max = 120) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const nameOf = (record: Record<string, any>) => {
  const first = text(record.firstName ?? record.first_name ?? record.nome, 60);
  const last = text(record.lastName ?? record.last_name ?? record.cognome, 60);
  if (first || last) return { first, last };
  const parts = text(record.name ?? record.fullName, 120).split(" ");
  return { first: parts[0] || "", last: parts.slice(1).join(" ") };
};

export const listPublicationCandidates = async (
  scope: WebsiteScope | null | undefined,
  filter: { kind?: unknown; q?: unknown } = {},
) => {
  const grant = await requireWebsiteAccess(scope, "website.people.manage", "read");
  const organizationId = grant.organizationId;
  const kind: PersonKind = isPersonKind(filter.kind) ? filter.kind : "athlete";
  const query = text(filter.q, 60).toLowerCase();
  const now = new Date();

  const publications = await (prisma as any).websitePersonPublication.findMany({
    where: { organization_id: organizationId, person_kind: kind },
    select: { person_id: true, published: true, settings: true, updated_at: true },
  });
  const byId = new Map<string, any>((publications as any[]).map((row) => [row.person_id, row]));

  if (kind === "athlete") {
    const [athletes, memberships, consent] = await Promise.all([
      (prisma as any).athlete.findMany({
        where: {
          organization_id: organizationId,
          anonymized_at: null,
          ...(query
            ? { OR: [{ first_name: { contains: query, mode: "insensitive" } }, { last_name: { contains: query, mode: "insensitive" } }] }
            : {}),
        },
        select: { id: true, first_name: true, last_name: true, birth_date: true, status: true, jersey_number: true, category_name: true },
        orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
        take: 400,
      }),
      (prisma as any).athleteCategoryMembership.findMany({
        where: { organization_id: organizationId },
        select: { athlete_id: true, category_name: true, is_primary: true },
      }),
      readConsentEnforcement({ organizationId, consentKey: "images", subjectKind: "athlete", mode: "require_explicit" }),
    ]);
    const categoriesOf = new Map<string, string[]>();
    for (const row of memberships as any[]) {
      const list = categoriesOf.get(row.athlete_id) || [];
      if (row.category_name) list.push(String(row.category_name));
      categoriesOf.set(row.athlete_id, list);
    }
    return {
      kind,
      imageConsentDefined: Boolean(consent.enforced),
      people: (athletes as any[]).map((athlete) => {
        const birthDate = athlete.birth_date instanceof Date ? athlete.birth_date.toISOString().slice(0, 10) : athlete.birth_date ? String(athlete.birth_date).slice(0, 10) : null;
        const publication = byId.get(athlete.id);
        const settings = publication ? { ...normalizePublicationSettings(publication.settings), published: Boolean(publication.published) } : { ...DEFAULT_PUBLICATION };
        const imageConsent = !consent.enforced
          ? ("missing" as const)
          : consent.acceptedSubjectIds.has(athlete.id)
            ? ("accepted" as const)
            : consent.blockedSubjectIds.has(athlete.id)
              ? ("rejected" as const)
              : ("missing" as const);
        const preview = applyPublicationPolicy(
          {
            id: athlete.id,
            kind: "athlete",
            firstName: athlete.first_name,
            lastName: athlete.last_name,
            birthDate,
            active: String(athlete.status || "active") === "active" || athlete.status === "loan",
            anonymized: false,
            jerseyNumber: text(athlete.jersey_number, 4),
            internalRole: "",
          },
          { ...settings, published: true },
          { now, imageConsent, imageConsentDefined: Boolean(consent.enforced) },
        );
        return {
          id: athlete.id,
          name: `${text(athlete.first_name, 60)} ${text(athlete.last_name, 60)}`.trim(),
          categories: categoriesOf.get(athlete.id)?.length ? categoriesOf.get(athlete.id) : athlete.category_name ? [athlete.category_name] : [],
          status: String(athlete.status || "active"),
          isMinor: isMinorAt(birthDate, now),
          imageConsent,
          settings,
          preview: preview.visible ? preview.fields : null,
          updatedAt: publication?.updated_at ? new Date(publication.updated_at).toISOString() : null,
        };
      }),
    };
  }

  const records = (await readClubResourceCollection(organizationId, kind === "trainer" ? "trainers" : "staff_members")) as Array<Record<string, any>>;
  return {
    kind,
    imageConsentDefined: false,
    people: records
      .map((record) => {
        const id = text(record.id, 64);
        const { first, last } = nameOf(record);
        const publication = byId.get(id);
        const settings = publication ? { ...normalizePublicationSettings(publication.settings), published: Boolean(publication.published) } : { ...DEFAULT_PUBLICATION };
        return {
          id,
          name: `${first} ${last}`.trim(),
          categories: [] as string[],
          status: text(record.status || "active", 20),
          isMinor: false,
          imageConsent: "missing" as const,
          settings,
          role: text(record.role ?? record.qualification, 60),
          /* Senza registro dei consensi per lo staff: la foto passa solo con il consenso raccolto fuori registro. */
          preview: (() => {
            const verdict = applyPublicationPolicy(
              {
                id,
                kind,
                firstName: first,
                lastName: last,
                birthDate: null,
                active: text(record.status || "active", 20) !== "inactive",
                anonymized: false,
                jerseyNumber: "",
                internalRole: text(record.role ?? record.qualification, 60),
              },
              { ...settings, published: true },
              { now, imageConsent: "missing", imageConsentDefined: false },
            );
            return verdict.visible ? verdict.fields : null;
          })(),
          updatedAt: publication?.updated_at ? new Date(publication.updated_at).toISOString() : null,
        };
      })
      .filter((person) => person.id && person.name && (!query || person.name.toLowerCase().includes(query))),
  };
};

/** Verifica che la persona esista nel club, nel suo registro. */
const assertPersonInClub = async (organizationId: string, kind: PersonKind, personId: string) => {
  if (kind === "athlete") {
    const athlete = await (prisma as any).athlete.findFirst({
      where: { id: personId, organization_id: organizationId, anonymized_at: null },
      select: { id: true },
    });
    if (!athlete) throw new Error("Accesso negato: la persona non appartiene al club attivo, o non esiste");
    return;
  }
  const records = (await readClubResourceCollection(organizationId, kind === "trainer" ? "trainers" : "staff_members")) as Array<Record<string, any>>;
  if (!records.some((record) => text(record.id, 64) === personId)) {
    throw new Error("Accesso negato: la persona non appartiene al club attivo, o non esiste");
  }
};

/**
 * Salva come una persona compare sul sito. La foto deve essere un file della
 * libreria del sito dello stesso club: un identificativo di un allegato
 * qualunque (un documento, un certificato) non diventa mai una foto pubblica.
 */
export const savePersonPublication = async (
  scope: WebsiteScope | null | undefined,
  input: { personKind: unknown; personId: unknown; settings: unknown },
  request?: Request,
) => {
  const grant = await requireWebsiteAccess(scope, "website.people.manage", "write");
  if (!isPersonKind(input.personKind)) throw new Error("Tipo di persona non riconosciuto");
  const personId = text(input.personId, 64);
  if (!personId) throw new Error("Persona non indicata");
  await assertPersonInClub(grant.organizationId, input.personKind, personId);

  const settings: PublicationSettings = normalizePublicationSettings(input.settings);
  if (settings.photoMediaId) {
    const media = await (prisma as any).attachment.findFirst({
      where: { id: settings.photoMediaId, organization_id: grant.organizationId, owner_type: "website" },
      select: { id: true, category: true },
    });
    if (!media) throw new Error("La foto deve essere un'immagine della libreria del sito");
    /*
      Una foto di persona e un file `person-photo`: la rotta pubblica la serve
      solo se la policy lo consente. Un'immagine generica della libreria e
      pubblica per natura, quindi non puo diventare la foto di un atleta: si
      carica dal pannello della persona, che la marca come tale.
    */
    if (media.category !== "person-photo") {
      throw new Error("La foto di una persona si carica dal suo pannello: un'immagine della libreria e pubblica per tutti");
    }
  }
  if (input.personKind !== "athlete") settings.photoConsentOutsideRegistry = Boolean(settings.photoConsentOutsideRegistry);

  const row = await (prisma as any).websitePersonPublication.upsert({
    where: {
      organization_id_person_kind_person_id: { organization_id: grant.organizationId, person_kind: input.personKind, person_id: personId },
    },
    update: { published: settings.published, settings, updated_by: grant.scope.userId },
    create: {
      organization_id: grant.organizationId,
      person_kind: input.personKind,
      person_id: personId,
      published: settings.published,
      settings,
      updated_by: grant.scope.userId,
    },
  });
  await auditWebsite(
    grant,
    WEBSITE_AUDIT_ACTIONS.personPublication,
    row.id,
    {
      personKind: input.personKind,
      personId,
      published: settings.published,
      showPhoto: settings.showPhoto,
      nameDisplay: settings.nameDisplay,
      showBirthYear: settings.showBirthYear,
    },
    request,
  );
  invalidateWebsiteData(grant.organizationId);
  /* Come la vedra il pubblico, calcolata dalla stessa policy dell'elenco. */
  const listed = await listPublicationCandidates(scope, { kind: input.personKind });
  const preview = (listed.people as Array<{ id: string; preview: unknown }>).find((person) => person.id === personId)?.preview ?? null;
  return { personKind: input.personKind, personId, settings, preview };
};

/**
 * Una foto della libreria e servibile al pubblico **come foto di una persona**
 * solo se una pubblicazione attiva la usa e la policy la lascia passare.
 * La chiama la rotta pubblica dei media per i file con categoria `person-photo`.
 */
export const isPersonPhotoPublic = async (organizationId: string, mediaId: string) => {
  const publications = await (prisma as any).websitePersonPublication.findMany({
    where: { organization_id: organizationId, published: true },
    select: { person_kind: true, person_id: true, settings: true },
  });
  const users = (publications as any[]).filter((row) => normalizePublicationSettings(row.settings).photoMediaId === mediaId);
  if (!users.length) return false;
  const now = new Date();
  const consent = await readConsentEnforcement({ organizationId, consentKey: "images", subjectKind: "athlete", mode: "require_explicit" });
  for (const row of users) {
    const settings = { ...normalizePublicationSettings(row.settings), published: true };
    if (row.person_kind === "athlete") {
      const athlete = await (prisma as any).athlete.findFirst({
        where: { id: row.person_id, organization_id: organizationId },
        select: { id: true, first_name: true, last_name: true, birth_date: true, status: true, anonymized_at: true },
      });
      if (!athlete) continue;
      const verdict = applyPublicationPolicy(
        {
          id: athlete.id,
          kind: "athlete",
          firstName: athlete.first_name,
          lastName: athlete.last_name,
          birthDate: athlete.birth_date instanceof Date ? athlete.birth_date.toISOString().slice(0, 10) : athlete.birth_date ? String(athlete.birth_date).slice(0, 10) : null,
          active: ["active", "loan"].includes(String(athlete.status || "active")),
          anonymized: Boolean(athlete.anonymized_at),
          jerseyNumber: "",
          internalRole: "",
        },
        settings,
        {
          now,
          imageConsent: !consent.enforced ? "missing" : consent.acceptedSubjectIds.has(athlete.id) ? "accepted" : consent.blockedSubjectIds.has(athlete.id) ? "rejected" : "missing",
          imageConsentDefined: Boolean(consent.enforced),
        },
      );
      if (verdict.visible && verdict.fields.photoMediaId === mediaId) return true;
    } else {
      const verdict = applyPublicationPolicy(
        { id: row.person_id, kind: row.person_kind, firstName: "x", lastName: "", birthDate: null, active: true, anonymized: false, jerseyNumber: "", internalRole: "" },
        settings,
        { now, imageConsent: "missing", imageConsentDefined: false },
      );
      if (verdict.visible && verdict.fields.photoMediaId === mediaId) return true;
    }
  }
  return false;
};
