import { NextResponse } from "next/server";
import { acceptAthleteAccountInvite } from "@/lib/server/athlete-accounts";

/**
 * **Il riscatto dell'invito. Pubblico per progetto.**
 *
 * Chi apre il link una sessione non ce l'ha, e non puo averla: la sua utenza e
 * nata **senza credenziali note** proprio perche la password la scegliera lui.
 * Chiedere una sessione qui vorrebbe dire chiedergli di accedere prima di
 * avere una password — cioe rendere l'invito inutile.
 *
 * Cio che difende questa rotta e lo stesso presidio del link di pagamento e
 * del riscontro d'iscrizione: un token opaco di 32 byte, di cui in archivio
 * resta il solo SHA-256, con una scadenza, uno stato che passa a `accepted`
 * al primo uso, e una risposta **identica** per token sconosciuto, scaduto,
 * revocato o gia usato.
 *
 * E non c'e niente da dirottare: l'invito porta con se **chi** e stato
 * invitato, quindi il legame nasce verso quell'utenza e non verso chi sta
 * guardando lo schermo.
 *
 * Da qui non esce nessun identificativo interno oltre a quello dell'atleta
 * appena collegato, che e il proprio.
 */

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const corpo = await request
      .json()
      .catch(() => ({}) as Record<string, unknown>);

    const esito = await acceptAthleteAccountInvite(String(corpo.token ?? ""));

    return NextResponse.json({ data: esito, error: null });
  } catch (error: any) {
    /*
      Un solo stato per tutti i motivi di rifiuto: distinguere 404 da 410
      direbbe a chi prova quale forma di token esiste davvero.
    */
    return NextResponse.json(
      {
        data: null,
        error: {
          message: String(
            error?.message || "Invito non valido, gia usato o scaduto",
          ),
        },
      },
      { status: 400 },
    );
  }
}
