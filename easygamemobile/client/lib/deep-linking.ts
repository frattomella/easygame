/**
 * Interpretazione pura di un deep link EasyGame (WP11).
 *
 * Nessuna dipendenza da `expo-linking`, da React Navigation o da `fetch`:
 * riceve una stringa URL e il contesto gia risolto dall'app (ruolo, sessione
 * presente) e decide **una sola cosa** — quale schermata aprire, con quali
 * parametri, oppure se non aprire niente. La convalida vera del **contenuto**
 * (l'allenamento esiste davvero? appartiene al club attivo?) resta dov'e
 * sempre stata: nella schermata di destinazione, che lo chiede al server e
 * mostra il proprio `StateMessage` se la risposta e vuota o negata — questo
 * modulo non pretende di saperlo prima di navigare.
 *
 * Schema URL: `easygame://<path>[?query]`, piu la forma che Expo Go/i client
 * di sviluppo usano (`exp://host:porta/--/<path>[?query]`) — la seconda si
 * riconosce dal separatore `--/` e si riduce alla prima.
 */

export type DeepLinkRoleGate = "trainer" | "parent" | null;

export interface ParsedDeepLink {
  /** Segmenti del percorso, es. `["training", "abc123"]`. Vuoto per un URL senza percorso. */
  path: string[];
  query: Record<string, string>;
}

const DEV_CLIENT_SEPARATOR = "--/";

/**
 * Divide un URL EasyGame in segmenti di percorso e query, senza fidarsi
 * della forma esatta con cui arriva (scheme di produzione o URL di sviluppo
 * Expo). Non lancia mai: un URL malformato produce percorso vuoto, che i
 * chiamanti trattano come "nessuna destinazione" — un deep link scritto a
 * mano male non deve mai far cadere l'app che lo riceve.
 */
export const parseDeepLink = (
  url: string | null | undefined,
): ParsedDeepLink => {
  const raw = String(url || "").trim();
  if (!raw) {
    return { path: [], query: {} };
  }

  const devSeparatorIndex = raw.indexOf(DEV_CLIENT_SEPARATOR);
  const afterSeparator =
    devSeparatorIndex >= 0
      ? raw.slice(devSeparatorIndex + DEV_CLIENT_SEPARATOR.length)
      : raw;

  // Una stringa dopo `--/` (o l'URL intero se il separatore non c'e) non è
  // uno schema valido di per sé: la si ricompone su uno schema neutro per
  // poterla far analizzare da `URL`, che gestisce correttamente query e
  // percorso senza che questo modulo debba reinventarne il parsing.
  const candidate =
    devSeparatorIndex >= 0 ? `easygame://x/${afterSeparator}` : raw;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { path: [], query: {} };
  }

  const hostSegment = parsed.host && parsed.host !== "x" ? [parsed.host] : [];
  const pathSegments = parsed.pathname
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .filter(Boolean);

  const query: Record<string, string> = {};
  parsed.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  return { path: [...hostSegment, ...pathSegments], query };
};

/** Un'istruzione di navigazione: quale tab (se serve), quale schermata, con quali parametri. */
export interface DeepLinkNavigationTarget {
  /** `null` per una destinazione fuori dai tab (es. `ResetPassword`, nello stack radice). */
  tab: string | null;
  screen: string;
  params?: Record<string, unknown>;
}

/**
 * `reset-password` non richiede sessione ne ruolo: e l'unica destinazione
 * che si risolve **prima** di ogni controllo di autenticazione, perche serve
 * a chi quella sessione non ce l'ha ancora (o non ce l'ha piu, per definizione
 * di reset).
 */
export const resolvePasswordResetTarget = (
  link: ParsedDeepLink,
): { userId: string; token: string } | null => {
  if (link.path[0] !== "reset-password") {
    return null;
  }
  const userId = link.query.uid || "";
  const token = link.query.token || "";
  if (!userId || !token) {
    return null;
  }
  return { userId, token };
};

/**
 * Le destinazioni che richiedono un ruolo risolto. Ogni voce sa in quale tab
 * vive; i parametri sono quelli che le schermate **gia** accettano
 * (`focusTrainingId`, `focusMatchId`, `eventId`/`kind`, `initialSection`) —
 * nessun nuovo parametro inventato per il deep link.
 */
export const resolveRoleGatedDeepLinkTarget = (
  link: ParsedDeepLink,
  roleGate: DeepLinkRoleGate,
): DeepLinkNavigationTarget | null => {
  const [head, id] = link.path;

  if (roleGate === "trainer") {
    switch (head) {
      case "training":
        return id
          ? {
              tab: "TrainingsTab",
              screen: "Trainings",
              params: { focusTrainingId: id },
            }
          : null;
      case "match":
        return id
          ? {
              tab: "MatchesTab",
              screen: "Matches",
              params: { focusMatchId: id },
            }
          : null;
      case "notification":
      case "notifications":
        return { tab: "HomeTab", screen: "Notifications" };
      case "appointment":
      case "appointments":
        return { tab: "ProfileTab", screen: "Appointments" };
      default:
        return null;
    }
  }

  if (roleGate === "parent") {
    switch (head) {
      case "training":
        return id
          ? {
              tab: "ParentCalendarTab",
              screen: "ParentEventDetail",
              params: { eventId: id, kind: "training" },
            }
          : null;
      case "match":
        return id
          ? {
              tab: "ParentCalendarTab",
              screen: "ParentEventDetail",
              params: { eventId: id, kind: "match" },
            }
          : null;
      case "rsvp":
      case "event": {
        // `event/:kind/:id`, oppure `rsvp/:id` (il tipo evento non serve a
        // scegliere la schermata, solo a impostare il tab del dettaglio —
        // il default e "training" quando non e specificato).
        const eventId = head === "rsvp" ? id : link.path[2];
        const kind = head === "rsvp" ? "training" : id;
        if (!eventId) return null;
        return {
          tab: "ParentCalendarTab",
          screen: "ParentEventDetail",
          params: {
            eventId,
            kind: kind === "match" ? "match" : "training",
          },
        };
      }
      case "payment":
      case "payments":
        return { tab: "ParentSegreteriaTab", screen: "ParentPayments" };
      case "document":
      case "documents":
        return { tab: "ParentSegreteriaTab", screen: "ParentDocuments" };
      case "notification":
      case "notifications":
        return {
          tab: "ParentBoardTab",
          screen: "ParentBoard",
          params: { initialSection: "notifications" },
        };
      case "appointment":
      case "appointments":
        return { tab: "ParentProfileTab", screen: "ParentAppointments" };
      default:
        return null;
    }
  }

  return null;
};
