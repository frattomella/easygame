/**
 * Conversazione IMAP minima per il test di connessione.
 *
 * Il progetto non ha una libreria IMAP e non ne introduce una per un solo
 * comando: qui serve unicamente sapere se host, porta, cifratura e credenziali
 * sono corretti. La macchina a stati e separata dal socket proprio per essere
 * verificabile senza rete (vedi tests/email/imap-protocol.test.mjs).
 *
 * RFC 3501: il server apre con una riga non taggata (`* OK`), ogni comando del
 * client porta un tag e termina quando arriva la riga con lo stesso tag.
 */

export type ImapErrorCode =
  | "IMAP_AUTH_FAILED"
  | "IMAP_CONNECTION_FAILED"
  | "IMAP_CONFIGURATION_INVALID"
  | "IMAP_TLS_REQUIRED";

export type ImapAction =
  | { kind: "wait" }
  | { kind: "send"; command: string }
  | { kind: "starttls" }
  | { kind: "done" }
  | { kind: "fail"; code: ImapErrorCode };

/**
 * Un CR o un LF dentro username o password chiuderebbe la riga di comando e
 * il resto verrebbe interpretato come un comando IMAP a se stante. Non e un
 * caso teorico: la password arriva da un form.
 */
export const containsLineBreak = (value: string) => /[\r\n]/.test(value);

export const quoteImapString = (value: string) =>
  `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const isTaggedResponse = (line: string, tag: string) =>
  line.toUpperCase().startsWith(`${tag} `);

const responseStatus = (line: string, tag: string) =>
  line.slice(tag.length + 1).trim().split(/\s+/)[0]?.toUpperCase() || "";

export type ImapConversationOptions = {
  username: string;
  password: string;
  securityMode: "ssl" | "starttls";
};

/**
 * Passi: attesa saluto -> (STARTTLS) -> LOGIN -> LOGOUT.
 *
 * `receive` accetta **una riga per volta**, gia priva di CRLF.
 */
export const createImapLoginConversation = ({
  username,
  password,
  securityMode,
}: ImapConversationOptions) => {
  let step: "greeting" | "starttls" | "login" | "logout" | "closed" =
    "greeting";

  const loginCommand = () =>
    `A2 LOGIN ${quoteImapString(username)} ${quoteImapString(password)}`;

  const afterGreeting = (): ImapAction => {
    if (securityMode === "starttls") {
      step = "starttls";
      return { kind: "send", command: "A1 STARTTLS" };
    }
    step = "login";
    return { kind: "send", command: loginCommand() };
  };

  return {
    /** Prima azione: si aspetta il saluto del server, non si scrive nulla. */
    start(): ImapAction {
      if (containsLineBreak(username) || containsLineBreak(password)) {
        step = "closed";
        return { kind: "fail", code: "IMAP_CONFIGURATION_INVALID" };
      }
      return { kind: "wait" };
    },

    receive(rawLine: string): ImapAction {
      const line = rawLine.trim();
      if (!line || step === "closed") {
        return { kind: "wait" };
      }

      if (step === "greeting") {
        const upper = line.toUpperCase();
        if (upper.startsWith("* OK")) {
          return afterGreeting();
        }
        if (upper.startsWith("* PREAUTH")) {
          // Sessione gia autenticata dal trasporto: nulla da verificare oltre.
          step = "logout";
          return { kind: "send", command: "A3 LOGOUT" };
        }
        if (upper.startsWith("* BYE")) {
          step = "closed";
          return { kind: "fail", code: "IMAP_CONNECTION_FAILED" };
        }
        // Righe non taggate di servizio prima del saluto: si continua ad attendere.
        return { kind: "wait" };
      }

      if (step === "starttls") {
        if (!isTaggedResponse(line, "A1")) {
          return { kind: "wait" };
        }
        if (responseStatus(line, "A1") !== "OK") {
          step = "closed";
          return { kind: "fail", code: "IMAP_TLS_REQUIRED" };
        }
        step = "login";
        return { kind: "starttls" };
      }

      if (step === "login") {
        if (!isTaggedResponse(line, "A2")) {
          return { kind: "wait" };
        }
        if (responseStatus(line, "A2") !== "OK") {
          step = "closed";
          return { kind: "fail", code: "IMAP_AUTH_FAILED" };
        }
        step = "logout";
        return { kind: "send", command: "A3 LOGOUT" };
      }

      if (step === "logout") {
        if (!isTaggedResponse(line, "A3")) {
          return { kind: "wait" };
        }
        step = "closed";
        return { kind: "done" };
      }

      return { kind: "wait" };
    },

    /** Comando da inviare subito dopo l'upgrade TLS. */
    afterStartTls(): ImapAction {
      return { kind: "send", command: loginCommand() };
    },
  };
};
