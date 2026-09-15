import { normalizeAthleteStatus } from "@/lib/athletes/status";
import { categoryIdentity, sameCategory } from "@/lib/categories/identity";
import { prisma } from "@/lib/server/prisma";
import { stripGuardianAccessTokens } from "@/lib/health/permissions";
import {
  buildClubCategoryOptions,
  resolveCategoryLabel,
  type NormalizedCategoryOption,
} from "@/lib/category-utils";
import { getAthleteDisplayName } from "@/lib/athlete-name-utils";
import {
  normalizeActiveClubSeason,
  normalizeClubSeasons,
} from "@/lib/club-seasons";
import {
  buildCategoryGroupLabel,
  buildCategoryGroups,
  buildSiteIndex,
  normalizeClubSites,
} from "@/lib/club-sites";
import { buildCategoryDisplayIndex } from "@/lib/categories/display";
import { normalizeAthleteCategoryMemberships } from "@/lib/athlete-category-memberships";
import { reportServerError } from "@/lib/server/observability";
import {
  findGuardianLinks,
  readGuardiansForAthlete,
} from "@/lib/server/athlete-guardians";
import { resolveCheckoutReadiness } from "@/lib/server/connect-accounts";
import { normalizePaymentSettings } from "@/lib/payments/payment-config-utils";
import { resolveFamilyCheckoutChannel } from "@/lib/payments/family-checkout";
import {
  bookableAppointmentTypes,
  familyCanRequestAppointment,
  normalizeAppointmentsConfig,
} from "@/lib/appointments/config";
import {
  getLatestMedicalCertificateExpiry,
  getMedicalCertificateAvailability,
  getMedicalCertificateAvailabilityLabel,
  getMedicalCertificateFamilyState,
  describeMedicalCertificateForFamily,
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
  athleteCardsEverOwnedByUser,
  clubsWhereStillAthlete,
} from "./athlete-membership";
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
  **Lo UUID non si controlla piu, perche non c'e piu niente da decidere.**

  Serviva a un ramo solo — «se **non** e uno UUID allora ricadi sul primo
  atleta collegato» — e la forma del pattern era rotta (mancava il trattino fra
  la variante e il nodo), quindi la ricaduta scattava sempre. La Wave 6 corresse
  la forma; PP-02 §A ha tolto la ricaduta, e con lei l'ultimo uso: un
  identificativo che non e nessuno dei propri figli **non e** una richiesta a
  cui rispondere con un figlio a caso.
*/

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





/**
 * **Le identita che, scritte su un tutore, aprono il cruscotto della
 * famiglia.**
 *
 * Questa funzione esiste per una ragione sola, e vale la pena scriverla:
 * `resources.ts` deve impedire che quell'insieme **cresca** da chi non ha
 * la vista clinica, e per farlo deve calcolarlo **esattamente come lo
 * calcola chi apre il cruscotto**.
 *
 * Le due stesure precedenti hanno condiviso prima niente, poi la **lista dei
 * campi**. Una revisione ha misurato che condividere la lista non basta: la
 * guardia contava solo i valori **stringa**, e `firstText` fa `String(v)`,
 * quindi `email: ["attaccante@…"]` non entrava nell'insieme sorvegliato e
 * apriva il cruscotto. Le due parti concordavano sui campi e non su cosa sia
 * un valore.
 *
 * Adesso condividono la **funzione**. Non c'e piu una seconda nozione di
 * identita da tenere allineata, e non ci sono contenitori da enumerare: si
 * parte dagli stessi `getGuardianRows` che il predicato usa.
 */
/**
 * **Le identita a cui il club ha tolto l'accesso a questo atleta.**
 *
 * Il marchio sulla **riga** non bastava, e il nono round lo ha misurato in due
 * mosse: il riporto del marchio si aggancia all'`id` della riga, quindi
 * bastava aggiungerne una **nuova** con lo stesso indirizzo e un `id` diverso
 * — o cambiare l'`id` a quella che c'era — per ritrovarsi una riga pulita che
 * il ripiego sull'indirizzo accetta. E la stessa cosa succedeva da sola
 * approvando un modulo di iscrizione in cui la persona si dichiara tutore: il
 * dominio dei moduli fa `guardians.push(...)` di un oggetto nuovo.
 *
 * L'errore era di livello: **l'accesso si concede a un'identita, non a una
 * riga**. Percio la revoca si registra sull'atleta, e vale per chiunque si
 * presenti con quell'identita, da qualunque riga.
 *
 * Resta reversibile, ed e importante che lo sia: un riscatto successivo
 * riscrive il legame **dichiarato**, che vince sul ripiego, e toglie
 * l'identita da questo elenco.
 */
/**
 * **Questa notifica parla di questo figlio.**
 *
 * Una notifica che **nomina** un atleta (`data.athleteId`) e di quel figlio;
 * una che non ne nomina nessuno parla del club, e vale per tutti.
 *
 * Vive qui, esportata, perche due posti devono dare la stessa risposta: la
 * lettura che riempie la bacheca e il conteggio della pastiglia, e la rotta
 * che segna letto. Non lo davano: la pastiglia contava le notifiche **del
 * figlio scelto**, e «segna tutte come lette» ne chiudeva **tutte** quelle del
 * genitore in quel club. Un genitore con due figli apriva la schermata di uno,
 * leggeva «(3)», premeva, e spegneva anche le sei dell'altro — che nessuno
 * aveva letto e che nessuna schermata avrebbe piu mostrato come nuove.
 */
export const notificationBelongsToAthlete = (
  notification: unknown,
  athleteId: string,
) => {
  const citato = asRecord(asRecord(notification).data).athleteId;
  if (!citato) return true;
  return sameId(String(citato), athleteId);
};



/*
  **Qui vivevano le tre funzioni della sesta copia privata** (D-INT-2).

  `getAthleteCategoryTokens`, `getRecordCategoryTokens` e
  `hasTokenIntersection` costruivano un insieme di token che mescolava
  identificativi ed **etichette** — `tokens.add(normalizeToken(text))`
  accanto a `tokens.add(normalizeToken(resolveCategoryLabel(...)))` — e lo
  intersecavano. Con due categorie omonime su due sedi l'intersezione era
  non vuota, e la famiglia di una si trovava sul calendario il programma
  dell'altra.

  `recordMatchesAthlete` passa ora dalla primitiva del dominio, e queste
  non le chiamava piu nessuno. Sono state tolte invece che lasciate: una
  copia della regola che nessuno usa e una copia che qualcuno riusera.
*/

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

/**
 * **La famiglia deve vedere la stessa convocazione che il club ha fatto**
 * (`D-AUD-9`, meta famiglia di P0-6).
 *
 * Questa funzione deduceva «convocato / non convocato» da **ventotto grafie**
 * dentro `match`, `match.payload` e `match.data` — `calledAthletes`, `roster`,
 * `lineup`, `convocations`… — e dopo ADR-0099 nessuna di quelle la scrive piu
 * nessuno: la convocazione e `club_event_participants.convocation_status`, con
 * il suo scrittore (`saveEventConvocations`), il suo permesso e la sua
 * notifica. L'effetto misurato: l'allenatore convoca sedici ragazzi, il club
 * vede la rosa, e nella bacheca di ogni famiglia la gara resta «Non
 * registrato». Tre superfici sullo stesso fatto, e quella della famiglia
 * leggeva l'unica copia che non viene piu aggiornata.
 *
 * La riga la si ha gia: e la stessa che porta la presenza dell'allenamento,
 * caricata da `club_event_participants` e indicizzata per evento. **Decide
 * lei**, e le grafie storiche restano solo come ripiego per le gare
 * antecedenti alla migrazione, dove una riga non c'e.
 *
 * L'ordine e quello del dominio: una presenza segnata e una partecipazione;
 * `excluded` e una decisione presa — «non giochi» — e vale `not_called`;
 * `convocated` e la convocazione. `null` non e «non convocato»: e nessuno che
 * ha ancora deciso, e da li si ricade sul payload.
 */
const resolveMatchParticipationStatus = (
  match: any,
  athlete: any,
  partecipazione?: {
    status?: unknown;
    convocation_status?: unknown;
  } | null,
) => {
  const presenza = normalizeToken(partecipazione?.status);
  if (presenza === "present" || presenza === "presente") {
    return "participated";
  }

  const convocazione = normalizeToken(partecipazione?.convocation_status);
  if (convocazione === "excluded") return "not_called";
  if (convocazione === "convocated") return "called";

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

/**
 * **Questo allenamento riguarda questo figlio?** (D-INT-2, ADR-0155)
 *
 * Qui c'era la sesta copia privata del confronto fra categorie, e come le
 * altre cinque metteva identificativi ed **etichette** nello stesso insieme:
 * `tokens.add(normalizeToken(text))` accanto a
 * `tokens.add(normalizeToken(resolveCategoryLabel(...)))`.
 *
 * Con due «Under 15» su due sedi l'intersezione era non vuota, e la famiglia
 * di Formia si trovava sul calendario **l'intero programma della squadra di
 * Scauri** — allenamenti, gare, e per ogni gara lo stato di partecipazione del
 * proprio figlio a un evento che non lo riguardava.
 *
 * Adesso risponde la primitiva del dominio. Resta il ramo che apre tutto
 * quando **nessuno dei due** dichiara una categoria: e il club mono-categoria,
 * che non ha mai compilato quel campo, e li restringere a zero vuoterebbe il
 * calendario invece di separare due squadre.
 */
const recordMatchesAthlete = (
  record: any,
  athlete: any,
  categories: NormalizedCategoryOption[],
) => {
  const delRecord = categoryIdentity(record, categories);
  const dellAtleta = categoryIdentity(athlete, categories);

  const recordNonDichiara =
    delRecord.identificativi.size === 0 && delRecord.nomi.size === 0;
  const atletaNonDichiara =
    dellAtleta.identificativi.size === 0 && dellAtleta.nomi.size === 0;

  if (recordNonDichiara && atletaNonDichiara) {
    return true;
  }

  return sameCategory(record, athlete, categories);
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
  /*
    **`allowSelfAthleteLink` arriva da chi ha aperto il cruscotto** (ADR-0122).

    Il fascicolo si richiude da se, con la sua guardia e il suo predefinito
    restrittivo: senza questo passaggio l'area atleta — che di ogni carta
    mostra il titolo e lo stato — riceveva un `Accesso negato` da dentro il
    proprio payload. Ripassare qui la stessa risposta che il dominio ha gia
    dato evita l'alternativa peggiore: due idee di chi sia una famiglia, in due
    file, che il giorno che una cambia dicono cose diverse.
  */
  options: { now?: Date; allowSelfAthleteLink?: boolean } = {},
): Promise<FamilyDocumentAreas> => {
  const organizationId = String(athlete?.organization_id || "");
  const scope = {
    userId: String(userId || ""),
    activeOrganizationId: organizationId,
    activeRole: null as string | null,
    allowedOrganizationIds: [organizationId],
    /*
      L'area atleta legge da qui lo **stato** dei propri documenti — non i
      byte, che la sua proiezione non espone. Senza questo, chiuderla ai
      ragazzi avrebbe spento la loro stanza invece di chiudere una porta.
    */
    allowSelfAthleteLink: Boolean(options.allowSelfAthleteLink),
  };

  const { getDocumentDossier } = await import("./document-requests");

  const entries = (await getDocumentDossier(
    scope,
    { subjectKind: "athlete", subjectId: athlete.id },
    {
      now: options.now,
      allowSelfAthleteLink: options.allowSelfAthleteLink === true,
    },
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

/**
 * **Le appartenenze di un atleta, con la sede scritta per esteso.**
 *
 * Sta fuori da `serializeAthleteCard` perche la schermata di scelta del figlio
 * ne ha bisogno **senza** il resto della scheda: li deve uscire un elenco
 * chiuso di campi, e comporlo prendendo una chiave da una scheda intera
 * significherebbe che un campo nuovo sulla scheda arriva anche li.
 */
const serializeAthleteCategories = (
  athlete: any,
  categoryOptions: NormalizedCategoryOption[] = [],
) => {
  const club = athlete?.organization;
  /*
    **Le appartenenze si leggono come identita, e si scrivono con l'indice**
    (ADR-0185). Qui si iteravano le righe grezze: la riga gemella storica con
    il solo nome usciva come seconda squadra, il nome stantio della colonna
    vinceva sul catalogo e, dove `category_name` e nullo, il ripiego era lo
    UUID. La famiglia leggeva «Pulcini - S. Cosma (S. Cosma) · Pulcini - S.
    Cosma». Adesso: lo stesso normalizzatore della scheda, lo stesso catalogo,
    la stessa etichetta.
  */
  const catalogo =
    categoryOptions.length > 0
      ? categoryOptions
      : buildClubCategoryOptions({
          clubCategories: club?.categories,
          athletes: [athlete],
        });
  const sedi = normalizeClubSites(club?.club_sites);
  const siteIndex = buildSiteIndex(sedi);
  const display = buildCategoryDisplayIndex({
    categories: catalogo,
    groups: buildCategoryGroups({
      categories: catalogo,
      sites: sedi,
      groups: club?.category_groups,
    }),
    sites: sedi,
  });

  return normalizeAthleteCategoryMemberships(athlete, catalogo).map(
    (membership) => {
      const descritta = display.describe({
        categoryId: membership.categoryId,
        categoryName: membership.categoryName,
      });
      /*
        PP-02 §B. La sede resta `null` quando la riga non ne dichiara una —
        cioe su ogni club mono-sede, dove nominarla sarebbe rumore — e non e
        mai un identificativo.
      */
      const siteName =
        membership.siteId && siteIndex.has(membership.siteId)
          ? siteIndex.getSiteName(membership.siteId)
          : null;

      return {
        id: membership.categoryId,
        name: descritta.name,
        siteId: membership.siteId || null,
        siteName,
        /*
          L'etichetta da leggere: la sede dove il nome ne nomina due, o dove
          l'appartenenza la dichiara — per la famiglia «dove si allena» e
          informazione, non rumore.
        */
        label: descritta.site
          ? descritta.label
          : siteName
            ? buildCategoryGroupLabel(descritta.name, siteName)
            : descritta.name,
        isPrimary: membership.isPrimary,
      };
    },
  );
};

const serializeAthleteCard = (
  athlete: any,
  categoryOptions: NormalizedCategoryOption[] = [],
) => {
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
    categories: serializeAthleteCategories(athlete, categoryOptions),
    status: athlete.status,
    /*
      PP-02 §A. La foto: la schermata di scelta la mostrava gia — e il modo
      piu rapido di riconoscere il proprio figlio — e il guscio, che di quello
      stesso figlio dice il nome su ogni pagina, non l'aveva.
    */
    avatar_url: athlete.avatar_url || firstText(data.avatar) || null,
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

/**
 * **Un documento di pagamento, come lo legge una famiglia.**
 *
 * PP-02 §E. Sette campi piu il figlio a cui si riferisce, e nient'altro. Cio
 * che resta fuori non e un dettaglio di comodo:
 *
 * | Campo escluso | Perche |
 * |---|---|
 * | `issued_by`, `cancelled_by` | chi in segreteria ha emesso o annullato: e una persona, e non riguarda la famiglia |
 * | `operation_type_code`, `snapshot` | la classificazione contabile congelata: il club la usa per il proprio rendiconto |
 * | `transaction_id`, `invoice_id`, `payment_id` | le chiavi con cui il club riconcilia la propria cassa |
 * | `data`, `file_url` | un JSON libero e un percorso di archivio, entrambi senza contratto |
 * | `series`, `sequence`, `document_year` | il numero completo c'e gia; questi sono la sua meccanica |
 *
 * **Lo stato** invece esce, ed e la ragione per cui `cancelled_at` non e
 * semplicemente omesso: una ricevuta annullata deve leggersi «Annullata», non
 * sparire. Una famiglia che ha in mano la copia cartacea di un documento
 * annullato deve poterlo capire dall'applicazione, non scoprirlo in segreteria.
 */
const serializeFamilyFiscalDocument = (
  kind: "receipt" | "invoice",
  row: any,
  athlete: any,
) => {
  const annullato = Boolean(row?.cancelled_at);

  return {
    id: row.id,
    kind,
    /** «Ricevuta n. 12/2026» oppure «Fattura n. 4/2026». */
    number:
      firstText(row.receipt_number, row.invoice_number) ||
      (kind === "receipt" ? "Ricevuta" : "Fattura"),
    issueDate: toIso(row.issue_date),
    amount: Number(row.amount ?? 0),
    /** La causale come e stata scritta sul documento, non quella contabile. */
    description: firstText(row.description),
    /** `issued` | `cancelled`: e cio che la famiglia deve poter distinguere. */
    status: annullato ? "cancelled" : firstText(row.status) || "issued",
    statusLabel: annullato ? "Annullata" : "Emessa",
    /*
      Il figlio, per nome — e per **cio che la riga porta con se**, non per
      distinguerla dalle altre: l'elenco e gia letto con
      `where: { athlete_id: selectedAthlete.id }`, quindi contiene un figlio
      solo e questo nome e sempre lo stesso.

      Serve a chi scarica il documento e lo ritrova in una cartella sei mesi
      dopo, e a chi legge la riga fuori dal contesto della schermata che l'ha
      chiesta. La prima stesura lo motivava con una famiglia di due figli che
      confronta importi simili: quello scenario, con questa query, non puo
      verificarsi.
    */
    athleteId: row.athlete_id || null,
    athleteName:
      row.athlete_id && sameId(row.athlete_id, athlete?.id)
        ? getAthleteDisplayName(athlete)
        : null,
    /** La rotta che ristampa il documento dallo snapshot, gia autorizzata per legame. */
    downloadPath: `/api/v1/documents/${kind}/${encodeURIComponent(row.id)}`,
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

/**
 * **Di quali atleti questa persona e tutore.**
 *
 * PP-02 / WP-C. Qui prima c'erano **tre** cose, e ognuna aveva il proprio
 * difetto:
 *
 * 1. una scansione in SQL grezzo di tutta la tabella `athletes` — «esiste,
 *    dentro un array JSON, un oggetto con una di queste quattro grafie uguale a
 *    questo valore» — che nessun indice poteva aiutare, e che un `catch` largo
 *    faceva degradare in silenzio a «nessun club»;
 * 2. un insieme di **candidati** che portava in memoria ogni atleta di ogni
 *    club in cui la persona avesse una tessera;
 * 3. un vaglio in memoria (`athleteBelongsToParent`) che girava **dopo**, su
 *    quell'insieme, e quindi non poteva vedere un figlio che l'insieme non
 *    contenesse.
 *
 * Adesso e una interrogazione su una tabella con una chiave. Il legame ha una
 * riga, la riga ha un indice, e chi decide e l'archivio. Chiude `PP02-D1`, che
 * diceva esattamente questo: «la chiusura vera e materializzare il legame in
 * una tabella con la sua chiave esterna».
 *
 * **Le due strade restano due, e la differenza non e una sfumatura.**
 * L'utenza vale ovunque, perche nasce dal riscatto di un invito: e un atto
 * della persona, tracciato e revocabile. L'indirizzo di contatto lo scrive la
 * segreteria a mano — e un refuso su un dominio diffuso e l'indirizzo
 * verificato di qualcun altro — quindi vale **solo dove quella persona ha gia
 * una tessera**, e solo se l'indirizzo e verificato. Le due regole vivono in
 * `findGuardianLinks`, nel modulo proprietario, perche sono regole di dominio
 * e non di questa schermata.
 *
 * ## Da quale legame si sta entrando (PP-04, ADR-0118)
 *
 * Due legami diversi aprono questa area, e non danno diritto alle stesse cose:
 *
 * - il **tutore**, che e la famiglia, e per cui l'area e stata scritta;
 * - l'**atleta stesso**, per il quale `athletes.user_id` esiste perche l'area
 *   atleta riusa questo dominio come sorgente — e poi ne proietta un elenco
 *   chiuso di campi (`CAMPI_AREA_ATLETA`), che e dove denaro, tutori e
 *   contenuto clinico restano fuori.
 *
 * Il difetto misurato da una revisione ostile: l'elenco chiuso vale sulla
 * proiezione, **non sulla rotta**. Un atleta perfettamente in regola apriva
 * `GET /api/parent-dashboard/<la propria scheda>` e riceveva il payload
 * intero — le quote e le ricevute della famiglia, la diagnosi e l'indirizzo
 * del file del certificato, l'anagrafica dei tutori. Il commento che dice
 * «fuori dall'elenco, e non per dimenticanza» era vero su una rotta sola.
 *
 * `allowSelfAthleteLink` messo a vero apre il ramo diretto: senza di lui
 * questo dominio serve **solo** chi entra come tutela.
 *
 * ## Il predefinito e restrittivo, e non lo e sempre stato (ADR-0122)
 *
 * Il primo giro l'aveva lasciato permissivo, e le cinque rotte del cruscotto
 * di famiglia dichiaravano `false`. Una seconda revisione ostile ha misurato
 * che quella forma non chiudeva niente: bastava dimenticarsi la dichiarazione
 * su **una** rotta perche la porta si riaprisse, e la rotta che se ne
 * dimenticava non lo diceva a nessuno.
 *
 * Il verso e adesso l'altro: **dimenticarsene chiude una porta invece di
 * aprirla**. Un chiamante nuovo nasce servendo la tutela, e chi serve davvero
 * l'atleta lo dichiara — oggi sono quattro, ognuno con il suo commento:
 *
 * | Chiamante | Perche |
 * |---|---|
 * | `readAthleteAreaOverview` (`athlete-accounts.ts`) | e la sorgente dell'area atleta, che ne proietta `CAMPI_AREA_ATLETA` |
 * | `GET /api/parent-dashboard/:id/board` | la bacheca dell'area atleta |
 * | `authorizeAnsweringUser` (`rsvp.ts`) | l'atleta risponde alla propria convocazione |
 * | `GET /api/v1/auth/memberships` | `linked_athlete_ids` del ruolo `athlete`, da cui dipende il rientro nell'area |
 *
 * Tutto il resto — il payload intero, i **byte** dei documenti, le strutture,
 * il checkout, i consensi, gli appuntamenti, il fascicolo, le pratiche
 * d'iscrizione — resta di chi ha la responsabilita.
 */
export type ParentAccessOptions = {
  allowSelfAthleteLink?: boolean;
};

export const getParentLinkedAthletes = async (
  userId: string,
  { allowSelfAthleteLink = false }: ParentAccessOptions = {},
) => {
  /*
    **Tre domande su `userId`, e nessuna dipende dall'altra.**

    Su Neon da Vercel ogni lettura paga un giro di rete: in fila costano tre
    attese, insieme una. La misura del §27 (`npm run wave6:perf`) conta le
    attese iniettando una latenza fissa.
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

    `PATCH /api/v1/auth/user` lascia cambiare il proprio indirizzo con qualunque
    altro non ancora registrato. Chiunque avesse **una qualsiasi** tessera nel
    club poteva scrivere l'indirizzo del tutore di un'altra famiglia e leggere
    di quel minore pagamenti, fatture, **certificati medici** e documenti
    d'identita, poi rimettere il proprio. Il cambio azzera pero
    `email_verified_at`, e pretendere qui la verifica chiude la strada senza
    toccare il tutore vero.
  */
  const verifiedEmail = user?.email_verified_at ? user.email : null;

  const organizationIdsForEmail = Array.from(
    new Set(
      memberships
        .map((membership) => membership.organization_id)
        .concat(ownedClubs.map((club) => club.id)),
    ),
  );

  const legami = await findGuardianLinks(prisma, {
    userId,
    verifiedEmail,
    organizationIdsForEmail,
  });

  const athleteIds = Array.from(new Set(legami.map((legame) => legame.athlete_id)));

  /*
    **«E un mio figlio» e «sono io» non sono la stessa domanda.**

    Il ramo «sono io» apre tutta l'area famiglia — nome, **indirizzo e telefono
    dei propri tutori**, che sono dati di terzi, la riga `data` grezza, allergie
    e note mediche, e da `/documents/<id>` i **byte** del certificato. Percio va
    **chiesto**, e lo chiede solo l'area atleta, che da questi stessi dati
    costruisce la propria proiezione ristretta.
  */
  const strade: any[] = [];
  if (allowSelfAthleteLink) strade.push({ user_id: userId });
  if (athleteIds.length) strade.push({ id: { in: athleteIds } });

  if (!strade.length) return [];

  const candidati = await prisma.athlete.findMany({
    where: { OR: strade },
    include: {
      organization: true,
      /*
        W6-14. Un atleta puo stare in piu categorie, e `recordMatchesAthlete`
        legge questa relazione per decidere quali allenamenti e quali gare
        riguardano questo figlio. Senza popolarla, il calendario perdeva le
        attivita della seconda squadra.
      */
      category_memberships: true,
    },
    orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
  });

  /*
    **Le schede di cui questa persona e, o e stata, l'account** (ADR-0123).

    Il legame vivo `athletes.user_id` piu gli inviti **accettati** che la
    revoca non cancella. Si chiede sempre, anche quando il ramo diretto e
    chiuso, perche non serve ad aprirlo: serve a impedire che chi e stato
    quella scheda rientri dal ramo del tutore quando il club gli ha appena
    tolto l'accesso.

    Una interrogazione per l'intero elenco, non una per riga.
  */
  const schedeProprie = new Set(
    candidati
      .filter((athlete) => sameId(athlete.user_id, userId))
      .map((athlete) => String(athlete.id)),
  );
  (
    await athleteCardsEverOwnedByUser(
      userId,
      candidati.map((athlete) => ({
        id: String(athlete.id),
        organization_id: String(athlete.organization_id),
      })),
    )
  ).forEach((athleteId) => schedeProprie.add(athleteId));

  /*
    I club in cui questa persona e **ancora un atleta**: serve solo al ramo del
    legame diretto, e si chiede una volta sola per l'intero elenco invece che
    per riga (ADR-0117). Si interroga soltanto sui club delle **sue** schede:
    sugli altri la domanda non si pone.
  */
  const ancoraAtleta = allowSelfAthleteLink
    ? await clubsWhereStillAthlete(
        userId,
        candidati
          .filter((athlete) => schedeProprie.has(String(athlete.id)))
          .map((athlete) => athlete.organization_id),
      )
    : new Set<string>();

  /*
    **Il ramo diretto e esclusivo, e chi lo giudica e la riga** (ADR-0124).

    Qui PP-04 e PP-02 si incontrano. PP-04 aveva scritto questa regola su
    `athletes.data.guardians[]`, che WP-C ha tolto dall'autorita: «e un tutore
    provato?» non si chiede piu al blob, si chiede alle righe che
    `findGuardianLinks` ha gia restituito. La distinzione che regge il
    Critical e la stessa — `linkedUserId` contro la casella — e nel modello
    relazionale e la colonna `user_id` contro il ripiego sull'indirizzo
    verificato: un legame **dichiarato** contro una coincidenza di recapito.

    Chi e (o e stato) l'account di questa scheda e **non** ha accanto una
    decisione registrata come tutore non rientra dal ramo del tutore: per lui
    vale il legame vivo, e solo dentro un club in cui e ancora un atleta.
    L'ex atleta senza piu nessuna tessera resta fuori, ed e il difetto che
    ADR-0122 e ADR-0123 hanno chiuso; chi porta due cappelli — l'account della
    scheda **e** un tutore dichiarato — passa dal ramo del tutore come vi
    passerebbe se non fosse mai stato invitato (ADR-0125).
  */
  const tutoreDichiarato = new Set(
    legami
      .filter((legame) => sameId(legame.user_id, userId))
      .map((legame) => String(legame.athlete_id)),
  );

  return candidati.filter((athlete) => {
    const scheda = String(athlete.id);
    const legameVivo = sameId(athlete.user_id, userId);
    const eLaPersonaStessa = legameVivo || schedeProprie.has(scheda);

    if (eLaPersonaStessa && !tutoreDichiarato.has(scheda)) {
      /*
        L'esclusione la decide `eLaPersonaStessa`, che e durevole; l'ammissione
        la decide `legameVivo`, che non lo e. Chi e stato l'account di questa
        scheda e non lo e piu **non torna dal ramo del tutore** — questa
        condizione lo tiene qui — e non entra nemmeno dal proprio (ADR-0125).
      */
      return (
        legameVivo && ancoraAtleta.has(String(athlete.organization_id || ""))
      );
    }

    /*
      Chi arriva qui o porta una riga di tutore viva — e `findGuardianLinks` ha
      gia applicato la revoca per identita e la regola dell'indirizzo
      verificato — oppure e un tutore dichiarato di una scheda che e anche la
      propria.
    */
    return true;
  });
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
  /*
    Vale la stessa regola del cruscotto: il ramo «sono io» va chiesto, e lo
    chiede solo chi costruisce l'area atleta. Le rotte della famiglia no.
  */
  opzioni: ParentAccessOptions = {},
) => {
  const linkedAthletes = await getParentLinkedAthletes(userId, opzioni);
  return linkedAthletes.some((athlete) => sameId(athlete.id, athleteId));
};

export const getParentDashboardData = async (
  userId: string,
  requestedAthleteOrClubId: string,
  /*
    Il ramo «sono io» lo chiede **solo** l'area atleta, che da qui costruisce
    la propria proiezione ristretta. Le rotte della famiglia non lo passano, e
    per loro un ragazzo non e tutore di se stesso.
  */
  opzioni: ParentAccessOptions = {},
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
  const linkedAthletes = await getParentLinkedAthletes(userId, opzioni);
  const requestedId = String(requestedAthleteOrClubId || "").trim();
  /*
    **PP-02 §A. Un identificativo che non si riconosce e una richiesta
    sbagliata, non una richiesta a cui rispondere con il primo figlio.**

    Il ramo di ripiego — «se non e uno UUID, prendi `linkedAthletes[0]`» —
    non usciva dal perimetro della famiglia, e per questo era sopravvissuto a
    due revisioni. Ma dentro il perimetro faceva la cosa peggiore che questa
    schermata possa fare: **rispondere del figlio sbagliato senza dirlo**. Un
    segnalibro storto, un indirizzo troncato da un messaggio, un `[id]` che il
    router non ha ancora risolto, e una madre di due figli leggeva importi,
    scadenze e stato del certificato **dell'altro**, con il nome giusto scritto
    accanto solo perche il guscio lo prende dallo stesso payload.

    Adesso non si indovina: chi chiede un atleta che non e nessuno dei propri
    riceve `null`, e il guscio lo porta alla schermata di scelta — che e il
    posto in cui la domanda «di quale figlio parliamo» si fa.

    Resta la forma storica `/parent-view/<idClub>`, che e una risposta a una
    domanda **posta davvero**: quel club e uno dei suoi, e il figlio che ci
    frequenta e uno solo o il primo per ordine di elenco.
  */
  const selectedAthlete =
    linkedAthletes.find((athlete) => sameId(athlete.id, requestedId)) ||
    linkedAthletes.find((athlete) =>
      sameId(athlete.organization_id, requestedId),
    ) ||
    null;

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
    /*
      **Una notifica senza destinatario non e «di tutti»: e di nessuno.**

      Il ramo `{ user_id: null }` era scritto pensando agli avvisi del club, e
      nessuno li scrive cosi: `club-notifications.ts` costruisce una riga
      **per destinatario**, e le altre due strade scrivono
      `user_id: recipient.userId`. Una riga con `user_id` nullo nasce quindi
      da un solo caso — un destinatario **senza account**, raggiungibile per
      email — e non e un annuncio: e il sollecito di **quella** famiglia.

      Misurato: «Rata scaduta: Luca Bianchi — la famiglia Bianchi (via Roma 3,
      tel 333…) non ha pagato 130,00 EUR», nella bacheca di ogni genitore del
      club. E non si poteva nemmeno spegnere, perche segnare letto filtra per
      `user_id`: la pastiglia restava accesa per sempre su una notizia di
      un'altra famiglia. Il filtro per figlio non la vedeva, perche guarda
      `data.athleteId` e il contenuto sta nel titolo.

      Chi non ha un account non ha una bacheca: la sua strada e l'email, e i
      due produttori adesso non scrivono piu una riga che nessuno puo leggere
      ne chiudere.
    */
    prisma.notification.findMany({
      where: { organization_id: organizationId, user_id: userId },
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
  const notificheDelFiglio = notifications.filter((notification) =>
    notificationBelongsToAthlete(notification, selectedAthlete.id),
  );

  const club = selectedAthlete.organization;

  /*
    **I tutori si leggono dalla tabella, non dal blob** (PP-02 / WP-C).

    E la stessa lettura che decide l'accesso, quindi cio che la famiglia vede
    elencato e cio che il prodotto considera vero. Prima erano due strade — una
    proiezione del blob per lo schermo e un predicato sul blob per la porta — e
    tenerle d'accordo era un lavoro che nessuno faceva.
  */
  const tutoriDellaScheda = await readGuardiansForAthlete(
    prisma,
    selectedAthlete.id,
  );

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
    .map((match) => {
      const summary = summarizeEvent(match, categoryOptions, "match");
      return {
        ...summary,
        participationStatus: resolveMatchParticipationStatus(
          match,
          selectedAthlete,
          attendanceByTrainingId.get(String(summary.id || "")) ?? null,
        ),
      };
    })
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
    {
      now: new Date(now),
      /* Vedi ADR-0122: il legame con cui si e entrati viaggia con la richiesta. */
      allowSelfAthleteLink: opzioni.allowSelfAthleteLink === true,
    },
  );
  /*
    **Un elenco chiuso, come le ricevute e gli slot.**

    Era uno spread della riga Prisma, e portava fuori `notes` — la nota che la
    segreteria scrive per se — piu `data`, che e JSON libero, e `file_url`. Il
    contenuto clinico ha un proprietario (`src/lib/health/permissions.ts`) e
    non e questo. Ma il difetto vero non e cosa usciva ieri: e che **un campo
    nuovo su `medical_certificates` nascerebbe visibile alla famiglia**, e
    nessuno se ne accorgerebbe. La stessa regola che questo file dichiara
    trenta righe piu sotto per le ricevute, qui non valeva.
  */
  const certificates = medicalCertificates.map((certificate) => ({
    id: certificate.id,
    athlete_id: certificate.athlete_id,
    type: certificate.type,
    status: certificate.status,
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
  /*
    PP-02 §F. La stessa domanda, con un dato in piu: **quanti certificati ci
    sono**. Senza, «nessuna data» e «nessun certificato» sono indistinguibili,
    e la famiglia legge «Certificato mancante» dopo averlo consegnato.
  */
  const statoFamigliaCertificato = getMedicalCertificateFamilyState(
    { count: certificates.length, expiryDate: scadenzaCertificato },
    new Date(now),
  );
  const descrizioneCertificato = describeMedicalCertificateForFamily(
    statoFamigliaCertificato,
    scadenzaCertificato,
  );
  const athleteData = asRecord(selectedAthlete.data);
  /*
    **Il periodo della stagione, che e il ripiego del pro-rata.**

    Il dato era gia in questo file — `normalizeActiveClubSeason` legge le
    stagioni poche righe piu sotto — ma ne uscivano solo id ed etichetta, non
    le date, e il ponte verso il riepilogo non aveva nemmeno il parametro. Cosi
    l'area famiglia mostrava il totale **non ripartito** mentre il club vedeva
    quello ripartito: due numeri per lo stesso atleta, e quello sbagliato era
    quello che vede chi deve pagare.
  */
  const stagioneAttiva = normalizeClubSeasons(
    typeof club?.settings === "object" && club.settings ? club.settings : {},
  ).activeSeason;

  const periodoStagione =
    stagioneAttiva?.startDate && stagioneAttiva?.endDate
      ? {
          startDate: stagioneAttiva.startDate,
          endDate: stagioneAttiva.endDate,
        }
      : null;

  const enrollmentSummary = getAthleteEnrollmentSummary({
    athlete: selectedAthlete,
    athleteId: selectedAthlete.id,
    paymentPlans: asArray(club.payment_plans),
    discounts: asArray(club.discounts),
    payments: asArray(athleteData.payments),
    athletePayments: payments,
    expectedIncomeEntries: asArray(club.expected_income),
    seasonPeriod: periodoStagione,
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

  /*
    **PP-02 §D. Il motivo per cui non si puo pagare, conosciuto prima del
    clic.**

    Il pulsante «Paga ora» era vero — chiama il checkout, che emette un link e
    lo apre — ma la ragione per cui a volte non funziona si conosceva **dopo**
    il gesto: se la societa non ha configurato gli incassi online il pulsante
    restava acceso e il motivo arrivava come errore rosso; se non c'erano rate
    aperte si spegneva, con il motivo nascosto in un `title` del browser, che
    su un telefono non esiste.

    Lo stato del canale lo sa gia il server, e lo sa lo **stesso** dominio che
    poi rifiuterebbe il checkout: chiederglielo qui non e un secondo sistema di
    pagamento, e leggere una risposta che c'era e non usciva.

    Un guasto nel leggerlo **non** deve spegnere il pulsante: chi puo pagare
    continua a poterlo fare, e il caso peggiore torna a essere quello di prima
    — l'errore dopo il clic — invece di diventare «non si paga piu».
  */
  const statoPagamentoOnline = await resolveCheckoutReadiness({
    organizationId,
    clubEnabled: normalizePaymentSettings(
      asRecord(club.settings).paymentSettings,
    ).enabled,
  })
    .then(({ readiness }) => resolveFamilyCheckoutChannel(readiness))
    .catch((error) => {
      reportServerError(error, {
        route: "parent-dashboard/checkout-readiness",
        organizationId,
        actorUserId: userId,
      });
      return { available: true, blocker: null, message: "" } as const;
    });

  const configurazioneAppuntamenti = normalizeAppointmentsConfig(
    asRecord(club.settings).appointments,
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
      ...serializeAthleteCard(selectedAthlete, categoryOptions),
      user_id: selectedAthlete.user_id,
      /*
        **Si dichiara cio che esce, non cio che non deve uscire.**

        Due stesure. La prima mandava `data` **grezza** accanto ai tutori gia
        sanificati: una madre riceveva nel proprio browser il codice d'accesso
        vivo del padre, e quello di ogni altro tutore. La seconda ha tolto le
        credenziali — sei nomi di campo, cercati ovunque — e ha lasciato tutto
        il resto.

        `athletes.data` e pero il blob **libero** che la segreteria riempie, e
        una revisione ha misurato cosa ci trova dentro chi apre il cruscotto:
        una nota «famiglia morosa», una «relazione-servizi-sociali», il codice
        fiscale e il telefono dell'altro tutore, una nota che dice che quel
        tutore «non puo prendere il bambino il martedi», e — nuovo di questa
        serie — `revokedGuardianIdentities`, cioe il cruscotto che dichiara
        alla nuova compagna che il club ha revocato l'ex. Il contesto del
        cruscotto conserva tutto anche in `sessionStorage`.

        Un elenco di cio che si toglie non regge su un contenitore aperto: ogni
        campo nuovo nasce **visibile**, e nessuno se ne accorge. Qui esce percio
        cio che le schermate della famiglia leggono davvero, e nient'altro —
        l'indirizzo e le visite mediche del **proprio** figlio. Il resto della
        scheda continua ad arrivare da `serializeAthleteCard`, che e una
        proiezione dichiarata, e il dato clinico da `data.health`, che ha il
        suo permesso.
      */
      data: (() => {
        const grezza = asRecord(stripGuardianAccessTokens(selectedAthlete.data));
        const visibili: Record<string, unknown> = {};

        for (const chiave of ["address", "medicalVisits"]) {
          if (chiave in grezza) visibili[chiave] = grezza[chiave];
        }

        return visibili;
      })(),
      /*
        **Cio che la famiglia vede di un tutore e chi e e dove si trova.**

        `getGuardianRows` e la proiezione che **decide** l'accesso, e porta per
        questo i campi con cui si decide: le grafie dell'identificativo, il
        segno di solo-recapito, il marchio della revoca. Nessuna schermata li
        disegna — la scheda mostra nome, rapporto, email e telefono — e uscivano
        lo stesso, dicendo a chi legge che il club ha revocato l'altro tutore.

        La proiezione che decide e quella che si pubblica sono due cose diverse,
        ed e la terza volta che questo file lo impara.
      */
      guardians: tutoriDellaScheda.map((guardian) => ({
        /*
          L'identificativo della **riga**, non piu quello sintetico costruito
          sulla posizione. Quello cambiava persona quando si cancellava una
          riga, ed e il difetto che ha fatto revocare il padre premendo
          «Scollega account» sulla nonna.
        */
        id: guardian.id,
        name: guardian.first_name,
        surname: guardian.last_name,
        relationship: guardian.relationship,
        email: guardian.email,
        phone: guardian.phone,
      })),
      /*
        **La quarta proiezione aperta, nello stesso file appena bonificato.**

        `serializeAthleteCard` e nata per l'atleta **selezionato** e porta una
        ventina di campi: codice fiscale, luogo di nascita, indirizzo, telefono,
        email, genere, nazionalita. Usarla anche per i fratelli voleva dire
        spedirli tutti, per ogni figlio, a ogni caricamento di tutte e tredici
        le pagine — quando cio che serve qui e un elenco per scegliere.

        Non sono dati di un'altra famiglia: sono i figli di chi legge. Ma e la
        stessa proprieta che questo file difende per nome tre volte poche righe
        piu su, e valeva anche qui.
      */
      linkedAthletes: linkedAthletes.map((figlio: any) => ({
        id: figlio.id,
        organization_id: figlio.organization_id,
        name: getAthleteDisplayName(figlio),
        birth_date: toIso(figlio.birth_date),
        category_name: figlio.category_name || null,
      })),
    },
    health: {
      certificates,
      /** `valid` | `expiring` | `expired` | `missing` (W6-16). */
      status: disponibilitaCertificato,
      statusLabel: getMedicalCertificateAvailabilityLabel(
        disponibilitaCertificato,
      ),
      /*
        **PP-02 §F. Lo stato che la famiglia legge, e la riga che ne esce.**

        `status` resta com'era — lo leggono il tono del riquadro e la CTA — e
        accanto compare la distinzione che gli manca: un certificato
        **consegnato senza scadenza** non e un certificato mancante, e finiva
        su «Certificato mancante» perche la data e l'unica cosa che il vecchio
        stato guardava.

        La riga (`Valido — Scade il 01/06/2027`) la compone il dominio e non la
        schermata: era gia stata riscritta tre volte, e la terza non conosceva
        «in scadenza».
      */
      familyState: statoFamigliaCertificato,
      familyLabel: descrizioneCertificato.label,
      familyDetail: descrizioneCertificato.detail,
      familySummary: descrizioneCertificato.summary,
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
      /**
       * PP-02 §D. Il canale di incasso online: se c'e, e se non c'e perche.
       * Sta accanto alle rate e non dentro ognuna: e una proprieta del club,
       * e ricalcolarla per riga vorrebbe dire chiederla venti volte.
       */
      online: statoPagamentoOnline,
      /*
        **PP-02 §E. Una ricevuta e un elenco chiuso di campi, non la riga.**

        `{ ...receipt }` mandava al browser di ogni famiglia l'intera riga del
        documento: `issued_by` e `cancelled_by` — gli identificativi delle
        persone di segreteria che lo hanno emesso o annullato —,
        `operation_type_code` e `snapshot`, cioe la classificazione contabile
        congelata, `transaction_id` e `invoice_id`, che sono le chiavi con cui
        il club riconcilia la propria cassa, e `data`, un JSON libero in cui
        nessuno ha promesso di non scrivere niente.

        Nessuno di quei campi veniva **disegnato**: uscivano nella risposta, che
        e la stessa cosa. La regola e quella della lane 5I e della schermata di
        scelta del figlio: si dichiara cio che esce, cosi un campo nuovo sulla
        riga nasce invisibile alla famiglia.
      */
      receipts: receipts.map((receipt) =>
        serializeFamilyFiscalDocument("receipt", receipt, selectedAthlete),
      ),
      invoices: invoices.map((invoice) =>
        serializeFamilyFiscalDocument("invoice", invoice, selectedAthlete),
      ),
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
      /*
        **Elenco chiuso**, e cio che ne resta fuori sono i due identificativi:
        `convocated_by` e `rsvp_by_user_id` sono persone del **club**, e la
        famiglia deve sapere se il figlio c'era e cosa ha risposto, non chi lo
        ha scritto a registro.

        `notes` invece **resta**, e non per inerzia: e la nota sull'appello di
        quel ragazzo, e l'area atleta la dichiara fra i quattro campi che
        mostra a lui di se stesso (`CAMPI_AREA_ATLETA.presenza`), leggendola
        proprio da qui. Toglierla avrebbe spento quella schermata di
        rimbalzo — una decisione di prodotto presa altrove, che non si
        capovolge in una lane di correzioni.
      */
      items: attendance.map((item) => ({
        id: item.id,
        event_id: item.event_id,
        athlete_id: item.athlete_id,
        status: item.status,
        notes: item.notes ?? "",
        rsvp_status: item.rsvp_status ?? null,
        rsvp_note: item.rsvp_note ?? "",
        rsvp_at: toIso(item.rsvp_at),
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
      /*
        PP-02 §K. **Cosa questo club accetta**, e se accetta. La famiglia deve
        poterlo sapere prima di compilare: un modulo che chiede un motivo
        libero a un club che ha configurato quattro tipi produce una richiesta
        che qualcuno dovra tradurre a mano, e un modulo aperto su un club che
        ha chiuso le prenotazioni produce un rifiuto dopo il gesto.
      */
      config: {
        /*
          **Non e l'interruttore: e se la richiesta puo davvero partire.**
          Un club con dei motivi tutti «solo dal desk» tiene l'interruttore
          acceso e non riceve nulla, e la schermata deve poterlo dire.
        */
        familyBookingEnabled: familyCanRequestAppointment(
          configurazioneAppuntamenti,
        ),
        types: bookableAppointmentTypes(configurazioneAppuntamenti).map(
          (tipo) => ({ id: tipo.id, name: tipo.name }),
        ),
      },
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
    /*
      Elenco chiuso. Lo spread faceva uscire `data` per intero, e fra queste
      righe ci sono anche le notifiche **di club** (`user_id: null`), che il
      filtro lascia passare quando non nominano un atleta: cio che il club si
      scrive dentro `data` non e detto sia scritto per una famiglia.
    */
    notifications: notificheDelFiglio.slice(0, 20).map((notification) => ({
      id: notification.id,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      read: Boolean(notification.read),
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
 *
 * ---
 *
 * **PP-02 §A e §B.** Due campi in piu, e nessuno dei due e un dato nuovo:
 *
 * * `birthYear` — l'anno, non la data. Due fratelli nella stessa categoria si
 *   distinguono per l'eta, e su una schermata di **scelta** la data intera e
 *   una precisione che non aiuta a scegliere;
 * * `categories` — **tutte** le appartenenze con la loro sede, e non la sola
 *   `category_name` piatta. Un ragazzo in due squadre si riconosceva a meta,
 *   e su due sedi diverse non si riconosceva affatto.
 *
 * `status` esce perche un figlio **non piu attivo** deve poter essere
 * distinto prima di entrare, non dopo: la sua area si apre lo stesso — la
 * storia e sua — ma senza dirlo la schermata prometterebbe un'iscrizione
 * viva.
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
    categories: serializeAthleteCategories(athlete),
    birthYear: athlete.birth_date
      ? new Date(athlete.birth_date).getUTCFullYear()
      : null,
    /*
      **Canonico, non grezzo.** La colonna contiene davvero altre grafie —
      `disattivato`, `sospeso`, `on_loan`, `in prestito` — perche la guardia
      in scrittura canonicalizza da oggi in avanti e non riscrive le righe
      storiche. Chi legge qui si indicizza un vocabolario chiuso: con una
      grafia storica il figlio non riceveva **nessuna** pastiglia sul
      selettore, cioe la schermata tornava a promettere un'iscrizione viva —
      la cosa che §B ha scritto per impedire. Il lato club normalizza in
      lettura da sempre; adesso lo fa anche questa strada.
    */
    status: normalizeAthleteStatus(athlete.status),
    avatarUrl: athlete.avatar_url || null,
  }));
};
