import { prisma } from "./prisma";
import { formatAthleteNameLastFirst } from "@/lib/athlete-name-utils";
import {
  readAthleteGuardianContacts,
  type AthleteGuardianContact,
} from "@/lib/athlete-guardians";
import {
  buildSiteIndex,
  getAthleteGroupIds,
  getAthleteSiteIds,
  normalizeClubSites,
  recordMatchesSite,
  type SiteIndex,
} from "@/lib/club-sites";
import { normalizeAthleteCategoryMemberships } from "@/lib/athlete-category-memberships";
import {
  buildInstallmentLedgers,
  normalizePaymentTransactions,
} from "@/lib/payments/installment-ledger";
import {
  getLatestMedicalCertificateExpiry,
  getMedicalCertificateAvailability,
} from "@/lib/medical-certificates";
import {
  criteriaRevealEconomicData,
  describeAudienceCriteria,
  normalizeAudienceCriteria,
  DEFAULT_CERTIFICATE_WITHIN_DAYS,
  type AudienceCriterion,
} from "@/lib/audience/criteria";
import {
  buildAudienceSet,
  type AudienceContact,
  type AudienceSet,
  type AudienceSubject,
} from "@/lib/audience/recipients";
import { assertCommunicationPermission } from "@/lib/communications/permissions";
import {
  consentBlocksSubject,
  readConsentEnforcement,
  type ConsentEnforcementMode,
} from "./consents";

/**
 * **L'unico risolutore del pubblico** (Wave 2, W2-C, ADR-0087).
 *
 * Cinque funzioni chiedono la stessa cosa — solleciti, automazioni,
 * comunicazione massiva, bacheca e invito a rispondere: «chi sono i
 * destinatari, chi non raggiungo, e perche». Prima della Wave 2 la risposta
 * era scritta due volte con **politiche diverse**, e la differenza non era una
 * scelta di prodotto: i promemoria sui certificati raggiungevano solo chi ha
 * un account nel club, il sollecito degli insoluti anche chi ha solo un
 * indirizzo. Qui la politica e una: **si scrive a un indirizzo**, e l'account
 * decide solo se arriva anche la notifica in applicazione.
 *
 * Un test strutturale vieta che ne nasca un secondo.
 */

export type AudienceScope = {
  userId: string;
  activeOrganizationId: string | null;
  allowedOrganizationIds: string[];
  activeRole?: string | null;
  /**
   * **Il consenso e configurazione, non un filtro cablato** (Wave 6, §15.2).
   *
   * Quando e valorizzata, il risolutore chiede al registro dei consensi chi ha
   * revocato quella chiave e lo esclude con il motivo `consent_revoked`.
   * Quando e assente — che e il caso di sicurezza, amministrativa, pagamento,
   * sanitaria e sportiva — non si legge nemmeno il registro.
   *
   * Il nome della chiave non lo sceglie chi manda: lo dice
   * `consentKeyForCommunication(kind)` in `src/lib/consents/catalog.ts`, che e
   * l'unico posto dove la mappa «natura della comunicazione → consenso» vive.
   * Se una funzione di invio scrivesse `"marketing"` a mano, la regola di
   * prodotto avrebbe due copie e la seconda resterebbe indietro.
   */
  requiredConsentKey?: string | null;
  /** Vedi `readConsentEnforcement`: oggi solo `block_negative` e in uso. */
  consentEnforcementMode?: ConsentEnforcementMode;
};

const asText = (value: unknown) => String(value ?? "").trim();

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

/**
 * Il club su cui si risolve il pubblico e **quello attivo**, non uno qualunque
 * fra quelli a cui l'utente ha accesso.
 *
 * E la stessa regola gia scritta in `payment-reminders.ts`, e la ragione e la
 * stessa: il ruolo con cui si decide se puoi mandare viene risolto sul club
 * attivo. Se il club su cui si opera potesse arrivare dal corpo della
 * richiesta, chi e proprietario del proprio club e genitore in un altro
 * passerebbe il controllo come proprietario del primo e leggerebbe gli
 * indirizzi email delle famiglie del secondo.
 */
export const resolveAudienceOrganizationId = (
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
    throw denied(
      "si opera sul club attivo, non su un altro fra quelli a cui hai accesso",
    );
  }

  if (!scope.allowedOrganizationIds.includes(scope.activeOrganizationId)) {
    throw denied("il club indicato non e fra quelli a cui hai accesso");
  }

  return scope.activeOrganizationId;
};

/*
  **Il nome di una persona ha gia un proprietario.**

  Qui c'era una copia privata, e ce n'erano quattro in tutta la Wave: tre
  scrivevano «Nome Cognome», una «Cognome Nome», e nessuna leggeva le grafie
  alternative (`nome`, `cognome`, `fullName`) che il proprietario canonico
  gestisce. Lo stesso atleta compariva quindi in due ordini diversi fra
  l'email di un'automazione e l'elenco RSVP dell'allenatore, e un'anagrafica
  con i soli campi alternativi diventava «Atleta» in un messaggio e aveva il
  nome giusto ovunque altrove.
*/
const athleteDisplayName = (athlete: any) =>
  formatAthleteNameLastFirst(athlete);

/**
 * Vero se l'anagrafica e attiva.
 *
 * Legge le due grafie che convivono — la colonna e il campo dentro `data` —
 * con la stessa regola gia usata dalla dashboard (`club-overview.ts`): due
 * letture divergenti dello stesso stato manderebbero un messaggio a chi e
 * stato archiviato in una schermata e non nell'altra.
 */
const athleteIsActive = (athlete: any) =>
  String(asRecord(athlete?.data).status || athlete?.status || "active")
    .trim()
    .toLowerCase() === "active";

/**
 * Gli account collegati, **verificati come iscritti a questo club**.
 *
 * Un identificativo dichiarato in anagrafica non e un lasciapassare: la stessa
 * email puo esistere in due societa, e un account che qui non risulta non deve
 * ricevere la notifica in applicazione di questo club.
 *
 * Due interrogazioni in tutto, mai una per atleta.
 */
export const resolveGuardianAccounts = async (
  organizationId: string,
  contacts: AthleteGuardianContact[],
) => {
  const declared = Array.from(
    new Set(contacts.map((contact) => contact.linkedUserId).filter(Boolean)),
  );

  if (declared.length === 0) {
    return new Map<string, { id: string; email: string }>();
  }

  const memberships = await (prisma as any).organizationUser.findMany({
    where: { organization_id: organizationId, user_id: { in: declared } },
    select: { user_id: true },
  });

  const membersOfClub = memberships
    .map((row: any) => asText(row.user_id))
    .filter(Boolean);

  if (membersOfClub.length === 0) {
    return new Map<string, { id: string; email: string }>();
  }

  const users = await (prisma as any).user.findMany({
    where: { id: { in: membersOfClub } },
    select: { id: true, email: true },
  });

  return new Map<string, { id: string; email: string }>(
    users.map((user: any) => [
      asText(user.id),
      { id: asText(user.id), email: asText(user.email).toLowerCase() },
    ]),
  );
};

/**
 * Da un atleta ai suoi contatti candidati.
 *
 * **`no_account` e `no_email` restano distinti.** Un account dichiarato ma
 * introvabile in questo club dice «il collegamento e da rifare»; un indirizzo
 * mancante dice «manca un dato in anagrafica». Sono due lavori diversi per la
 * segreteria, e un motivo unico li farebbe cercare entrambi nel posto
 * sbagliato.
 */
export const buildAudienceContacts = (
  athlete: any,
  accounts: Map<string, { id: string; email: string }>,
): AudienceContact[] =>
  readAthleteGuardianContacts(athlete).map((contact) => {
    const account = contact.linkedUserId
      ? accounts.get(contact.linkedUserId) || null
      : null;

    return {
      guardianId: contact.id,
      guardianName: contact.name,
      email: (contact.email || account?.email || "").trim().toLowerCase(),
      userId: account?.id || null,
      declaresMissingAccount: Boolean(contact.linkedUserId && !account),
    };
  });

/**
 * Costruisce i soggetti a partire da atleti gia caricati.
 *
 * **Chi la usa, e chi no.** La usa `resolveAudience`, che e il percorso per
 * criteri. **Non** la usa il sollecito degli insoluti, e la revisione di
 * architettura ha avuto ragione a segnalarlo: il commento diceva che sarebbe
 * stato «il punto in cui la migrazione del sollecito si aggancia», e quel
 * punto non e stato usato.
 *
 * La ragione e che il sollecito **non produce l'insieme canonico**: il suo
 * messaggio e per **atleta**, non per famiglia, perche parla di una posizione
 * economica e fondere due figli direbbe un residuo che non e quello di nessuno
 * dei due. Quello che condivide con il motore — e che adesso condivide davvero
 * — e la risoluzione dei **contatti** (`buildAudienceContacts`,
 * `resolveGuardianAccounts`), che era la duplicazione vera.
 *
 * La differenza e dichiarata al §3.4 del documento 34 e in ADR-0087.
 */
export const buildAudienceSubjects = async ({
  organizationId,
  athletes,
  contextByAthleteId,
}: {
  organizationId: string;
  athletes: any[];
  contextByAthleteId?: Map<string, Record<string, unknown>>;
}): Promise<AudienceSubject[]> => {
  const accounts = await resolveGuardianAccounts(
    organizationId,
    athletes.flatMap((athlete) => readAthleteGuardianContacts(athlete)),
  );

  return athletes.map((athlete) => {
    const athleteId = asText(athlete.id);
    const context = contextByAthleteId?.get(athleteId);

    return {
      athleteId,
      athleteName: athleteDisplayName(athlete),
      athleteFirstName: asText(athlete.first_name),
      athleteLastName: asText(athlete.last_name),
      active: athleteIsActive(athlete),
      contacts: buildAudienceContacts(athlete, accounts),
      ...(context ? { context } : {}),
    } satisfies AudienceSubject;
  });
};

const matchesCategories = (athlete: any, wanted: Set<string>) => {
  const memberships = normalizeAthleteCategoryMemberships(athlete);
  for (const membership of memberships) {
    if (wanted.has(asText(membership.categoryId))) return true;
  }
  /*
    La colonna storica `athletes.category_id` conta ancora: un club che non ha
    mai usato le appartenenze avrebbe un pubblico vuoto senza questa riga, e un
    pubblico vuoto che sembra corretto e il modo piu silenzioso di non mandare
    un messaggio.
  */
  return wanted.has(asText(athlete?.category_id));
};

const matchesGroups = (
  athlete: any,
  wanted: Set<string>,
  siteIndex: SiteIndex,
) => getAthleteGroupIds(athlete, siteIndex).some((id) => wanted.has(id));

const matchesSites = (
  athlete: any,
  wanted: string[],
  siteIndex: SiteIndex,
) => {
  const athleteSites = getAthleteSiteIds(athlete, siteIndex);
  return wanted.some((siteId) => recordMatchesSite(athleteSites, siteId));
};

/**
 * Gli atleti con almeno una rata ancora scoperta.
 *
 * **Il residuo non si ricalcola qui.** Lo produce `buildInstallmentLedgers`,
 * cioe la stessa funzione che alimenta la scheda atleta, i movimenti e i
 * report: sommare per conto proprio sarebbe la terza interpretazione del
 * denaro, e `tests/lib/reports-cash-invariant.test.mjs` esiste per impedirlo.
 */
const readAthletesWithOverdue = async ({
  organizationId,
  athleteIds,
  now,
}: {
  organizationId: string;
  athleteIds: string[];
  now: Date;
}) => {
  if (athleteIds.length === 0) return new Set<string>();

  const charges = await (prisma as any).athletePayment.findMany({
    where: { organization_id: organizationId, athlete_id: { in: athleteIds } },
  });

  if (charges.length === 0) return new Set<string>();

  const transactions = normalizePaymentTransactions(
    await (prisma as any).paymentTransaction.findMany({
      where: {
        organization_id: organizationId,
        payment_id: { in: charges.map((charge: any) => asText(charge.id)) },
      },
    }),
  );

  const byAthlete = new Map<string, any[]>();
  for (const charge of charges) {
    const athleteId = asText(charge.athlete_id);
    if (!athleteId) continue;
    const bucket = byAthlete.get(athleteId);
    if (bucket) bucket.push(charge);
    else byAthlete.set(athleteId, [charge]);
  }

  const withOverdue = new Set<string>();

  for (const [athleteId, athleteCharges] of byAthlete) {
    const ledgers = buildInstallmentLedgers({
      charges: athleteCharges,
      transactions,
      now,
    });
    if (ledgers.some((ledger) => ledger.residualAmount > 0)) {
      withOverdue.add(athleteId);
    }
  }

  return withOverdue;
};

const certificateNeedsAttention = (
  athlete: any,
  withinDays: number,
  now: Date,
) => {
  const certificates = Array.isArray(athlete?.medical_certificates)
    ? athlete.medical_certificates
    : [];
  const expiry = getLatestMedicalCertificateExpiry(certificates);
  const availability = getMedicalCertificateAvailability(expiry || null, now);

  if (availability === "missing" || availability === "expired") return true;
  if (availability !== "expiring") return false;

  /*
    `expiring` usa la finestra standard del prodotto; qui la finestra la
    dichiara il criterio, quindi va ricontrollata invece di fidarsi
    dell'etichetta: «entro 7 giorni» e «entro 30» non sono lo stesso pubblico.
  */
  const expiryDate = expiry ? new Date(expiry) : null;
  if (!expiryDate || Number.isNaN(expiryDate.getTime())) return false;

  const days = Math.ceil(
    (expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
  );
  return days <= withinDays;
};

export type ResolvedAudience = AudienceSet & {
  organizationId: string;
  clubName: string;
  criteriaLabel: string;
  athleteIds: string[];
  /**
   * La chiave di consenso applicata a questo pubblico, o `null`.
   *
   * Viaggia nel risultato perche l'anteprima deve poter spiegare **perche**
   * mancano venti indirizzi, e «consenso revocato» senza dire *quale* consenso
   * manda la segreteria a cercare nel posto sbagliato.
   */
  appliedConsentKey: string | null;
};

/**
 * Risolve un pubblico.
 *
 * `alreadySent` sono le chiavi gia presenti nel registro delle consegne per
 * questa occorrenza: entrano come **esclusione con il motivo**, non come
 * silenzio.
 */
export const resolveAudience = async ({
  organizationId,
  criteria,
  scope,
  actorRole,
  now = new Date(),
  alreadySent,
  requiredConsentKey,
  consentEnforcementMode,
}: {
  organizationId?: string | null;
  criteria: unknown;
  scope?: AudienceScope;
  actorRole?: string | null;
  now?: Date;
  alreadySent?: ReadonlySet<string>;
  /**
   * Vince sullo scope. Serve alle funzioni di invio, che conoscono la
   * **natura** del messaggio e non il ruolo di chi lo manda: passare da qui
   * evita di dover ricomporre lo scope solo per aggiungere una chiave.
   */
  requiredConsentKey?: string | null;
  consentEnforcementMode?: ConsentEnforcementMode;
}): Promise<ResolvedAudience> => {
  const clubId = resolveAudienceOrganizationId(scope, organizationId);
  const normalized = normalizeAudienceCriteria(criteria);

  /*
    **Il permesso protegge il criterio, non la pagina.** «Manda a chi non ha
    pagato» non mostra nessun importo, eppure produce l'elenco delle famiglie
    in arretrato. Senza questa riga un allenatore lo otterrebbe passando di
    qui invece che dai movimenti, che e il buco che il permesso esiste per
    chiudere.
  */
  if (criteriaRevealEconomicData(normalized)) {
    assertCommunicationPermission(
      actorRole ?? scope?.activeRole ?? null,
      "communications.audience_economic",
    );
  }

  const wantsCertificates = normalized.some(
    (criterion) => criterion.kind === "certificate_missing_or_expiring",
  );
  const athleteIdCriterion = normalized.find(
    (criterion): criterion is Extract<AudienceCriterion, { kind: "athlete_ids" }> =>
      criterion.kind === "athlete_ids",
  );

  const [club, athletes] = await Promise.all([
    (prisma as any).club.findUnique({
      where: { id: clubId },
      select: { name: true, club_sites: true },
    }),
    (prisma as any).athlete.findMany({
      where: {
        organization_id: clubId,
        ...(athleteIdCriterion ? { id: { in: athleteIdCriterion.values } } : {}),
      },
      include: {
        category_memberships: true,
        ...(wantsCertificates ? { medical_certificates: true } : {}),
      },
    }),
  ]);

  if (!club) throw new Error("Club non trovato");

  const siteIndex = buildSiteIndex(normalizeClubSites(club.club_sites));

  let selected: any[] = athletes;

  for (const criterion of normalized) {
    switch (criterion.kind) {
      case "all_families":
      case "athlete_ids":
        /* Gia applicati: il primo non filtra, il secondo e nella query. */
        break;
      case "category_ids": {
        const wanted = new Set(criterion.values);
        selected = selected.filter((athlete) =>
          matchesCategories(athlete, wanted),
        );
        break;
      }
      case "group_ids": {
        const wanted = new Set(criterion.values);
        selected = selected.filter((athlete) =>
          matchesGroups(athlete, wanted, siteIndex),
        );
        break;
      }
      case "site_ids":
        selected = selected.filter((athlete) =>
          matchesSites(athlete, criterion.values, siteIndex),
        );
        break;
      case "certificate_missing_or_expiring":
        selected = selected.filter((athlete) =>
          certificateNeedsAttention(
            athlete,
            criterion.withinDays ?? DEFAULT_CERTIFICATE_WITHIN_DAYS,
            now,
          ),
        );
        break;
      case "no_account":
        /* Risolto dopo, quando gli account sono noti. */
        break;
      /*
        **I convocati, e chi non ha risposto** (W5-14, ADR-0098).

        Due criteri che prima erano inesprimibili: la convocazione viveva dentro
        il payload della gara in dieci grafie, e la risposta della famiglia non
        aveva un evento a cui appoggiarsi. Adesso sono due colonne della stessa
        riga, e la domanda diventa una query.

        «Senza risposta» significa **convocato e silenzioso**, non «non
        convocato»: scrivere a chi non e stato chiamato per chiedergli se viene
        e il modo piu rapido per far arrivare al campo qualcuno che non doveva
        esserci.
      */
      case "event_convocated":
      case "event_no_rsvp": {
        const righe = await (prisma as any).clubEventParticipant.findMany({
          where: {
            organization_id: clubId,
            event_id: { in: criterion.values },
            convocation_status: "convocated",
            ...(criterion.kind === "event_no_rsvp"
              ? { rsvp_status: null }
              : {}),
          },
          select: { athlete_id: true },
        });
        const wanted = new Set(
          (Array.isArray(righe) ? righe : []).map((riga: any) =>
            asText(riga.athlete_id),
          ),
        );
        selected = selected.filter((athlete) =>
          wanted.has(asText(athlete.id)),
        );
        break;
      }
      case "overdue_payments": {
        const withOverdue = await readAthletesWithOverdue({
          organizationId: clubId,
          athleteIds: selected.map((athlete) => asText(athlete.id)),
          now,
        });
        selected = selected.filter((athlete) =>
          withOverdue.has(asText(athlete.id)),
        );
        break;
      }
    }
  }

  const subjects = await buildAudienceSubjects({
    organizationId: clubId,
    athletes: selected,
  });

  const wantsNoAccount = normalized.some(
    (criterion) => criterion.kind === "no_account",
  );

  /*
    «Senza account collegato» si applica **sui contatti**, non sugli atleti: un
    atleta con due tutori, uno collegato e uno no, non e ne dentro ne fuori. Il
    pubblico che serve alla segreteria e l'insieme delle persone da invitare,
    quindi si tengono i contatti senza account e si scartano gli altri.
  */
  const filtered = wantsNoAccount
    ? subjects
        .map((subject) => ({
          ...subject,
          contacts: subject.contacts.filter((contact) => !contact.userId),
        }))
        .filter((subject) => subject.contacts.length > 0)
    : subjects;

  /*
    **Il consenso, una volta sola e alla fine.**

    Una lettura per tutto il pubblico invece che una per atleta: il registro e
    append-only e cresce, e una domanda per destinatario su un invio a
    trecento famiglie sarebbe trecento interrogazioni per un fatto che si legge
    in una.

    Sta **dopo** i criteri e non prima, perche escludere chi ha revocato da un
    insieme che poi si filtra per categoria non cambia il risultato e legge
    righe che non servono; e sta **prima** di `buildAudienceSet` perche
    l'esclusione deve comparire nell'insieme canonico, con il suo motivo, non
    come un silenzio a monte.
  */
  const consentKey = asText(requiredConsentKey ?? scope?.requiredConsentKey);
  const enforcement = consentKey
    ? await readConsentEnforcement({
        organizationId: clubId,
        consentKey,
        subjectKind: "athlete",
        mode:
          consentEnforcementMode ??
          scope?.consentEnforcementMode ??
          "block_negative",
      })
    : null;

  const withConsent = enforcement?.enforced
    ? filtered.map((subject) => ({
        ...subject,
        consentRevoked: consentBlocksSubject(enforcement, subject.athleteId),
      }))
    : filtered;

  const set = buildAudienceSet({ subjects: withConsent, alreadySent });

  return {
    ...set,
    organizationId: clubId,
    clubName: asText(club.name) || "Il tuo club",
    criteriaLabel: describeAudienceCriteria(normalized),
    /*
      `athleteIds` e l'elenco di chi il messaggio **riguarda**, e chi ha
      revocato non lo riguarda piu: lasciarlo dentro farebbe scrivere il
      registro delle consegne su una persona che non e stata raggiunta.
    */
    athleteIds: withConsent
      .filter((subject) => subject.consentRevoked !== true)
      .map((subject) => subject.athleteId),
    appliedConsentKey: enforcement?.enforced ? enforcement.consentKey : null,
  };
};
