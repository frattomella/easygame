import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/server/cron-auth";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { isPlatformAdminUser } from "@/lib/platform-admin";
import { runScheduledMaintenance } from "@/lib/server/maintenance";

/**
 * La manutenzione periodica.
 *
 *   POST /api/v1/maintenance   — a mano, o da un cron con `x-maintenance-token`
 *   GET  /api/v1/maintenance   — da Vercel Cron, con `CRON_SECRET`
 *
 * Cancella cio che e scaduto — sessioni, sfide OTP, contatori di rate limit,
 * audit oltre la retention. **Nessuna schermata le legge**, quindi nessuna
 * schermata le pulira mai: e l'unica cosa dell'audit del punto 13 che doveva
 * davvero essere periodica. Il ragionamento su tutto il resto sta in
 * `src/lib/server/maintenance.ts`.
 *
 * **Chi puo azionarla.** Due strade, e nessuna delle due e «chiunque»:
 *
 * 1. un segreto condiviso in `x-maintenance-token`, confrontato con
 *    `EASYGAME_MAINTENANCE_TOKEN`. Serve a un cron, che non ha una sessione;
 * 2. una sessione di `platform_admin`, per poterla lanciare a mano.
 *
 * Se il segreto **non e configurato** la prima strada e chiusa: un confronto
 * con una stringa vuota aprirebbe la rotta a chiunque mandi un header vuoto,
 * ed e esattamente il modo in cui una porta di servizio diventa un ingresso.
 *
 * **Perche una rotta e non un servizio di scheduling dell'hosting.**
 * [ADR-0007](../../../../docs/knowledge-base/18-decision-log.md) vieta di
 * legarsi a servizi proprietari. Qui il *trigger* e fuori: Vercel Cron,
 * un'azione GitHub, il cron di una macchina, o una persona con `curl`. Il
 * giorno in cui il dominio si sposta fuori da Next.js, si sposta la funzione
 * e non il meccanismo.
 *
 * **Perche adesso esiste anche un `GET`.** Vercel Cron sa invocare una sola
 * cosa: un `GET` senza corpo e senza intestazioni proprie. Finche la porta era
 * solo `POST`, la pulizia era «azionabile da un cron» in teoria e non girava
 * mai davvero: le righe scadute restavano li a crescere.
 *
 * **Perche il `GET` non riapre il problema che il `POST` evitava.** Il timore
 * era che un `GET` lo esegua un prefetch del browser, un antivirus o un
 * crawler. Nessuno dei tre porta il segreto: qui **senza `CRON_SECRET`
 * corretto non si cancella niente**, e la regola e piu severa di quella delle
 * altre porte di cron del progetto —
 *
 *   - `CRON_SECRET` e obbligatorio **in ogni ambiente**, produzione compresa e
 *     sviluppo compreso: se non e configurato la rotta risponde `503` e non
 *     esegue nulla. Non c'e la scorciatoia «fuori da produzione passa
 *     comunque» che ha il giro del lavoro sportivo, perche quel giro riscrive
 *     stati e questo cancella righe;
 *   - il confronto passa da `secretsMatch`, a tempo costante, come per
 *     `EASYGAME_MAINTENANCE_TOKEN`.
 *
 * Le due strade del `POST` restano invariate: `ADR-0007` vieta di legarsi a un
 * servizio dell'hosting, quindi il token condiviso continua a valere per un
 * cron che non sia quello di Vercel.
 */

export const runtime = "nodejs";

/**
 * Confronto a tempo costante fra due segreti.
 *
 * Un `===` su una stringa esce al primo carattere diverso, e il tempo che ci
 * mette dice quanti caratteri iniziali erano giusti. Su una rotta pubblica e
 * abbastanza per indovinare un segreto un carattere alla volta.
 */
const secretsMatch = (left: string, right: string) => {
  if (!left || !right || left.length !== right.length) return false;

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
};

export async function POST(request: Request) {
  const configuredToken = String(
    process.env.EASYGAME_MAINTENANCE_TOKEN || "",
  ).trim();
  const presentedToken = String(
    request.headers.get("x-maintenance-token") || "",
  ).trim();

  const authorizedByToken =
    Boolean(configuredToken) && secretsMatch(configuredToken, presentedToken);

  if (!authorizedByToken) {
    const session = await requireAuthenticatedUser(request);
    if (!session || !isPlatformAdminUser(session.db.user)) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Accesso negato: la manutenzione la aziona un cron autorizzato o chi amministra la piattaforma",
          },
        },
        { status: 403 },
      );
    }
  }

  const report = await runScheduledMaintenance();

  /*
    Un passo fallito non fa fallire la richiesta: il resto della pulizia e
    stato fatto, e il rapporto dice quale passo non e riuscito. Rispondere 500
    farebbe risultare rotto un sistema sano e, con un cron che riprova,
    ripeterebbe anche i passi andati a buon fine.
  */
  return NextResponse.json({ data: report, error: null });
}

/**
 * La porta di Vercel Cron.
 *
 * Il segreto non e opzionale: manca -> `503`, in **qualunque** ambiente, ed e
 * per questo che un prefetch o un crawler non aziona niente. La regola vive in
 * `src/lib/server/cron-auth.ts`, che dall'audit di fine Wave 1 e la sola porta
 * di tutti e quattro i giri: era nata qui perche la manutenzione cancella
 * righe, e si e scoperto che valeva per tutti.
 */
export async function GET(request: Request) {
  const denied = authorizeCronRequest(request, "la manutenzione periodica");
  if (denied) return denied.response;

  const report = await runScheduledMaintenance();

  return NextResponse.json({ data: report, error: null });
}
