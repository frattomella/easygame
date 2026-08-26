import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { isPlatformAdminUser } from "@/lib/platform-admin";
import { runScheduledMaintenance } from "@/lib/server/maintenance";

/**
 * La manutenzione periodica.
 *
 *   POST /api/v1/maintenance
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
 * **Perche `POST` e non `GET`.** Cancella righe. Un `GET` lo esegue un
 * prefetch del browser, un antivirus o un crawler.
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
