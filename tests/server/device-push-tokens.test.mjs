import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * L'anagrafica dei token push (WP11, ADR-0166).
 *
 * Il requisito che conta di piu non e "registra un token" — e "un token non
 * appartiene mai a due account insieme", perche un token duplicato vuol dire
 * una notifica recapitata alla persona sbagliata.
 */

let devicePushTokens;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  devicePushTokens = await import("../../src/lib/server/device-push-tokens.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma({ devicePushToken: [] });
  setPrismaClientForTests(fake.client);
});

test("registrare un token nuovo crea una riga viva, non revocata", async () => {
  const row = await devicePushTokens.registerDevicePushToken({
    userId: "user-1",
    sessionId: "session-1",
    token: "ExponentPushToken[aaa]",
    platform: "ios",
  });

  assert.equal(row.platform, "ios");

  const righe = fake.rows("devicePushToken");
  assert.equal(righe.length, 1);
  assert.equal(righe[0].user_id, "user-1");
  assert.equal(righe[0].session_id, "session-1");
  assert.equal(righe[0].revoked_at, null);
});

test("lo stesso token registrato da un account diverso riscrive la riga, non ne crea una seconda", async () => {
  await devicePushTokens.registerDevicePushToken({
    userId: "user-1",
    sessionId: "session-1",
    token: "ExponentPushToken[condiviso]",
    platform: "ios",
  });

  await devicePushTokens.registerDevicePushToken({
    userId: "user-2",
    sessionId: "session-2",
    token: "ExponentPushToken[condiviso]",
    platform: "ios",
  });

  const righe = fake.rows("devicePushToken");
  assert.equal(righe.length, 1, "un token vale una sola riga, mai due");
  assert.equal(righe[0].user_id, "user-2");
  assert.equal(righe[0].session_id, "session-2");
});

test("rinnovare un token gia revocato lo riporta vivo", async () => {
  fake.rows("devicePushToken").push({
    id: "dpt-1",
    user_id: "user-1",
    session_id: "session-vecchia",
    platform: "ios",
    token: "ExponentPushToken[bbb]",
    last_seen_at: new Date("2026-01-01"),
    revoked_at: new Date("2026-02-01"),
  });

  await devicePushTokens.registerDevicePushToken({
    userId: "user-1",
    sessionId: "session-nuova",
    token: "ExponentPushToken[bbb]",
    platform: "ios",
  });

  const riga = fake.rows("devicePushToken")[0];
  assert.equal(riga.revoked_at, null);
  assert.equal(riga.session_id, "session-nuova");
});

test("revocare un token appartiene solo a chi lo possiede", async () => {
  fake.rows("devicePushToken").push({
    id: "dpt-1",
    user_id: "user-1",
    session_id: "session-1",
    platform: "android",
    token: "ExponentPushToken[ccc]",
    last_seen_at: new Date(),
    revoked_at: null,
  });

  const esitoEstraneo = await devicePushTokens.revokeDevicePushToken({
    userId: "user-2",
    token: "ExponentPushToken[ccc]",
  });
  assert.equal(esitoEstraneo, false, "un altro account non revoca il tuo dispositivo");
  assert.equal(fake.rows("devicePushToken")[0].revoked_at, null);

  const esitoProprietario = await devicePushTokens.revokeDevicePushToken({
    userId: "user-1",
    token: "ExponentPushToken[ccc]",
  });
  assert.equal(esitoProprietario, true);
  assert.notEqual(fake.rows("devicePushToken")[0].revoked_at, null);
});

test("la revoca per sessione tocca solo i token di quella sessione, non gli altri dispositivi dello stesso account", async () => {
  fake.rows("devicePushToken").push(
    {
      id: "dpt-telefono",
      user_id: "user-1",
      session_id: "session-telefono",
      platform: "ios",
      token: "ExponentPushToken[telefono]",
      last_seen_at: new Date(),
      revoked_at: null,
    },
    {
      id: "dpt-tablet",
      user_id: "user-1",
      session_id: "session-tablet",
      platform: "android",
      token: "ExponentPushToken[tablet]",
      last_seen_at: new Date(),
      revoked_at: null,
    },
  );

  const contati = await devicePushTokens.revokeDevicePushTokensForSession(
    "session-telefono",
  );

  assert.equal(contati, 1);
  const [telefono, tablet] = fake.rows("devicePushToken");
  assert.notEqual(telefono.revoked_at, null, "il dispositivo disconnesso e revocato");
  assert.equal(tablet.revoked_at, null, "l'altro dispositivo resta collegato");
});
