import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  LEGACY_SESSION_CACHE_KEY,
  LEGACY_SESSION_TIMESTAMP_KEY,
  SESSION_CACHE_KEY,
  clearClientAuthCache,
  markSessionValidated,
  notifyUnauthorized,
  registerUnauthorizedHandler,
} from "../../src/lib/auth/session-sync.ts";

class FakeStorage {
  constructor(entries = {}) {
    Object.entries(entries).forEach(([key, value]) => this.setItem(key, value));
  }

  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this, key)
      ? String(this[key])
      : null;
  }

  setItem(key, value) {
    this[key] = String(value);
  }

  removeItem(key) {
    delete this[key];
  }

  clear() {
    Object.keys(this).forEach((key) => delete this[key]);
  }
}

beforeEach(() => {
  globalThis.window = {
    localStorage: new FakeStorage(),
    sessionStorage: new FakeStorage(),
  };
  markSessionValidated();
});

afterEach(() => {
  markSessionValidated();
  delete globalThis.window;
});

test("clearClientAuthCache rimuove sessione e club di ogni account", () => {
  window.localStorage.setItem(SESSION_CACHE_KEY, "session");
  window.localStorage.setItem("activeClub", "club-a");
  window.localStorage.setItem("activeClub_user-a", "club-a");
  window.localStorage.setItem("activeClub_user-b", "club-b");
  window.localStorage.setItem("userClubs", "clubs");
  window.localStorage.setItem("unrelated", "keep");
  window.sessionStorage.setItem(LEGACY_SESSION_CACHE_KEY, "legacy");
  window.sessionStorage.setItem(LEGACY_SESSION_TIMESTAMP_KEY, "123");

  clearClientAuthCache();

  assert.equal(window.localStorage.getItem(SESSION_CACHE_KEY), null);
  assert.equal(window.localStorage.getItem("activeClub"), null);
  assert.equal(window.localStorage.getItem("activeClub_user-a"), null);
  assert.equal(window.localStorage.getItem("activeClub_user-b"), null);
  assert.equal(window.localStorage.getItem("userClubs"), null);
  assert.equal(window.sessionStorage.getItem(LEGACY_SESSION_CACHE_KEY), null);
  assert.equal(
    window.sessionStorage.getItem(LEGACY_SESSION_TIMESTAMP_KEY),
    null,
  );
  assert.equal(window.localStorage.getItem("unrelated"), "keep");
});

test("più 401 paralleli producono un solo logout fino a nuova validazione", () => {
  let notifications = 0;
  const unregister = registerUnauthorizedHandler(() => {
    notifications += 1;
  });

  notifyUnauthorized();
  notifyUnauthorized();
  assert.equal(notifications, 1);

  markSessionValidated();
  notifyUnauthorized();
  assert.equal(notifications, 2);

  unregister();
});

test("la pulizia è sicura durante rendering server senza window", () => {
  delete globalThis.window;
  assert.doesNotThrow(() => clearClientAuthCache());
});
