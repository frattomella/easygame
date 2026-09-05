import { NextResponse } from "next/server";
import {
  getPhoneNormalizationMessage,
  normalizePhoneNumber,
} from "@/lib/auth/phone-number";
import { publicErrorMessage } from "@/lib/server/api-errors";
import { prisma } from "@/lib/server/prisma";
import {
  buildSessionPayload,
  getSessionFromRequest,
  hashPassword,
  verifyPassword,
} from "@/lib/server/auth";
import {
  getPasswordPolicyMessage,
  validatePassword,
} from "@/lib/auth/password-policy";
import {
  AUTH_RATE_LIMITS,
  consumeRequestRateLimits,
  getRequestIp,
  rateLimitHeaders,
} from "@/lib/server/auth-rate-limit";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);

  return NextResponse.json({
    data: {
      user: session?.payload.user || null,
    },
    error: null,
  });
}

export async function PATCH(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json(
        {
          data: { user: null },
          error: { message: "Sessione non valida" },
        },
        { status: 401 },
      );
    }

    const body = await request.json();
    const email =
      body?.email !== undefined
        ? String(body.email || "")
            .trim()
            .toLowerCase()
        : undefined;
    /*
      **Le chiavi che il soggetto di un dato non puo scrivere su se stesso.**

      `user_metadata` e una colonna JSON libera, e va bene che lo sia: e il
      posto dove una persona tiene le sue preferenze. Ma da qui si scriveva
      **qualunque** chiave, e `isPlatformAdminUser` ne leggeva una: `role`.
      Da un account qualunque — un genitore, un atleta, uno appena registrato
      e senza club — bastava
      `{"user_metadata":{"role":"platform_admin"}}` per diventare
      amministratore della piattaforma alla richiesta successiva.

      Il controllo di `platform-admin.ts` non legge piu quel campo, e questa
      lista e la seconda meta della stessa correzione: due difese per lo stesso
      privilegio, perche una sola prima o poi si dimentica.

      **E infatti se n'e dimenticata una** (terzo round della revisione ostile,
      CRITICAL). La lista aveva tre nomi, e nel frattempo `isPlatformAdminUser`
      aveva imparato a leggerne un quarto: `emailVerified`. Un elenco di nomi
      proibiti va tenuto aggiornato contro ogni lettore futuro, e questo non lo
      e stato per la durata di un commit.

      **La regola che lo chiude in generale**, e non solo per quel nome: le
      chiavi che `buildUserMetadata` **calcola** non si scrivono. Sono una
      **proiezione** di colonne vere — `email_verified_at`, `phone_verified_at`,
      `phone_verification_required`, `role`, `is_club_creator` — e a ogni
      serializzazione vengono ricalcolate e sovrascritte. Persisterle in
      archivio non cambia quindi cio che il browser legge: cambia solo cio che
      leggono i **chiamanti lato server**, che hanno in mano la riga grezza e
      la sua colonna JSON. Una scrittura senza effetto visibile e con un
      effetto invisibile e la forma peggiore che possa avere.
    */
    const CHIAVI_NON_SCRIVIBILI = [
      "role",
      "app_metadata",
      "is_platform_admin",
      /* Le proiezioni calcolate da `buildUserMetadata`: si leggono, non si scrivono. */
      "emailVerified",
      "phoneVerified",
      "phoneVerificationRequired",
      "isClubCreator",
    ];

    const metadataGrezzo =
      (typeof body?.data === "object" && body.data) ||
      (typeof body?.user_metadata === "object" && body.user_metadata) ||
      {};

    const metadata = Object.fromEntries(
      Object.entries(metadataGrezzo).filter(
        ([chiave]) => !CHIAVI_NON_SCRIVIBILI.includes(chiave),
      ),
    ) as Record<string, any>;
    const phone =
      metadata.phone !== undefined
        ? String(metadata.phone || "").trim()
        : undefined;

    if (email !== undefined && !email) {
      return NextResponse.json(
        {
          data: { user: null },
          error: { message: "Email obbligatoria" },
        },
        { status: 400 },
      );
    }

    const requestedPassword =
      body?.password !== undefined ? String(body.password) : undefined;
    if (requestedPassword !== undefined) {
      const passwordPolicy = validatePassword(
        requestedPassword,
        email || session.db.user.email,
      );
      if (!passwordPolicy.valid) {
        return NextResponse.json(
          {
            data: { user: null },
            error: {
              message: getPasswordPolicyMessage(passwordPolicy),
              code: "WEAK_PASSWORD",
            },
          },
          { status: 400 },
        );
      }
    }

    if (email && email !== session.db.user.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser && existingUser.id !== session.db.user_id) {
        return NextResponse.json(
          {
            data: { user: null },
            error: { message: "Email gia in uso" },
          },
          { status: 409 },
        );
      }
    }

    /*
      **Il numero si normalizza qui come alla registrazione.**

      Senza normalizzazione lo stesso numero scritto in due modi produceva due
      valori diversi in colonna, e il legame fra challenge e numero corrente
      (`verifyInternalChallenge`) non si sarebbe mai chiuso: la persona avrebbe
      ricevuto l'SMS e il codice sarebbe stato rifiutato, senza capire perche.
      Un numero vuoto **non e** un modo per togliersi il cellulare: e
      obbligatorio, e chi lo cancella riceve lo stesso rifiuto di chi lo scrive
      male.
    */
    let phoneNormalizzato: string | undefined;
    if (phone !== undefined) {
      const numero = normalizePhoneNumber(phone);
      if (!numero.valid) {
        return NextResponse.json(
          {
            data: { user: null },
            error: {
              message: getPhoneNormalizationMessage(numero.reason),
              code: "INVALID_PHONE",
            },
          },
          { status: 400 },
        );
      }
      phoneNormalizzato = numero.e164;
    }

    const emailChanged = email !== undefined && email !== session.db.user.email;
    const phoneChanged =
      phoneNormalizzato !== undefined &&
      phoneNormalizzato !== String(session.db.user.phone || "");

    /*
      **Cambiare recapito richiede la password corrente (chiude W4-R13).**

      Era registrato come debito: «chiedere anche la password corrente e la
      difesa che manca ancora». Con PP-05 non e piu rimandabile, perche il
      recapito e diventato un **fattore**: chi possiede una sessione altrui —
      un browser lasciato aperto, un Bearer sfuggito — poteva sostituire
      indirizzo e numero con i propri, verificarli, e diventare il titolare
      dell'account a tutti gli effetti, con il proprietario chiuso fuori dal suo
      stesso recupero password.

      La password corrente e cio che una sessione rubata **non** porta con se.
      Vale per l'indirizzo, per il numero e per la password nuova; non vale per
      nome, cognome e preferenze, che non sono fattori.
    */
    if (emailChanged || phoneChanged || requestedPassword !== undefined) {
      /*
        **Un tetto ai tentativi, e una riga nel registro** (MEDIUM-7 della
        revisione ostile PP-05A).

        La richiesta della password attuale e nata contro la sessione rubata, e
        senza contatore la sessione rubata poteva semplicemente **indovinarla**:
        misurati venticinque tentativi di fila senza un solo 429, e nessun
        evento di audit a raccontarlo. Il contatore si consuma **prima** del
        confronto, altrimenti conterebbe i successi e non i tentativi.
      */
      const cambioRateLimit = await consumeRequestRateLimits([
        {
          policy: AUTH_RATE_LIMITS.credentialChangeIp,
          identifier: `credential:ip:${getRequestIp(request)}`,
        },
        {
          policy: AUTH_RATE_LIMITS.credentialChangeAccount,
          identifier: `credential:account:${session.db.user_id}`,
        },
      ]);
      if (cambioRateLimit) {
        return NextResponse.json(
          {
            data: { user: null },
            error: {
              message: "Troppi tentativi. Riprova più tardi.",
              code: "RATE_LIMITED",
            },
          },
          { status: 429, headers: rateLimitHeaders(cambioRateLimit) },
        );
      }

      const currentPassword = String(body?.currentPassword || "");
      const passwordCorretta =
        Boolean(currentPassword) &&
        (await verifyPassword(currentPassword, session.db.user.password_hash));

      if (!passwordCorretta) {
        await recordAuditEvent({
          action: AUDIT_ACTIONS.authLoginFailure,
          outcome: "failure",
          actorUserId: session.db.user_id,
          actorEmail: session.db.user.email,
          request,
          /*
            Il motivo dice **quale porta** e stata provata: senza, questa riga
            si confonderebbe con un login sbagliato, e chi legge il registro
            non saprebbe che qualcuno con una sessione valida stava provando a
            cambiare i recapiti.
          */
          metadata: { reason: "wrong_current_password_on_credential_change" },
        });
        return NextResponse.json(
          {
            data: { user: null },
            error: {
              message:
                "Per cambiare email, cellulare o password serve la password attuale.",
              code: "CURRENT_PASSWORD_REQUIRED",
            },
          },
          { status: 403 },
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id: session.db.user_id },
      data: {
        email: emailChanged ? email : undefined,
        password_hash: requestedPassword
          ? await hashPassword(requestedPassword)
          : undefined,
        first_name:
          metadata.firstName !== undefined
            ? String(metadata.firstName || "")
            : undefined,
        last_name:
          metadata.lastName !== undefined
            ? String(metadata.lastName || "")
            : undefined,
        phone: phoneNormalizzato,
        /*
          **Cambio recapito → nuova verifica.** Le due righe c'erano gia; cio
          che mancava era che qualcuno le facesse valere, e a farle valere e il
          legame fra challenge e destinatario in `verifyInternalChallenge`:
          senza, un codice emesso per il recapito vecchio confermava quello
          nuovo, e l'azzeramento era teatro.
        */
        email_verified_at: emailChanged ? null : undefined,
        phone_verified_at: phoneChanged ? null : undefined,
        phone_verification_required: phone !== undefined ? true : undefined,
        organization_name:
          metadata.organizationName !== undefined
            ? metadata.organizationName || null
            : undefined,
        user_metadata: {
          ...(typeof session.db.user.user_metadata === "object" &&
          session.db.user.user_metadata
            ? session.db.user.user_metadata
            : {}),
          ...metadata,
        },
      },
    });

    /*
      **Cambiare credenziali chiude le altre sessioni.**

      La password si riscriveva senza chiedere quella corrente e senza toccare
      le sessioni aperte, e l'indirizzo pure: una sessione presa in prestito —
      un browser lasciato aperto, un Bearer sfuggito dal flusso mobile —
      diventava proprieta definitiva del conto, perche chi la teneva poteva
      cambiare password e indirizzo e restare dentro mentre il proprietario
      restava fuori.

      Il reset via email lo faceva gia (`confirmPasswordReset` cancella tutte
      le sessioni nella stessa transazione della scrittura): qui mancava.
      Questa sessione resta viva, cosi chi sta legittimamente cambiando i
      propri dati non si ritrova sloggato; tutte le altre cadono, e chi
      possedeva quella vera se ne accorge subito.

      Chiedere **anche** la password corrente e la difesa che manca ancora, ed
      e una modifica a due schermate: e registrata come debito (W4-R13).
    */
    if (emailChanged || phoneChanged || requestedPassword !== undefined) {
      await prisma.session.deleteMany({
        where: {
          user_id: session.db.user_id,
          NOT: { id: session.db.id },
        },
      });
    }

    return NextResponse.json({
      data: {
        user: buildSessionPayload(
          updated,
          session.payload.access_token,
          session.db.expires_at,
        ).user,
      },
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: { user: null },
        // Il testo interno di Prisma non esce dalla rotta.
        error: { message: publicErrorMessage(error, "Errore aggiornamento utente") },
      },
      { status: 500 },
    );
  }
}
