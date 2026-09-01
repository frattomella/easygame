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
] as const;

/**
 * Percorsi che devono restare raggiungibili senza sessione anche se ricadono
 * sotto un prefisso protetto: fanno parte dei flussi che una sessione la
 * devono ancora creare.
 */
const PUBLIC_EXCEPTIONS = ["/auth/complete", "/token-verification"] as const;

const matchesPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_EXCEPTIONS.some((prefix) => matchesPrefix(pathname, prefix))) {
    return NextResponse.next();
  }

  if (!PROTECTED_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) {
    return NextResponse.next();
  }

  if (request.cookies.get(SESSION_COOKIE_NAME)?.value) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  // Solo il percorso interno, mai un URL assoluto: evita open redirect.
  loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  /**
   * Esclude API, asset di Next e file statici. Le API devono continuare a
   * rispondere con 401 JSON, non con un redirect.
   */
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|images|.*\\.[\\w]+$).*)"],
};
