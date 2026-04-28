import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  Access,
  Athlete,
  Club,
  ClubCategorySummary,
  Match,
  Task,
  Training,
  User,
} from "./api";
import {
  DEFAULT_TRAINER_DASHBOARD_PERMISSIONS,
  TrainerDashboardPermissions,
  resolveTrainerDashboardPermissions,
} from "@/lib/trainer-permissions";

const KEYS = {
  schemaVersion: "@easygame/mobile/schema-version",
  user: "@easygame/mobile/user",
  clubs: "@easygame/mobile/clubs",
  accesses: "@easygame/mobile/accesses",
  athletes: "@easygame/mobile/athletes",
  trainings: "@easygame/mobile/trainings",
  matches: "@easygame/mobile/matches",
  tasks: "@easygame/mobile/tasks",
  tokens: "@easygame/mobile/tokens",
  currentContext: "@easygame/mobile/current-context",
  isLoggedIn: "@easygame/mobile/is-logged-in",
  serverUrl: "@easygame/mobile/server-url",
} as const;

const SCHEMA_VERSION = "easygame-mobile-v2-account-trainer";

type CurrentContext = {
  clubId: string;
  role: string;
  accessId?: string | null;
  source?: "owned" | "assigned" | null;
};

type CreateClubInput = {
  name: string;
  city?: string;
  province?: string;
  contactEmail?: string;
  contactPhone?: string;
  logoUrl?: string;
};

type AccessTokenRecord = {
  token: string;
  access: Access;
};

const FULL_ACCESS_PERMISSIONS: TrainerDashboardPermissions = {
  navigation: {
    home: true,
    trainings: true,
    matches: true,
    athletes: true,
    categories: true,
  },
  widgets: {
    summary: true,
    todayTrainings: true,
    todayMatches: true,
    assignedAthletes: true,
    assignedCategories: true,
  },
  actions: {
    viewTrainingDetails: true,
    manageAttendance: true,
    manageTrainingStatus: true,
    viewMatchDetails: true,
    manageConvocations: true,
    viewAthleteDetails: true,
    viewAthleteTechnicalSheet: true,
    viewAthleteContacts: true,
    viewMedicalStatus: true,
    viewEnrollmentAndPayments: true,
  },
};

const MOCK_USER: User = {
  id: "user-marco-cappuccia",
  email: "marco@easygame.it",
  name: "Marco Cappuccia",
  phone: "+39 333 2456789",
  city: "Scauri",
  roleLabel: "Account EasyGame",
};

const FORTITUDO_CATEGORIES: ClubCategorySummary[] = [
  {
    id: "cat-forti-mini-2018",
    name: "Mini Basket 2018/2019",
    birthYearsLabel: "2018-2019",
    athleteCount: 14,
    trainerNames: ["Davide Russo"],
  },
  {
    id: "cat-forti-aquilotti-2016",
    name: "Aquilotti 2016/2017",
    birthYearsLabel: "2016-2017",
    athleteCount: 18,
    trainerNames: ["Andrea Esposito"],
  },
  {
    id: "cat-forti-esordienti-2014",
    name: "Esordienti 2014/2015",
    birthYearsLabel: "2014-2015",
    athleteCount: 20,
    trainerNames: ["Andrea Esposito", "Luca Iuliano"],
  },
];

const MINTURNO_CATEGORIES: ClubCategorySummary[] = [
  {
    id: "cat-minturno-pulcini-2015",
    name: "Pulcini Elite 2015/2016",
    birthYearsLabel: "2015-2016",
    athleteCount: 16,
    trainerNames: ["Marco Cappuccia"],
  },
  {
    id: "cat-minturno-esordienti-2013",
    name: "Esordienti 2013/2014",
    birthYearsLabel: "2013-2014",
    athleteCount: 18,
    trainerNames: ["Marco Cappuccia", "Gabriele Serra"],
  },
  {
    id: "cat-minturno-giovanissimi-2011",
    name: "Giovanissimi 2011/2012",
    birthYearsLabel: "2011-2012",
    athleteCount: 21,
    trainerNames: ["Paolo Villa"],
  },
];

const MOCK_CLUBS: Club[] = [
  {
    id: "club-fortitudo-scauri",
    name: "Fortitudo Scauri",
    categories: FORTITUDO_CATEGORIES.map((item) => item.name),
    categoryItems: FORTITUDO_CATEGORIES,
    city: "Scauri",
    province: "LT",
    ownerLabel: "Proprietario",
    slotsUsed: 2,
    slotsTotal: 5,
    contactEmail: "fortitudo@easygame.it",
    contactPhone: "+39 0771 652300",
    accentColor: "#2563EB",
    surfaceColor: "#EFF6FF",
  },
  {
    id: "club-easygame-lab",
    name: "EasyGame Lab",
    categories: ["Academy U12", "Academy U14"],
    categoryItems: [
      {
        id: "cat-lab-u12",
        name: "Academy U12",
        birthYearsLabel: "2014-2015",
        athleteCount: 12,
        trainerNames: ["Marco Cappuccia"],
      },
      {
        id: "cat-lab-u14",
        name: "Academy U14",
        birthYearsLabel: "2012-2013",
        athleteCount: 11,
        trainerNames: ["Luca Conti"],
      },
    ],
    city: "Formia",
    province: "LT",
    ownerLabel: "Proprietario",
    slotsUsed: 2,
    slotsTotal: 5,
    contactEmail: "academy@easygame.it",
    contactPhone: "+39 0771 445566",
    accentColor: "#0F766E",
    surfaceColor: "#ECFDF5",
  },
  {
    id: "club-atletico-minturno",
    name: "Atletico Minturno",
    categories: MINTURNO_CATEGORIES.map((item) => item.name),
    categoryItems: MINTURNO_CATEGORIES,
    city: "Minturno",
    province: "LT",
    ownerLabel: "Club partner",
    slotsUsed: 1,
    slotsTotal: 3,
    contactEmail: "segreteria@atleticominturno.it",
    contactPhone: "+39 0771 334455",
    accentColor: "#EA580C",
    surfaceColor: "#FFF7ED",
  },
];

const TRAINER_ACCESS_PERMISSIONS = resolveTrainerDashboardPermissions({
  navigation: {
    home: true,
    trainings: true,
    matches: true,
    athletes: true,
    categories: true,
  },
  widgets: {
    summary: true,
    todayTrainings: true,
    todayMatches: true,
    assignedAthletes: true,
    assignedCategories: true,
  },
  actions: {
    viewTrainingDetails: true,
    manageAttendance: true,
    manageTrainingStatus: true,
    viewMatchDetails: true,
    manageConvocations: true,
    viewAthleteDetails: true,
    viewAthleteTechnicalSheet: true,
    viewAthleteContacts: true,
    viewMedicalStatus: true,
    viewEnrollmentAndPayments: false,
  },
});

const SECRETARIAT_ACCESS_PERMISSIONS = resolveTrainerDashboardPermissions({
  navigation: {
    home: true,
    trainings: false,
    matches: false,
    athletes: true,
    categories: false,
  },
  widgets: {
    summary: true,
    todayTrainings: false,
    todayMatches: false,
    assignedAthletes: true,
    assignedCategories: false,
  },
  actions: {
    viewTrainingDetails: false,
    manageAttendance: false,
    manageTrainingStatus: false,
    viewMatchDetails: false,
    manageConvocations: false,
    viewAthleteDetails: true,
    viewAthleteTechnicalSheet: false,
    viewAthleteContacts: true,
    viewMedicalStatus: true,
    viewEnrollmentAndPayments: false,
  },
});

const MOCK_ACCESSES: Access[] = [
  {
    id: "access-trainer-minturno",
    clubId: "club-atletico-minturno",
    clubName: "Atletico Minturno",
    role: "trainer",
    status: "active",
    source: "assigned",
    trainerId: "trainer-marco-cappuccia",
    linkedTrainerName: "Marco Cappuccia",
    linkedAt: "2026-04-02T11:58:00.000Z",
    assignedCategories: ["Pulcini Elite 2015/2016", "Esordienti 2013/2014"],
    assignedCategoryIds: [
      "cat-minturno-pulcini-2015",
      "cat-minturno-esordienti-2013",
    ],
    permissions: TRAINER_ACCESS_PERMISSIONS,
    summary:
      "Allenatore collegato tramite token con accesso a categorie, roster, convocazioni e presenze.",
  },
  {
    id: "access-secretariat-lab",
    clubId: "club-easygame-lab",
    clubName: "EasyGame Lab",
    role: "assistant",
    status: "pending",
    source: "assigned",
    linkedTrainerName: "Segreteria Academy",
    linkedAt: "2026-04-01T16:10:00.000Z",
    assignedCategories: ["Academy U12"],
    assignedCategoryIds: ["cat-lab-u12"],
    permissions: SECRETARIAT_ACCESS_PERMISSIONS,
    summary:
      "Accesso limitato alla consultazione di anagrafiche e stato documentale.",
  },
];

const MOCK_TOKENS: AccessTokenRecord[] = [
  {
    token: "TRN9CFGBNKED",
    access: {
      id: "access-token-minturno",
      clubId: "club-atletico-minturno",
      clubName: "Atletico Minturno",
      role: "trainer",
      status: "active",
      source: "assigned",
      trainerId: "trainer-marco-cappuccia",
      linkedTrainerName: "Marco Cappuccia",
      linkedAt: "2026-04-02T11:52:11.880Z",
      assignedCategories: ["Pulcini Elite 2015/2016", "Esordienti 2013/2014"],
      assignedCategoryIds: [
        "cat-minturno-pulcini-2015",
        "cat-minturno-esordienti-2013",
      ],
      permissions: TRAINER_ACCESS_PERMISSIONS,
      summary:
        "Token allenatore con accesso alla dashboard tecnica, ai roster assegnati e alle presenze.",
    },
  },
  {
    token: "ACC4GSHJKNVT",
    access: {
      id: "access-token-lab",
      clubId: "club-easygame-lab",
      clubName: "EasyGame Lab",
      role: "assistant",
      status: "pending",
      source: "assigned",
      linkedTrainerName: "Segreteria Academy",
      linkedAt: "2026-04-02T12:20:00.000Z",
      assignedCategories: ["Academy U12"],
      assignedCategoryIds: ["cat-lab-u12"],
      permissions: SECRETARIAT_ACCESS_PERMISSIONS,
      summary:
        "Token di accesso secondario con permessi limitati su anagrafiche e contatti.",
    },
  },
];

const MOCK_ATHLETES: Athlete[] = [
  {
    id: "ath-minturno-1",
    clubId: "club-atletico-minturno",
    name: "Lorenzo Bianchi",
    firstName: "Lorenzo",
    lastName: "Bianchi",
    number: 7,
    position: "Playmaker",
    status: "attivo",
    category: "Pulcini Elite 2015/2016",
    categoryId: "cat-minturno-pulcini-2015",
    birthDate: "2015-03-12",
    city: "Minturno",
    phone: "+39 329 0001122",
    email: "famiglia.bianchi@email.it",
    medicalCertExpiry: "2026-05-04",
    technicalNotes: "Ottima visione di gioco e buona lettura difensiva.",
    shirtSize: "XS Bambino",
    pantsSize: "8 anni",
    shoeSize: "31",
    clothingProfile: "BAMBINO",
    guardians: [
      {
        id: "guardian-bianchi-1",
        name: "Sara Bianchi",
        relationship: "Madre",
        phone: "+39 338 1234432",
        email: "sara.bianchi@email.it",
      },
    ],
    registrations: [
      {
        id: "registration-bianchi-1",
        federation: "FIP",
        number: "FIP-2026-0012",
        status: "Attivo",
        issueDate: "2025-09-01",
        expiryDate: "2026-06-30",
      },
    ],
    payments: [
      {
        id: "payment-bianchi-1",
        date: "2026-02-10",
        description: "Seconda rata iscrizione",
        amount: "€ 85,00",
        status: "Pagato",
      },
    ],
    documents: [
      {
        id: "doc-bianchi-1",
        name: "Documento identita",
        type: "Carta d'identita",
        issueDate: "2025-01-14",
        expiryDate: "2030-01-13",
      },
    ],
  },
  {
    id: "ath-minturno-2",
    clubId: "club-atletico-minturno",
    name: "Tommaso Romano",
    firstName: "Tommaso",
    lastName: "Romano",
    number: 12,
    position: "Guardia",
    status: "attivo",
    category: "Pulcini Elite 2015/2016",
    categoryId: "cat-minturno-pulcini-2015",
    birthDate: "2016-01-28",
    city: "Scauri",
    phone: "+39 329 0005566",
    email: "romano.family@email.it",
    medicalCertExpiry: "2026-04-21",
    technicalNotes:
      "Molto rapido sul primo passo, da far crescere sulla mano debole.",
    shirtSize: "S Bambino",
    pantsSize: "9 anni",
    shoeSize: "32",
    clothingProfile: "BAMBINO",
    guardians: [
      {
        id: "guardian-romano-1",
        name: "Giulia Romano",
        relationship: "Madre",
        phone: "+39 347 6677889",
      },
    ],
  },
  {
    id: "ath-minturno-3",
    clubId: "club-atletico-minturno",
    name: "Mattia Ferri",
    firstName: "Mattia",
    lastName: "Ferri",
    number: 4,
    position: "Ala",
    status: "infortunato",
    category: "Esordienti 2013/2014",
    categoryId: "cat-minturno-esordienti-2013",
    birthDate: "2013-08-09",
    city: "Formia",
    phone: "+39 340 1122334",
    email: "ferri@email.it",
    medicalCertExpiry: "2026-07-18",
    technicalNotes: "Sta rientrando dopo un infortunio alla caviglia.",
    shirtSize: "XS Uomo",
    pantsSize: "XS Uomo",
    shoeSize: "37",
    clothingProfile: "UOMO",
  },
  {
    id: "ath-minturno-4",
    clubId: "club-atletico-minturno",
    name: "Riccardo Serra",
    firstName: "Riccardo",
    lastName: "Serra",
    number: 15,
    position: "Centro",
    status: "attivo",
    category: "Esordienti 2013/2014",
    categoryId: "cat-minturno-esordienti-2013",
    birthDate: "2014-02-17",
    city: "Gaeta",
    phone: "+39 349 4477881",
    email: "riccardo.serra@email.it",
    medicalCertExpiry: "2026-06-01",
    technicalNotes: "Fisicita interessante, va seguito sul timing a rimbalzo.",
    shirtSize: "S Uomo",
    pantsSize: "S Uomo",
    shoeSize: "38",
    clothingProfile: "UOMO",
  },
  {
    id: "ath-minturno-5",
    clubId: "club-atletico-minturno",
    name: "Alessio Conte",
    firstName: "Alessio",
    lastName: "Conte",
    number: 10,
    position: "Guardia",
    status: "attivo",
    category: "Giovanissimi 2011/2012",
    categoryId: "cat-minturno-giovanissimi-2011",
    birthDate: "2011-11-02",
    city: "Minturno",
    phone: "+39 349 4455667",
    email: "alessio.conte@email.it",
    medicalCertExpiry: "2026-09-30",
    technicalNotes:
      "Profilo senior del club, non assegnato al coach mobile demo.",
  },
  {
    id: "ath-forti-1",
    clubId: "club-fortitudo-scauri",
    name: "Federico Norcia",
    firstName: "Federico",
    lastName: "Norcia",
    number: 56,
    position: "Playmaker",
    status: "attivo",
    category: "Aquilotti 2016/2017",
    categoryId: "cat-forti-aquilotti-2016",
    birthDate: "2017-01-01",
    city: "Minturno",
    phone: "+39 392 9236842",
    email: "inti@fe.it",
    medicalCertExpiry: "2026-04-01",
    technicalNotes: "Esempio atleta lato club proprietario.",
  },
];

const MOCK_TRAININGS: Training[] = [
  {
    id: "training-minturno-1",
    clubId: "club-atletico-minturno",
    title: "Allenamento Pulcini",
    date: "2026-04-03",
    time: "17:00",
    endTime: "18:30",
    location: "PalaBorrelli - Campo A",
    category: "Pulcini Elite 2015/2016",
    categoryId: "cat-minturno-pulcini-2015",
    coachName: "Marco Cappuccia",
    status: "scheduled",
    presentCount: 0,
    totalCount: 16,
    notes: "Lavoro su 1vs1 e partenze veloci.",
  },
  {
    id: "training-minturno-2",
    clubId: "club-atletico-minturno",
    title: "Allenamento Esordienti",
    date: "2026-04-03",
    time: "19:00",
    endTime: "20:30",
    location: "PalaBorrelli - Campo B",
    category: "Esordienti 2013/2014",
    categoryId: "cat-minturno-esordienti-2013",
    coachName: "Marco Cappuccia",
    status: "scheduled",
    presentCount: 0,
    totalCount: 18,
    notes: "Situazioni di uscita pressing e letture in transizione.",
  },
  {
    id: "training-minturno-3",
    clubId: "club-atletico-minturno",
    title: "Allenamento Giovanissimi",
    date: "2026-04-04",
    time: "18:30",
    endTime: "20:00",
    location: "PalaBorrelli - Campo A",
    category: "Giovanissimi 2011/2012",
    categoryId: "cat-minturno-giovanissimi-2011",
    coachName: "Paolo Villa",
    status: "scheduled",
    presentCount: 0,
    totalCount: 21,
  },
  {
    id: "training-minturno-4",
    clubId: "club-atletico-minturno",
    title: "Richiamo Tecnico Pulcini",
    date: "2026-04-06",
    time: "17:15",
    endTime: "18:45",
    location: "Tensostruttura - Campo 1",
    category: "Pulcini Elite 2015/2016",
    categoryId: "cat-minturno-pulcini-2015",
    coachName: "Marco Cappuccia",
    status: "scheduled",
    presentCount: 0,
    totalCount: 16,
  },
  {
    id: "training-forti-1",
    clubId: "club-fortitudo-scauri",
    title: "Allenamento Aquilotti",
    date: "2026-04-03",
    time: "18:00",
    endTime: "19:30",
    location: "Palasport Scauri",
    category: "Aquilotti 2016/2017",
    categoryId: "cat-forti-aquilotti-2016",
    coachName: "Andrea Esposito",
    status: "scheduled",
    presentCount: 9,
    totalCount: 18,
  },
];

const MOCK_MATCHES: Match[] = [
  {
    id: "match-minturno-1",
    clubId: "club-atletico-minturno",
    date: "2026-04-03",
    time: "20:45",
    homeTeam: "Atletico Minturno",
    awayTeam: "Basket Gaeta",
    location: "PalaBorrelli",
    kit: "Divisa Home Blu",
    isHome: true,
    category: "Esordienti 2013/2014",
    categoryId: "cat-minturno-esordienti-2013",
    convokedCount: 10,
    totalConvocable: 14,
  },
  {
    id: "match-minturno-2",
    clubId: "club-atletico-minturno",
    date: "2026-04-05",
    time: "11:00",
    homeTeam: "Virtus Cassino",
    awayTeam: "Atletico Minturno",
    location: "PalaSoriano",
    kit: "Divisa Away Bianca",
    isHome: false,
    category: "Pulcini Elite 2015/2016",
    categoryId: "cat-minturno-pulcini-2015",
    convokedCount: 12,
    totalConvocable: 16,
  },
  {
    id: "match-forti-1",
    clubId: "club-fortitudo-scauri",
    date: "2026-04-04",
    time: "16:30",
    homeTeam: "Fortitudo Scauri",
    awayTeam: "Basket Formia",
    location: "Palasport Scauri",
    isHome: true,
    category: "Aquilotti 2016/2017",
    categoryId: "cat-forti-aquilotti-2016",
    convokedCount: 9,
    totalConvocable: 15,
  },
];

const MOCK_TASKS: Task[] = [
  {
    id: "task-trainer-1",
    clubId: "club-atletico-minturno",
    title: "Conferma presenze Esordienti",
    description: "Controlla i presenti per l'allenamento di stasera.",
    dueDate: "2026-04-03",
    completed: false,
    type: "task",
    roles: ["trainer"],
  },
  {
    id: "task-trainer-2",
    clubId: "club-atletico-minturno",
    title: "Invia convocazioni",
    description: "Prepara la lista gara per la partita di domenica.",
    dueDate: "2026-04-04",
    completed: false,
    type: "reminder",
    roles: ["trainer"],
  },
  {
    id: "task-owner-1",
    clubId: "club-fortitudo-scauri",
    title: "Rivedi i club di proprieta",
    description: "Aggiorna i dati di contatto del club principale.",
    dueDate: "2026-04-03",
    completed: false,
    type: "task",
    roles: ["owner", "admin"],
  },
];

const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeText = (value?: string | null) =>
  String(value || "")
    .trim()
    .toLowerCase();

const sortClubs = (clubs: Club[]) =>
  [...clubs].sort((left, right) => {
    const leftPrimary = left.id === "club-fortitudo-scauri" ? 1 : 0;
    const rightPrimary = right.id === "club-fortitudo-scauri" ? 1 : 0;

    if (leftPrimary !== rightPrimary) {
      return rightPrimary - leftPrimary;
    }

    return left.name.localeCompare(right.name, "it");
  });

const sortAccesses = (accesses: Access[]) =>
  [...accesses].sort((left, right) => {
    const statusSort =
      (left.status === "active" ? 0 : 1) - (right.status === "active" ? 0 : 1);
    if (statusSort !== 0) {
      return statusSort;
    }

    return left.clubName.localeCompare(right.clubName, "it");
  });

const matchesQuery = (value: string, query: string) =>
  normalizeText(value).includes(normalizeText(query));

const roleHasFullClubAccess = (role?: string | null) =>
  role === "owner" || role === "admin";

class MobileStorageService {
  private seeded = false;

  private async readJSON<T>(key: string, fallback: T): Promise<T> {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      return fallback;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private async writeJSON<T>(key: string, value: T) {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  }

  private async ensureSeed() {
    if (this.seeded) {
      return;
    }

    const version = await AsyncStorage.getItem(KEYS.schemaVersion);
    if (version === SCHEMA_VERSION) {
      this.seeded = true;
      return;
    }

    const persistedServerUrl = await AsyncStorage.getItem(KEYS.serverUrl);
    const persistedLoggedIn = await AsyncStorage.getItem(KEYS.isLoggedIn);
    const persistedUser = await AsyncStorage.getItem(KEYS.user);

    await this.writeJSON(
      KEYS.user,
      persistedUser ? JSON.parse(persistedUser) : MOCK_USER,
    );
    await this.writeJSON(KEYS.clubs, MOCK_CLUBS);
    await this.writeJSON(KEYS.accesses, MOCK_ACCESSES);
    await this.writeJSON(KEYS.athletes, MOCK_ATHLETES);
    await this.writeJSON(KEYS.trainings, MOCK_TRAININGS);
    await this.writeJSON(KEYS.matches, MOCK_MATCHES);
    await this.writeJSON(KEYS.tasks, MOCK_TASKS);
    await this.writeJSON(KEYS.tokens, MOCK_TOKENS);
    await AsyncStorage.removeItem(KEYS.currentContext);
    await AsyncStorage.setItem(
      KEYS.isLoggedIn,
      persistedLoggedIn === "true" ? "true" : "false",
    );

    if (persistedServerUrl) {
      await AsyncStorage.setItem(KEYS.serverUrl, persistedServerUrl);
    }

    await AsyncStorage.setItem(KEYS.schemaVersion, SCHEMA_VERSION);
    this.seeded = true;
  }

  private async getRawClubs() {
    await this.ensureSeed();
    return this.readJSON<Club[]>(KEYS.clubs, []);
  }

  private async getRawAccesses() {
    await this.ensureSeed();
    return this.readJSON<Access[]>(KEYS.accesses, []);
  }

  private async getRawAthletes() {
    await this.ensureSeed();
    return this.readJSON<Athlete[]>(KEYS.athletes, []);
  }

  private async getRawTrainings() {
    await this.ensureSeed();
    return this.readJSON<Training[]>(KEYS.trainings, []);
  }

  private async getRawMatches() {
    await this.ensureSeed();
    return this.readJSON<Match[]>(KEYS.matches, []);
  }

  private async getRawTasks() {
    await this.ensureSeed();
    return this.readJSON<Task[]>(KEYS.tasks, []);
  }

  private applyAccessViewToClub(club: Club, access: Access | null): Club {
    if (!access || !access.assignedCategoryIds?.length) {
      return club;
    }

    const filteredCategoryItems = (club.categoryItems || []).filter(
      (category) => access.assignedCategoryIds?.includes(category.id),
    );

    return {
      ...club,
      categories:
        access.assignedCategories && access.assignedCategories.length > 0
          ? access.assignedCategories
          : filteredCategoryItems.map((item) => item.name),
      categoryItems: filteredCategoryItems,
    };
  }

  private async getContextCategoryIds() {
    const [context, access, currentClub] = await Promise.all([
      this.getContext(),
      this.getCurrentAccess(),
      this.getCurrentClub(),
    ]);

    if (!context || roleHasFullClubAccess(context.role)) {
      return new Set(
        (currentClub?.categoryItems || []).map((category) => category.id),
      );
    }

    return new Set(access?.assignedCategoryIds || []);
  }

  async login(email: string, password: string): Promise<User | null> {
    await this.ensureSeed();
    if (!email.trim() || !password.trim()) {
      return null;
    }

    const currentUser = await this.getUser();
    const nextUser = {
      ...(currentUser || MOCK_USER),
      email: email.trim().toLowerCase(),
    };

    await this.writeJSON(KEYS.user, nextUser);
    await AsyncStorage.setItem(KEYS.isLoggedIn, "true");
    return nextUser;
  }

  async logout() {
    await this.ensureSeed();
    await AsyncStorage.setItem(KEYS.isLoggedIn, "false");
    await AsyncStorage.removeItem(KEYS.currentContext);
  }

  async isLoggedIn(): Promise<boolean> {
    await this.ensureSeed();
    return (await AsyncStorage.getItem(KEYS.isLoggedIn)) === "true";
  }

  async getUser(): Promise<User | null> {
    await this.ensureSeed();
    return this.readJSON<User | null>(KEYS.user, null);
  }

  async updateUserProfile(
    updates: Partial<
      Pick<User, "name" | "email" | "phone" | "city" | "avatar">
    >,
  ) {
    await this.ensureSeed();
    const currentUser = (await this.getUser()) || MOCK_USER;
    const nextUser = {
      ...currentUser,
      ...updates,
      name: updates.name?.trim() || currentUser.name,
      email: updates.email?.trim() || currentUser.email,
      phone: updates.phone?.trim() || currentUser.phone,
      city: updates.city?.trim() || currentUser.city,
      avatar: updates.avatar ?? currentUser.avatar,
    };

    await this.writeJSON(KEYS.user, nextUser);
    return nextUser;
  }

  async setContext(
    clubId: string,
    role: string,
    accessId?: string | null,
    source?: "owned" | "assigned" | null,
  ) {
    await this.ensureSeed();
    const payload: CurrentContext = {
      clubId,
      role,
      accessId: accessId || null,
      source: source || (roleHasFullClubAccess(role) ? "owned" : "assigned"),
    };

    await this.writeJSON(KEYS.currentContext, payload);
  }

  async getContext(): Promise<CurrentContext | null> {
    await this.ensureSeed();
    return this.readJSON<CurrentContext | null>(KEYS.currentContext, null);
  }

  async clearContext() {
    await this.ensureSeed();
    await AsyncStorage.removeItem(KEYS.currentContext);
  }

  async hasContext(): Promise<boolean> {
    const context = await this.getContext();
    return Boolean(context?.clubId && context?.role);
  }

  async getOwnedClubs(): Promise<Club[]> {
    const clubs = await this.getRawClubs();
    return sortClubs(
      clubs.filter((club) => club.id !== "club-atletico-minturno"),
    );
  }

  async createOwnedClub(input: CreateClubInput) {
    await this.ensureSeed();
    const clubs = await this.getRawClubs();
    const nextClub: Club = {
      id: createId("club"),
      name: input.name.trim(),
      city: input.city?.trim() || "",
      province: input.province?.trim() || "",
      contactEmail: input.contactEmail?.trim() || "",
      contactPhone: input.contactPhone?.trim() || "",
      avatar: input.logoUrl?.trim() || undefined,
      categories: [],
      categoryItems: [],
      ownerLabel: "Proprietario",
      slotsUsed: clubs.length + 1,
      slotsTotal: 5,
      accentColor: "#2563EB",
      surfaceColor: "#EFF6FF",
    };

    const nextClubs = sortClubs([...clubs, nextClub]);
    await this.writeJSON(KEYS.clubs, nextClubs);
    return nextClub;
  }

  async getAccesses(): Promise<Access[]> {
    const accesses = await this.getRawAccesses();
    return sortAccesses(accesses);
  }

  async getCurrentAccess(): Promise<Access | null> {
    const [context, accesses] = await Promise.all([
      this.getContext(),
      this.getAccesses(),
    ]);

    if (!context || roleHasFullClubAccess(context.role)) {
      return null;
    }

    if (context.accessId) {
      return accesses.find((access) => access.id === context.accessId) || null;
    }

    return (
      accesses.find(
        (access) =>
          access.clubId === context.clubId &&
          normalizeText(access.role) === normalizeText(context.role),
      ) || null
    );
  }

  async getCurrentClub(): Promise<Club | null> {
    const [context, clubs, access] = await Promise.all([
      this.getContext(),
      this.getRawClubs(),
      this.getCurrentAccess(),
    ]);

    if (!context) {
      return null;
    }

    const club = clubs.find((item) => item.id === context.clubId);
    if (!club && access) {
      return {
        id: access.clubId,
        name: access.clubName,
        avatar: access.clubAvatar,
        categories: access.assignedCategories || [],
        categoryItems: [],
      };
    }

    if (!club) {
      return null;
    }

    return this.applyAccessViewToClub(club, access);
  }

  async getTrainerPermissions(): Promise<TrainerDashboardPermissions> {
    const [context, access] = await Promise.all([
      this.getContext(),
      this.getCurrentAccess(),
    ]);

    if (!context) {
      return DEFAULT_TRAINER_DASHBOARD_PERMISSIONS;
    }

    if (roleHasFullClubAccess(context.role)) {
      return FULL_ACCESS_PERMISSIONS;
    }

    return resolveTrainerDashboardPermissions(access?.permissions);
  }

  async getAssignedCategories(): Promise<ClubCategorySummary[]> {
    const [club, access, context] = await Promise.all([
      this.getCurrentClub(),
      this.getCurrentAccess(),
      this.getContext(),
    ]);

    if (!club) {
      return [];
    }

    if (!context || roleHasFullClubAccess(context.role) || !access) {
      return club.categoryItems || [];
    }

    if (!access.assignedCategoryIds?.length) {
      return [];
    }

    return (club.categoryItems || []).filter((category) =>
      access.assignedCategoryIds?.includes(category.id),
    );
  }

  async addAccess(token: string): Promise<Access | null> {
    await this.ensureSeed();
    const cleanedToken = token.trim().toUpperCase();
    const [tokenRegistry, accesses] = await Promise.all([
      this.readJSON<AccessTokenRecord[]>(KEYS.tokens, []),
      this.getAccesses(),
    ]);

    const record = tokenRegistry.find((entry) => entry.token === cleanedToken);
    if (!record) {
      return null;
    }

    const existingAccess = accesses.find(
      (access) =>
        access.clubId === record.access.clubId &&
        normalizeText(access.role) === normalizeText(record.access.role),
    );

    if (existingAccess) {
      return existingAccess;
    }

    const nextAccess: Access = {
      ...record.access,
      id: createId("access"),
      linkedAt: new Date().toISOString(),
    };

    const nextAccesses = sortAccesses([...accesses, nextAccess]);
    await this.writeJSON(KEYS.accesses, nextAccesses);
    return nextAccess;
  }

  async getAthletes(query?: string): Promise<Athlete[]> {
    const [context, athletes, categoryIds] = await Promise.all([
      this.getContext(),
      this.getRawAthletes(),
      this.getContextCategoryIds(),
    ]);

    let filtered = athletes;
    if (context?.clubId) {
      filtered = filtered.filter(
        (athlete) => athlete.clubId === context.clubId,
      );
    }

    if (
      context &&
      !roleHasFullClubAccess(context.role) &&
      categoryIds.size > 0
    ) {
      filtered = filtered.filter((athlete) =>
        athlete.categoryId ? categoryIds.has(athlete.categoryId) : false,
      );
    }

    if (query?.trim()) {
      filtered = filtered.filter((athlete) =>
        [
          athlete.name,
          athlete.firstName,
          athlete.lastName,
          athlete.position,
          athlete.category,
          athlete.city,
        ].some((value) => matchesQuery(value || "", query)),
      );
    }

    return [...filtered].sort((left, right) => {
      const byCategory = left.category.localeCompare(right.category, "it");
      if (byCategory !== 0) {
        return byCategory;
      }

      return left.name.localeCompare(right.name, "it");
    });
  }

  async getAthlete(id: string): Promise<Athlete | null> {
    const athletes = await this.getAthletes();
    return athletes.find((athlete) => athlete.id === id) || null;
  }

  async getTrainings(): Promise<Training[]> {
    const [context, trainings, categoryIds] = await Promise.all([
      this.getContext(),
      this.getRawTrainings(),
      this.getContextCategoryIds(),
    ]);

    let filtered = trainings;
    if (context?.clubId) {
      filtered = filtered.filter(
        (training) => training.clubId === context.clubId,
      );
    }

    if (
      context &&
      !roleHasFullClubAccess(context.role) &&
      categoryIds.size > 0
    ) {
      filtered = filtered.filter((training) =>
        training.categoryId ? categoryIds.has(training.categoryId) : false,
      );
    }

    return [...filtered].sort((left, right) => {
      const leftStamp = `${left.date}T${left.time}`;
      const rightStamp = `${right.date}T${right.time}`;
      return leftStamp.localeCompare(rightStamp);
    });
  }

  async getMatches(): Promise<Match[]> {
    const [context, matches, categoryIds] = await Promise.all([
      this.getContext(),
      this.getRawMatches(),
      this.getContextCategoryIds(),
    ]);

    let filtered = matches;
    if (context?.clubId) {
      filtered = filtered.filter((match) => match.clubId === context.clubId);
    }

    if (
      context &&
      !roleHasFullClubAccess(context.role) &&
      categoryIds.size > 0
    ) {
      filtered = filtered.filter((match) =>
        match.categoryId ? categoryIds.has(match.categoryId) : false,
      );
    }

    return [...filtered].sort((left, right) => {
      const leftStamp = `${left.date}T${left.time}`;
      const rightStamp = `${right.date}T${right.time}`;
      return leftStamp.localeCompare(rightStamp);
    });
  }

  async getTasks(): Promise<Task[]> {
    const [context, tasks] = await Promise.all([
      this.getContext(),
      this.getRawTasks(),
    ]);
    if (!context) {
      return [];
    }

    return tasks.filter((task) => {
      const matchesClub = !task.clubId || task.clubId === context.clubId;
      const matchesRole =
        !task.roles?.length ||
        task.roles.includes(context.role) ||
        roleHasFullClubAccess(context.role);
      return matchesClub && matchesRole;
    });
  }

  async toggleTask(id: string): Promise<void> {
    const tasks = await this.getRawTasks();
    const nextTasks = tasks.map((task) =>
      task.id === id ? { ...task, completed: !task.completed } : task,
    );
    await this.writeJSON(KEYS.tasks, nextTasks);
  }

  async setServerUrl(url: string) {
    await this.ensureSeed();
    await AsyncStorage.setItem(KEYS.serverUrl, url.trim());
  }

  async getServerUrl(): Promise<string | null> {
    await this.ensureSeed();
    return AsyncStorage.getItem(KEYS.serverUrl);
  }
}

export const mobileStorage = new MobileStorageService();
