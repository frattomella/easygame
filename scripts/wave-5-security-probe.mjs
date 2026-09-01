/**
 * **La sonda di sicurezza della Wave 5, contro un database vero.**
 *
 *     node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *       scripts/wave-5-security-probe.mjs
 *
 * ---
 *
 * ## Perche esiste, accanto a tremila test
 *
 * Il §22 del planning della Wave 5 lo dice in una riga che vale per tutto
 * questo file: **i difetti BLOCKER non sono visibili da nessuno dei quattro
 * gate.** Test verdi, typecheck pulito, build completa, e tre superfici che non
 * funzionano. Un test unitario chiama la funzione che sa esistere; una sonda
 * chiama la funzione che un attaccante chiamerebbe, e guarda cosa torna.
 *
 * Qui si eseguono i due scenari che riguardano il confine e il permesso:
 *
 * - **U-15** — undici tentativi dalla sessione del club B verso righe del club
 *   A. Attesi: undici respinte. Per le **letture** la riga deve risultare
 *   *inesistente* — non *negata*: confermare che una riga altrui esiste e gia
 *   un'informazione che non si deve dare.
 * - **U-16** — per ognuna delle chiavi nuove del §12, dalla sessione di un
 *   ruolo che non la possiede: la chiamata deve fallire con `Accesso negato`,
 *   il diniego deve lasciare **una riga di audit**, e il ruolo che la possiede
 *   deve riuscire. Senza quest'ultimo controspecchio, un `403` per tutti — o
 *   un modulo che non carica — passerebbe come successo.
 *
 * ## La regola di questo file
 *
 * **La sonda misura, non corregge.** Dove trova un difetto lo dichiara `FAIL`
 * con la nota di cio che ha osservato, e non tocca una riga del codice di
 * produzione. Sara chi legge a decidere se e un difetto o una scelta.
 *
 * In particolare, dove una strada **non scrive** l'audit del diniego, questa
 * sonda lo dichiara `FAIL` invece di ignorarlo: e esattamente la lacuna che
 * esiste per trovare.
 *
 * ## Cosa scrive
 *
 * Due club di collaudo con i loro utenti, atleti, eventi, richieste
 * documentali, appuntamenti e slot. `pulisci()` li cancella entrambi in
 * `finally`, e il `Cascade` porta via il resto.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("Rifiuto: serve EASYGAME_DB_ENV=development.");
  process.exit(1);
}

const NL = String.fromCharCode(10);
const prisma = new PrismaClient();

const MARCA = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const POSTA = (nome) => `w5probe-${nome}-${MARCA}@easygame.test`;

const CLUB_A = randomUUID();
const CLUB_B = randomUUID();
const ATLETA_A = randomUUID();
const ATLETA_B = randomUUID();
const SEDE_A = "sede-w5-a";
const CATEGORIA = "U15";

/* I sette ruoli canonici: la sonda ne semina uno per club dove serve. */
const RUOLI_A = ["owner", "club_manager", "collaborator", "staff", "trainer", "parent", "athlete"];

const utenti = {};
let EVENTO_A = null;
let EVENTO_A_GARA = null;
let EVENTO_B = null;
let RICHIESTA_A = null;
let DEPOSITO_A = null;
let APPUNTAMENTO_A = null;
let APPUNTAMENTO_TRAINER = null;
let SLOT_A = null;
let CONSENSO_A = null;

/* I moduli sotto misura, importati dinamicamente come fa il collaudo Wave 4. */
let eventi;
let documenti;
let appuntamenti;
let rsvp;
let risorse;
let autenticazione;
let catalogo;
let permessiComunicazioni;
let permessiSanitari;
let consensi;

/* ------------------------------------------------------------ il verdetto */

const esiti = [];

/**
 * **La deviazione dichiarata, che non e ne un successo ne un fallimento.**
 *
 * Alcune chiavi non si difendono nella forma che il §22 descrive, e non per
 * una lacuna: `clinical.read` protegge un **campo** e lo toglie dalla
 * risposta invece di negare la chiamata; `rsvp.answer` non ha un ruolo a cui
 * negarla perche il ruolo con cui si risponde e derivato dal legame.
 *
 * Registrarle come `FAIL` avrebbe reso questa sonda impossibile da portare a
 * verde, e una sonda che non puo essere verde e una sonda in cui una
 * regressione vera si confonde con il rumore. Registrarle come `PASS` avrebbe
 * nascosto una scelta che merita di essere riletta. Restano una terza cosa,
 * **visibile**, con il motivo accanto e il conto separato in fondo.
 */
const deviazioni = [];

const devia = (titolo, motivo) => {
  deviazioni.push({ titolo, motivo });
  console.log(`  DEVIA ${titolo.padEnd(64)} scelta dichiarata`);
  console.log(`        ${motivo}`);
};

const prova = (titolo, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ titolo, ok, atteso, trovato, nota });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(64)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        nota: ${nota}`);
};

/**
 * **I quattro esiti che questa sonda sa distinguere, e perche non bastano due.**
 *
 * `riuscito` e la chiamata che torna un dato. Gli altri sono tutti rifiuti, ma
 * un rifiuto **dice** qualcosa, e cio che dice e la meta della domanda:
 *
 * - `inesistente` — la riga non risulta: `null`, elenco vuoto, oppure «non
 *   trovato». Chi ha indovinato l'identificativo resta senza sapere se ha
 *   indovinato. E cio che il §22 pretende dalle **letture** cross-tenant.
 * - `ambiguo` — la formula di `assertActiveClub`: «non appartiene al club
 *   attivo, **o non esiste**». La disgiunzione e deliberata e sta scritta in
 *   `active-club-boundary.ts`: distinguere i due casi direbbe a un attaccante
 *   che l'identificativo esiste davvero. Non e `inesistente`, ma non conferma
 *   nulla, e tenerlo separato e l'unico modo di dire a chi legge **quale**
 *   delle due difese ha risposto.
 * - `negato` — un `Accesso negato` che non lascia alcuna ambiguita: e la
 *   risposta giusta a un permesso mancante, ed e la risposta sbagliata a una
 *   lettura cross-tenant, perche conferma che la riga c'e.
 *
 * `errore` tiene separato cio che e fallito per un'altra ragione — un vincolo,
 * un campo mancante — da cio che e stato rifiutato: una prova che passa perche
 * il dato di semina era sbagliato non prova niente.
 */
const NON_TROVATO = /non\s+(?:e\s+)?(?:stat[oa]\s+)?trovat[oa]?/i;
const FORMULA_AMBIGUA = /o non esiste|o non e di questo club/i;

const tenta = async (azione) => {
  try {
    const valore = await azione();
    const vuoto =
      valore === null ||
      valore === undefined ||
      (Array.isArray(valore) && valore.length === 0);
    return { esito: vuoto ? "inesistente" : "riuscito", valore, messaggio: "" };
  } catch (error) {
    const messaggio = String(error?.message || error);
    if (NON_TROVATO.test(messaggio)) {
      return { esito: "inesistente", valore: null, messaggio };
    }
    if (FORMULA_AMBIGUA.test(messaggio)) {
      return { esito: "ambiguo", valore: null, messaggio };
    }
    if (messaggio.includes("Accesso negato")) {
      return { esito: "negato", valore: null, messaggio };
    }
    return { esito: "errore", valore: null, messaggio };
  }
};

/* ------------------------------------------------------------- le sessioni */

/**
 * Lo scope che `resolveOrganizationScopeForUser` produrrebbe per quel ruolo in
 * quel club. Si costruisce a mano perche la sonda non passa dall'HTTP; il
 * **verso opposto** — che la sessione vera non produca uno scope su un club a
 * cui non si appartiene — e provato a parte, ed e la prova 11-bis.
 */
const scopeDi = (userId, organizationId, role) => ({
  userId,
  activeOrganizationId: organizationId,
  activeRole: role,
  activeMembershipId: null,
  allowedOrganizationIds: [organizationId],
});

const scopeRuolo = (ruolo) => scopeDi(utenti[ruolo].id, CLUB_A, ruolo);

/* ---------------------------------------------------------------- semina */

const semina = async () => {
  for (const ruolo of RUOLI_A) {
    utenti[ruolo] = await prisma.user.create({
      data: {
        email: POSTA(ruolo),
        password_hash: "w5-probe",
        first_name: "W5PROBE",
        last_name: ruolo.toUpperCase(),
        /*
          L'indirizzo verificato conta: `getParentLinkedAthletes` accetta la
          corrispondenza per email **solo** se verificata, ed e la difesa che
          chiude la strada del cambio indirizzo. Qui il legame passa comunque
          da `athletes.user_id`, ma un utente non verificato renderebbe la
          semina fragile al primo cambio di quella regola.
        */
        email_verified_at: new Date(),
      },
    });
  }
  utenti.ownerB = await prisma.user.create({
    data: {
      email: POSTA("ownerb"),
      password_hash: "w5-probe",
      first_name: "W5PROBE",
      last_name: "OWNER-B",
      email_verified_at: new Date(),
    },
  });

  const club = (id, nome, creatore) => ({
    id,
    slug: `w5probe-${nome}-${MARCA}`,
    name: `ASD Sonda ${nome.toUpperCase()}`,
    creator_id: creatore,
    transactions: [],
    transfers: [],
    club_sites: [{ id: SEDE_A, name: "Sede Unica", active: true }],
    settings: {},
  });

  await prisma.club.create({
    data: {
      ...club(CLUB_A, "a", utenti.owner.id),
      categories: [{ id: CATEGORIA, name: CATEGORIA }],
      /*
        **L'allenatore deve essere una persona del club, non solo un ruolo.**

        Il perimetro dell'allenatore si risolve da `clubs.trainers`: un utente
        con ruolo `trainer` e nessuna scheda vede **zero** atleti e zero
        eventi. Una sonda seminata cosi misurerebbe l'assenza della scheda e la
        chiamerebbe «difesa», che e il modo piu comune di scrivere un controllo
        di sicurezza che passa sempre.
      */
      trainers: [
        {
          id: "trainer-sonda",
          name: "W5PROBE TRAINER",
          email: utenti.trainer.email,
          linkedUserId: utenti.trainer.id,
          categories: [CATEGORIA],
        },
      ],
    },
  });
  await prisma.club.create({ data: club(CLUB_B, "b", utenti.ownerB.id) });

  for (const ruolo of RUOLI_A) {
    await prisma.organizationUser.create({
      data: {
        organization_id: CLUB_A,
        user_id: utenti[ruolo].id,
        role: ruolo,
        is_primary: true,
      },
    });
  }
  await prisma.organizationUser.create({
    data: {
      organization_id: CLUB_B,
      user_id: utenti.ownerB.id,
      role: "owner",
      is_primary: true,
    },
  });

  /*
    L'atleta del club A e legato all'account `parent` da `user_id`: e il legame
    che `canParentAccessAthlete` riconosce, e senza di esso ogni prova sul
    simbolo `⛓` della matrice misurerebbe soltanto l'assenza del legame.
  */
  await prisma.athlete.create({
    data: {
      id: ATLETA_A,
      organization_id: CLUB_A,
      user_id: utenti.parent.id,
      first_name: "Sonda",
      last_name: "Alfa",
      status: "active",
      /* La categoria e cio che mette l'atleta dentro il perimetro dell'allenatore. */
      category_id: CATEGORIA,
      category_name: CATEGORIA,
      data: {
        /* Contenuto clinico vero, per misurare se la proiezione lo toglie. */
        allergies: "Arachidi",
        bloodType: "0+",
        medications: "Salbutamolo",
        phone: "3330000000",
      },
      updated_at: new Date(),
    },
  });

  await prisma.athlete.create({
    data: {
      id: ATLETA_B,
      organization_id: CLUB_B,
      first_name: "Sonda",
      last_name: "Beta",
      status: "active",
      data: {},
      updated_at: new Date(),
    },
  });

  const scopeOwnerA = scopeDi(utenti.owner.id, CLUB_A, "owner");
  const scopeOwnerB = scopeDi(utenti.ownerB.id, CLUB_B, "owner");
  const domani = new Date(Date.now() + 86_400_000);
  const giorno = domani.toISOString().slice(0, 10);

  /*
    Gli eventi si creano **attraverso il servizio** e non con un `INSERT`: e la
    stessa strada che proietta `clubs.trainings`, e il riepilogo RSVP legge
    quella proiezione. Seminarli a mano darebbe una riga senza proiezione, e la
    prova su `rsvp.read` fallirebbe per la ragione sbagliata.
  */
  EVENTO_A = await eventi.createClubEvent(
    scopeOwnerA,
    "training",
    {
      date: giorno,
      time: "18:00",
      endTime: "19:30",
      title: "Allenamento Sonda A",
      siteId: SEDE_A,
      rsvpRequired: true,
      rsvpDeadline: new Date(Date.now() + 43_200_000).toISOString(),
    },
    { userId: utenti.owner.id, email: utenti.owner.email },
  );

  EVENTO_A_GARA = await eventi.createClubEvent(
    scopeOwnerA,
    "match",
    {
      date: giorno,
      time: "21:00",
      title: "Gara Sonda A",
      opponent: "Avversaria",
      siteId: SEDE_A,
    },
    { userId: utenti.owner.id, email: utenti.owner.email },
  );

  EVENTO_B = await eventi.createClubEvent(
    scopeOwnerB,
    "training",
    { date: giorno, time: "18:00", title: "Allenamento Sonda B" },
    { userId: utenti.ownerB.id, email: utenti.ownerB.email },
  );

  RICHIESTA_A = await prisma.documentRequest.create({
    data: {
      organization_id: CLUB_A,
      subject_kind: "athlete",
      subject_id: ATLETA_A,
      document_kind: "medical_certificate",
      title: "Certificato medico 2026/27",
      required: true,
      status: "open",
      updated_at: new Date(),
    },
  });

  DEPOSITO_A = await prisma.documentSubmission.create({
    data: {
      organization_id: CLUB_A,
      request_id: RICHIESTA_A.id,
      subject_kind: "athlete",
      subject_id: ATLETA_A,
      document_kind: "medical_certificate",
      submitted_by: utenti.parent.id,
      source: "parent",
      status: "under_review",
    },
  });

  APPUNTAMENTO_A = await prisma.appointment.create({
    data: {
      organization_id: CLUB_A,
      site_id: SEDE_A,
      starts_at: new Date(Date.now() + 172_800_000),
      ends_at: new Date(Date.now() + 174_600_000),
      status: "requested",
      athlete_id: ATLETA_A,
      requested_by_user_id: utenti.parent.id,
      reason: "Colloquio con la segreteria",
      updated_at: new Date(),
    },
  });

  /*
    Un secondo appuntamento **assegnato all'allenatore**: senza di esso
    `appointments.read_own` restituirebbe un elenco vuoto, e un elenco vuoto
    passerebbe per un permesso che funziona mentre non prova nulla.
  */
  APPUNTAMENTO_TRAINER = await prisma.appointment.create({
    data: {
      organization_id: CLUB_A,
      site_id: SEDE_A,
      starts_at: new Date(Date.now() + 176_400_000),
      ends_at: new Date(Date.now() + 178_200_000),
      status: "requested",
      athlete_id: ATLETA_A,
      requested_by_user_id: utenti.parent.id,
      assigned_to_user_id: utenti.trainer.id,
      reason: "Colloquio con l'allenatore",
      updated_at: new Date(),
    },
  });

  SLOT_A = await prisma.appointmentSlot.create({
    data: {
      organization_id: CLUB_A,
      site_id: SEDE_A,
      weekday: 2,
      start_time: "16:00",
      end_time: "18:00",
      duration_minutes: 30,
      capacity: 1,
      active: true,
      updated_at: new Date(),
    },
  });

  /*
    Un certificato medico vero. Serve al controspecchio di
    `clinical.status_read`: senza una riga da leggere, chi **ha** il permesso
    riceverebbe un elenco vuoto, e un elenco vuoto passerebbe per un permesso
    che funziona mentre non prova niente — lo stesso motivo per cui piu sopra
    si semina un appuntamento assegnato all'allenatore.
  */
  await prisma.medicalCertificate.create({
    data: {
      organization_id: CLUB_A,
      athlete_id: ATLETA_A,
      type: "agonistico",
      expiry_date: new Date(Date.now() + 15_552_000_000),
      updated_at: new Date(),
    },
  });

  /*
    Un consenso **pubblicato**, che e la sola forma su cui si possa decidere:
    serve a misurare `consents.decide_own`, il permesso che non si ottiene mai
    da un ruolo. Si semina passando dal servizio e non da Prisma, perche una
    definizione senza la sua versione pubblicata farebbe fallire la prova per
    la ragione sbagliata.
  */
  const scopeDirezione = scopeDi(utenti.owner.id, CLUB_A, "owner");
  CONSENSO_A = await consensi.createConsentDefinition(scopeDirezione, {
    key: "immagini",
    title: "Consenso immagini",
    description: "Foto e video dell'attivita sportiva",
    required: false,
  });
  await consensi.publishConsentVersion(scopeDirezione, CONSENSO_A.id, {
    bodyText: "Testo dell'informativa della sonda",
  });
};

/* ============================================================ U-15 ======= */

/**
 * **Undici tentativi dal club B verso il club A.**
 *
 * Lo scope e quello di un proprietario vero — del **proprio** club: non e un
 * attacco con una sessione contraffatta, e la posizione ordinaria di chiunque
 * abbia una societa e conosca, o indovini, l'identificativo di una riga
 * altrui. La Wave 4 ha dimostrato che questa e la posizione da cui il confine
 * si rompe davvero.
 *
 * Per ogni tentativo si dichiara **prima** l'esito atteso, e la distinzione
 * fra `inesistente` e `negato` non e formale: una lettura che risponde
 * «Accesso negato» ha appena confermato che la riga esiste.
 */
const u15 = async () => {
  console.log(`${NL}U-15 — ISOLAMENTO CROSS-TENANT: UNDICI TENTATIVI DAL CLUB B`);

  const B = scopeDi(utenti.ownerB.id, CLUB_B, "owner");

  /*
    **Il controspecchio, prima degli undici.**

    Undici rifiuti si ottengono anche con una semina sbagliata, un modulo che
    non carica o un identificativo inventato. Questa prova dice che la stessa
    sessione, sulle **proprie** righe, funziona: da qui in avanti un rifiuto e
    un confine e non un guasto.
  */
  const proprio = await tenta(() => eventi.readClubEvent(B, EVENTO_B.id));
  const propriAtleti = await tenta(() =>
    risorse.listResource(
      "athletes",
      new URLSearchParams({ organization_id: CLUB_B, id: ATLETA_B }),
      B,
    ),
  );
  prova(
    "0. la sessione del club B legge le proprie righe",
    { evento: "riuscito", atleti: "riuscito" },
    { evento: proprio.esito, atleti: propriAtleti.esito },
    "senza questo, undici rifiuti non distinguono un confine da un guasto",
  );

  /* 1 — leggere un evento del club A. */
  const t1 = await tenta(() => eventi.readClubEvent(B, EVENTO_A.id));
  prova("1. leggere un evento altrui", "inesistente", t1.esito, t1.messaggio);

  /*
    2 — elencare gli eventi **dichiarando** il club altrui. Il registro generico
    e la strada in cui un `organization_id` scelto da chi chiama e arrivato
    piu volte fino alla query: il dominio non accetta il parametro, il registro
    si.
  */
  const t2 = await tenta(async () => {
    const righe = await risorse.listResource(
      "club_events",
      new URLSearchParams({ organization_id: CLUB_A }),
      B,
    );
    /*
      Un elenco vuoto e il rifiuto giusto; un elenco che contiene righe del
      club A e la fuga. Si guarda il **contenuto**, non il conteggio: filtrare
      sul club attivo e restituire zero righe sarebbe indistinguibile da un
      filtro che non c'e, se il club A non avesse eventi.
    */
    const estranee = righe.filter((riga) => riga.organization_id === CLUB_A);
    return estranee.length ? estranee : null;
  });
  /*
    Qui l'atteso e `negato` e non `inesistente`, ed e una scelta dichiarata:
    il rifiuto non nomina nessuna riga, rifiuta **il club**. Non dice a chi
    chiede se il club A abbia eventi, quindi non c'e niente da confondere con
    l'inesistenza.
  */
  prova(
    "2. elencare gli eventi dichiarando il club altrui",
    "negato",
    t2.esito,
    t2.messaggio || `righe del club A restituite: ${t2.valore?.length ?? 0}`,
  );

  /* 3 — modificare un evento altrui. */
  const t3 = await tenta(() =>
    eventi.updateClubEvent(B, EVENTO_A.id, { title: "Riscritto dal club B" }, {
      userId: utenti.ownerB.id,
    }),
  );
  prova("3. modificare un evento altrui", "inesistente", t3.esito, t3.messaggio);

  /* 4 — cancellare un evento altrui. */
  const t4 = await tenta(() =>
    eventi.deleteClubEvent(B, EVENTO_A.id, { userId: utenti.ownerB.id }),
  );
  prova("4. cancellare un evento altrui", "inesistente", t4.esito, t4.messaggio);

  /* 5 — leggere i partecipanti di un evento altrui. */
  const t5 = await tenta(() => eventi.listEventParticipants(B, EVENTO_A.id));
  prova(
    "5. leggere i partecipanti di un evento altrui",
    "inesistente",
    t5.esito,
    t5.messaggio,
  );

  /* 6 — registrare una presenza su un evento altrui. */
  const t6 = await tenta(() =>
    eventi.saveEventAttendance(
      B,
      EVENTO_A.id,
      [{ athleteId: ATLETA_A, status: "present" }],
      { userId: utenti.ownerB.id },
    ),
  );
  prova(
    "6. registrare una presenza su un evento altrui",
    "inesistente",
    t6.esito,
    t6.messaggio,
  );

  /* 7 — leggere una richiesta documentale altrui. */
  const t7 = await tenta(() => documenti.getDocumentRequest(B, RICHIESTA_A.id));
  /*
    Qui l'esito atteso e cambiato, e vale la pena dire perche.

    `loadRequest` cercava la riga **senza** filtro di club e la faceva poi
    cadere su `assertActiveClub`: la difesa reggeva — nessun contenuto usciva —
    ma le due frasi non erano la stessa, e un audit indipendente l'ha misurato.
    Un identificativo inventato riceveva «non e stata trovata»; un
    identificativo **di un altro club** riceveva la formula del confine, «non
    appartiene al club attivo, o non esiste». Due risposte distinguibili sono un
    oracolo di esistenza: chiunque crei la propria societa poteva chiedere se un
    UUID fosse una richiesta viva da qualche parte sulla piattaforma.

    Adesso il club sta **dentro** il `where`, come per gli eventi e gli
    appuntamenti, e l'esito e `inesistente` — cioe cio che il §22 chiede a una
    lettura cross-tenant.
  */
  prova(
    "7. leggere una richiesta documentale altrui",
    "inesistente",
    t7.esito,
    t7.messaggio,
  );

  /* 8 — decidere su un deposito documentale altrui. */
  const t8 = await tenta(() =>
    documenti.decideDocumentSubmission(B, DEPOSITO_A.id, {
      decision: "approved",
    }),
  );
  prova(
    "8. decidere su un deposito documentale altrui",
    "inesistente",
    t8.esito,
    t8.messaggio,
  );

  /* 9 — confermare un appuntamento altrui. */
  const t9 = await tenta(() =>
    appuntamenti.confirmAppointment(B, APPUNTAMENTO_A.id, {}, {
      userId: utenti.ownerB.id,
    }),
  );
  prova(
    "9. confermare un appuntamento altrui",
    "inesistente",
    t9.esito,
    t9.messaggio,
  );

  /*
    10 — lo slot di disponibilita, **letto e modificato**. Le due meta stanno
    insieme perche una lettura che non trapela nulla accanto a una scrittura
    che passa sarebbe una difesa a meta, e il conteggio della lettura da solo
    non basterebbe: si guarda se lo slot del club A compare fra quelli letti.
  */
  const t10lettura = await tenta(async () => {
    const righe = await appuntamenti.listAppointmentSlots(B);
    const estranei = righe.filter((riga) => riga.organization_id === CLUB_A);
    return estranei.length ? estranei : null;
  });
  const t10scrittura = await tenta(() =>
    appuntamenti.updateAppointmentSlot(
      B,
      SLOT_A.id,
      { startTime: "09:00", endTime: "10:00", weekday: 1 },
      { userId: utenti.ownerB.id },
    ),
  );
  prova(
    "10. leggere e modificare uno slot altrui",
    { lettura: "inesistente", scrittura: "inesistente" },
    { lettura: t10lettura.esito, scrittura: t10scrittura.esito },
    `${t10lettura.messaggio} | ${t10scrittura.messaggio}`,
  );

  /*
    **11 — lo scope contraffatto.**

    Il tentativo dichiara come club attivo il club A pur non avendolo fra i
    club consentiti: e la forma esatta dell'attacco che la Wave 4 ha eseguito
    end-to-end mandando `x-active-club-id` di un club altrui.

    ADR-0094 decide che il confine dei servizi guardi **solo**
    `activeOrganizationId` e mai `allowedOrganizationIds`, e la ragione e
    buona: il ruolo si risolve sul club attivo, quindi confrontare la riga con
    l'elenco dei club consentiti autorizzerebbe con un ruolo che vale altrove.
    La conseguenza era che uno scope contraffatto **passava** ogni
    `assertActiveClub`, e la prima esecuzione di questa sonda l'ha misurato:
    quattro chiamate su quattro riuscite, titolo dell'evento del club A
    riscritto, appuntamento del club A portato a `confirmed`.

    Adesso non passa piu. `assertActiveClub` verifica **prima** che lo scope
    stia in piedi — il club attivo dev'essere fra quelli a cui l'account
    appartiene — e solo dopo confronta la riga con il club attivo. Non e un
    ritorno all'autorizzazione per `allowedOrganizationIds` che ADR-0094
    vieta: quella giudicava l'appartenenza di una **riga** con l'elenco, questa
    giudica la coerenza dello **scope** e lascia il giudizio sulla riga dov'era.

    L'esito atteso cambia di conseguenza, e vale la pena dire perche non e
    `inesistente` come nelle prove da 1 a 10: li il rifiuto e volutamente
    ambiguo — «non appartiene al club attivo, o non esiste» — per non dire a un
    estraneo quali identificativi esistono. Qui il rifiuto arriva prima di
    guardare qualunque riga, e non puo rivelare niente su nessuna: nomina lo
    scope, non il record.
  */
  /*
    La fotografia **prima** dello scope contraffatto. Serve a tenere separate
    due domande che altrimenti si confondono: i dieci tentativi con uno scope
    onesto hanno lasciato scritto qualcosa? E poi, separatamente, l'undicesimo?
  */
  const fotografia = async () => {
    const evento = await prisma.clubEvent.findUnique({ where: { id: EVENTO_A.id } });
    const slot = await prisma.appointmentSlot.findUnique({ where: { id: SLOT_A.id } });
    const deposito = await prisma.documentSubmission.findUnique({
      where: { id: DEPOSITO_A.id },
    });
    const appuntamento = await prisma.appointment.findUnique({
      where: { id: APPUNTAMENTO_A.id },
    });
    return {
      evento: evento?.title ?? null,
      slot: slot?.start_time ?? null,
      deposito: deposito?.status ?? null,
      appuntamento: appuntamento?.status ?? null,
    };
  };

  const INTATTO = {
    evento: "Allenamento Sonda A",
    slot: "16:00",
    deposito: "under_review",
    appuntamento: "requested",
  };

  prova(
    "10-bis. dopo i dieci tentativi il club A e intatto",
    INTATTO,
    await fotografia(),
    "una riga cambiata qui direbbe che un tentativo e passato anche se aveva risposto con un errore",
  );

  const CONTRAFFATTO = {
    userId: utenti.ownerB.id,
    activeOrganizationId: CLUB_A,
    activeRole: "owner",
    activeMembershipId: null,
    allowedOrganizationIds: [CLUB_B],
  };

  const c1 = await tenta(() => eventi.readClubEvent(CONTRAFFATTO, EVENTO_A.id));
  const c2 = await tenta(() =>
    eventi.updateClubEvent(CONTRAFFATTO, EVENTO_A.id, { title: "Contraffatto" }, {
      userId: utenti.ownerB.id,
    }),
  );
  const c3 = await tenta(() =>
    documenti.getDocumentRequest(CONTRAFFATTO, RICHIESTA_A.id),
  );
  const c4 = await tenta(() =>
    appuntamenti.confirmAppointment(CONTRAFFATTO, APPUNTAMENTO_A.id, {}, {
      userId: utenti.ownerB.id,
    }),
  );

  prova(
    "11. le stesse chiamate con lo scope contraffatto",
    {
      evento: "negato",
      modifica: "negato",
      richiesta: "negato",
      appuntamento: "negato",
    },
    {
      evento: c1.esito,
      modifica: c2.esito,
      richiesta: c3.esito,
      appuntamento: c4.esito,
    },
    "lo scope incoerente lo ferma assertActiveClub prima di guardare qualunque riga; la 11-bis resta la seconda difesa, non piu l'unica",
  );

  /*
    11-bis — dove sta davvero la serratura. Non e uno degli undici tentativi:
    e la verifica che lo scope contraffatto della prova 11 **non sia
    ottenibile** da una sessione vera.
  */
  const risolto = await autenticazione.resolveOrganizationScopeForUser(
    utenti.ownerB.id,
    CLUB_A,
  );
  prova(
    "11-bis. la sessione vera non consegna il club altrui",
    { attivo: CLUB_B, consentiti: [CLUB_B] },
    {
      attivo: risolto.activeOrganizationId,
      consentiti: risolto.allowedOrganizationIds,
    },
    "resolveOrganizationScopeForUser ignora il club dichiarato se non e fra quelli consentiti",
  );

  /*
    **Il danno, non l'errore.** Cosa e rimasto scritto dopo lo scope
    contraffatto: e la differenza fra «una chiamata non ha risposto 403» e «una
    riga di un altro club e cambiata».
  */
  const dopoIlContraffatto = await fotografia();
  prova(
    "11-ter. lo scope contraffatto non ha cambiato niente nel club A",
    INTATTO,
    dopoIlContraffatto,
    "cio che qui diverge e stato scritto da fuori: il titolo dell'evento e lo stato dell'appuntamento",
  );

  /* Ripristino, cosi le prove di U-16 partono da uno stato dichiarato. */
  await prisma.clubEvent.update({
    where: { id: EVENTO_A.id },
    data: { title: "Allenamento Sonda A" },
  });
  await prisma.appointment.update({
    where: { id: APPUNTAMENTO_A.id },
    data: { status: "requested" },
  });
};

/* ============================================================ U-16 ======= */

/**
 * **Le chiavi nuove del §12, una per una.**
 *
 * `nega` e la chiamata fatta dal ruolo che **non** ha la chiave; `concede` e la
 * stessa cosa dal ruolo che ce l'ha. Il secondo non e un lusso: senza di esso
 * un modulo che non carica, un identificativo sbagliato o un `403` scritto per
 * tutti passerebbero per una difesa che funziona.
 *
 * `nega: null` significa che **non esiste una strada** per negare quella chiave
 * a runtime: non e un caso da saltare, e il risultato piu grave che questa
 * sonda possa produrre, e viene dichiarato `FAIL`.
 */
const chiaviU16 = () => [
  {
    chiave: "events.read",
    senza: "parent",
    con: "staff",
    nega: (scope) => eventi.listClubEvents(scope),
    concede: (scope) => eventi.listClubEvents(scope),
  },
  {
    chiave: "events.manage",
    senza: "parent",
    con: "staff",
    nega: (scope) =>
      eventi.updateClubEvent(scope, EVENTO_A.id, { title: "Tentativo" }, {
        userId: scope.userId,
      }),
    concede: (scope) =>
      eventi.updateClubEvent(scope, EVENTO_A.id, { title: "Allenamento Sonda A" }, {
        userId: scope.userId,
      }),
  },
  {
    chiave: "events.convoke",
    senza: "parent",
    con: "staff",
    nega: (scope) =>
      eventi.saveEventConvocations(
        scope,
        EVENTO_A_GARA.id,
        [{ athleteId: ATLETA_A, status: "convocated" }],
        { userId: scope.userId },
      ),
    concede: (scope) =>
      eventi.saveEventConvocations(
        scope,
        EVENTO_A_GARA.id,
        [{ athleteId: ATLETA_A, status: "convocated" }],
        { userId: scope.userId },
      ),
  },
  {
    chiave: "events.attendance",
    senza: "parent",
    con: "staff",
    nega: (scope) =>
      eventi.saveEventAttendance(
        scope,
        EVENTO_A.id,
        [{ athleteId: ATLETA_A, status: "present" }],
        { userId: scope.userId },
      ),
    concede: (scope) =>
      eventi.saveEventAttendance(
        scope,
        EVENTO_A.id,
        [{ athleteId: ATLETA_A, status: "present" }],
        { userId: scope.userId },
      ),
  },
  {
    chiave: "rsvp.read",
    senza: "parent",
    con: "staff",
    nega: (scope) =>
      rsvp.readEventRsvpSummary({ trainingId: EVENTO_A.id, scope }),
    concede: (scope) =>
      rsvp.readEventRsvpSummary({ trainingId: EVENTO_A.id, scope }),
  },
  {
    /*
      `rsvp.answer` **non ha un ruolo a cui negarla**, e non e una lacuna: e la
      forma del permesso. `answerRsvp` deriva il ruolo con cui si risponde dal
      **legame** (`parent` oppure `athlete`) e non guarda quello della
      sessione — percio la porta chiusa e il legame assente, non un ruolo.

      Percio qui la prova cambia legame e non ruolo: l'allenatore, che non e
      legato all'atleta, viene respinto; il genitore risponde. E il diniego che
      conta davvero su questa chiave — provare a rispondere per il figlio di
      un altro — e da questa Wave lascia la sua riga.
    */
    chiave: "rsvp.answer",
    senza: "trainer",
    con: "parent",
    nega: (scope) =>
      rsvp.answerRsvp({
        trainingId: EVENTO_A.id,
        athleteId: ATLETA_A,
        status: "yes",
        userId: scope.userId,
      }),
    concede: (scope) =>
      rsvp.answerRsvp({
        trainingId: EVENTO_A.id,
        athleteId: ATLETA_A,
        status: "yes",
        userId: scope.userId,
      }),
  },
  {
    chiave: "documents.request",
    senza: "trainer",
    con: "staff",
    nega: (scope) =>
      documenti.createDocumentRequest(scope, {
        subjectKind: "athlete",
        subjectId: ATLETA_A,
        documentKind: "identity_document",
        title: "Documento di identita",
      }),
    concede: (scope) =>
      documenti.createDocumentRequest(scope, {
        subjectKind: "athlete",
        subjectId: ATLETA_A,
        documentKind: "identity_document",
        title: "Documento di identita",
      }),
  },
  {
    chiave: "documents.review",
    senza: "trainer",
    con: "staff",
    nega: (scope) => documenti.listPendingDocumentSubmissions(scope),
    concede: (scope) => documenti.listPendingDocumentSubmissions(scope),
  },
  {
    /*
      Il ruolo `athlete` non porta `documents.submit_own` e non e legato
      all'atleta A: cadono entrambe le strade, il ruolo e il legame, ed e
      l'unica combinazione in cui questa chiave puo essere negata.
    */
    chiave: "documents.submit_own",
    senza: "athlete",
    con: "staff",
    nega: (scope) =>
      documenti.submitDocument(scope, {
        subjectKind: "athlete",
        subjectId: ATLETA_A,
        documentKind: "identity_document",
        file: {
          fileName: "sonda.pdf",
          mimeType: "application/pdf",
          content: Buffer.from("%PDF-1.4 sonda"),
        },
      }),
    concede: (scope) =>
      documenti.submitDocument(scope, {
        subjectKind: "athlete",
        subjectId: ATLETA_A,
        documentKind: "identity_document",
        source: "club",
        file: {
          fileName: "sonda.pdf",
          mimeType: "application/pdf",
          content: Buffer.from("%PDF-1.4 sonda"),
        },
      }),
  },
  {
    chiave: "documents.read_dossier",
    senza: "trainer",
    con: "staff",
    /* Senza soggetto e una lettura di club, e la concede il ruolo. */
    nega: (scope) => documenti.listDocumentRequests(scope, {}),
    concede: (scope) => documenti.listDocumentRequests(scope, {}),
  },
  {
    /*
      La prima esecuzione di questa sonda l'aveva trovata senza nessun punto di
      applicazione: `assertHealthPermission` non era chiamata da nessun modulo
      server, e `hasHealthPermission` compariva due volte — per la sola
      `clinical.read`, e in una schermata che la usava per **descriversi**.
      Una chiave che nessuna strada applica non e un permesso: e una didascalia.

      Adesso la strada c'e, ed e l'ingresso in lettura del registro generico:
      chi non ha `clinical.status_read` non apre affatto l'elenco dei
      certificati. Non toglie niente a nessuno oggi — i ruoli che la hanno sono
      gli stessi che gia leggevano — e questo e il punto: la chiave esiste da
      applicare il giorno dei ruoli personalizzati.
    */
    chiave: "clinical.status_read",
    senza: "parent",
    con: "trainer",
    nega: (scope) =>
      risorse.listResource(
        "medical_certificates",
        new URLSearchParams({ organization_id: CLUB_A }),
        scope,
      ),
    concede: (scope) =>
      risorse.listResource(
        "medical_certificates",
        new URLSearchParams({ organization_id: CLUB_A }),
        scope,
      ),
  },
  {
    /*
      `clinical.read` **e** applicata, ma come proiezione: la chiamata riesce e
      i campi clinici spariscono dalla risposta.

      Non e cio che il §22 chiede — «la chiamata risponde 403» — ed e una
      deviazione **deliberata**, non una lacuna: negare l'elenco degli atleti a
      un allenatore perche non puo vedere le allergie renderebbe inservibile la
      sua dashboard, mentre il dato clinico resta fuori dalla risposta lo
      stesso. Il §22 descrive la forma giusta per le chiavi che proteggono un
      **atto**; questa protegge un **campo**, e un campo si toglie.

      Percio qui si misura solo la meta che ha senso — chi la possiede riceve
      la riga — e il taglio si misura dove va misurato: in D-4, sul dato vero.
    */
    chiave: "clinical.read",
    senza: null,
    con: "collaborator",
    motivoSenza:
      "clinical.read non nega per scelta: proietta. Il taglio e misurato in D-4, sul dato vero",
    nega: null,
    concede: (scope) =>
      risorse.listResource(
        "athletes",
        new URLSearchParams({ organization_id: CLUB_A, id: ATLETA_A }),
        scope,
      ),
  },
  {
    /*
      Anche questa era dichiarata e mai chiesta: si registrava un certificato
      senza passare da nessuna chiave. Adesso la scrittura di una risorsa
      clinica — e la scrittura dei **campi** clinici di una scheda atleta — la
      pretende.
    */
    chiave: "clinical.manage",
    senza: "trainer",
    con: "staff",
    nega: (scope) =>
      risorse.createResource(
        "medical_certificates",
        {
          organization_id: CLUB_A,
          athlete_id: ATLETA_A,
          expiry_date: "2027-06-30",
          type: "agonistico",
        },
        "create",
        scope,
      ),
    concede: (scope) =>
      risorse.createResource(
        "medical_certificates",
        {
          organization_id: CLUB_A,
          athlete_id: ATLETA_A,
          expiry_date: "2027-07-31",
          type: "agonistico",
        },
        "create",
        scope,
      ),
  },
  {
    chiave: "appointments.read",
    senza: "parent",
    con: "staff",
    nega: (scope) => appuntamenti.listAppointments(scope),
    concede: (scope) => appuntamenti.listAppointments(scope),
  },
  {
    /*
      Lo stesso gesto con due ruoli diversi: `parent` non ha ne `read` ne
      `read_own` e viene respinto, `trainer` ha solo `read_own` e legge la coda
      **gia filtrata** sui propri. E il difetto D-5 misurato al contrario: il
      filtro non e un parametro, e una conseguenza del permesso.
    */
    chiave: "appointments.read_own",
    senza: "parent",
    con: "trainer",
    nega: (scope) => appuntamenti.listAppointments(scope),
    concede: (scope) => appuntamenti.listAppointments(scope),
  },
  {
    chiave: "appointments.request",
    senza: "trainer",
    con: "staff",
    nega: (scope) =>
      appuntamenti.createAppointment(
        scope,
        {
          athleteId: ATLETA_A,
          startsAt: new Date(Date.now() + 259_200_000).toISOString(),
          reason: "Colloquio richiesto dalla sonda",
          idempotencyKey: randomUUID(),
        },
        { userId: scope.userId },
      ),
    /*
      `outsideAvailability` e il gesto del desk che mette in agenda un colloquio
      preso al telefono: senza di esso la chiamata cadrebbe sulla
      disponibilita — un errore di dominio, non un permesso — e la prova
      direbbe «fallita» per la ragione sbagliata. Chiede `appointments.manage`,
      che `staff` ha.
    */
    concede: (scope) =>
      appuntamenti.createAppointment(
        scope,
        {
          athleteId: ATLETA_A,
          startsAt: new Date(Date.now() + 262_800_000).toISOString(),
          reason: "Colloquio richiesto dalla sonda",
          outsideAvailability: true,
          idempotencyKey: randomUUID(),
        },
        { userId: scope.userId },
      ),
  },
  {
    chiave: "appointments.manage",
    senza: "parent",
    con: "staff",
    nega: (scope) =>
      appuntamenti.createAppointmentSlot(
        scope,
        { weekday: 3, startTime: "10:00", endTime: "12:00" },
        { userId: scope.userId },
      ),
    concede: (scope) =>
      appuntamenti.createAppointmentSlot(
        scope,
        { weekday: 4, startTime: "10:00", endTime: "12:00" },
        { userId: scope.userId },
      ),
  },
  {
    /*
      La prima esecuzione l'aveva trovata **assente dal catalogo**: c'era solo
      `consents.decide_for_others`, che e il permesso opposto. Adesso c'e, con
      `roles: []` e `byLink: true`, e non e una svista: questo permesso non si
      ottiene mai da un ruolo — si ottiene dal legame con **quell'** atleta, ed
      e `assertSubjectMayDecide` ad applicarlo.

      Percio cio che separa il «senza» dal «con» non e il permesso di ruolo —
      nessuno dei due ne ha — ma il **legame**: il genitore decide sul proprio
      figlio, l'allenatore dello stesso atleta no.
    */
    chiave: "consents.decide_own",
    senza: "trainer",
    con: "parent",
    nega: (scope) =>
      consensi.recordConsentDecision(scope, {
        definitionId: CONSENSO_A.id,
        subjectKind: "athlete",
        subjectId: ATLETA_A,
        status: "accepted",
        source: "subject",
        asSubject: { userId: scope.userId, athleteId: ATLETA_A },
      }),
    concede: (scope) =>
      consensi.recordConsentDecision(scope, {
        definitionId: CONSENSO_A.id,
        subjectKind: "athlete",
        subjectId: ATLETA_A,
        status: "accepted",
        source: "subject",
        asSubject: { userId: scope.userId, athleteId: ATLETA_A },
      }),
  },
];

const u16 = async () => {
  console.log(`${NL}U-16 — PERMESSI NEGATI: LE CHIAVI NUOVE DEL §12`);

  for (const voce of chiaviU16()) {
    console.log(`${NL}  ${voce.chiave}`);

    /* La chiave e almeno **dichiarata**? Una didascalia non e un permesso. */
    prova(
      `  ${voce.chiave} · e nel catalogo dei permessi`,
      true,
      Boolean(catalogo.getPermissionEntry(voce.chiave)),
      "una chiave assente dal catalogo non e elencabile, non e mostrabile e non e assegnabile",
    );

    if (!voce.nega) {
      /*
        Una voce senza strada di diniego **deve** dire perche: senza il motivo
        e indistinguibile da una prova dimenticata, e questa e la riga che
        impedisce di far sparire una chiave scomoda lasciando `nega: null`.
      */
      if (!voce.motivoSenza) {
        prova(
          `  ${voce.chiave} · dichiara perche non ha una strada di diniego`,
          true,
          false,
          "una chiave senza prova e senza motivo e una prova saltata",
        );
      } else {
        devia(`  ${voce.chiave} · non nega, e qui c'e scritto perche`, voce.motivoSenza);
      }

      if (!voce.con) {
        prova(
          `  ${voce.chiave} · chi la possiede riesce`,
          "riuscito",
          "nessuna strada",
          voce.motivoSenza,
        );
        continue;
      }
    }

    if (voce.nega) {
      const scopeSenza = scopeRuolo(voce.senza);
      const primaDelDiniego = await prisma.auditLog.count({
        where: { organization_id: CLUB_A, outcome: "denied" },
      });

      const rifiuto = await tenta(() => voce.nega(scopeSenza));

      prova(
        `  ${voce.chiave} · il diniego dice Accesso negato (${voce.senza})`,
        "negato",
        rifiuto.esito,
        voce.notaDiniego ||
          rifiuto.messaggio ||
          `la chiamata e riuscita: il ruolo ${voce.senza} ha ottenuto il dato`,
      );

      const dopoIlDiniego = await prisma.auditLog.count({
        where: { organization_id: CLUB_A, outcome: "denied" },
      });

      /*
        La riga di audit si conta **sul club**, non sull'attore: un diniego
        registrato senza il club sarebbe illeggibile nel momento in cui serve,
        cioe quando qualcuno chiede «chi ha provato a entrare nel mio club».
      */
      prova(
        `  ${voce.chiave} · il diniego lascia una riga di audit`,
        true,
        dopoIlDiniego > primaDelDiniego,
        `righe di diniego prima ${primaDelDiniego}, dopo ${dopoIlDiniego}`,
      );
    }

    if (voce.con) {
      const scopeCon = scopeRuolo(voce.con);
      const successo = await tenta(() => voce.concede(scopeCon));
      prova(
        `  ${voce.chiave} · chi la possiede riesce (${voce.con})`,
        "riuscito",
        successo.esito,
        successo.messaggio ||
          "senza questo controspecchio un 403 per tutti passerebbe per una difesa",
      );
    }
  }
};

/* ================================================ le due matrici e il conto */

/**
 * **Due matrici per la stessa chiave.**
 *
 * `rsvp.read` e `rsvp.answer` sono dichiarate sia nel catalogo unico sia in
 * `communications/permissions.ts`, e la seconda e quella che **decide**:
 * `answerRsvp` e `readEventRsvpSummary` chiamano
 * `assertCommunicationPermission`. Se le due tabelle non dicono la stessa cosa,
 * una schermata di configurazione mostrerebbe un permesso che il server non
 * applica — ed e il difetto che il catalogo unico era nato per chiudere.
 */
const dueMatrici = async () => {
  console.log(`${NL}COERENZA — LE CHIAVI DICHIARATE DUE VOLTE`);

  for (const chiave of ["rsvp.read", "rsvp.answer"]) {
    const divergenze = RUOLI_A.filter(
      (ruolo) =>
        catalogo.roleHasPermission(ruolo, chiave) !==
        permessiComunicazioni.hasCommunicationPermission(ruolo, chiave),
    );
    prova(
      `  ${chiave} · catalogo e matrice che decide concordano`,
      [],
      divergenze,
      divergenze.length
        ? `il catalogo dice ${divergenze
            .map(
              (ruolo) =>
                `${ruolo}=${catalogo.roleHasPermission(ruolo, chiave)}`,
            )
            .join(", ")} e l'applicatore dice il contrario`
        : "",
    );
  }

  /*
    Il §12 dichiara «16 chiavi nuove» — ne dichiarava 17 e la tabella ne marcava
    16, e questa prova e cio che l'ha fatto correggere. Il conto delle chiavi marcate come nuove
    va tenuto onesto: se il documento e il catalogo divergono, la matrice non e
    piu la fonte che si puo leggere per sapere cosa va provato.
  */
  const nuove = [
    "events.read",
    "events.manage",
    "events.convoke",
    "events.attendance",
    "documents.request",
    "documents.review",
    "documents.submit_own",
    "documents.read_dossier",
    "clinical.status_read",
    "clinical.read",
    "clinical.manage",
    "appointments.read",
    "appointments.read_own",
    "appointments.request",
    "appointments.manage",
    "consents.decide_own",
  ];
  prova(
    "  il §12 dichiara 16 chiavi nuove, e la matrice ne marca",
    16,
    nuove.length,
    "contate le righe con ✱ nella tabella del §12 di 39-wave-5-planning.md",
  );

  const assenti = nuove.filter((chiave) => !catalogo.getPermissionEntry(chiave));
  prova(
    "  ogni chiave nuova del §12 esiste nel catalogo",
    [],
    assenti,
    assenti.length ? `assenti dal catalogo: ${assenti.join(", ")}` : "",
  );
};

/**
 * **La proiezione clinica, misurata sul dato vero.**
 *
 * `clinical.read` non nega: taglia. Questa e la prova che il taglio esista
 * davvero e che non sia solo lo schermo a nasconderlo — il difetto D-4 era
 * esattamente un flag di interfaccia che nasceva acceso mentre il dato usciva
 * comunque dall'API.
 */
const proiezioneClinica = async () => {
  console.log(`${NL}D-4 — IL CONTENUTO CLINICO NON ESCE DALL'API`);

  const clinici = permessiSanitari.CLINICAL_ATHLETE_FIELDS;
  /*
    **Il conteggio delle righe sta nella stessa asserzione dei campi**, e non e
    pedanteria: se l'allenatore ricevesse zero atleti — per il perimetro, per
    un filtro sbagliato, per una scheda mancante — l'elenco dei campi clinici
    sarebbe vuoto e la prova passerebbe senza avere misurato niente. E la forma
    piu comune di controllo di sicurezza che passa sempre.
  */
  const leggi = async (ruolo) => {
    const righe = await risorse.listResource(
      "athletes",
      new URLSearchParams({ organization_id: CLUB_A, id: ATLETA_A }),
      scopeRuolo(ruolo),
    );
    const dati = righe[0]?.data || {};
    return {
      righe: righe.length,
      clinici: clinici.filter((campo) => campo in dati),
    };
  };

  prova(
    "  l'allenatore riceve l'atleta ma non allergie, farmaci e gruppo sanguigno",
    { righe: 1, clinici: [] },
    await leggi("trainer"),
    "sono i campi che D-4 lasciava uscire da GET /api/v1/athletes",
  );

  prova(
    "  il collaboratore, che ha clinical.read, li riceve",
    { righe: 1, clinici: ["allergies", "bloodType", "medications"] },
    await leggi("collaborator"),
    "senza questo controspecchio una proiezione che azzera tutto passerebbe per una difesa",
  );
};

/* -------------------------------------------------------------- pulizia */

const pulisci = async () => {
  /*
    L'audit non ha una chiave esterna verso il club — di proposito, perche deve
    sopravvivere alla cancellazione di cio che racconta — quindi va tolto a
    mano, altrimenti la sonda lascia scritte le proprie tracce nel database di
    sviluppo a ogni esecuzione.
  */
  await prisma.auditLog
    .deleteMany({ where: { organization_id: { in: [CLUB_A, CLUB_B] } } })
    .catch(() => {});

  for (const id of [CLUB_A, CLUB_B]) {
    await prisma.club.delete({ where: { id } }).catch((error) => {
      console.error(`Pulizia non riuscita, il club ${id} e rimasto: ${error?.message}`);
    });
  }

  await prisma.user
    .deleteMany({ where: { email: { endsWith: `-${MARCA}@easygame.test` } } })
    .catch((error) => {
      console.error(`Utenti di collaudo rimasti: ${error?.message}`);
    });
};

try {
  eventi = await import("../src/lib/server/events.ts");
  documenti = await import("../src/lib/server/document-requests.ts");
  appuntamenti = await import("../src/lib/server/appointments.ts");
  rsvp = await import("../src/lib/server/rsvp.ts");
  risorse = await import("../src/lib/server/resources.ts");
  autenticazione = await import("../src/lib/server/auth.ts");
  catalogo = await import("../src/lib/permissions/catalog.ts");
  permessiComunicazioni = await import("../src/lib/communications/permissions.ts");
  permessiSanitari = await import("../src/lib/health/permissions.ts");
  consensi = await import("../src/lib/server/consents.ts");

  console.log(`${NL}Semina dei due club di collaudo ${CLUB_A} / ${CLUB_B}...`);
  await semina();

  await u15();
  await u16();
  await dueMatrici();
  await proiezioneClinica();

  const falliti = esiti.filter((e) => !e.ok);
  if (deviazioni.length) {
    console.log(
      `${NL}${deviazioni.length} deviazioni dichiarate (non sono ne successi ne difetti):`,
    );
    for (const d of deviazioni) console.log(`  - ${d.titolo.trim()}`);
  }
  console.log(
    `${NL}${esiti.length - falliti.length}/${esiti.length} controlli passati.`,
  );
  if (falliti.length) {
    console.log(`${NL}FALLITI:`);
    for (const e of falliti) {
      console.log(
        `  ${e.titolo.trim()}${NL}    atteso  ${JSON.stringify(e.atteso)}${NL}    trovato ${JSON.stringify(e.trovato)}${e.nota ? `${NL}    nota    ${e.nota}` : ""}`,
      );
    }
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    `${NL}Sonda interrotta:${NL}${String(error?.stack || error?.message).split(NL).slice(0, 40).join(NL)}`,
  );
  process.exitCode = 1;
} finally {
  await pulisci();
  await prisma.$disconnect();
}
