import { NextResponse } from "next/server";
import { assertActiveClub } from "@/lib/auth/active-club-boundary";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import { canAccessClubResource } from "@/lib/access-roles";
import {
  isPaymentExcludedFromTotals,
  isPaymentPaidLike,
} from "@/lib/payments/payment-status-utils";
import {
  lockInstallmentAndTransaction,
  recomputeChargeFromLedger,
} from "@/lib/server/payment-transactions";
import { publicErrorMessage } from "@/lib/server/api-errors";

type Context = {
  params: {
    paymentId: string;
  };
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const asDateOrNull = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toAmount = (value: unknown) => {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : NaN;
};

/*
  Il PIN di club e stato rimosso (Blocco 7, punto 17).

  Non era un meccanismo di sicurezza:

  - il valore predefinito era `"1234"`, scritto in chiaro sia qui sia nel
    client, in un repository pubblico;
  - `payment_pin` era fra i campi proiettabili di `/api/v1/clubs/:id`, quindi
    chiunque potesse leggere il club poteva **leggere il PIN**;
  - era un segreto condiviso da tutto il club: non diceva chi avesse agito.

  Cio che protegge davvero questa rotta c'era gia e resta: sessione valida,
  appartenenza all'organizzazione, regole di dominio (un pagamento gia pagato
  non si modifica ne si elimina) e traccia di audit con l'id di chi ha agito.
  In piu ora c'e un controllo di **ruolo**, che il PIN non ha mai fatto: prima
  un allenatore con accesso al club poteva modificare un pagamento conoscendo
  quattro cifre uguali per tutti.
*/

/** Le sole azioni che questa rotta conosce. */
const KNOWN_ACTIONS = new Set(["update", "delete", "cancel"]);

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ data: null, error: { message } }, { status });

export async function PATCH(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return jsonError("Sessione non valida", 401);
    }

    const payment = await prisma.athletePayment.findUnique({
      where: { id: context.params.paymentId },
    });
    if (!payment) {
      return jsonError("Pagamento non trovato", 404);
    }

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
    );
    /*
      **Il confine e il club attivo, e questa rotta era l'anti-pattern in
      chiaro.**

      Il permesso si verifica due righe sotto con `scope.activeRole`, che e il
      ruolo nel club **attivo**; il confine guardava l'elenco di tutti i club
      dell'utente. Chi possiede una societa e in un'altra e soltanto genitore
      poteva mandare `x-active-club-id: <la propria>` con l'identificativo di
      una rata dell'altra, e riscriverla, annullarla o **cancellarla** — e la
      cancellazione porta via in cascata ogni incasso, storno e rimborso
      collegato, cioe l'invariante centrale di questa Wave.

      La correzione e stata fatta in quindici moduli e questo file non c'era:
      sta sotto `/api/`, non sotto `/api/v1/`, e la ricerca si era fermata al
      secondo. Vedi `src/lib/auth/active-club-boundary.ts`.
    */
    assertActiveClub(scope, payment.organization_id, "il pagamento");

    /*
      **Due porte sulla stessa riga, e una sola diceva di no.**

      Questa rotta pretendeva la direzione; `PATCH /api/v1/payments/:id`, che
      scrive la **stessa riga**, diceva si alla segreteria. Misurato:
      l'importo di una rata passava da 100 a 999 dalla seconda porta mentre
      la prima rispondeva 403. Una regola che un'altra porta non applica non
      e una regola: e una dimenticanza scritta due volte al contrario.

      Il proprietario della decisione «chi puo toccare una rata» e la
      **matrice per risorsa**, e li la scelta e esplicita e provata da
      `tests/server/payment-delete-guard.test.mjs`: la segreteria legge,
      registra e modifica una rata, e **non** la cancella. Questa rotta la
      chiede invece di riscriverla, e cosi le due porte non possono piu
      divergere.

      Nessun permesso nuovo: e cio che il registro generico gia concedeva.
      Cambia che adesso lo concedono **entrambe**, o nessuna.
    */
    const verbo = request.method === "DELETE" ? "delete" : "update";
    if (!canAccessClubResource(scope.activeRole, "payments", verbo)) {
      return jsonError(
        "Accesso negato: solo il proprietario o un gestore del club puo modificare un pagamento",
        403,
      );
    }

    const body = await request.json().catch(() => ({}));

    const action = String(body?.action || "update").trim();
    const now = new Date();
    const auditBase = {
      actorUserId: session.db.user_id,
      at: now.toISOString(),
      action,
    };

    if (!KNOWN_ACTIONS.has(action)) {
      return jsonError("Azione pagamento non supportata");
    }

    /*
      L'importo si valida prima di aprire la transazione: e un controllo di
      forma, non dipende da cosa c'e in archivio, e sbagliarlo non merita di
      mettersi in fila per una riga.
    */
    const updates = asRecord(body?.updates);
    const amount = action === "update" ? toAmount(updates.amount) : 0;
    if (action === "update" && (!Number.isFinite(amount) || amount <= 0)) {
      return jsonError("Importo non valido");
    }

    /*
      Da qui in avanti si lavora sulla rata **bloccata e riletta**, non su
      quella caricata per il controllo di accesso.

      Cambiare l'importo di una rata cambia il residuo, quindi cambia lo
      stato: questa rotta e la quarta operazione che decide sullo stato
      economico di una rata, dopo incasso, storno e rimborso. Senza mettersi
      nella stessa fila, il suo `recomputeChargeFromLedger` — che girava fuori
      da qualunque transazione — poteva scrivere uno stato calcolato **prima**
      che un incasso concorrente entrasse: la rata restava `pending` con 130
      euro incassati sopra, che e esattamente la contraddizione fra stato e
      importi che ADR-0067 esiste per chiudere.

      E i tre rami riscrivono `data` per intero: letto fuori dalla
      transazione, il ricalcolo di un incasso appena committato — che scrive
      `data.ledger` — spariva sotto la copia vecchia.
    */
    const result = await (prisma as any).$transaction(async (client: any) => {
      await lockInstallmentAndTransaction(client, payment.id);

      const fresh = await client.athletePayment.findUnique({
        where: { id: payment.id },
      });

      if (!fresh) {
        return { error: "Pagamento non trovato", status: 404 } as const;
      }

      const currentData = asRecord(fresh.data);

      if (isPaymentExcludedFromTotals(fresh)) {
        return { error: "Il pagamento e gia annullato", status: 400 } as const;
      }

      if (action === "update") {
        if (isPaymentPaidLike(fresh)) {
          return {
            error: "I pagamenti gia pagati non possono essere modificati",
            status: 400,
          } as const;
        }

        /*
          Lo stato di una rata non arriva dal client, nemmeno da qui.

          Questa rotta accettava lo `status` mandato dal client e lo
          scriveva: bastava modificare l'importo di una rata scoperta mandando
          `status: "paid"` per farla risultare saldata senza che fosse entrato
          un euro, e la rotta le metteva pure una data di pagamento. Lo stato
          si ricava dagli incassi (ADR-0036) e lo riscrive
          `payment-transactions.ts`: qui si conserva quello che c'e, e le altre
          modifiche — importo, scadenza, descrizione, note — passano come prima.
        */
        const updated = await client.athletePayment.update({
          where: { id: fresh.id },
          data: {
            description:
              String(updates.description || "").trim() || fresh.description,
            amount,
            due_date: asDateOrNull(updates.dueDate),
            status: String(fresh.status || "pending").trim(),
            method: String(updates.method || fresh.method || "").trim() || null,
            notes: String(updates.notes || "").trim() || null,
            paid_at: fresh.paid_at || null,
            data: {
              ...currentData,
              updatedAt: now.toISOString(),
              updatedBy: session.db.user_id,
              audit: [
                ...(Array.isArray(currentData.audit) ? currentData.audit : []),
                {
                  ...auditBase,
                  before: {
                    description: fresh.description,
                    amount: fresh.amount,
                    dueDate: fresh.due_date?.toISOString() || null,
                    status: fresh.status,
                    notes: fresh.notes || null,
                  },
                },
              ],
            },
          },
        });

        /*
          Cambiare l'importo cambia il debito, quindi puo cambiare lo stato:
          una rata da 130 con 100 incassati e parziale, la stessa rata portata
          a 100 e saldata. Il ricalcolo lo fa il proprietario del dominio, non
          questa rotta — e gira dentro la stessa transazione che tiene la riga.
        */
        const settled = await recomputeChargeFromLedger(client, fresh.id);

        return { data: settled || updated } as const;
      }

      if (action === "delete" && isPaymentPaidLike(fresh)) {
        return {
          error:
            "I pagamenti pagati non possono essere eliminati: annullali invece",
          status: 400,
        } as const;
      }

      const isDelete = action === "delete";
      const reason =
        String(body?.reason || "").trim() ||
        (isDelete
          ? "Pagamento eliminato dallo storico atleta"
          : "Pagamento annullato dallo storico atleta");

      const updated = await client.athletePayment.update({
        where: { id: fresh.id },
        data: {
          status: "cancelled",
          data: {
            ...currentData,
            ...(isDelete
              ? {
                  deletedAt: now.toISOString(),
                  deletedBy: session.db.user_id,
                  deletionReason: reason,
                }
              : {
                  cancelledAt: now.toISOString(),
                  cancelledBy: session.db.user_id,
                  cancellationReason: reason,
                }),
            originalStatus: fresh.status,
            originalPaidAt: fresh.paid_at?.toISOString() || null,
            originalAmount: fresh.amount,
            excludedFromTotals: true,
            audit: [
              ...(Array.isArray(currentData.audit) ? currentData.audit : []),
              auditBase,
            ],
          },
        },
      });

      return { data: updated } as const;
    });

    if ("error" in result) {
      return jsonError(result.error, result.status);
    }

    return NextResponse.json({ data: result.data, error: null });
  } catch (error: any) {
    /*
      Il messaggio del driver non esce di qui: un `paymentId` che non e un
      UUID faceva rispondere con l'invocazione Prisma per intero — nome del
      modello, operazione, codice Postgres. Il dettaglio resta nei log del
      server, dove serve.
    */
    console.error("PATCH /api/athlete-payments/[paymentId]", error);
    return jsonError(
      publicErrorMessage(error, "Errore aggiornamento pagamento"),
      500,
    );
  }
}
