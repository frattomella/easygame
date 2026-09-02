import { NextResponse } from "next/server";
import { reportServerError } from "./observability";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "./auth";
import {
  assertSportWorkPermission,
  hasSportWorkPermission,
  type SportWorkPermission,
} from "@/lib/sport-work/permissions";
import { recordAuditEvent, AUDIT_ACTIONS } from "./audit";
import {
  isValidationError,
  validationErrorPayload,
} from "@/lib/validation";
import type { SportWorkScope } from "./sport-work";

/**
 * L'involucro comune delle rotte del lavoro sportivo.
 *
 * **Perche un involucro e non venti copie dello stesso preambolo.** Le rotte
 * di questo dominio sono una ventina e fanno tutte le stesse quattro cose
 * prima di arrivare al lavoro vero: leggere la sessione, risolvere il club
 * attivo, verificare il permesso economico, mappare gli errori. Copiare
 * quel preambolo venti volte significa che il giorno in cui una delle quattro
 * cambia, diciannove rotte restano indietro — e la diciannovesima e quella
 * che perde il confine.
 *
 * Il permesso e un **parametro obbligatorio**: non esiste una rotta di questo
 * dominio senza. Scriverla richiede dichiarare cosa serve per usarla.
 *
 * **Il diniego si traccia.** Un tentativo di leggere i compensi di un altro
 * club, o di erogare senza averne il diritto, e un evento di sicurezza: e la
 * stessa scelta gia presa sul resto delle risorse economiche.
 */

export type SportWorkRouteContext = {
  request: Request;
  url: URL;
  scope: SportWorkScope;
  session: NonNullable<Awaited<ReturnType<typeof requireAuthenticatedUser>>>;
  params: Record<string, string>;
};

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

/**
 * Vero se il messaggio viene dall'ORM o dal driver, non dal dominio.
 *
 * Prisma compone messaggi lunghi che citano il **nome del modello**, la query
 * e il codice d'errore di Postgres. Un identificativo malformato — che e il
 * caso ordinario, non un attacco: un link vecchio, un copia-incolla monco —
 * arriva fino a `findUnique` e ne fa uscire il testo intero verso il client.
 *
 * Chi legge quel messaggio non impara nulla di utile e impara qualcosa che non
 * gli spetta: come si chiamano le tabelle di un dominio che tratta i compensi.
 */
const isInfrastructureError = (message: string) =>
  /Invalid `prisma\.|ConnectorError|PostgresError|invalid input syntax for type uuid|\bat .*node_modules/i.test(
    message,
  );

export const sportWorkFailure = (error: any, fallback: string) => {
  if (isValidationError(error)) {
    return NextResponse.json(validationErrorPayload(error), { status: 400 });
  }

  const raw = String(error?.message || fallback);

  /*
   * Un identificativo che non e un UUID non individua **nessun** record: la
   * risposta onesta e 404, la stessa che riceverebbe un UUID ben formato ma
   * inesistente. Distinguere i due casi direbbe a chi prova che quella forma
   * di identificativo esiste, e non serve a chi ha solo sbagliato link.
   */
  if (/invalid input syntax for type uuid/i.test(raw)) {
    return NextResponse.json(
      { data: null, error: { message: "Risorsa non trovata" } },
      { status: 404 },
    );
  }

  if (isInfrastructureError(raw)) {
    reportServerError(error, {
      metadata: { esito: "[sport-work] errore non gestito" },
    });
    return NextResponse.json(
      { data: null, error: { message: fallback } },
      { status: 400 },
    );
  }

  const status = raw.includes("Accesso negato")
    ? 403
    : /non trovat[ao]/i.test(raw)
      ? 404
      : 400;

  return NextResponse.json({ data: null, error: { message: raw } }, { status });
};

/**
 * **Le coordinate bancarie escono solo da `sport_work.manage`.**
 *
 * `projectPersonForList` le toglie dall'elenco e ne lascia il solo
 * `has_iban`, e il commento che accompagna quella proiezione dichiara che
 * «le coordinate si leggono aprendo la scheda, e chi lo fa ha
 * `sport_work.manage`». Non era vero: `GET /people/:id` chiede
 * `sport_work.read` e restituiva la **riga intera**, IBAN compreso. Lo
 * stesso valeva per il dettaglio di un rapporto, che monta la persona
 * accanto al rapporto.
 *
 * **Perche qui e non nelle due rotte.** Perche le due rotte sono quelle di
 * oggi. La proprieta da tenere non e «questa funzione proietta», e «nessuna
 * risposta di questo dominio porta un IBAN a chi non amministra»: e una
 * proprieta sulle **risposte**, e il solo posto da cui passano tutte e
 * l'involucro. Una rotta scritta domani la eredita senza saperlo.
 *
 * Il campo non sparisce e basta: al suo posto resta `has_iban`, che e cio
 * che l'elenco gia mostra. Chi legge vede che le coordinate esistono e non
 * le legge — che e la distinzione che serve a chi prepara un pagamento
 * senza poterlo disporre.
 */
const redigiCoordinateBancarie = (valore: unknown): unknown => {
  if (Array.isArray(valore)) return valore.map(redigiCoordinateBancarie);
  if (!valore || typeof valore !== "object") return valore;

  const dentro = valore as Record<string, unknown>;
  const fuori: Record<string, unknown> = {};

  for (const [chiave, contenuto] of Object.entries(dentro)) {
    if (chiave === "iban") {
      fuori.has_iban = Boolean(
        typeof contenuto === "string" ? contenuto.trim() : contenuto,
      );
      continue;
    }
    fuori[chiave] = redigiCoordinateBancarie(contenuto);
  }

  return fuori;
};

const rispostaRedatta = async (risposta: Response) => {
  const tipo = risposta.headers.get("content-type") || "";
  if (!tipo.includes("application/json")) return risposta;

  const corpo = await risposta
    .clone()
    .json()
    .catch(() => undefined);
  if (corpo === undefined) return risposta;

  return NextResponse.json(redigiCoordinateBancarie(corpo), {
    status: risposta.status,
  });
};
export const sportWorkRoute =
  (
    permission: SportWorkPermission,
    handler: (context: SportWorkRouteContext) => Promise<Response>,
    fallbackMessage = "Operazione sul lavoro sportivo non riuscita",
  ) =>
  async (request: Request, routeContext?: { params?: Record<string, string> }) => {
    try {
      const session = await requireAuthenticatedUser(request);
      if (!session) return unauthorized();

      const url = new URL(request.url);
      const scope = await resolveOrganizationScopeForUser(
        session.db.user_id,
        url.searchParams.get("organization_id") ||
          request.headers.get("x-active-club-id"),
        request.headers.get("x-active-access-role"),
      );

      try {
        assertSportWorkPermission(scope.activeRole, permission);
      } catch (error: any) {
        await recordAuditEvent({
          action: AUDIT_ACTIONS.resourceAccessDenied,
          outcome: "denied",
          actorUserId: session.db.user_id,
          actorEmail: session.db.user.email,
          actorRole: scope.activeRole,
          organizationId: scope.activeOrganizationId,
          resource: "sport_work",
          resourceId: routeContext?.params?.id || null,
          request,
          metadata: { permission, path: url.pathname, method: request.method },
        });
        return NextResponse.json(
          { data: null, error: { message: String(error?.message) } },
          { status: 403 },
        );
      }

      const risposta = await handler({
        request,
        url,
        session,
        params: routeContext?.params || {},
        scope: {
          userId: scope.userId,
          activeOrganizationId: scope.activeOrganizationId,
          activeRole: scope.activeRole,
          actorEmail: session.db.user.email,
          allowedOrganizationIds: scope.allowedOrganizationIds,
          request,
        },
      });

      return hasSportWorkPermission(scope.activeRole, "sport_work.manage")
        ? risposta
        : await rispostaRedatta(risposta);
    } catch (error: any) {
      return sportWorkFailure(error, fallbackMessage);
    }
  };

export const ok = (data: unknown, status = 200) =>
  NextResponse.json({ data, error: null }, { status });

export const readBody = async (request: Request) =>
  request.json().catch(() => ({}) as Record<string, unknown>);
