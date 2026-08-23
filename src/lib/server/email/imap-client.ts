import net from "node:net";
import tls from "node:tls";
import type { Socket } from "node:net";

import {
  createImapLoginConversation,
  type ImapErrorCode,
} from "./imap-protocol";

export class ImapConnectionError extends Error {
  readonly code: ImapErrorCode;

  constructor(code: ImapErrorCode) {
    super(code);
    this.code = code;
    this.name = "ImapConnectionError";
  }
}

export type ImapConnectionOptions = {
  host: string;
  port: number;
  securityMode: "ssl" | "starttls";
  username: string;
  password: string;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Apre una sessione IMAP, esegue LOGIN e chiude.
 *
 * Non legge nessun messaggio: serve solo a dire all'amministratore se la
 * configurazione che ha appena salvato funziona. Il traffico viaggia sempre
 * cifrato — SSL implicito, oppure TCP e subito STARTTLS: se lo STARTTLS non
 * riesce la sessione viene chiusa invece di autenticarsi in chiaro.
 */
export const verifyImapConnection = ({
  host,
  port,
  securityMode,
  username,
  password,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: ImapConnectionOptions): Promise<void> =>
  new Promise((resolve, reject) => {
    const conversation = createImapLoginConversation({
      username,
      password,
      securityMode,
    });

    const initial = conversation.start();
    if (initial.kind === "fail") {
      reject(new ImapConnectionError(initial.code));
      return;
    }

    let socket: Socket | tls.TLSSocket;
    let buffer = "";
    let settled = false;
    let timer: NodeJS.Timeout | null = null;

    const finish = (error: ImapConnectionError | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        socket?.destroy();
      } catch {
        // La connessione e gia caduta: non cambia l'esito.
      }
      if (error) reject(error);
      else resolve();
    };

    const fail = (code: ImapErrorCode) =>
      finish(new ImapConnectionError(code));

    const send = (command: string) => {
      socket.write(`${command}\r\n`);
    };

    const upgradeToTls = () => {
      const plainSocket = socket;
      plainSocket.removeAllListeners("data");
      const secure = tls.connect({
        socket: plainSocket,
        servername: host,
        minVersion: "TLSv1.2",
      });
      socket = secure;
      secure.on("error", () => fail("IMAP_CONNECTION_FAILED"));
      secure.on("data", onData);
      secure.on("secureConnect", () => {
        const next = conversation.afterStartTls();
        if (next.kind === "send") send(next.command);
      });
    };

    const apply = (action: ReturnType<typeof conversation.receive>) => {
      if (action.kind === "send") {
        send(action.command);
        return;
      }
      if (action.kind === "starttls") {
        upgradeToTls();
        return;
      }
      if (action.kind === "done") {
        finish(null);
        return;
      }
      if (action.kind === "fail") {
        fail(action.code);
      }
    };

    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString("utf8");
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1 && !settled) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        apply(conversation.receive(line));
        newlineIndex = buffer.indexOf("\n");
      }
    };

    timer = setTimeout(() => fail("IMAP_CONNECTION_FAILED"), timeoutMs);

    socket =
      securityMode === "ssl"
        ? tls.connect({ host, port, servername: host, minVersion: "TLSv1.2" })
        : net.connect({ host, port });

    socket.setTimeout(timeoutMs, () => fail("IMAP_CONNECTION_FAILED"));
    socket.on("error", () => fail("IMAP_CONNECTION_FAILED"));
    socket.on("close", () => fail("IMAP_CONNECTION_FAILED"));
    socket.on("data", onData);
  });
