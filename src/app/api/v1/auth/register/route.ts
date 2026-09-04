import { NextResponse } from "next/server";
import {
  readRequestId,
  reportServerError,
} from "@/lib/server/observability";
import { prisma } from "@/lib/server/prisma";
import { hashPassword, verifyPassword } from "@/lib/server/auth";
import {
  VerificationRejected,
  createVerificationReference,
  canDeliverPhoneOtp,
  isPhoneVerificationRequired,
  sendEmailVerificationChallenge,
  sendPhoneVerificationChallenge,
} from "@/lib/server/auth-workflows";
import {
  AUTH_RATE_LIMITS,
  consumeRequestRateLimits,
  getRequestIp,
  rateLimitHeaders,
} from "@/lib/server/auth-rate-limit";
import {
  getPasswordPolicyMessage,
  validatePassword,
} from "@/lib/auth/password-policy";
import { normalizePublicRegistrationRole } from "@/lib/auth/registration-policy";
import {
  getPhoneNormalizationMessage,
  maskPhoneNumber,
  normalizePhoneNumber,
} from "@/lib/auth/phone-number";
import { parseInput, validationErrorPayload } from "@/lib/validation";
import { registerInputSchema } from "@/lib/validation/schemas";
import { resolveEmailVerificationPolicy } from "@/lib/auth/email-verification-policy";
import {
  EmailDeliveryError,
  getEmailErrorMessage,
  isEmailDeliveryConfigured,
} from "@/lib/server/email/email-service";

/**
 * Manda il codice, e se il cooldown lo vieta non e un errore.
 *
 * La registrazione ripetuta di un indirizzo non ancora verificato riapre la
 * stessa schermata di verifica: se e passato meno di un minuto dal codice
 * precedente, `createInternalChallenge` rifiuta di aprirne un altro **e lascia
 * vivo quello gia inviato**. Da qui la risposta e la stessa di un invio
 * riuscito, perche per chi guarda lo schermo lo e: il codice che ha in mano
 * funziona.
 */
const senzaCooldown = async (
  invio: () => Promise<{ sent: boolean; previewCode: string | null }>,
) => {
  try {
    return await invio();
  } catch (error) {
    if (
      error instanceof VerificationRejected &&
      error.code === "RESEND_TOO_SOON"
    ) {
      return { sent: false, previewCode: null };
    }
    throw error;
  }
};

const registrationResponse = ({
  verificationReference,
  email,
  phone,
  emailPreviewCode = null,
  phonePreviewCode = null,
}: {
  verificationReference: string;
  email: string;
  phone: string | null;
  emailPreviewCode?: string | null;
  phonePreviewCode?: string | null;
}) =>
  NextResponse.json(
    {
      data: {
        user: null,
        session: null,
        verification: {
          userId: verificationReference,
          email,
          /*
            **Mascherato.** Questa risposta esce senza sessione: chi la riceve
            ha appena scritto il numero e lo riconosce dalle ultime tre cifre,
            e chi la riceve **per un account che esisteva gia** — il ramo
            dell'indirizzo occupato, che risponde identico per non rivelare
            l'occupazione — non deve poter leggere il recapito di quell'altra
            persona. Restituirlo per intero avrebbe reso quel ramo, nato per
            non dire niente, il modo piu comodo per farsi dire un numero.
          */
          phone: phone ? maskPhoneNumber(phone) : null,
          emailRequired: true,
          phoneRequired: Boolean(phone) && isPhoneVerificationRequired(),
          emailPreviewCode,
          phonePreviewCode,
        },
      },
      error: null,
    },
    { status: 202 },
  );

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userData =
      (typeof body?.options?.data === "object" && body.options.data) ||
      (typeof body?.userData === "object" && body.userData) ||
      {};

    let email = "";
    let password = "";
    try {
      const input = parseInput(registerInputSchema, body);
      email = input.email;
      password = input.password;
    } catch (error) {
      return NextResponse.json(
        {
          ...validationErrorPayload(error),
          data: { user: null, session: null },
        },
        { status: 400 },
      );
    }

    const passwordPolicy = validatePassword(password, email);
    if (!passwordPolicy.valid) {
      return NextResponse.json(
        {
          data: { user: null, session: null },
          error: {
            message: getPasswordPolicyMessage(passwordPolicy),
            code: "WEAK_PASSWORD",
          },
        },
        { status: 400 },
      );
    }

    const ip = getRequestIp(request);
    const rateLimit = await consumeRequestRateLimits([
      { policy: AUTH_RATE_LIMITS.registerIp, identifier: `ip:${ip}` },
      {
        policy: AUTH_RATE_LIMITS.registerIdentity,
        identifier: `identity:${email}`,
      },
    ]);
    if (rateLimit) {
      return NextResponse.json(
        {
          data: { user: null, session: null },
          error: {
            message: "Troppe richieste. Riprova più tardi.",
            code: "RATE_LIMITED",
          },
        },
        { status: 429, headers: rateLimitHeaders(rateLimit) },
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    const shouldCreateClub = Boolean(body?.createClub ?? userData.createClub);
    const role = normalizePublicRegistrationRole(
      userData.role,
      shouldCreateClub,
    );
    const first_name = String(userData.firstName || "").trim() || null;
    const last_name = String(userData.lastName || "").trim() || null;
    const phoneVerificationEnabled = canDeliverPhoneOtp();
    const emailVerificationPolicy = resolveEmailVerificationPolicy(
      await isEmailDeliveryConfigured(),
    );

    /*
      **Email e cellulare sono entrambi obbligatori (ADR-0115).**

      Prima il numero si raccoglieva solo se un fornitore SMS era configurato,
      quindi su ogni installazione reale non si raccoglieva affatto e l'intero
      flusso di verifica era irraggiungibile. Adesso il numero si chiede
      sempre, si normalizza in E.164 e si rifiuta se non e un cellulare: e un
      dato del prodotto, non una funzione del fornitore.

      Il rifiuto arriva **prima** di guardare se l'indirizzo esista gia: un
      numero malformato risponde allo stesso modo per un indirizzo libero e per
      uno occupato, e non diventa quindi un modo per sapere quale dei due sia.
    */
    const numero = normalizePhoneNumber(userData.phone);
    if (!numero.valid) {
      return NextResponse.json(
        {
          data: { user: null, session: null },
          error: {
            message: getPhoneNormalizationMessage(numero.reason),
            code: "INVALID_PHONE",
          },
        },
        { status: 400 },
      );
    }
    const phone = numero.e164;
    const organization_name = String(
      userData.organizationName ||
        [first_name, last_name].filter(Boolean).join(" ").trim() ||
        "Nuovo Club",
    ).trim();

    if (existingUser) {
      const passwordMatches = await verifyPassword(
        password,
        existingUser.password_hash,
      );

      if (passwordMatches && !existingUser.email_verified_at) {
        const verificationReference = createVerificationReference();
        const pendingUser = await prisma.user.update({
          where: { id: existingUser.id },
          data: { token_verification_id: verificationReference },
        });
        const emailChallenge = emailVerificationPolicy.canSendOtp
          ? await senzaCooldown(() =>
              sendEmailVerificationChallenge(pendingUser, "signup"),
            )
          : { sent: false, previewCode: null };
        const phoneChallenge = phoneVerificationEnabled
          ? await senzaCooldown(() =>
              sendPhoneVerificationChallenge(pendingUser, "signup"),
            )
          : { sent: false, previewCode: null };

        return registrationResponse({
          verificationReference,
          email,
          phone: pendingUser.phone || null,
          emailPreviewCode: emailChallenge.previewCode,
          phonePreviewCode: phoneChallenge.previewCode,
        });
      }

      return registrationResponse({
        verificationReference: createVerificationReference(),
        email,
        phone,
      });
    }

    const password_hash = await hashPassword(password);
    const verificationReference = createVerificationReference();

    const createdUser = await prisma.user.create({
      data: {
        email,
        password_hash,
        first_name,
        last_name,
        phone,
        /*
          **Il flag si scrive sempre a `true`.** Prima dipendeva dalla presenza
          di un fornitore SMS: un account creato prima del contratto restava
          `false` per sempre, e non tornava mai a chiedere la verifica quando
          l'operatore arrivava. Il flag dice «questo account deve verificare il
          numero», che e una proprieta dell'account; se la verifica **blocchi**
          l'accesso lo decide `isPhoneVerificationRequired()` al momento della
          sessione, che e una proprieta dell'installazione e cambia con essa.
        */
        phone_verification_required: true,
        role,
        is_club_creator: shouldCreateClub,
        organization_name: shouldCreateClub ? organization_name : null,
        token_verification_id: verificationReference,
        user_metadata: {
          firstName: first_name || undefined,
          lastName: last_name || undefined,
          name:
            String(userData.name || "").trim() ||
            [first_name, last_name].filter(Boolean).join(" ").trim() ||
            undefined,
          phone: phone || undefined,
          accessCode: userData.accessCode || undefined,
          role,
          createClub: shouldCreateClub,
          organizationName: shouldCreateClub ? organization_name : undefined,
          isClubCreator: shouldCreateClub,
        },
      },
    });

    const emailChallenge = emailVerificationPolicy.canSendOtp
      ? await senzaCooldown(() =>
          sendEmailVerificationChallenge(createdUser, "signup"),
        )
      : { sent: false, previewCode: null };
    const phoneChallenge = phoneVerificationEnabled
      ? await senzaCooldown(() =>
          sendPhoneVerificationChallenge(createdUser, "signup"),
        )
      : { sent: false, previewCode: null };

    return registrationResponse({
      verificationReference,
      email,
      phone,
      emailPreviewCode: emailChallenge.previewCode,
      phonePreviewCode: phoneChallenge.previewCode,
    });
  } catch (error: any) {
    if (error instanceof EmailDeliveryError) {
      return NextResponse.json(
        {
          data: { user: null, session: null },
          error: {
            message: getEmailErrorMessage(error.code),
            code: error.code,
          },
        },
        { status: 503 },
      );
    }
    /*
      **Non l'errore intero** (ADR-0019: i log non devono contenere dati personali).
      Il messaggio di un errore di validazione dell'ORM porta con se l'oggetto che
      si stava scrivendo: su questi flussi vuol dire password, hash e codici di
      verifica. Il punto unico lo riduce a nome, messaggio e codice, e ci mette
      l'identificativo di richiesta perche due righe della stessa richiesta si
      possano finalmente mettere in fila.
    */
    reportServerError(error, {
      requestId: readRequestId(request),
      route: "/api/v1/auth/register",
      method: "POST",
    });
    return NextResponse.json(
      {
        data: { user: null, session: null },
        error: {
          message: "Errore durante la registrazione",
        },
      },
      { status: 500 },
    );
  }
}
