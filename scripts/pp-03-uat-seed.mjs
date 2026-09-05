/**
 * **Il club di collaudo per la UAT a schermo dell'allenatore.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs scripts/pp-03-uat-seed.mjs
 *
 * ---
 *
 * ## Perche esiste
 *
 * Le sonde di PP-03 attaccano le rotte e non aprono nessuna schermata. La
 * verifica di responsivita chiesta dal mandato — **375 / 768 / 1280 / 1440 px**
 * — si fa invece con un browser e una sessione vera, e per averla serve un club
 * con dentro qualcosa: se le pagine sono vuote non si misura niente, perche una
 * tabella senza righe non trabocca mai.
 *
 * Semina quindi un club **pieno abbastanza da fare male**: nomi lunghi,
 * categorie con etichette che non stanno su una riga, atleti a sufficienza da
 * far scorrere l'elenco, allenamenti passati **con l'appello gia fatto** e
 * futuri, una gara con le convocazioni, avvisi in bacheca, un appuntamento e
 * qualche notifica.
 *
 * ## Le due utenze
 *
 * | Ruolo | Email | Password |
 * |---|---|---|
 * | Proprietario | `pp03-uat-presidente@example.invalid` | `CollaudoPP03!` |
 * | Allenatore (solo Under 15) | `pp03-uat-mister@example.invalid` | `CollaudoPP03!` |
 *
 * L'allenatore ha **una sola** categoria nella scheda dentro `clubs.trainers`:
 * e il perimetro, e serve a vedere a schermo che l'elenco atleti e il
 * calendario si fermano dove devono.
 *
 * Rieseguirlo **rifa da capo** il proprio club (slug `pp03-uat`) e lascia stare
 * tutto il resto del database.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("Rifiuto: serve EASYGAME_DB_ENV=development.");
  process.exit(1);
}

const prisma = new PrismaClient();

const SLUG = "pp03-uat";
const PASSWORD = "CollaudoPP03!";

const CAT_U15 = "cat-pp03uat-u15";
const CAT_U17 = "cat-pp03uat-u17";
const CAT_PRIMA = "cat-pp03uat-prima";
const SEDE_NORD = "sede-pp03uat-nord";
const SEDE_SUD = "sede-pp03uat-sud";
const STRUTTURA = "struttura-pp03uat-1";

const giorno = (delta) => {
  const data = new Date();
  data.setHours(0, 0, 0, 0);
  data.setDate(data.getDate() + delta);
  return data;
};

const iso = (data) => data.toISOString().slice(0, 10);

const utente = async (email, first_name, last_name) => {
  const password_hash = await bcrypt.hash(PASSWORD, 10);
  const esistente = await prisma.user.findUnique({ where: { email } });
  if (esistente) {
    return prisma.user.update({
      where: { id: esistente.id },
      data: { password_hash, first_name, last_name, email_verified_at: new Date() },
    });
  }
  return prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      first_name,
      last_name,
      password_hash,
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

/**
 * Venti atleti, dieci per categoria, con **nomi lunghi**: un elenco di «Rossi
 * Marco» non trova mai il punto in cui la colonna trabocca.
 */
const NOMI = [
  ["Alessandro", "Della Valle Buonocore"],
  ["Benedetta", "Sciarrillo Mastrogiovanni"],
  ["Cristiano", "Rapisarda Lo Giudice"],
  ["Daniela", "Fontanarosa Di Bartolomeo"],
  ["Emanuele", "Castagnaviz Pellegrini"],
  ["Federica", "Montecchiari Salvadori"],
  ["Gianmarco", "Squarcialupi Bonaventura"],
  ["Helena", "Vanderbeken Scognamiglio"],
  ["Iacopo", "Malaspina Della Rovere"],
  ["Ludovica", "Fiorentino Barracchia"],
];

const risorse = await import(
  pathToFileURL(path.resolve("src/lib/server/resources.ts")).href,
);
const CATEGORIE = [
  { id: CAT_U15, name: "Under 15 maschile — girone provinciale B" },
  { id: CAT_U17, name: "Under 17 femminile — girone regionale" },
  { id: CAT_PRIMA, name: "Prima squadra — serie C silver" },
];

const SEDI = [
  { id: SEDE_NORD, name: "Palestra comunale di via dei Tigli", active: true },
  { id: SEDE_SUD, name: "Centro sportivo Sud", active: true },
];

const STRUTTURE = [
  {
    id: STRUTTURA,
    name: "Palestra comunale di via dei Tigli — campo 1",
    siteId: SEDE_NORD,
    fields: [{ id: "campo-1", name: "Campo 1" }],
  },
];

const eventi_dominio = await import(
  pathToFileURL(path.resolve("src/lib/server/events.ts")).href,
);

const appuntamenti_dominio = await import(
  pathToFileURL(path.resolve("src/lib/server/appointments.ts")).href,
);

const lavoro_sportivo = await import(
  pathToFileURL(path.resolve("src/lib/server/sport-work.ts")).href,
);

const main = async () => {
  const presidente = await utente(
    "pp03-uat-presidente@example.invalid",
    "Annamaria",
    "Presidente",
  );
  const mister = await utente(
    "pp03-uat-mister@example.invalid",
    "Gianfranco",
    "Allenatore",
  );

  const vecchio = await prisma.club.findUnique({ where: { slug: SLUG } });
  if (vecchio) {
    await prisma.auditLog
      .deleteMany({ where: { organization_id: vecchio.id } })
      .catch(() => {});
    await prisma.club.delete({ where: { id: vecchio.id } });
  }

  /*
    **L'identificativo del club e fisso.**

    Con un `randomUUID()` ogni riesecuzione dava un club nuovo, e la sessione
    aperta nel browser restava appesa a quello vecchio: la verifica di
    responsivita si interrompeva a ogni ritocco del seed per rifare
    «Home account → entra nel club». Lo slug e gia unico e il club viene
    comunque cancellato e rifatto: un identificativo stabile non cambia cosa
    fa il seed, cambia solo quante volte bisogna ricominciare a guardarlo.
  */
  const CLUB = "3ff03a11-0000-4000-8000-000000000001";

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: SLUG,
      name: "A.S.D. Polisportiva Collaudo Responsivita",
      creator_id: presidente.id,
      settings: {
        seasons: [
          {
            id: "2026-27",
            label: "2026/27",
            startDate: "2026-07-01",
            endDate: "2027-06-30",
            status: "active",
          },
        ],
      },
      categories: CATEGORIE,
      club_sites: SEDI,
      structures: STRUTTURE,
      category_groups: [],
      trainers: [],
      staff_members: [],
      matches: [],
      trainings: [],
    },
  });

  /*
    **La scheda dell'allenatore passa da `resources.ts`, non da Prisma.**

    La prima stesura la scriveva dentro `clubs.trainers` con la `create` del
    club, e a schermo compariva «Profilo allenatore non collegato»: il
    contesto della dashboard legge `GET /api/v1/trainers`, che serve
    `club_resource_items`, e quella riga non esisteva. E letteralmente
    l'errore n. 3 di CLAUDE.md §11 — scrivere `clubs.<campo>` aggirando
    `resources.ts` disallinea `club_resource_items` — colto da un seed invece
    che da un utente.
  */
  await risorse.replaceClubResourceCollections(CLUB, [
    {
      resource_type: "trainers",
      items: [
        {
          id: "trainer-pp03uat-1",
          first_name: "Gianfranco",
          last_name: "Allenatore",
          email: mister.email,
          linkedUserId: mister.id,
          /* Il perimetro: **una sola** categoria. */
          categories: [CAT_U15],
          groups: [],
          role: "Allenatore",
        },
      ],
    },
    /*
      Categorie, sedi e strutture passano di qui **anche loro**, e non solo la
      scheda dell'allenatore. Scritte nella sola colonna JSON del club, il
      registro generico non le trovava: l'allenatore riceveva `[]` da
      `/api/v1/categories` e a schermo compariva l'**identificativo** della
      categoria al posto del nome, ovunque servisse un'etichetta.
    */
    { resource_type: "categories", items: CATEGORIE },
    { resource_type: "club_sites", items: SEDI },
    /*
      **Le note della segreteria, con il loro canarino.**

      Il riquadro «Note della segreteria» della bacheca legge
      `GET /api/v1/secretariat_notes` e le passa per
      `isReminderVisibleToTrainer`. Senza righe non si vede ne che il vaglio
      funziona ne quanto e larga una nota lunga: qui ce ne sono tre, e la
      terza — `club_dashboard` — **non deve comparire**. E il canarino della
      correzione §1 del verbale, letto a schermo invece che da una sonda.
    */
    {
      resource_type: "secretariat_notes",
      items: [
        {
          id: "nota-pp03uat-tutti",
          content: "Riconsegnare i moduli di iscrizione firmati entro venerdi in segreteria, insieme alla copia del documento di chi accompagna in trasferta.",
          targetType: "all_trainers",
          expiryDate: iso(giorno(3)),
        },
        {
          id: "nota-pp03uat-mio",
          content: "Gianfranco, la palestra di via dei Tigli e occupata giovedi: l'allenamento dell'Under 15 si sposta al Centro sportivo Sud.",
          targetType: "trainer",
          targetId: "trainer-pp03uat-1",
          targetLabel: "Gianfranco Allenatore",
          expiryDate: iso(giorno(1)),
        },
        {
          id: "nota-pp03uat-canarino",
          content: "CANARINO: promemoria interno della direzione, non deve comparire nella bacheca dell'allenatore.",
          targetType: "club_dashboard",
          expiryDate: iso(giorno(2)),
        },
      ],
    },
  ]);

  await prisma.organizationUser.createMany({
    data: [
      {
        id: randomUUID(),
        organization_id: CLUB,
        user_id: presidente.id,
        role: "owner",
        is_primary: true,
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB,
        user_id: mister.id,
        role: "trainer",
        is_primary: true,
        updated_at: new Date(),
      },
    ],
  });

  const atleti = [];
  for (let indice = 0; indice < 20; indice += 1) {
    const [nome, cognome] = NOMI[indice % NOMI.length];
    const categoria = indice % 2 === 0 ? CAT_U15 : CAT_U17;
    atleti.push({
      id: randomUUID(),
      organization_id: CLUB,
      first_name: nome,
      last_name: `${cognome}${indice >= NOMI.length ? " jr." : ""}`,
      category_id: categoria,
      status: "active",
      birth_date: new Date(2010 - (indice % 4), (indice % 12) + 1, 12),
      data: {
        categoryIds: [categoria],
        siteId: indice % 3 === 0 ? SEDE_SUD : SEDE_NORD,
        /*
          **La chiave e `medicalCertExpiry`**, non un suo sinonimo: e quella
          che `getAthleteMedicalExpiry` legge in `trainer-dashboard-shared.tsx`,
          quindi l'unica che a schermo diventa una data. Con il nome sbagliato
          la colonna «Certificato Medico» mostrava un trattino per tutti e
          venti, e una colonna sempre vuota non misura ne la larghezza ne il
          permesso sanitario.
        */
        medicalCertExpiry: iso(giorno(indice * 7 - 30)),
        allergies: "arachidi",
        bloodType: "0+",
        medicalNotes: "riservato: non deve uscire verso l'allenatore",
      },
      updated_at: new Date(),
    });
  }
  await prisma.athlete.createMany({ data: atleti });

  const eventi = [
    {
      titolo: "Allenamento congiunto Under 15 + Under 17",
      quando: giorno(-3),
      categorie: [CAT_U15, CAT_U17],
      tipo: "training",
    },
    {
      titolo: "Allenamento tecnico Under 15",
      quando: giorno(-1),
      categorie: [CAT_U15],
      tipo: "training",
    },
    {
      titolo: "Allenamento atletico Under 15",
      quando: giorno(1),
      categorie: [CAT_U15],
      tipo: "training",
    },
    {
      titolo: "Allenamento Prima squadra (fuori perimetro dell'allenatore)",
      quando: giorno(2),
      categorie: [CAT_PRIMA],
      tipo: "training",
    },
    {
      titolo: "Gara di campionato contro Polisportiva Sant'Antonio Abate",
      quando: giorno(5),
      categorie: [CAT_U15],
      tipo: "match",
    },
  ];

  /*
    **Gli eventi passano dal dominio, non da Prisma.** `clubs.trainings` e
    `clubs.matches` sono una proiezione in sola lettura con un solo scrittore
    (ADR-0098): un seed che scrivesse `club_events` a mano lascerebbe le due
    colonne indietro, e la schermata che le legge mostrerebbe un club vuoto.
  */
  const owner = {
    userId: presidente.id,
    activeOrganizationId: CLUB,
    activeRole: "owner",
    activeMembershipId: null,
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };
  const attore = { userId: presidente.id, email: presidente.email };

  for (const evento of eventi) {
    const riga = await eventi_dominio.createClubEvent(owner, evento.tipo, {
      id: `pp03uat-${randomUUID().slice(0, 8)}`,
      title: evento.titolo,
      date: iso(evento.quando),
      time: "18:30",
      endTime: "20:00",
      categoryId: evento.categorie[0],
      categories: evento.categorie,
      siteId: SEDE_NORD,
      opponent: evento.tipo === "match" ? "Polisportiva Sant'Antonio Abate" : undefined,
    });

    const dentro = atleti.filter((atleta) =>
      evento.categorie.includes(atleta.category_id),
    );

    /* L'appello gia fatto sugli allenamenti passati: e cio che rende
       osservabile lo stato «concluso» e il congelamento dei campi (ADR-0112). */
    if (evento.quando < new Date()) {
      await eventi_dominio.saveEventAttendance(
        owner,
        riga.id,
        dentro.slice(0, 8).map((atleta, indice) => ({
          athleteId: atleta.id,
          status: indice % 4 === 0 ? "absent" : "present",
        })),
        attore,
      );
    } else if (evento.tipo === "match") {
      await eventi_dominio.saveEventConvocations(
        owner,
        riga.id,
        dentro.slice(0, 10).map((atleta) => ({ athleteId: atleta.id })),
        attore,
      );
    }
  }

  /*
    **Gli appuntamenti assegnati all'allenatore.**

    `listAppointments` per chi non ha `appointments.read` filtra su
    `assigned_to_user_id = <chi chiede>`: senza una riga assegnata a lui la
    pagina resta sull'insieme vuoto, che e proprio la forma che non fa
    traboccare niente. Uno confermato e uno ancora da confermare, cosi si
    vedono a schermo i due stati e i comandi che li accompagnano.
  */
  for (const appuntamento of [
    {
      giorni: 2,
      ora: "17:00",
      motivo:
        "Colloquio con la famiglia di Alessandro Della Valle Buonocore sul rientro dopo l'infortunio",
      confermato: true,
    },
    {
      giorni: 6,
      ora: "19:15",
      motivo: "Riunione tecnica di categoria e consegna del programma mensile",
      confermato: false,
    },
  ]) {
    await appuntamenti_dominio.createAppointment(
      owner,
      {
        assignedToUserId: mister.id,
        siteId: SEDE_NORD,
        date: iso(giorno(appuntamento.giorni)),
        time: appuntamento.ora,
        durationMinutes: 45,
        reason: appuntamento.motivo,
        confirmed: appuntamento.confermato,
        outsideAvailability: true,
      },
      attore,
    );
  }

  /*
    **Il rapporto di lavoro sportivo dell'allenatore.**

    `readOwnCompensationStatement` riconosce la persona del registro dalla
    coppia `origin_type` + `origin_id`, che qui e la scheda dentro
    `clubs.trainers`. Senza questa parte la pagina «I miei compensi» dice —
    correttamente — «Nessun compenso registrato», e la tabella delle rate, che
    porta un `min-w-[560px]` dentro un contenitore scorrevole, non viene mai
    disegnata: cioe l'unico punto della dashboard allenatore in cui la
    larghezza minima e dichiarata a mano resta **non misurato**.

    Il piano e mensile su dieci mesi: dieci righe bastano a far scorrere la
    tabella e a riempire il riepilogo.
  */
  const persona_compensi = await lavoro_sportivo.createSportWorkPerson(
    {
      organizationId: CLUB,
      originType: "trainer",
      originId: "trainer-pp03uat-1",
      firstName: "Gianfranco",
      lastName: "Allenatore",
      email: mister.email,
      fiscalProfile: "AMATEUR",
    },
    owner,
  );

  const rapporto = await lavoro_sportivo.createRelationship(
    {
      personId: persona_compensi.id,
      seasonId: "2026-27",
      /*
        `role` e `relationshipType` sono **vocabolari**, non testo libero:
        `normalizeRole` ricade su `OTHER` e `normalizeRelationshipType` su
        `SPORT_COCOCO` davanti a un valore che non riconosce. La prima stesura
        scriveva la qualifica per esteso e a schermo compariva «OTHER».
      */
      role: "COACH",
      relationshipType: "SPORT_COCOCO",
      startDate: "2026-09-01",
      endDate: "2027-06-30",
      contractAmount: 4800,
      compensationFrequency: "MONTHLY",
      weeklyHours: 6,
    },
    owner,
  );

  await lavoro_sportivo.saveCompensationPlan(
    {
      relationshipId: rapporto.id,
      kind: "MONTHLY",
      monthlyAmount: 480,
      startMonth: "2026-09",
      endMonth: "2027-06",
      dueDayOfMonth: 10,
    },
    owner,
  );

  console.log("");
  console.log("  Club di collaudo PP-03 seminato.");
  console.log(`  slug: ${SLUG}   id: ${CLUB}`);
  console.log("");
  console.log("  Proprietario  pp03-uat-presidente@example.invalid");
  console.log("  Allenatore    pp03-uat-mister@example.invalid");
  console.log(`  Password      ${PASSWORD}`);
  console.log("");
};

main()
  .catch((errore) => {
    console.error(errore);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
