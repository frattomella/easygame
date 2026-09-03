import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  getSessionFromRequest,
  isPlatformAdminSession,
} from "@/lib/server/auth";
import {
  buildPasswordResetEmailHtml,
  buildVerificationEmailHtml,
} from "@/lib/server/auth-workflows";
import { buildAthleteInviteEmailHtml } from "@/lib/server/athlete-accounts";
import { buildGenericNotificationEmailHtml } from "@/lib/server/email/email-service";
import { renderMessageTemplate } from "@/lib/messages/templates";
import { DEFAULT_MESSAGE_TEMPLATES } from "@/lib/messages/defaults";
import { buildDailyDigest } from "@/lib/automations/digest";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Anteprima email EasyGame",
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * Anteprima locale dei template email (Branding Pass).
 *
 * Solo development: in produzione questa pagina non deve esistere, a
 * differenza di `/private/api-docs` che e una funzione reale per
 * l'amministrazione di piattaforma. Chiama le stesse funzioni pure usate
 * dagli invii veri (`buildVerificationEmailHtml` e simili) con dati di
 * esempio: quello che si vede qui e esattamente quello che parte, non un
 * markup reimplementato per l'occasione.
 */
export default async function EmailPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const session = await getSessionFromRequest(
    new Request("http://easygame.local/private/email-preview", {
      headers: {
        cookie: cookies().toString(),
      },
    }),
  );

  if (!session) {
    redirect("/login");
  }

  if (!isPlatformAdminSession(session)) {
    redirect("/account");
  }

  const comunicazioneClub = renderMessageTemplate({
    template: DEFAULT_MESSAGE_TEMPLATES.installment_due,
    values: {
      "recipient.name": "Famiglia Rossi",
      "club.name": "ASD Esempio",
      "athlete.first_name": "Marco",
      "athlete.last_name": "Rossi",
      "installment.description": "Novembre",
      "installment.due_date": "30/11/2026",
      "installment.residual_amount": "€ 80,00",
      "payment.link": "https://esempio.easygame.app/pay/token-di-esempio",
    },
    allowEconomic: true,
  });

  const digest = buildDailyDigest({
    clubName: "ASD Esempio",
    dayLabel: "03/09/2026",
    entries: [
      {
        triggerKind: "installment_overdue",
        subjectName: "Marco Rossi",
        detail: "Rata di novembre, € 80,00",
        when: "30/11/2026",
      },
      {
        triggerKind: "certificate",
        subjectName: "Giulia Bianchi",
        detail: "Certificato medico in scadenza",
        when: "10/09/2026",
      },
    ],
  });

  const templates: Array<{ title: string; note: string; html: string }> = [
    {
      title: "1. Verifica accesso / OTP",
      note: "Platform — auth-workflows.ts",
      html: buildVerificationEmailHtml({ firstName: "Marco", code: "482913" }),
    },
    {
      title: "2. Recupero password",
      note: "Platform — auth-workflows.ts",
      html: buildPasswordResetEmailHtml({
        firstName: "Marco",
        resetUrl:
          "https://esempio.easygame.app/auth/reset-password?uid=demo&token=demo",
      }),
    },
    {
      title: "3. Invito (attivazione accesso atleta)",
      note: "Platform/ibrida — athlete-accounts.ts",
      html: buildAthleteInviteEmailHtml({
        athleteName: "Marco Rossi",
        clubName: "ASD Esempio",
        link: "https://esempio.easygame.app/athlete-invite/demo",
      }),
    },
    {
      title: "4. Notifica generica (copre anche le richieste di documenti)",
      note: "Club → utente — email-service.ts, contenuto sempre fisso per privacy",
      html: buildGenericNotificationEmailHtml(),
    },
    {
      title: "5. Comunicazione del club (rappresentativa)",
      note: "Club → utente — messages/templates.ts, modello «rata in scadenza»",
      html: comunicazioneClub.html,
    },
    ...(digest
      ? [
          {
            title: "6. Digest giornaliero al club (bonus, non fra i 5 richiesti)",
            note: "Club → Club — automations/digest.ts",
            html: digest.html,
          },
        ]
      : []),
  ];

  return (
    <div className="min-h-[100dvh] space-y-8 bg-[var(--eg-paper)] p-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-slate-900">
          Anteprima email EasyGame
        </h1>
        <p className="text-sm text-slate-500">
          Solo development — dati di esempio, nessun invio reale. Ogni
          riquadro chiama la stessa funzione usata dall&apos;invio vero.
        </p>
      </div>

      {templates.map((item) => (
        <section
          key={item.title}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white"
        >
          <header className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <p className="font-display text-sm font-semibold text-slate-900">
              {item.title}
            </p>
            <p className="text-xs text-slate-500">{item.note}</p>
          </header>
          <iframe
            title={item.title}
            srcDoc={item.html}
            className="h-[420px] w-full"
          />
        </section>
      ))}
    </div>
  );
}
