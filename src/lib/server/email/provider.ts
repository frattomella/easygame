export type TransactionalEmail = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export interface EmailProvider {
  readonly id: string;
  verify(): Promise<void>;
  send(message: TransactionalEmail): Promise<void>;
}

export type EmailDeliveryResult =
  | { status: "sent"; provider: string }
  | { status: "skipped"; reason: "not_configured" };
