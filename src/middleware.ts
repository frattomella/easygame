import { NextResponse, type NextRequest } from "next/server";

/**
 * Primo cancello di autenticazione, a livello edge.
 *
 * Cosa fa: se una pagina protetta viene aperta **senza cookie di sessione**,
 * reindirizza a `/login` invece di lasciar montare la shell dell'applicazione.
 *
 * Cosa NON fa, di proposito:
 * - non valida la sessione contro il database (il runtime edge non ha Prisma):
 *   un cookie scaduto passa di qui e viene respinto dalle API con 401, che il
 *   client trasforma in logout tramite `notifyUnauthorized`;
 * - non applica la matrice dei ruoli: quella resta in `access-roles.ts`,
 *   verificata lato client da `AccessAreaGuard` e lato server dalle API.
 *
 * E quindi un filtro grossolano che elimina il caso "utente non autenticato
 * che vede una pagina rotta", non il presidio di sicurezza principale.
 * Vedi docs/knowledge-base/08-roles-and-permissions.md e 14-security.md.
 */

const SESSION_COOKIE_NAME = "easygame_session";

/**
 * Prefissi che richiedono una sessione. Allineati a `MANAGEMENT_PATH_PREFIXES`
 * di `src/lib/access-roles.ts`, piu le aree trainer, genitore e account.
 */
const PROTECTED_PREFIXES = [
  "/account",
  "/athletes",
  /*
    Il registro delle operazioni (WP-16, lane 6G). Riga aggiunta **fuori dal
    perimetro della lane**, e dichiarata: e la sola compagna obbligatoria di
    un'area nuova sotto `src/app`, e il test che la pretende esiste proprio
    perche questo elenco l'ha gia dimenticata quattro volte.
  */
  "/audit",
  /*
    **La terza volta che questo elenco dimentica una pagina.** `/consensi` e
    `/sport-work` sono gia documentati qui sotto; `/calendar` — la pagina
    nuova del calendario unico (5F) — rispondeva **200 senza sessione**, mentre
    la sorella `/matches` risponde 307. Le API rifiutano comunque, quindi non
    usciva un dato: usciva la struttura di una pagina gestionale a chiunque
    passasse. Questo elenco esiste perche non succeda.
  */
  "/calendar",
  "/categories",
  "/clothing",
  "/communications",
  /*
    La Wave 3 ha aggiunto `/consensi` a `MANAGEMENT_PATH_PREFIXES` e si e
    dimenticata di questo elenco: lo smoke su staging lo ha visto rispondere
    **200 senza sessione**, mentre `/modulistica` rispondeva 307.

    Non era una fuga — la pagina si difende da sola e ogni rotta rifiuta — ma
    due percorsi gestionali che rispondono diversamente alla stessa domanda
    sono un difetto anche quando nessuno dei due e sbagliato da solo. E questo
    elenco esiste apposta per non far arrivare a una pagina chi non ha una
    sessione.
  */
  "/consensi",
  "/create-club",
  "/dashboard",
  "/hub",
  "/matches",
  "/medical",
  "/modulistica",
  "/movements",
  "/notifications",
  "/onboarding",
  "/organization",
  /*
    Wave 6. **La quarta volta.** Le tre aree nate in questa Wave —
    l area atleta, la coda documentale e la configurazione degli
    appuntamenti — erano tutte e tre fuori da questo elenco, come lo erano
    state /calendar, /consensi e /sport-work prima di loro.

    Non e piu una dimenticanza: e una classe. Percio adesso non lo presidia
    solo la memoria di chi scrive, ma un test che **enumera le aree dal
    filesystem** e pretende che ognuna sia qui — vedi
    tests/auth/route-guards.test.mjs.
  */
  "/athlete-dashboard",
  "/appuntamenti",
  "/documenti",
  "/parent-view",
  "/payments",
  "/permissions",
  "/private",
  "/procura",
  "/profile",
  "/registration-management",
  "/reports",
  "/secretariat",
  "/settings",
  "/soci",
  /*
    Stessa dimenticanza di `/consensi`, sul dominio piu riservato che ci sia:
    `/sport-work` e in `MANAGEMENT_PATH_PREFIXES` e fra i prefissi riservati a
    proprietario e gestore, ma non era qui — e a differenza di ogni altra area
    gestionale non ha un `layout.tsx` che monti `AccessAreaGuard`. La sua shell
    legge il ruolo da `localStorage`, che e del client.

    Le rotte reggono — `sportWorkRoute` risolve il ruolo sul server — quindi
    non usciva un dato. Ma la pagina dei compensi si apriva **senza sessione**,
    e questo elenco esiste esattamente perche non si apra.
  */
  "/sport-work",
  "/sponsors",
  "/staff",
  "/structures",
  "/trainer-dashboard",
  "/trainers",
  "/training",
  /* EasyGame Website (ADR-0200): l'area del gestionale e l'anteprima privata. */
  "/website",
  "/website-preview",
] as const;

/**
 * Percorsi che devono restare raggiungibili senza sessione anche se ricadono
 * sotto un prefisso protetto: fanno parte dei flussi che una sessione la
 * devono ancora creare.
 */
const PUBLIC_EXCEPTIONS = [
  "/auth/complete",
  "/token-verification",
  /*
    La porta dell area atleta: ci arriva chi ha appena ricevuto l invito,
    quindi senza sessione e senza una password. Mandarlo su /login sarebbe
    mandarlo dove non puo entrare.
  */
  "/athlete-dashboard/attiva",
] as const;

const matchesPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * **L'identificativo di richiesta** (Wave 6, §16).
 *
 * Il difetto che chiude: due righe di log prodotte dalla **stessa** richiesta
 * non erano correlabili. Chi indagava su un 500 aveva un messaggio e un
 * orario, e su un runtime che serve molte richieste insieme un orario non
 * distingue niente.
 *
 * Sta qui e non in un helper condiviso perche il middleware gira sul runtime
 * **edge**: importare `src/lib/server/observability.ts` — che riusa
 * `sanitizeMetadata` da `audit.ts`, che importa Prisma — trascinerebbe l'ORM
 * dentro il bundle edge. La duplicazione e di sei righe, e dichiarata:
 * l'alfabeto e i limiti sono gli stessi di `isValidRequestId`, e
 * `tests/server/request-id.test.mjs` verifica che le due letture concordino.
 *
 * **Il valore puo arrivare da fuori**, ed e voluto: un identificativo generato
 * dal browser lega la riga del server alla richiesta che si sta guardando in
 * rete. Ma cio che arriva da fuori non si rimette in un'intestazione senza
 * guardarlo — un valore con dentro un a capo spezzerebbe l'intestazione in
 * due, e uno lunghissimo finirebbe in ogni riga di log della richiesta.
 */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;
export const REQUEST_ID_HEADER = "x-request-id";

const resolveRequestId = (request: NextRequest) => {
  const dichiarato = String(
    request.headers.get(REQUEST_ID_HEADER) || "",
  ).trim();
  if (REQUEST_ID_PATTERN.test(dichiarato)) return dichiarato;

  const generato = globalThis.crypto?.randomUUID?.();
  return (
    generato ||
    `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
};

/**
 * **Gli host del gestionale e quelli dei siti dei club** (ADR-0200 §2, §4).
 *
 * Il gestionale risponde sui suoi host (`EASYGAME_APP_HOSTS`, l'host di
 * `NEXT_PUBLIC_APP_URL`/`AUTH_BASE_URL`, `localhost`, le anteprime di
 * deploy). **Ogni altro host e il dominio di un club**: la richiesta si
 * riscrive verso il renderer del sito (`/site-render/<host>/<percorso>`), che
 * risolve host → sito → revisione pubblicata sul runtime Node — qui, sul
 * runtime edge, Prisma non c'e.
 *
 * Sul dominio di un club le API del gestionale **non esistono**: passano solo
 * quelle pubbliche del sito (`/api/public/website/…`), con l'host dichiarato
 * in un'intestazione. Il cookie di sessione di EasyGame non arriva mai su un
 * dominio diverso, quindi non c'e sessione da proteggere: c'e da non esporre
 * superfici che non servono.
 */
const hostOf = (value: string | undefined | null) => {
  if (!value) return "";
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
};

const APP_HOSTS = new Set(
  [
    ...String(process.env.EASYGAME_APP_HOSTS || "").split(","),
    hostOf(process.env.NEXT_PUBLIC_APP_URL),
    hostOf(process.env.AUTH_BASE_URL),
    "localhost",
    "127.0.0.1",
    "[::1]",
  ]
    .map((value) => value.trim().toLowerCase().replace(/:\d+$/, ""))
    .filter(Boolean),
);

const normalizeHost = (value: string | null) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");

export const isAppHost = (host: string) =>
  !host ||
  APP_HOSTS.has(host) ||
  /* Le anteprime di deploy dell'hosting sono il gestionale, mai il sito di un club. */
  host.endsWith(".vercel.app");

const SITE_HOST_HEADER = "x-easygame-site-host";

/*
  **Il secondo passaggio della riscrittura.** Next ripassa dal middleware il
  percorso riscritto (`/site-render/<host>/<percorso>`) con l'host interno, che
  e quello del gestionale: senza riconoscerlo, ogni pagina tranne la home
  rispondeva 404 (la home sfuggiva perche `/site-render/club.it` sembra un
  file con estensione e il matcher la salta). Il riconoscimento e un segreto
  che il visitatore non conosce — l'intestazione dell'host da sola si
  falsifica, e farebbe disegnare il sito di un club sull'origine del
  gestionale, che porta i cookie di sessione. Con piu istanze si fissa con
  `EASYGAME_SITE_RENDER_SECRET`; altrimenti ne nasce uno per processo.
*/
const SITE_RENDER_HEADER = "x-easygame-site-render";
const SITE_RENDER_SECRET =
  String(process.env.EASYGAME_SITE_RENDER_SECRET || "").trim() ||
  (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

const isInternalSiteRender = (request: NextRequest, pathname: string) => {
  if (request.headers.get(SITE_RENDER_HEADER) !== SITE_RENDER_SECRET) return false;
  const declared = String(request.headers.get(SITE_HOST_HEADER) || "");
  const fromPath = decodeURIComponent(pathname.split("/")[2] || "");
  return Boolean(declared) && declared === fromPath;
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = resolveRequestId(request);

  const host = normalizeHost(request.headers.get("host") || request.headers.get("x-forwarded-host"));
  if (!isAppHost(host)) {
    const headers = new Headers(request.headers);
    headers.set(REQUEST_ID_HEADER, requestId);
    headers.set(SITE_HOST_HEADER, host);
    headers.set(SITE_RENDER_HEADER, SITE_RENDER_SECRET);
    if (pathname.startsWith("/api/")) {
      if (!pathname.startsWith("/api/public/website/")) {
        const blocked = new NextResponse("Not found", { status: 404 });
        blocked.headers.set(REQUEST_ID_HEADER, requestId);
        return blocked;
      }
      const passthrough = NextResponse.next({ request: { headers } });
      passthrough.headers.set(REQUEST_ID_HEADER, requestId);
      return passthrough;
    }
    const target = request.nextUrl.clone();
    target.pathname = `/site-render/${encodeURIComponent(host)}${pathname === "/" ? "" : pathname}`;
    const rewritten = NextResponse.rewrite(target, { request: { headers } });
    rewritten.headers.set(REQUEST_ID_HEADER, requestId);
    return rewritten;
  }

  /* Sul gestionale il renderer interno non si apre per indirizzo. */
  if (pathname === "/site-render" || pathname.startsWith("/site-render/")) {
    if (isInternalSiteRender(request, pathname)) {
      const passa = NextResponse.next();
      passa.headers.set(REQUEST_ID_HEADER, requestId);
      return passa;
    }
    const hidden = new NextResponse("Not found", { status: 404 });
    hidden.headers.set(REQUEST_ID_HEADER, requestId);
    return hidden;
  }

  /*
    L'identificativo viaggia in **due** direzioni, e servono entrambe: in
    avanti verso il route handler, che lo mette nelle righe di log; indietro
    verso il chiamante, perche un messaggio di errore possa citarlo e
    l'assistenza trovare la riga senza chiedere di riprodurre il problema.
  */
  const headersInoltrate = new Headers(request.headers);
  headersInoltrate.set(REQUEST_ID_HEADER, requestId);
  /*
    Sul gestionale l'host di un sito non esiste: un'intestazione con quel nome
    arriva solo dal visitatore, e le rotte pubbliche del sito la credono.
  */
  headersInoltrate.delete(SITE_HOST_HEADER);
  headersInoltrate.delete(SITE_RENDER_HEADER);

  const conIdentificativo = (response: NextResponse) => {
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  };

  const prosegui = () =>
    conIdentificativo(
      NextResponse.next({ request: { headers: headersInoltrate } }),
    );

  /*
    **Le API passano di qui solo per prendere l'identificativo.**

    Il matcher le escludeva del tutto, e quindi le rotte — cioe il posto dove
    gli errori nascono davvero — erano l'unica parte dell'applicazione senza
    modo di correlare due righe. Adesso entrano, e il cancello di
    autenticazione le lascia proseguire subito: devono continuare a rispondere
    **401 JSON**, mai con un redirect a `/login`.
  */
  if (pathname === "/api" || pathname.startsWith("/api/")) return prosegui();

  if (PUBLIC_EXCEPTIONS.some((prefix) => matchesPrefix(pathname, prefix))) {
    return prosegui();
  }

  if (!PROTECTED_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) {
    return prosegui();
  }

  if (request.cookies.get(SESSION_COOKIE_NAME)?.value) {
    return prosegui();
  }

  const loginUrl = new URL("/login", request.url);
  // Solo il percorso interno, mai un URL assoluto: evita open redirect.
  loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
  return conIdentificativo(NextResponse.redirect(loginUrl));
}

export const config = {
  /**
   * Esclude asset di Next e file statici. **Le API adesso sono incluse**: non
   * per applicarci il cancello — il ramo `/api` prosegue sempre — ma perche e
   * l'unico punto in cui l'identificativo di richiesta puo essere generato una
   * volta sola per tutte le righe della stessa richiesta.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images|.*\\.[\\w]+$).*)",
    /*
      `robots.txt` e `sitemap.xml` hanno un'estensione e la regola sopra li
      lascerebbe fuori: sul dominio di un club devono invece arrivare al
      renderer del sito, che li scrive per quel dominio (ADR-0200 §2).
    */
    "/robots.txt",
    "/sitemap.xml",
  ],
};
