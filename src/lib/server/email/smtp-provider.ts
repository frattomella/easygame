import nodemailer from "nodemailer";
import type { EmailProvider, TransactionalEmail } from "./provider";

export type SmtpProviderOptions = {
  host: string;
  port: number;
  securityMode: "ssl" | "starttls";
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
};

export class SmtpEmailProvider implements EmailProvider {
  readonly id = "smtp";
  private readonly transport;

  constructor(private readonly options: SmtpProviderOptions) {
    this.transport = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.securityMode === "ssl",
      requireTLS: options.securityMode === "starttls",
      auth: { user: options.username, pass: options.password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      tls: { minVersion: "TLSv1.2", servername: options.host },
    });
  }

  async verify() {
    await this.transport.verify();
  }

  async send(message: TransactionalEmail) {
    await this.transport.sendMail({
      from: { address: this.options.fromEmail, name: this.options.fromName },
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }
}
