import { NextResponse } from "next/server";

/**
 * L'unica porta da cui entra un giro automatico.
 *
 * **Perche un modulo e non quattro copie.** Fino all'audit di fine Wave 1 le
 * quattro rotte schedulate in `vercel.json` avevano ognuna la propria versione
 * di questo controllo, e non dicevano la stessa cosa: la manutenzione
 * pretendeva il segreto in ogni ambiente e lo confrontava a tempo costante; le
 * altre tre lasciavano passare **chiunque** quando `CRON_SECRET` non era
 * configurato e `NODE_ENV` non era `production`, con un confronto `!==`.
 *
 * Su una porta che manda email a tutte le famiglie di tutti i club, «fuori da
 * produzione passa comunque» non e una comodita di sviluppo: e una porta
 * aperta su ogni ambiente che non si chiami produzione, anteprime comprese
 * quando la variabile manca. Il §5.3 punto 14 del planning della Wave 1 lo
 * diceva gia — «ogni porta cron risponde `503` se `CRON_SECRET` non e
 * configurato e `401` se il `Bearer` non corrisponde. Mai `200` a vuoto» — e
 * tre porte su quattro non lo facevano.
 *
 * Il prezzo e che per provare un giro in locale bisogna avviare
 * l'applicazione con `CRON_SECRET` in ambiente. E il prezzo giusto: e cio che
 * fanno gli script di collaudo della Wave.
 *
 * **Perche il trigger resta fuori.** Il segreto e un `Bearer` su una rotta
 * HTTP: qualunque schedulatore puo azionarla, non solo Vercel Cron. ADR-0007
 * vieta di legarsi a un servizio dell'hosting, e questa forma non lo fa.
 */

/**
 * Confronto a tempo costante.
 *
 * Un confronto normale esce al primo carattere diverso, e il tempo di risposta
 * racconta quanti caratteri erano giusti. Su un segreto che aziona la
 * cancellazione di righe non e un rischio teorico che valga la pena correre.
 */
const secretsMatch = (left: string, right: string) => {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

const cronError = (message: string, status: number) =>
  NextResponse.json({ data: null, error: { message } }, { status });

export type CronAuthorization = { response: NextResponse } | null;

/**
 * `null` se la richiesta puo procedere, altrimenti la risposta da restituire.
 *
 *     const denied = authorizeCronRequest(request, "il giro dei certificati");
 *     if (denied) return denied.response;
 */
export const authorizeCronRequest = (
  request: Request,
  what: string,
): CronAuthorization => {
  const cronSecret = String(process.env.CRON_SECRET || "").trim();

  if (!cronSecret) {
    return {
      response: cronError(
        `CRON_SECRET non configurato: ${what} non si aziona senza segreto.`,
        503,
      ),
    };
  }

  const presented = String(request.headers.get("authorization") || "").trim();
  const expected = `Bearer ${cronSecret}`;

  if (!secretsMatch(expected, presented)) {
    return {
      response: cronError("Accesso negato: cron non autenticato", 401),
    };
  }

  return null;
};
