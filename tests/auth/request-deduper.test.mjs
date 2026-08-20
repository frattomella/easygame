import assert from "node:assert/strict";
import test from "node:test";
import { createScopedRequestDeduper } from "../../src/lib/auth/request-deduper.ts";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

test("deduplica due richieste membership contemporanee dello stesso account", async () => {
  const deduper = createScopedRequestDeduper();
  const pending = deferred();
  let calls = 0;
  const factory = () => {
    calls += 1;
    return pending.promise;
  };

  const first = deduper.run("user-a", factory);
  const second = deduper.run("user-a", factory);
  assert.strictEqual(first, second);
  assert.equal(calls, 0);

  pending.resolve({ data: ["club-a"] });
  assert.deepEqual(await first, { data: ["club-a"] });
  assert.deepEqual(await second, { data: ["club-a"] });
  assert.equal(calls, 1);
  assert.equal(deduper.size(), 0);
});

test("non condivide membership tra account diversi", async () => {
  const deduper = createScopedRequestDeduper();
  let calls = 0;
  const factory = async (signal) => ({ call: ++calls, aborted: signal.aborted });

  const [accountA, accountB] = await Promise.all([
    deduper.run("user-a", factory),
    deduper.run("user-b", factory),
  ]);

  assert.equal(calls, 2);
  assert.notEqual(accountA.call, accountB.call);
  assert.equal(accountA.aborted, false);
  assert.equal(accountB.aborted, false);
});

test("reset annulla le richieste della sessione precedente", async () => {
  const deduper = createScopedRequestDeduper();
  const request = deduper.run(
    "user-a",
    (signal) =>
      new Promise((resolve, reject) => {
        signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }),
  );

  await Promise.resolve();
  deduper.reset();

  await assert.rejects(request, { name: "AbortError" });
  assert.equal(deduper.size(), 0);
  assert.equal(await deduper.run("user-a", async () => "fresh"), "fresh");
});

test("una richiesta conclusa può essere ritentata", async () => {
  const deduper = createScopedRequestDeduper();
  let calls = 0;
  const factory = async () => ++calls;

  assert.equal(await deduper.run("user-a", factory), 1);
  assert.equal(await deduper.run("user-a", factory), 2);
  assert.equal(calls, 2);
});

test("un errore non resta in cache e il retry esegue una nuova richiesta", async () => {
  const deduper = createScopedRequestDeduper();
  let calls = 0;
  const factory = async () => {
    calls += 1;
    if (calls === 1) {
      throw new Error("API temporaneamente non disponibile");
    }
    return { data: ["club-a"], error: null };
  };

  await assert.rejects(deduper.run("user-a", factory), {
    message: "API temporaneamente non disponibile",
  });
  assert.deepEqual(await deduper.run("user-a", factory), {
    data: ["club-a"],
    error: null,
  });
  assert.equal(calls, 2);
});
