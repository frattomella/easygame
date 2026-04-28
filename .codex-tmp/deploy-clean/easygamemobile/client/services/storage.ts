import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  User,
  Club,
  Access,
  Athlete,
  Training,
  Match,
  Task,
} from "./api";

const KEYS = {
  USER: "@easygame/user",
  CLUBS: "@easygame/clubs",
  ACCESSES: "@easygame/accesses",
  ATHLETES: "@easygame/athletes",
  TRAININGS: "@easygame/trainings",
  MATCHES: "@easygame/matches",
  TASKS: "@easygame/tasks",
  CURRENT_CONTEXT: "@easygame/current_context",
  IS_LOGGED_IN: "@easygame/is_logged_in",
  SERVER_URL: "@easygame/server_url",
};

const MOCK_USER: User = {
  id: "1",
  email: "coach@easygame.it",
  name: "Mario Rossi",
};

const MOCK_CLUBS: Club[] = [
  {
    id: "1",
    name: "ASD Calcio Milano",
    categories: ["Esordienti", "Giovanissimi"],
  },
];

const MOCK_ACCESSES: Access[] = [
  {
    id: "1",
    clubId: "1",
    clubName: "ASD Calcio Milano",
    role: "Allenatore",
  },
  {
    id: "2",
    clubId: "2",
    clubName: "FC Roma Junior",
    role: "Assistente",
  },
];

const MOCK_ATHLETES: Athlete[] = [
  {
    id: "1",
    name: "Luca Bianchi",
    number: 10,
    position: "Centrocampista",
    status: "attivo",
    category: "Esordienti",
    phone: "+39 333 1234567",
    email: "luca.bianchi@email.it",
  },
  {
    id: "2",
    name: "Marco Verdi",
    number: 7,
    position: "Attaccante",
    status: "attivo",
    category: "Esordienti",
    phone: "+39 333 2345678",
    email: "marco.verdi@email.it",
  },
  {
    id: "3",
    name: "Andrea Neri",
    number: 1,
    position: "Portiere",
    status: "infortunato",
    category: "Esordienti",
    phone: "+39 333 3456789",
    email: "andrea.neri@email.it",
  },
  {
    id: "4",
    name: "Giovanni Russo",
    number: 4,
    position: "Difensore",
    status: "squalificato",
    category: "Esordienti",
    phone: "+39 333 4567890",
    email: "giovanni.russo@email.it",
  },
  {
    id: "5",
    name: "Francesco Esposito",
    number: 9,
    position: "Attaccante",
    status: "attivo",
    category: "Giovanissimi",
    phone: "+39 333 5678901",
    email: "francesco.esposito@email.it",
  },
  {
    id: "6",
    name: "Alessandro Colombo",
    number: 3,
    position: "Difensore",
    status: "attivo",
    category: "Giovanissimi",
    phone: "+39 333 6789012",
    email: "alessandro.colombo@email.it",
  },
];

const MOCK_TRAININGS: Training[] = [
  {
    id: "1",
    title: "Allenamento Tecnico",
    date: "2026-01-21",
    time: "17:00",
    location: "Campo Sportivo A",
    category: "Esordienti",
    presentCount: 12,
    totalCount: 15,
  },
  {
    id: "2",
    title: "Tattica Difensiva",
    date: "2026-01-22",
    time: "16:30",
    location: "Campo Sportivo B",
    category: "Giovanissimi",
    presentCount: 0,
    totalCount: 18,
  },
  {
    id: "3",
    title: "Partitella",
    date: "2026-01-23",
    time: "17:30",
    location: "Campo Sportivo A",
    category: "Esordienti",
    presentCount: 0,
    totalCount: 15,
  },
  {
    id: "4",
    title: "Preparazione Atletica",
    date: "2026-01-24",
    time: "16:00",
    location: "Palestra",
    category: "Giovanissimi",
    presentCount: 0,
    totalCount: 18,
  },
];

const MOCK_MATCHES: Match[] = [
  {
    id: "1",
    date: "2026-01-25",
    time: "15:00",
    homeTeam: "ASD Calcio Milano",
    awayTeam: "FC Torino Youth",
    location: "Stadio Comunale",
    kit: "Prima Divisa (Blu)",
    isHome: true,
  },
  {
    id: "2",
    date: "2026-02-01",
    time: "10:30",
    homeTeam: "Inter Academy",
    awayTeam: "ASD Calcio Milano",
    location: "Centro Sportivo Interello",
    kit: "Seconda Divisa (Bianca)",
    isHome: false,
  },
  {
    id: "3",
    date: "2026-01-18",
    time: "15:00",
    homeTeam: "ASD Calcio Milano",
    awayTeam: "Juventus Youth",
    location: "Stadio Comunale",
    isHome: true,
    result: {
      homeScore: 2,
      awayScore: 1,
    },
  },
  {
    id: "4",
    date: "2026-01-11",
    time: "11:00",
    homeTeam: "AC Milan Primavera",
    awayTeam: "ASD Calcio Milano",
    location: "Vismara",
    isHome: false,
    result: {
      homeScore: 3,
      awayScore: 3,
    },
  },
];

const MOCK_TASKS: Task[] = [
  {
    id: "1",
    title: "Preparare scheda allenamento",
    description: "Creare il piano per la sessione tattica di giovedì",
    dueDate: "2026-01-22",
    completed: false,
    type: "task",
  },
  {
    id: "2",
    title: "Chiamare genitori di Marco",
    description: "Confermare disponibilità per trasferta",
    dueDate: "2026-01-23",
    completed: false,
    type: "reminder",
  },
  {
    id: "3",
    title: "Inviare convocazioni",
    description: "Convocazioni per la partita di sabato",
    dueDate: "2026-01-24",
    completed: false,
    type: "task",
  },
];

class StorageService {
  async initMockData() {
    const isInit = await AsyncStorage.getItem("@easygame/initialized");
    if (!isInit) {
      await AsyncStorage.setItem(KEYS.USER, JSON.stringify(MOCK_USER));
      await AsyncStorage.setItem(KEYS.CLUBS, JSON.stringify(MOCK_CLUBS));
      await AsyncStorage.setItem(KEYS.ACCESSES, JSON.stringify(MOCK_ACCESSES));
      await AsyncStorage.setItem(KEYS.ATHLETES, JSON.stringify(MOCK_ATHLETES));
      await AsyncStorage.setItem(KEYS.TRAININGS, JSON.stringify(MOCK_TRAININGS));
      await AsyncStorage.setItem(KEYS.MATCHES, JSON.stringify(MOCK_MATCHES));
      await AsyncStorage.setItem(KEYS.TASKS, JSON.stringify(MOCK_TASKS));
      await AsyncStorage.setItem("@easygame/initialized", "true");
    }
  }

  async login(email: string, password: string): Promise<User | null> {
    await this.initMockData();
    if (email && password) {
      await AsyncStorage.setItem(KEYS.IS_LOGGED_IN, "true");
      return MOCK_USER;
    }
    return null;
  }

  async logout() {
    await AsyncStorage.removeItem(KEYS.IS_LOGGED_IN);
    await AsyncStorage.removeItem(KEYS.CURRENT_CONTEXT);
  }

  async isLoggedIn(): Promise<boolean> {
    const val = await AsyncStorage.getItem(KEYS.IS_LOGGED_IN);
    return val === "true";
  }

  async getUser(): Promise<User | null> {
    const json = await AsyncStorage.getItem(KEYS.USER);
    return json ? JSON.parse(json) : null;
  }

  async setContext(clubId: string, role: string) {
    await AsyncStorage.setItem(
      KEYS.CURRENT_CONTEXT,
      JSON.stringify({ clubId, role })
    );
  }

  async getContext(): Promise<{ clubId: string; role: string } | null> {
    const json = await AsyncStorage.getItem(KEYS.CURRENT_CONTEXT);
    return json ? JSON.parse(json) : null;
  }

  async clearContext() {
    await AsyncStorage.removeItem(KEYS.CURRENT_CONTEXT);
  }

  async hasContext(): Promise<boolean> {
    const context = await this.getContext();
    return !!context;
  }

  async getOwnedClubs(): Promise<Club[]> {
    const json = await AsyncStorage.getItem(KEYS.CLUBS);
    return json ? JSON.parse(json) : [];
  }

  async getAccesses(): Promise<Access[]> {
    const json = await AsyncStorage.getItem(KEYS.ACCESSES);
    return json ? JSON.parse(json) : [];
  }

  async addAccess(token: string): Promise<Access | null> {
    if (token.length >= 5 && token.length <= 8) {
      const newAccess: Access = {
        id: Date.now().toString(),
        clubId: "3",
        clubName: "Nuovo Club " + token,
        role: "Collaboratore",
      };
      const accesses = await this.getAccesses();
      accesses.push(newAccess);
      await AsyncStorage.setItem(KEYS.ACCESSES, JSON.stringify(accesses));
      return newAccess;
    }
    return null;
  }

  async getAthletes(query?: string): Promise<Athlete[]> {
    const json = await AsyncStorage.getItem(KEYS.ATHLETES);
    let athletes: Athlete[] = json ? JSON.parse(json) : [];
    if (query) {
      const lowerQuery = query.toLowerCase();
      athletes = athletes.filter(
        (a) =>
          a.name.toLowerCase().includes(lowerQuery) ||
          a.position.toLowerCase().includes(lowerQuery)
      );
    }
    return athletes;
  }

  async getAthlete(id: string): Promise<Athlete | null> {
    const athletes = await this.getAthletes();
    return athletes.find((a) => a.id === id) || null;
  }

  async getTrainings(): Promise<Training[]> {
    const json = await AsyncStorage.getItem(KEYS.TRAININGS);
    return json ? JSON.parse(json) : [];
  }

  async getMatches(): Promise<Match[]> {
    const json = await AsyncStorage.getItem(KEYS.MATCHES);
    return json ? JSON.parse(json) : [];
  }

  async getTasks(): Promise<Task[]> {
    const json = await AsyncStorage.getItem(KEYS.TASKS);
    return json ? JSON.parse(json) : [];
  }

  async toggleTask(id: string): Promise<void> {
    const tasks = await this.getTasks();
    const taskIndex = tasks.findIndex((t) => t.id === id);
    if (taskIndex >= 0) {
      tasks[taskIndex].completed = !tasks[taskIndex].completed;
      await AsyncStorage.setItem(KEYS.TASKS, JSON.stringify(tasks));
    }
  }

  async setServerUrl(url: string) {
    await AsyncStorage.setItem(KEYS.SERVER_URL, url);
  }

  async getServerUrl(): Promise<string | null> {
    return AsyncStorage.getItem(KEYS.SERVER_URL);
  }

  async getCurrentClub(): Promise<Club | null> {
    const context = await this.getContext();
    if (!context) return null;
    const clubs = await this.getOwnedClubs();
    const accesses = await this.getAccesses();
    const club = clubs.find((c) => c.id === context.clubId);
    if (club) return club;
    const access = accesses.find((a) => a.clubId === context.clubId);
    if (access) {
      return {
        id: access.clubId,
        name: access.clubName,
        avatar: access.clubAvatar,
      };
    }
    return null;
  }
}

export const storage = new StorageService();
