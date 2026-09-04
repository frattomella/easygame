/**
 * **L'inventario delle email, come dati.**
 *
 * L'anteprima (`/private/email-preview`) era una pagina che si costruiva da
 * sola l'elenco dei template dentro il proprio `page.tsx`. Due conseguenze:
 * l'inventario viveva in un componente React e non era interrogabile da
 * nessun'altra parte, e **non era provabile** — in particolare non si poteva
 * dimostrare la sola proprieta che conta davvero di un'anteprima, cioe che
 * **non spedisce niente**.
 *
 * Qui l'elenco e un valore. La pagina lo rende; un test lo costruisce con un
 * trasporto SMTP finto e conta gli invii: zero.
 *
 * ## La regola dei dati di esempio
 *
 * Nessun dato reale, mai: ne un indirizzo, ne un numero, ne un nome di club
 * esistente. Gli esempi usano `esempio.test` e `ASD Esempio`. Un'anteprima che
 * pescasse una riga vera dall'archivio per «essere realistica» sarebbe una
 * schermata che mostra i dati di una famiglia a chi apre una pagina di
 * manutenzione.
 *
 * Uno degli esempi porta di proposito **del markup dentro il nome del club**:
 * l'anteprima e il posto in cui si guarda se l'escaping regge, e un catalogo
 * di soli valori innocui non lo direbbe mai.
 */
import {
  buildPasswordResetEmail,
  buildVerificationEmail,
} from "../auth-workflows";
import { buildAthleteInviteEmailHtml } from "../athlete-accounts";
import {
  buildGenericNotificationEmailHtml,
  buildPaymentReminderEmail,
  buildPaymentReminderSubject,
} from "./email-service";
import { renderEmailLayout } from "./layout";
import { renderMessageTemplate } from "@/lib/messages/templates";
import { DEFAULT_MESSAGE_TEMPLATES } from "@/lib/messages/defaults";
import { buildDailyDigest } from "@/lib/automations/digest";

/** Chi manda davvero il messaggio: e la colonna che decide il marchio. */
export type EmailPreviewBrandMode = "easygame" | "club";

export type EmailPreviewItem = {
  id: string;
  title: string;
  /** Da dove nasce: modulo sorgente, per ritrovarlo. */
  source: string;
  /** A chi arriva. */
  recipient: string;
  brandMode: EmailPreviewBrandMode;
  subject: string;
  html: string;
  /** Il testo semplice, dove il costruttore lo produce. */
  text: string | null;
  /** Una riga che dice cosa guardare in questo riquadro. */
  note: string;
};

const CLUB = "ASD Esempio";
const LINK = "https://esempio.test/pay/gettone-di-esempio";

/**
 * **Costruisce l'inventario. Non spedisce, e non puo spedire.**
 *
 * Non importa il punto di invio e non chiama nessuna funzione che ci arrivi:
 * chiama solo i costruttori di contenuto, che sono puri. Se un giorno qualcuno
 * aggiungesse qui una riga che manda davvero, due cose diventerebbero rosse —
 * `tests/email/anteprima-non-spedisce.test.mjs`, che conta gli invii, e il
 * test strutturale di `tests/ui/communications-ownership.test.mjs`, che tiene
 * l'elenco dei chiamanti legittimi.
 */
export const buildEmailPreviewCatalog = (): EmailPreviewItem[] => {
  const verifica = buildVerificationEmail({
    firstName: "Marco",
    code: "482913",
  });
  const reset = buildPasswordResetEmail({
    firstName: "Marco",
    resetUrl: "https://esempio.test/auth/reset-password?uid=demo&token=demo",
  });

  const sollecito = {
    to: "famiglia@esempio.test",
    clubName: CLUB,
    athleteName: "Marco Rossi",
    guardianName: "Anna Rossi",
    residualAmount: 80,
    overdueCount: 1,
    nextDueDate: "2026-11-30",
    paymentLink: LINK,
  };
  const solleciteEmail = buildPaymentReminderEmail(sollecito);

  const comunicazione = renderMessageTemplate({
    template: DEFAULT_MESSAGE_TEMPLATES.installment_due,
    values: {
      "recipient.name": "Famiglia Rossi",
      "club.name": CLUB,
      "athlete.first_name": "Marco",
      "athlete.last_name": "Rossi",
      "installment.description": "Novembre",
      "installment.due_date": "30/11/2026",
      "installment.residual_amount": "€ 80,00",
      "payment.link": LINK,
    },
    allowEconomic: true,
  });

  const digest = buildDailyDigest({
    clubName: CLUB,
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

  const voci: EmailPreviewItem[] = [
    {
      id: "verifica-email",
      title: "Verifica del recapito (OTP email)",
      source: "auth-workflows.ts · buildVerificationEmail",
      recipient: "La persona che si sta registrando o verificando",
      brandMode: "easygame",
      subject: "Verifica il tuo account EasyGame",
      html: verifica.html,
      text: verifica.text,
      note: "Marchio EasyGame: chiede di digitare un codice, e chi lo riceve deve distinguerlo da una comunicazione del club.",
    },
    {
      id: "reset-password",
      title: "Reimposta la password",
      source: "auth-workflows.ts · buildPasswordResetEmail",
      recipient: "Il titolare dell'account",
      brandMode: "easygame",
      subject: "Reimposta la password EasyGame",
      html: reset.html,
      text: reset.text,
      note: "Il link passa da sanitizeEmailUrl; sotto al pulsante compare per esteso.",
    },
    {
      id: "invito-atleta",
      title: "Invito: attiva l'accesso atleta",
      source: "athlete-accounts.ts · buildAthleteInviteEmailHtml (PP-04)",
      recipient: "L'atleta o la famiglia invitata dal club",
      brandMode: "easygame",
      subject: `${CLUB}: attiva il tuo accesso EasyGame`,
      html: buildAthleteInviteEmailHtml({
        athleteName: "Marco Rossi",
        clubName: CLUB,
        link: "https://esempio.test/athlete-invite/demo",
      }),
      text: null,
      note: "Ibrida: la manda il club ma apre un account EasyGame. Resta marchio EasyGame finche la dependency verso PP-04 non e chiusa.",
    },
    {
      id: "notifica-generica",
      title: "Notifica generica",
      source: "email-service.ts · buildGenericNotificationEmailHtml",
      recipient:
        "Chiunque abbia una notifica: appuntamenti, documenti, moduli, certificati",
      brandMode: "easygame",
      subject: "Nuova notifica EasyGame",
      html: buildGenericNotificationEmailHtml(),
      text: null,
      note: "Contenuto fisso di proposito: mai un dato riservato fuori dall'applicazione, solo l'invito ad accedere.",
    },
    {
      id: "sollecito-quote",
      title: "Sollecito di pagamento",
      source: "email-service.ts · buildPaymentReminderEmail",
      recipient: "La famiglia con quote da versare",
      brandMode: "club",
      subject: buildPaymentReminderSubject(sollecito),
      html: solleciteEmail.html,
      text: solleciteEmail.text,
      note: "Marchio club: la famiglia deve riconoscere a chi deve dei soldi. Piede «Powered by EasyGame», non rimovibile.",
    },
    {
      id: "comunicazione-club",
      title: "Comunicazione del club",
      source: "communications.ts · renderMessageTemplate + renderEmailLayout",
      recipient: "Le famiglie del pubblico scelto",
      brandMode: "club",
      subject: comunicazione.subject,
      html: renderEmailLayout({
        bodyHtml: comunicazione.html,
        brand: { mode: "club", clubName: CLUB },
      }),
      text: comunicazione.text,
      note: "Il corpo lo compone il club da un modello; il guscio e il marchio li mette il core.",
    },
    {
      id: "nome-club-ostile",
      title: "Marchio club — nome con dentro del markup",
      source: "template-core.ts · resolveBrandLogo + escapeHtml",
      recipient: "Nessuno: e la prova di tenuta dell'escaping",
      brandMode: "club",
      subject: "Prova di escaping",
      html: renderEmailLayout({
        bodyHtml: "<p>Il corpo di una comunicazione qualunque.</p>",
        brand: {
          mode: "club",
          clubName: '<img src=x onerror=alert(1)> ASD "Le Virgolette"',
          logoUrl: "https://tracciatore-esterno.test/pixel.png",
          accentColor: "rosso-acceso",
        },
      }),
      text: null,
      note: "Il nome esce sfuggito, il logo su host esterno non diventa un <img>, il colore illeggibile ricade sull'accento EasyGame.",
    },
  ];

  if (digest) {
    voci.push({
      id: "digest-club",
      title: "Riepilogo giornaliero al club",
      source: "automations.ts · buildDailyDigest",
      recipient: "Chi gestisce il club",
      brandMode: "club",
      subject: digest.subject,
      html: renderEmailLayout({
        bodyHtml: digest.html,
        brand: { mode: "club", clubName: CLUB },
      }),
      text: digest.text,
      note: "Va al club e non a una famiglia, ma porta comunque il nome del club: chi ne gestisce piu di uno deve capire quale.",
    });
  }

  return voci;
};
