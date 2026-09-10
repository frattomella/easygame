/**
 * L'unico scrittore di `device_push_tokens` (WP11, ADR-0166).
 *
 * **Solo anagrafica dei destinatari.** Nessuna funzione qui sotto invia una
 * notifica push: registrano e revocano righe, punto. L'invio resta un lavoro
 * a se — vedi `docs/knowledge-base/05-mobile-architecture.md`.
 *
 * **Un token, un proprietario.** Il vincolo unico su `token` e il contratto:
 * lo stesso dispositivo che cambia account riscrive la riga sul nuovo
 * `user_id` invece di lasciarne una seconda che punterebbe ancora al vecchio
 * — un token duplicato varrebbe una notifica recapitata alla persona
 * sbagliata. La route chiama solo queste funzioni; nessuna scrive la tabella
 * altrove.
 */

import { prisma } from "./prisma";

export type DevicePushTokenPlatform = "ios" | "android";

export const DEVICE_PUSH_TOKEN_PLATFORMS: readonly DevicePushTokenPlatform[] =
  ["ios", "android"];

interface RegisterDevicePushTokenInput {
  userId: string;
  sessionId: string | null;
  token: string;
  platform: DevicePushTokenPlatform;
}

/**
 * Registra o rinnova un token. Upsert sul solo `token`: se la riga esiste
 * gia — stesso dispositivo, stesso account o uno diverso — viene riscritta
 * per intero sul chiamante corrente, mai lasciata a nome del vecchio
 * proprietario.
 */
export const registerDevicePushToken = async ({
  userId,
  sessionId,
  token,
  platform,
}: RegisterDevicePushTokenInput) => {
  const now = new Date();

  return prisma.devicePushToken.upsert({
    where: { token },
    create: {
      user_id: userId,
      session_id: sessionId,
      token,
      platform,
      last_seen_at: now,
      revoked_at: null,
    },
    update: {
      user_id: userId,
      session_id: sessionId,
      platform,
      last_seen_at: now,
      revoked_at: null,
    },
    select: { id: true, platform: true, last_seen_at: true },
  });
};

/**
 * Revoca un token esplicitamente (es. l'utente disattiva le notifiche).
 * Restituisce `false` senza scrivere nulla se il token non esiste o non
 * appartiene al chiamante — un utente non puo revocare il dispositivo di un
 * altro indovinandone il token.
 */
export const revokeDevicePushToken = async ({
  userId,
  token,
}: {
  userId: string;
  token: string;
}): Promise<boolean> => {
  const result = await prisma.devicePushToken.updateMany({
    where: { token, user_id: userId, revoked_at: null },
    data: { revoked_at: new Date() },
  });

  return result.count > 0;
};

/**
 * Revoca tutti i token vivi di una sessione. Il logout la chiama **prima**
 * di cancellare la sessione (`deleteSessionToken`): l'`onDelete: SetNull`
 * sulla colonna `session_id` e solo una rete di sicurezza per sessioni
 * cancellate da un'altra strada, non il meccanismo di revoca — una volta che
 * la sessione e sparita questa funzione non troverebbe piu le righe da
 * marcare.
 */
export const revokeDevicePushTokensForSession = async (
  sessionId: string,
): Promise<number> => {
  const result = await prisma.devicePushToken.updateMany({
    where: { session_id: sessionId, revoked_at: null },
    data: { revoked_at: new Date() },
  });

  return result.count;
};
