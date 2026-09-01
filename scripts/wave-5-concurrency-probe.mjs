/**
 * **Le prove di concorrenza della Wave 5** — lo scenario U-17 del §22 di
 * `docs/knowledge-base/39-wave-5-planning.md`, eseguito contro Postgres.
 *
 *     node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *       scripts/wave-5-concurrency-probe.mjs
 *
 * ---
 *
 * ## Perche una sonda e non dei test
 *
 * I test del repository girano su `tests/helpers/fake-prisma.mjs`, che e
 * sequenziale per costruzione: non puo dimostrare che due richieste simultanee
 * non producano due righe, perche nel doppio non esistono due richieste
 * simultanee. Il doppio lo dichiara lui stesso a proposito di
 * `appointments_slot_vivo_unico`: le colonne di quell'indice comprendono
 * `starts_at`, il doppio confronta i campi con `===`, e su due `Date` distinte
 * con lo stesso istante risponde sempre «diverse». Un indice unico parziale si
 * prova **solo** contro il database vero.
 *
 * ## E il controllo e sulle righe, non sulle risposte
 *
 * Un servizio che risponde «conflitto» alla seconda chiamata e rassicurante e
 * non prova niente: cio che conta e quante righe ci sono dopo. Ogni prova qui
 * conta righe — appuntamenti, partecipazioni, compilazioni, certificati
 * promossi, eventi — e mai il valore di ritorno.
 *
 * ## Le cinque prove, come le chiede U-17
 *
 * 1. **doppio clic** su conferma appuntamento, accettazione di un deposito
 *    documentale, salvataggio convocazioni, risposta RSVP e invio della
 *    domanda di iscrizione: due chiamate identiche in parallelo, **un solo
 *    effetto** atteso;
 * 2. **due operatori insieme** sullo stesso evento con la stessa versione
 *    attesa: uno vince, l'altro riceve un conflitto esplicito, e la versione
 *    della riga avanza **una volta sola**;
 * 3. **due famiglie insieme** sullo stesso slot: una ottiene l'appuntamento,
 *    l'altra un rifiuto che nasce dal **vincolo del database**;
 * 4. **due allenatori insieme** sull'appello dello stesso allenamento: nessuna
 *    riga duplicata, la chiave unica `(organization_id, event_id, athlete_id)`
 *    regge;
 * 5. **il caso che prima perdeva dati**: due segretarie creano due allenamenti
 *    diversi nello stesso momento. Prima della Wave 5 ne sopravviveva uno,
 *    perche ogni salvataggio riscriveva l'intero array `clubs.trainings`.
 *
 * ## Cosa questa sonda NON fa
 *
 * **Non corregge.** Dove trova un difetto lo dichiara `FAIL` con la nota di
 * cio che ha osservato, e non tocca una riga del codice di produzione: una
 * misura che aggiusta cio che misura smette di essere una misura.
 *
 * Club dedicato con identificativi casuali, e se ne va alla fine — anche
 * l'audit e le notifiche, che non hanno una chiave esterna verso il club e
 * sopravviverebbero alla sua cancellazione. Non si tronca niente e non si
 * cancella niente che non sia nato qui: sullo stesso database di sviluppo puo
 * girare in parallelo un'altra sonda.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error(
    "Rifiuto: EASYGAME_DB_ENV vale " +
      JSON.stringify(process.env.EASYGAME_DB_ENV || null) +
      ', e questa sonda scrive. Serve "development".',
  );
  process.exit(1);
}

const NL = String.fromCharCode(10);
const prisma = new PrismaClient();

/* Tutto casuale: un'altra sonda puo lavorare sullo stesso archivio. */
const CLUB = randomUUID();
const OPERATORE = randomUUID();
const FAMIGLIA_A = randomUUID();
const FAMIGLIA_B = randomUUID();
const ATLETA_A = randomUUID();
const ATLETA_B = randomUUID();
const ALLENAMENTO = `sonda-allenamento-${randomUUID()}`;
const GARA = `sonda-gara-${randomUUID()}`;
const MODULO = randomUUID();
const VERSIONE_MODULO = randomUUID();
const SLUG = `sonda-concorrenza-${randomUUID().slice(0, 8)}-${randomUUID().replace(/-/g, "").slice(0, 12)}`;

const UTENTI = [OPERATORE, FAMIGLIA_A, FAMIGLIA_B];

/* Il giorno di lavoro della sonda: futuro, cosi nessun filtro «gia passato» interferisce. */
const GIORNO_EVENTI = "2026-10-05";
const GIORNO_GARA = "2026-10-06";
const GIORNO_APPUNTAMENTO = "2026-10-07";
const GIORNO_SLOT = "2026-10-08";
const ORA_SLOT = "10:00";

let appuntamentoDaConfermare = null;
let deposito = null;

/* i moduli, importati dinamicamente dopo la guardia sull'ambiente */
let appointments;
let documentRequests;
let events;
let rsvp;
let formSubmissions;
let audit;

/* ------------------------------------------------------------ il verdetto */

const esiti = [];

const prova = (titolo, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ titolo, ok, atteso, trovato, nota });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(58)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (nota) console.log(`        ${nota}`);
};

/**
 * Esegue due operazioni **davvero** insieme.
 *
 * `Promise.allSettled` e non `Promise.all`: meta di queste prove si aspetta che
 * una delle due chiamate fallisca, e con `all` il rifiuto della perdente
 * fermerebbe la misura prima di poter contare le righe — che e l'unica cosa
 * che interessa.
 */
const insieme = async (...operazioni) => {
  const risultati = await Promise.allSettled(operazioni.map((fn) => fn()));
  return {
    riuscite: risultati.filter((r) => r.status === "fulfilled").length,
    fallite: risultati.filter((r) => r.status === "rejected").length,
    motivi: risultati
      .filter((r) => r.status === "rejected")
      .map((r) => String(r.reason?.message || r.reason).split(NL)[0]),
    valori: risultati
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value),
  };
};

/** Lo scope della segreteria: e il ruolo che ha tutti i permessi del §12. */
const scopeClub = () => ({
  userId: OPERATORE,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

const contaPartecipanti = async (eventId) =>
  prisma.clubEventParticipant.count({
    where: { organization_id: CLUB, event_id: eventId },
  });

const contaAudit = async (action) =>
  prisma.auditLog.count({ where: { organization_id: CLUB, action } });

/* ---------------------------------------------------------------- semina */

const semina = async () => {
  await prisma.user.createMany({
    data: UTENTI.map((id, indice) => ({
      id,
      email: `sonda-w5-conc-${id}@example.invalid`,
      /*
        Non e una password: e un segnaposto che nessun confronto bcrypt puo
        mai far coincidere, su un account che vive il tempo di questa sonda.
      */
      password_hash: `non-utilizzabile-${randomUUID()}`,
      first_name: ["Segreteria", "Famiglia A", "Famiglia B"][indice],
      last_name: "Sonda",
      email_verified_at: new Date(),
    })),
  });

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `sonda-concorrenza-w5-${Date.now()}`,
      name: "ASD Sonda Concorrenza Wave 5",
      creator_id: OPERATORE,
      trainings: [],
      matches: [],
      appointments: [],
    },
  });

  /*
    Il legame famiglia-atleta passa da `athletes.user_id`, che e la prima
    condizione che `athleteBelongsToParent` verifica: bastano due righe, e non
    serve nessuna appartenenza al club — che e esattamente il caso reale di un
    tutore collegato solo al proprio figlio.
  */
  await prisma.athlete.createMany({
    data: [
      {
        id: ATLETA_A,
        organization_id: CLUB,
        user_id: FAMIGLIA_A,
        first_name: "Anna",
        last_name: "Sonda",
        updated_at: new Date(),
      },
      {
        id: ATLETA_B,
        organization_id: CLUB,
        user_id: FAMIGLIA_B,
        first_name: "Bruno",
        last_name: "Sonda",
        updated_at: new Date(),
      },
    ],
  });

  /*
    L'allenamento nasce con `rsvpRequired`: senza, `canAnswerRsvp` rifiuta la
    risposta con `not_required` e la prova del doppio clic sull'RSVP
    misurerebbe il rifiuto invece della concorrenza.
  */
  await events.createClubEvent(
    scopeClub(),
    "training",
    {
      id: ALLENAMENTO,
      title: "Allenamento della sonda",
      date: GIORNO_EVENTI,
      time: "18:00",
      endTime: "19:30",
      rsvpRequired: true,
    },
    { userId: OPERATORE },
  );

  await events.createClubEvent(
    scopeClub(),
    "match",
    {
      id: GARA,
      title: "Gara della sonda",
      date: GIORNO_GARA,
      time: "16:00",
      opponent: "ASD Avversaria",
    },
    { userId: OPERATORE },
  );

  /* La richiesta documentale, e il deposito su cui si decidera due volte. */
  const richiesta = await documentRequests.createDocumentRequest(scopeClub(), {
    subjectKind: "athlete",
    subjectId: ATLETA_A,
    documentKind: "medical_certificate",
    title: "Certificato medico della sonda",
    dueDate: "2026-12-31",
  });

  await documentRequests.submitDocument(scopeClub(), {
    requestId: richiesta.id,
    file: {
      fileName: "certificato-sonda.pdf",
      mimeType: "application/pdf",
      content: Buffer.from("%PDF-1.4 sonda concorrenza wave 5"),
      validUntil: "2027-06-30",
    },
  });

  deposito = await prisma.documentSubmission.findFirst({
    where: { organization_id: CLUB, subject_id: ATLETA_A },
  });
  if (!deposito) throw new Error("Il deposito documentale non e stato creato");

  /*
    Lo slot con un **operatore assegnato**, e non e un dettaglio: l'indice
    unico parziale copre `(organization_id, assigned_to_user_id, starts_at)`, e
    in Postgres due `NULL` non collidono. Uno slot di segreteria senza titolare
    non farebbe scattare il vincolo, e la prova numero 3 direbbe «passa»
    misurando un vincolo che non e mai intervenuto.
  */
  await appointments.createAppointmentSlot(
    scopeClub(),
    {
      assignedToUserId: OPERATORE,
      weekday: new Date(`${GIORNO_SLOT}T00:00:00.000Z`).getUTCDay(),
      startTime: ORA_SLOT,
      endTime: "11:00",
      durationMinutes: 30,
      capacity: 1,
    },
    { userId: OPERATORE },
  );

  /*
    L'appuntamento da confermare nasce fuori dagli slot pubblicati: la prova
    del doppio clic riguarda la **conferma**, e farla dipendere dalla
    disponibilita mescolerebbe due prove diverse nella stessa riga.
  */
  appuntamentoDaConfermare = await appointments.createAppointment(
    scopeClub(),
    {
      athleteId: ATLETA_A,
      date: GIORNO_APPUNTAMENTO,
      time: "09:00",
      reason: "Colloquio della sonda",
      outsideAvailability: true,
    },
    { userId: OPERATORE },
  );

  /* Il modulo pubblicato: e la porta da cui entra la domanda di iscrizione. */
  await prisma.formTemplate.create({
    data: {
      id: MODULO,
      organization_id: CLUB,
      title: "Iscrizione della sonda",
      status: "published",
      public_slug: SLUG,
      public_enabled: true,
      published_version: 1,
      published_at: new Date(),
      draft: { title: "Iscrizione della sonda", fields: [], settings: {} },
      created_by: OPERATORE,
    },
  });

  await prisma.formTemplateVersion.create({
    data: {
      id: VERSIONE_MODULO,
      organization_id: CLUB,
      template_id: MODULO,
      version: 1,
      schema_json: {
        title: "Iscrizione della sonda",
        description: "",
        fields: [
          {
            id: "nome",
            type: "short_text",
            label: "Nome dell'atleta",
            required: false,
          },
        ],
        /*
          Niente email obbligatoria e niente notifica: la sonda misura le
          righe della compilazione, e un giro di posta verso le bacheche del
          club sarebbe rumore su un archivio condiviso con un'altra sonda.
        */
        settings: {
          collectRespondentEmail: false,
          notifyOnSubmit: false,
          successMessage: "Ricevuta",
        },
      },
      published_by: OPERATORE,
    },
  });
};

/* ============================================ 1. il doppio clic ========== */

/**
 * Cinque gesti, cinque doppi clic.
 *
 * Il doppio clic non e un caso di laboratorio: e cio che fa una segretaria
 * quando la rete e lenta e il pulsante non risponde. U-17 chiede due richieste
 * HTTP e **un solo effetto**, e «effetto» qui vuol dire riga: due notifiche
 * alla stessa famiglia per la stessa conferma sono due effetti, non uno.
 */
const provaDoppioClic = async () => {
  console.log(`${NL}1. Doppio clic: due chiamate identiche, un solo effetto${NL}`);

  /* -------------------------------------- 1a. conferma di un appuntamento */
  {
    const conferma = () => () =>
      appointments.confirmAppointment(
        scopeClub(),
        appuntamentoDaConfermare.id,
        { note: "Confermato dalla sonda" },
        { userId: OPERATORE },
      );

    const esito = await insieme(conferma(), conferma());

    const riga = await prisma.appointment.findUnique({
      where: { id: appuntamentoDaConfermare.id },
    });
    const notifiche = await prisma.notification.count({
      where: { organization_id: CLUB, type: "appointment_update" },
    });
    const tracce = await contaAudit(audit.AUDIT_ACTIONS.appointmentConfirmed);

    prova(
      "1a. conferma appuntamento cliccata due volte",
      { stato: "confirmed", versione: 2, notifiche: 1, audit: 1 },
      {
        stato: riga.status,
        versione: riga.version,
        notifiche,
        audit: tracce,
      },
      `${esito.riuscite}/2 chiamate riuscite; il rifiuto dice: ${esito.motivi[0] || "nessuno"}`,
    );
  }

  /* ------------------------- 1b. accettazione di un deposito documentale */
  {
    const accetta = () => () =>
      documentRequests.decideDocumentSubmission(scopeClub(), deposito.id, {
        decision: "approved",
      });

    const esito = await insieme(accetta(), accetta());

    const depositi = await prisma.documentSubmission.count({
      where: { organization_id: CLUB, request_id: deposito.request_id },
    });
    /*
      Il certificato promosso e la riga che conta davvero: due certificati per
      lo stesso file vogliono dire due scadenze per lo stesso documento e due
      promemoria notturni alla stessa famiglia.
    */
    const certificati = await prisma.medicalCertificate.count({
      where: { organization_id: CLUB, athlete_id: ATLETA_A },
    });
    const tracce = await contaAudit(
      audit.AUDIT_ACTIONS.documentSubmissionDecided,
    );
    const notifiche = await prisma.notification.count({
      where: { organization_id: CLUB, type: "document_approved" },
    });

    prova(
      "1b. accettazione documento cliccata due volte",
      { depositi: 1, certificati: 1, audit: 1, notifiche: 1 },
      { depositi, certificati, audit: tracce, notifiche },
      `${esito.riuscite}/2 chiamate riuscite; il rifiuto dice: ${esito.motivi[0] || "nessuno"}`,
    );
  }

  /* --------------------------------------- 1c. salvataggio convocazioni */
  {
    const gara = await events.findClubEvent(CLUB, GARA);
    const elenco = [
      { athleteId: ATLETA_A, status: "convocated" },
      { athleteId: ATLETA_B, status: "convocated" },
    ];

    const salva = () => () =>
      events.saveEventConvocations(scopeClub(), GARA, elenco, {
        userId: OPERATORE,
      });

    const esito = await insieme(salva(), salva());

    const partecipanti = await contaPartecipanti(gara.id);
    const convocati = await prisma.clubEventParticipant.count({
      where: {
        organization_id: CLUB,
        event_id: gara.id,
        convocation_status: "convocated",
      },
    });

    prova(
      "1c. convocazioni salvate due volte",
      { partecipanti: 2, convocati: 2 },
      { partecipanti, convocati },
      `${esito.riuscite}/2 chiamate riuscite; il rifiuto dice: ${esito.motivi[0] || "nessuno"}`,
    );
  }

  /* ------------------------------------------ 1d. risposta RSVP famiglia */
  {
    const allenamento = await events.findClubEvent(CLUB, ALLENAMENTO);

    const rispondi = () => () =>
      rsvp.answerRsvp({
        organizationId: CLUB,
        trainingId: ALLENAMENTO,
        athleteId: ATLETA_A,
        status: "yes",
        userId: FAMIGLIA_A,
      });

    const esito = await insieme(rispondi(), rispondi());

    const righe = await prisma.clubEventParticipant.count({
      where: {
        organization_id: CLUB,
        event_id: allenamento.id,
        athlete_id: ATLETA_A,
      },
    });
    const risposte = await prisma.clubEventParticipant.count({
      where: {
        organization_id: CLUB,
        event_id: allenamento.id,
        rsvp_status: "yes",
      },
    });

    prova(
      "1d. risposta RSVP inviata due volte",
      { righe: 1, risposte: 1 },
      { righe, risposte },
      `${esito.riuscite}/2 chiamate riuscite; il rifiuto dice: ${esito.motivi[0] || "nessuno"}`,
    );
  }

  /* --------------------------------- 1e. invio della domanda d'iscrizione */
  {
    const invia = () => () =>
      formSubmissions.submitPublicForm(SLUG, {
        answers: { nome: "Anna Sonda" },
        files: [],
        respondentName: "Famiglia Sonda",
        respondentEmail: "",
      });

    const esito = await insieme(invia(), invia());

    const domande = await prisma.formSubmission.count({
      where: { organization_id: CLUB, template_id: MODULO },
    });

    prova(
      "1e. domanda di iscrizione inviata due volte",
      { domande: 1 },
      { domande },
      `${esito.riuscite}/2 chiamate riuscite; il rifiuto dice: ${esito.motivi[0] || "nessuno"}`,
    );
  }
};

/* ==================================== 2. due operatori sullo stesso evento */

/**
 * Due segretarie salvano lo stesso evento con la **stessa versione attesa**.
 *
 * Prima della Wave 5 l'operazione era «leggi l'array intero, modificalo,
 * riscrivilo»: vinceva l'ultima, in silenzio, e la prima modifica spariva
 * senza un errore e senza una traccia. La riga con `version` cambia la
 * domanda: la seconda scrittura deve **fallire dicendolo**, e la versione deve
 * avanzare una volta sola — se avanzasse due volte vorrebbe dire che sono
 * passate entrambe.
 */
const provaConflittoOttimistico = async () => {
  console.log(`${NL}2. Due operatori insieme sullo stesso evento${NL}`);

  const prima = await events.findClubEvent(CLUB, GARA);
  const attesa = prima.version;

  const modifica = (titolo) => () =>
    events.updateClubEvent(
      scopeClub(),
      GARA,
      { title: titolo },
      { userId: OPERATORE },
      { expectedVersion: attesa },
    );

  const esito = await insieme(
    modifica("Gara vista dalla segreteria 1"),
    modifica("Gara vista dalla segreteria 2"),
  );

  const dopo = await prisma.clubEvent.findUnique({ where: { id: prima.id } });
  const conflittoDichiarato = esito.motivi.some((motivo) =>
    /modificat[oa] da qualcun altro/i.test(motivo),
  );

  prova(
    "2. modifica concorrente: una vince, l'altra sa perche",
    { riuscite: 1, fallite: 1, versione: attesa + 1, conflittoDichiarato: true },
    {
      riuscite: esito.riuscite,
      fallite: esito.fallite,
      versione: dopo.version,
      conflittoDichiarato,
    },
    `titolo rimasto: «${dopo.title}»; il rifiuto dice: ${esito.motivi[0] || "nessuno"}`,
  );
};

/* ================================ 3. due famiglie sullo stesso slot ====== */

/**
 * Due famiglie chiedono lo stesso slot **nello stesso momento**.
 *
 * Il presidio non e nel codice ed e importante che non lo sia: entrambe le
 * chiamate calcolano la disponibilita e la trovano libera, perche nessuna
 * delle due ha ancora scritto. Il controllo in memoria arriverebbe sempre
 * troppo presto. A chiudere la corsa e l'indice unico parziale
 * `appointments_slot_vivo_unico` su `(organization_id, assigned_to_user_id,
 * starts_at)` per gli stati vivi.
 *
 * La nota dice **da dove** viene il rifiuto: `creaRiga` intercetta il `P2002`
 * di Prisma — cioe il `23505` di Postgres — e lo traduce in una frase per la
 * segreteria. La traduzione e cio che si legge; il vincolo e cio che decide.
 */
const provaDoppiaPrenotazione = async () => {
  console.log(`${NL}3. Due famiglie insieme sullo stesso slot${NL}`);

  const contesti = await Promise.all([
    appointments.resolveFamilyAppointmentContext(FAMIGLIA_A, ATLETA_A),
    appointments.resolveFamilyAppointmentContext(FAMIGLIA_B, ATLETA_B),
  ]);

  if (!contesti[0] || !contesti[1]) {
    prova(
      "3. due famiglie sullo stesso slot",
      "due contesti famiglia risolti",
      "il legame famiglia-atleta non si e risolto",
      "senza contesto la prova non e eseguibile",
    );
    return;
  }

  const chiedi = (ctx) => () =>
    appointments.requestFamilyAppointment(ctx, {
      date: GIORNO_SLOT,
      time: ORA_SLOT,
      reason: "Colloquio richiesto dalla famiglia",
    });

  const esito = await insieme(chiedi(contesti[0]), chiedi(contesti[1]));

  const vivi = await prisma.appointment.count({
    where: {
      organization_id: CLUB,
      assigned_to_user_id: OPERATORE,
      status: { in: ["requested", "confirmed"] },
    },
  });

  /*
    Da dove viene il rifiuto: il messaggio tradotto e quello di `creaRiga`, che
    e la sola strada per cui un `P2002` non-idempotente diventa una frase.
    Nessun controllo applicativo produce quel testo.
  */
  const dalVincolo = esito.motivi.some((motivo) =>
    /appena stato preso/i.test(motivo),
  );

  prova(
    "3. slot conteso: una prenota, l'altra e respinta",
    { riuscite: 1, fallite: 1, appuntamentiVivi: 1, dalVincolo: true },
    {
      riuscite: esito.riuscite,
      fallite: esito.fallite,
      appuntamentiVivi: vivi,
      dalVincolo,
    },
    `il rifiuto dice: ${esito.motivi[0] || "nessuno"} — e la traduzione che ` +
      "`creaRiga` fa del P2002 sollevato da `appointments_slot_vivo_unico`: " +
      "il rifiuto nasce dal vincolo del database, il testo dal servizio",
  );
};

/* ============================ 4. due allenatori sullo stesso appello ===== */

/**
 * Due allenatori fanno l'appello dello stesso allenamento sugli stessi atleti.
 *
 * Succede davvero: due telefoni in palestra, la stessa lista. Cio che si prova
 * qui e che la chiave unica `(organization_id, event_id, athlete_id)` regga —
 * cioe che non nascano due righe di presenza per lo stesso ragazzo allo stesso
 * allenamento, che e il modo in cui una rendicontazione di contributi pubblici
 * conterebbe due volte la stessa persona.
 */
const provaDoppioAppello = async () => {
  console.log(`${NL}4. Due allenatori insieme sull'appello${NL}`);

  const legacy = `sonda-appello-${randomUUID()}`;
  const evento = await events.createClubEvent(
    scopeClub(),
    "training",
    {
      id: legacy,
      title: "Allenamento con due appelli",
      date: GIORNO_EVENTI,
      time: "20:00",
      endTime: "21:00",
    },
    { userId: OPERATORE },
  );

  const elenco = [
    { athleteId: ATLETA_A, status: "present" },
    { athleteId: ATLETA_B, status: "present" },
  ];

  const appello = () => () =>
    events.saveEventAttendance(scopeClub(), legacy, elenco, {
      userId: OPERATORE,
    });

  const esito = await insieme(appello(), appello());

  const righe = await contaPartecipanti(evento.id);
  const presenti = await prisma.clubEventParticipant.count({
    where: {
      organization_id: CLUB,
      event_id: evento.id,
      status: "present",
    },
  });

  prova(
    "4. appello doppio: nessuna riga duplicata",
    { righe: 2, presenti: 2 },
    { righe, presenti },
    `${esito.riuscite}/2 chiamate riuscite; il rifiuto dice: ${esito.motivi[0] || "nessuno"}`,
  );
};

/* ======================= 5. il caso che prima perdeva dati =============== */

/**
 * **Due segretarie creano due allenamenti diversi nello stesso momento.**
 *
 * E la prova che nomina il difetto per cui la Wave 5 esiste. Prima ogni
 * salvataggio era `prisma.club.update` sull'intero array `clubs.trainings`:
 * due richieste concorrenti leggevano lo stesso array, ne scrivevano due
 * versioni diverse, e **l'ultima vinceva**. Ne sopravviveva uno solo, senza un
 * errore e senza una traccia.
 *
 * Adesso l'evento e una riga, e due `INSERT` distinti non si toccano. Ma la
 * colonna JSON resta come **proiezione**, riscritta per intero a ogni
 * scrittura: la seconda meta della prova verifica che anche la copia finisca
 * allineata alle righe. Una proiezione che perde un evento non perde il dato —
 * la riga c'e — ma novantadue punti del prodotto leggono ancora la copia, e
 * per loro quell'allenamento non esiste.
 */
const provaDueAllenamentiInsieme = async () => {
  console.log(`${NL}5. Due segretarie, due allenamenti, lo stesso momento${NL}`);

  const primo = `sonda-parallelo-1-${randomUUID()}`;
  const secondo = `sonda-parallelo-2-${randomUUID()}`;

  const crea = (legacy, ora, titolo) => () =>
    events.createClubEvent(
      scopeClub(),
      "training",
      { id: legacy, title: titolo, date: GIORNO_EVENTI, time: ora },
      { userId: OPERATORE },
    );

  const esito = await insieme(
    crea(primo, "07:00", "Allenamento del mattino"),
    crea(secondo, "08:30", "Allenamento di meta mattina"),
  );

  const righe = await prisma.clubEvent.findMany({
    where: { organization_id: CLUB, kind: "training" },
    select: { id: true, legacy_id: true },
  });
  const sopravvissuti = righe.filter((riga) =>
    [primo, secondo].includes(riga.legacy_id),
  ).length;

  prova(
    "5a. due allenamenti creati insieme: due righe",
    { creati: 2, riuscite: 2 },
    { creati: sopravvissuti, riuscite: esito.riuscite },
    esito.motivi.length ? `rifiuti: ${esito.motivi.join(" | ")}` : "",
  );

  /*
    L'allineamento della proiezione: gli identificativi della colonna JSON
    devono essere **esattamente** quelli delle righe. Un confronto per insiemi
    e non per numero, cosi la nota puo dire quale evento manca.
  */
  const club = await prisma.club.findUnique({
    where: { id: CLUB },
    select: { trainings: true },
  });
  const proiettati = Array.isArray(club?.trainings)
    ? club.trainings.map((voce) => String(voce?.id ?? "")).filter(Boolean)
    : [];
  const attesi = righe.map((riga) => riga.legacy_id || riga.id);
  const mancanti = attesi.filter((id) => !proiettati.includes(id));
  const inPiu = proiettati.filter((id) => !attesi.includes(id));

  prova(
    "5b. la proiezione clubs.trainings resta allineata alle righe",
    { mancanti: 0, inPiu: 0 },
    { mancanti: mancanti.length, inPiu: inPiu.length },
    mancanti.length || inPiu.length
      ? `righe: ${attesi.length}, proiettati: ${proiettati.length}. ` +
        "La proiezione e un «leggi tutte le righe, riscrivi la colonna» " +
        "eseguito da ogni scrittura: due creazioni simultanee possono " +
        "leggere prima dell'altra e scrivere dopo, e la copia perde un evento " +
        "che la riga conserva"
      : `righe e proiezione concordano su ${attesi.length} allenamenti`,
  );
};

/* -------------------------------------------------------------- pulizia */

/**
 * Si cancella **solo** cio che questa sonda ha creato.
 *
 * Audit e notifiche prima del club, perche non hanno una chiave esterna che li
 * porti via con lui: `audit_logs` non ha nessuna relazione verso `clubs`, e
 * `notifications.organization_id` e `SET NULL`. Lasciarli sarebbe lasciare
 * righe orfane su un archivio condiviso.
 */
const pulisci = async () => {
  const passo = async (nome, fn) => {
    try {
      await fn();
    } catch (error) {
      console.error(
        `Pulizia incompleta (${nome}): ${String(error?.message).split(NL)[0]}`,
      );
    }
  };

  await passo("notifiche", () =>
    prisma.notification.deleteMany({ where: { organization_id: CLUB } }),
  );
  await passo("audit", () =>
    prisma.auditLog.deleteMany({ where: { organization_id: CLUB } }),
  );
  await passo("club", () => prisma.club.delete({ where: { id: CLUB } }));
  await passo("utenti", () =>
    prisma.user.deleteMany({ where: { id: { in: UTENTI } } }),
  );
};

/* ------------------------------------------------------------------ via */

try {
  appointments = await import("../src/lib/server/appointments.ts");
  documentRequests = await import("../src/lib/server/document-requests.ts");
  events = await import("../src/lib/server/events.ts");
  rsvp = await import("../src/lib/server/rsvp.ts");
  formSubmissions = await import("../src/lib/server/form-submissions.ts");
  audit = await import("../src/lib/server/audit.ts");

  console.log(`${NL}Semina del club di sonda ${CLUB}...`);
  await semina();

  await provaDoppioClic();
  await provaConflittoOttimistico();
  await provaDoppiaPrenotazione();
  await provaDoppioAppello();
  await provaDueAllenamentiInsieme();

  const falliti = esiti.filter((e) => !e.ok);
  console.log(
    `${NL}${esiti.length - falliti.length}/${esiti.length} prove di concorrenza passate.`,
  );
  if (falliti.length) {
    console.log(`${NL}FALLITE:`);
    for (const e of falliti) {
      console.log(
        `  ${e.titolo}${NL}    atteso  ${JSON.stringify(e.atteso)}${NL}    trovato ${JSON.stringify(e.trovato)}${e.nota ? `${NL}    nota    ${e.nota}` : ""}`,
      );
    }
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    `${NL}Sonda interrotta:${NL}${String(error?.stack || error?.message).split(NL).slice(0, 20).join(NL)}`,
  );
  process.exitCode = 1;
} finally {
  await pulisci();
  await prisma.$disconnect();
}
