/**
 * I modelli di messaggio predefiniti, in italiano.
 *
 * **Perche sono dati e non funzioni.** Un modello predefinito e cio che il club
 * si trova scritto nella casella di testo il primo giorno, e che poi cambia con
 * le sue parole. Se fosse una funzione non sarebbe modificabile: sarebbe di
 * nuovo codice, cioe esattamente il gap G-05. Questi oggetti si
 * copiano dentro la configurazione del club e da quel momento appartengono al
 * club, non al prodotto.
 *
 * **Da dove viene il testo.** Il sollecito riprende parola per parola quello
 * che oggi e cablato in `buildPaymentReminderLines`
 * (`src/lib/server/email/email-service.ts`), e il certificato quello di
 * `buildReminderContent` (`src/lib/server/medical-certificate-reminders.ts`):
 * il primo passo non e scrivere messaggi nuovi, e rendere modificabili quelli
 * che gia partono.
 *
 * **Il limite dichiarato.** Non esistono condizionali: una riga come «Rate
 * scadute: {{installment.overdue_count}}» resta scritta anche quando il valore
 * non c'e, e in quel caso il segnaposto e vuoto e finisce in `unresolved`. Il
 * rimedio non e un `{{#if}}` — e che chi manda lo vede in **anteprima** e
 * toglie la riga. Il testo della segreteria e piu breve del linguaggio che
 * servirebbe a generarlo.
 */

import type { MessageTemplate } from "./templates";

export type DefaultMessageTemplateKey =
  | "installment_due"
  | "installment_overdue"
  | "certificate_expiring"
  | "event_invitation"
  | "document_expiring";

/**
 * Un modello per ciascuna regola: le quattro della V1 (§4.1 del planning di
 * Wave 2) — AUT-01 rata in scadenza, AUT-02 rata scaduta, AUT-03 certificato,
 * AUT-04 invito a confermare la presenza — piu AUT-05 documento in scadenza,
 * aperto dalla Wave 3 (§11.2).
 */
export const DEFAULT_MESSAGE_TEMPLATES: Readonly<
  Record<DefaultMessageTemplateKey, MessageTemplate>
> = {
  installment_due: {
    subject:
      "{{club.name}}: rata in scadenza per {{athlete.first_name}} {{athlete.last_name}}",
    body: [
      "Gentile {{recipient.name}},",
      "",
      "{{club.name}} ricorda che la rata {{installment.description}} di {{athlete.first_name}} {{athlete.last_name}} scade il {{installment.due_date}}.",
      "",
      "Importo ancora da versare: {{installment.residual_amount}}",
      "",
      "Si puo pagare da qui: {{payment.link}}",
      "",
      "Se il pagamento e gia stato effettuato, consideri questo messaggio come non ricevuto.",
      "",
      "{{club.name}}",
    ].join("\n"),
  },

  installment_overdue: {
    subject:
      "{{club.name}}: quote da regolarizzare per {{athlete.first_name}} {{athlete.last_name}}",
    body: [
      "Gentile {{recipient.name}},",
      "",
      "{{club.name}} ricorda che risultano quote ancora da versare per {{athlete.first_name}} {{athlete.last_name}}.",
      "",
      "Importo ancora da versare: {{installment.residual_amount}}",
      "Rate scadute: {{installment.overdue_count}}",
      "Prossima scadenza: {{payment.next_due_date}}",
      "",
      "Si puo pagare da qui: {{payment.link}}",
      "",
      "Se il pagamento e gia stato effettuato, consideri questo messaggio come non ricevuto.",
      "",
      "{{club.name}}",
    ].join("\n"),
  },

  certificate_expiring: {
    subject:
      "{{club.name}}: certificato medico da aggiornare per {{athlete.first_name}} {{athlete.last_name}}",
    body: [
      "Gentile {{recipient.name}},",
      "",
      /*
        La chiave e `medical_certificate.expiry_date`, quella che il catalogo
        gia porta: un secondo nome per la stessa data — `certificate.expiry_date`
        — sarebbe un alias, e due nomi per un dato solo sono il modo in cui un
        catalogo chiuso smette di esserlo.
      */
      "il certificato medico di {{athlete.first_name}} {{athlete.last_name}} risulta da aggiornare: scadenza {{medical_certificate.expiry_date}}, stato {{medical_certificate.status}}.",
      "",
      "Senza un certificato valido l'atleta non puo essere ammesso all'attivita.",
      "",
      "{{club.name}}",
    ].join("\n"),
  },

  event_invitation: {
    subject: "{{club.name}}: confermi la presenza a {{event.title}}",
    body: [
      "Gentile {{recipient.name}},",
      "",
      "{{club.name}} chiede di confermare la presenza di {{athlete.first_name}} {{athlete.last_name}} a {{event.title}}.",
      "",
      "Quando: {{event.date}} alle {{event.time}}",
      "",
      "La conferma si da dall'area riservata di EasyGame.",
      "",
      "{{club.name}}",
    ].join("\n"),
  },

  /**
   * Il quinto, arrivato con la Wave 3 (AUT-05).
   *
   * **Perche riusa `document.title` e `document.date`** invece di chiedere
   * `document.expiry_date`. Il catalogo dei segnaposto e chiuso e vive in
   * `src/lib/documents/placeholders.ts`: le due chiavi ci sono gia e dicono
   * esattamente queste due cose — quale documento, e la data che lo riguarda.
   * Aggiungerne una terza per la stessa informazione sarebbe l'alias che il
   * modello del certificato ha gia rifiutato di introdurre, poche righe piu
   * sopra.
   */
  document_expiring: {
    subject:
      "{{club.name}}: {{document.title}} in scadenza per {{athlete.first_name}} {{athlete.last_name}}",
    body: [
      "Gentile {{recipient.name}},",
      "",
      "{{club.name}} ricorda che il documento «{{document.title}}» di {{athlete.first_name}} {{athlete.last_name}} scade il {{document.date}}.",
      "",
      "Per restare in regola serve una copia aggiornata: si puo consegnarla in segreteria o caricarla dall'area riservata.",
      "",
      "Se il documento e gia stato rinnovato, consideri questo messaggio come non ricevuto.",
      "",
      "{{club.name}}",
    ].join("\n"),
  },
};

/** Le chiavi dei modelli predefiniti, per i cicli e per i test. */
export const DEFAULT_MESSAGE_TEMPLATE_KEYS = Object.keys(
  DEFAULT_MESSAGE_TEMPLATES,
) as DefaultMessageTemplateKey[];
