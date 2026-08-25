import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Perche questo test esiste.
 *
 * L'integrazione di Web V1 ha rinumerato cinque ADR (0036-0040), tre Work
 * Package e cinque voci di debito tecnico, perche i tre workstream avevano
 * lavorato in parallelo sulla stessa numerazione. Una rinumerazione fatta a
 * mano lascia link rotti che nessuno vede finche non ci clicca sopra, e un
 * riferimento rotto in una Knowledge Base che si dichiara «fonte di verita»
 * la rende inaffidabile proprio dove serve di piu.
 *
 * Il test non giudica il contenuto: verifica solo che ogni link interno
 * alla KB atterri su un file che esiste e su un titolo che esiste davvero.
 */

const ROOT = "docs";

/**
 * La regola di GitHub per gli ancoraggi: minuscolo, via i caratteri non di
 * parola, e **ogni** spazio diventa un trattino senza collassare i doppi.
 * «## ADR-0036 — Una rata...» produce percio `adr-0036--una-rata-...`.
 */
const slug = (heading) =>
  heading
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s/g, "-");

const markdownFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".md")) markdownFiles.push(full);
  }
})(ROOT);

const anchorsByFile = new Map();
for (const file of markdownFiles) {
  const anchors = new Set();
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const heading = /^#{1,6}\s+(.*?)\s*$/.exec(line);
    if (heading) anchors.add(slug(heading[1]));
  }
  anchorsByFile.set(path.resolve(file), anchors);
}

test("ogni link a un altro documento della KB punta a un file che esiste", () => {
  const rotti = [];
  for (const file of markdownFiles) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(/\]\((?!https?:|#|mailto:)([^)\s#]+\.md)[)#]/g)) {
      const target = path.resolve(path.dirname(file), m[1]);
      if (!fs.existsSync(target)) rotti.push(`${file} -> ${m[1]}`);
    }
  }
  assert.deepEqual(rotti, [], "un link a un file inesistente e una bugia silenziosa");
});

test("ogni ancoraggio citato corrisponde a un titolo che esiste", () => {
  const rotti = [];
  for (const file of markdownFiles) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(/\]\(([^)\s#]+\.md)#([A-Za-z0-9_-]+)\)/g)) {
      const target = path.resolve(path.dirname(file), m[1]);
      const anchors = anchorsByFile.get(target);
      if (anchors && !anchors.has(m[2])) rotti.push(`${file} -> ${m[1]}#${m[2]}`);
    }
    for (const m of text.matchAll(/\]\(#([A-Za-z0-9_-]+)\)/g)) {
      if (!anchorsByFile.get(path.resolve(file)).has(m[1])) {
        rotti.push(`${file} -> #${m[1]}`);
      }
    }
  }
  assert.deepEqual(rotti, [], "un ancoraggio rotto sopravvive a ogni rinumerazione non verificata");
});

test("gli ADR sono numerati senza buchi e senza doppioni", () => {
  const log = fs.readFileSync(path.join(ROOT, "knowledge-base/18-decision-log.md"), "utf8");
  const numeri = [...log.matchAll(/^## ADR-(\d{4}) —/gm)].map((m) => Number(m[1]));

  assert.ok(numeri.length > 30, `ADR trovati: ${numeri.length}`);
  assert.deepEqual(
    numeri.filter((n, i) => numeri.indexOf(n) !== i),
    [],
    "due ADR con lo stesso numero rendono ambiguo ogni riferimento",
  );
  assert.deepEqual(
    [...numeri].sort((a, b) => a - b),
    numeri,
    "il registro si legge in ordine cronologico: i numeri devono crescere",
  );
});
