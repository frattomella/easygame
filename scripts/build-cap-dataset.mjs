#!/usr/bin/env node
/**
 * Rigenera `src/data/cap-ipa.json`: il CAP di un comune, quando e univoco.
 *
 * **Perche esiste, e perche non e arrivato prima.** ADR-0035 aveva verificato
 * che nel repository non c'era nessuna fonte del CAP e che ISTAT non lo
 * pubblica, e aveva elencato le cinque proprieta che una fonte doveva avere
 * per chiudere la questione. La verifica di allora era giusta, ma si era
 * fermata a Poste Italiane e alle raccolte non ufficiali. La fonte c'era, in
 * un posto in cui nessuno l'aveva cercata.
 *
 * **La fonte.** L'Indice della Pubblica Amministrazione (IPA), gestito da
 * AgID: l'anagrafe delle pubbliche amministrazioni italiane, con l'indirizzo
 * della sede di ciascuna. Licenza CC BY 4.0, aggiornamento giornaliero, e
 * nella stessa riga porta comune, sigla di provincia e CAP.
 *
 * **Che cosa e davvero questo dato, e cosa non e.** IPA non pubblica «i CAP
 * del comune X». Pubblica il CAP della *sede* di ogni amministrazione. Presi
 * tutti insieme e raggruppati per comune, danno **i CAP osservati** in quel
 * comune. La differenza conta:
 *
 * - per un comune con un solo CAP, l'insieme osservato ha un elemento solo, e
 *   quell'elemento **e** il CAP del comune. Sono 7.836 comuni su 7.896;
 * - per una citta grande, l'insieme osservato e un **sottoinsieme** dei suoi
 *   CAP: Roma ne ha oltre 200 e IPA ne vede quelli degli uffici pubblici. Un
 *   sottoinsieme presentato come l'elenco completo sarebbe una bugia.
 *
 * Da qui la regola che questo script incide nel dataset e che il resto del
 * codice non puo aggirare: **si compila solo quando l'osservazione e unica.**
 * Per gli altri comuni il dataset dice «questo comune ha piu di un CAP» e non
 * dice quali: e cio che serve al form per non riempire un campo che
 * riempirebbe male. Non si inventa un CAP, esattamente come non si inventa un
 * codice catastale (ADR-0027, ADR-0032).
 *
 * **La chiave.** Il codice catastale, che e la chiave che l'applicazione gia
 * porta. IPA non lo espone piu nel formato corrente, quindi si ricava
 * unendo IPA all'archivio ISTAT gia in repository su (denominazione
 * normalizzata, sigla di provincia). Non e un join per nome — quello non
 * reggerebbe, ci sono sette denominazioni non univoche — ma per nome **e**
 * provincia, che le distingue tutte.
 *
 * Uso:
 *
 *   node scripts/build-cap-dataset.mjs            # scarica e rigenera
 *   node scripts/build-cap-dataset.mjs --check    # verifica senza scrivere
 *   node scripts/build-cap-dataset.mjs --from amministrazioni.txt
 *
 * Come il suo gemello ISTAT, non ha una modalita che scrive un file che non ha
 * superato i controlli: se la fonte cambia forma, fallisce e lascia il dataset
 * com'era.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SOURCE_URL =
  "https://indicepa.gov.it/ipa-dati/dataset/502ff370-1b2c-4310-94c7-f39ceb7500e3/resource/3ed63523-ff9c-41f6-a6fe-980f3d9e501f/download/amministrazioni.txt";

const OUTPUT = path.join(process.cwd(), "src", "data", "cap-ipa.json");
const COMUNI = path.join(process.cwd(), "src", "data", "comuni-istat.json");

/**
 * Soglie di sanita. Non sono decorative: se la fonte cambia formato le colonne
 * scivolano e il file uscirebbe pieno di stringhe plausibili e sbagliate.
 */
const MIN_ADMINISTRATIONS = 15000;
const MIN_RESOLVED = 7000;
const MAX_AMBIGUOUS = 400;

const fail = (message) => {
  console.error(`build-cap-dataset: ${message}`);
  process.exit(1);
};

/** Stessa normalizzazione di `comuni-model.ts`: senza accenti, senza segni. */
const normalizeName = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const loadSource = async (fromFile) => {
  if (fromFile) return readFileSync(fromFile);

  const response = await fetch(SOURCE_URL);
  if (!response.ok) fail(`la fonte IPA ha risposto ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};

const build = (buffer) => {
  const text = buffer.toString("utf8").replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  const header = (lines[0] || "").split("\t");

  const columnComune = header.indexOf("Comune");
  const columnCap = header.indexOf("Cap");
  const columnProvince = header.indexOf("Provincia");

  if (columnComune < 0 || columnCap < 0 || columnProvince < 0) {
    fail(
      "il file IPA non ha piu le colonne Comune/Cap/Provincia " +
        `(intestazione: ${header.slice(0, 8).join(", ")}). La fonte ha cambiato forma.`,
    );
  }

  if (lines.length - 1 < MIN_ADMINISTRATIONS) {
    fail(
      `${lines.length - 1} amministrazioni: troppo poche rispetto a ` +
        `${MIN_ADMINISTRATIONS}. Scaricamento parziale o fonte cambiata.`,
    );
  }

  /** CAP osservati per (nome normalizzato, sigla provincia). */
  const observed = new Map();
  /** Gli stessi, per solo nome: serve al secondo passaggio. */
  const observedByName = new Map();

  for (const line of lines.slice(1)) {
    const cells = line.split("\t");
    const cap = String(cells[columnCap] || "").trim();
    const comune = String(cells[columnComune] || "").trim();
    const province = String(cells[columnProvince] || "").trim().toUpperCase();

    // Una riga senza un CAP di cinque cifre non e un errore della fonte: e
    // un'amministrazione con l'indirizzo incompleto. Si salta e basta.
    if (!/^\d{5}$/.test(cap)) continue;
    if (!comune || !/^[A-Z]{2}$/.test(province)) continue;

    const name = normalizeName(comune);
    const key = `${name}|${province}`;
    if (!observed.has(key)) observed.set(key, new Set());
    observed.get(key).add(cap);

    if (!observedByName.has(name)) observedByName.set(name, new Set());
    observedByName.get(name).add(cap);
  }

  // --- unione con l'archivio ISTAT ------------------------------------------
  const comuniDataset = JSON.parse(readFileSync(COMUNI, "utf8"));
  const comuni = comuniDataset.comuni || [];

  if (!comuni.length) fail("l'archivio ISTAT dei comuni e vuoto o illeggibile");

  /**
   * Le denominazioni che in tutta Italia appartengono a un comune solo.
   *
   * Servono al secondo passaggio: se un nome e univoco, un'osservazione fatta
   * sotto quel nome appartiene a quel comune e a nessun altro, qualunque
   * sigla di provincia porti la riga di IPA.
   */
  const uniqueNames = new Map();
  for (const [name] of comuni) {
    const key = normalizeName(name);
    uniqueNames.set(key, (uniqueNames.get(key) || 0) + 1);
  }

  const unique = [];
  const ambiguous = [];
  let unobserved = 0;
  let recoveredByName = 0;

  for (const [name, province, belfiore] of comuni) {
    const key = normalizeName(name);
    let caps = observed.get(`${key}|${province}`);

    /*
      Secondo passaggio: la sigla di provincia di IPA non e sempre quella di
      oggi. Nel file corrente 154 comuni sardi portano ancora VS, CI, OT e OG
      — le province riorganizzate nel 2016 — dove ISTAT scrive SU, SS e NU; e
      una riga porta una sigla semplicemente sbagliata.

      La tentazione sarebbe scrivere qui la tabella delle province abolite.
      Sarebbe storia amministrativa incisa nel codice, che invecchia da sola e
      che nessuno rivedra alla prossima riorganizzazione. Il ripiego che non
      invecchia e un altro: **se la denominazione appartiene a un comune solo
      in tutta Italia**, l'osservazione fatta sotto quel nome e sua, e la
      sigla della riga non aggiunge niente. Se invece il nome e condiviso da
      piu comuni, non si ripiega: si resta senza osservazione, che e la
      risposta onesta.
    */
    if ((!caps || caps.size === 0) && uniqueNames.get(key) === 1) {
      const byName = observedByName.get(key);
      if (byName && byName.size > 0) {
        caps = byName;
        recoveredByName += 1;
      }
    }

    if (!caps || caps.size === 0) {
      unobserved += 1;
      continue;
    }

    if (caps.size === 1) {
      unique.push([belfiore, [...caps][0]]);
    } else {
      /*
        Si registra che il comune ha piu CAP, non quali: l'insieme osservato e
        un sottoinsieme, e pubblicarlo come elenco lo farebbe sembrare
        completo. Al form serve sapere solo che qui non deve compilare.
      */
      ambiguous.push(belfiore);
    }
  }

  if (unique.length < MIN_RESOLVED) {
    fail(
      `solo ${unique.length} comuni con CAP univoco (attesi almeno ` +
        `${MIN_RESOLVED}). L'unione con l'archivio ISTAT non ha funzionato.`,
    );
  }

  if (ambiguous.length > MAX_AMBIGUOUS) {
    fail(
      `${ambiguous.length} comuni con CAP multipli (attesi meno di ` +
        `${MAX_AMBIGUOUS}). Sospetto che il join stia fondendo comuni diversi.`,
    );
  }

  unique.sort((left, right) => left[0].localeCompare(right[0]));
  ambiguous.sort();

  return {
    source: {
      name: "IPA — Indice della Pubblica Amministrazione (AgID), amministrazioni",
      url: SOURCE_URL,
      license: "CC BY 4.0",
      sha256: createHash("sha256").update(buffer).digest("hex"),
      administrations: lines.length - 1,
    },
    /**
     * Cosa significa questo file, scritto nel file: chi lo apre fra un anno
     * non deve dedurlo dal nome.
     */
    meaning:
      "CAP osservati nelle sedi delle pubbliche amministrazioni, raggruppati " +
      "per comune. Per un comune con un solo CAP osservato l'osservazione e " +
      "il CAP del comune. Per gli altri e un sottoinsieme: l'elenco non e " +
      "pubblicato e il CAP non si compila.",
    joinedWith: {
      dataset: "src/data/comuni-istat.json",
      on: "denominazione normalizzata + sigla di provincia",
      /** Recuperati dal ripiego sul solo nome, quando il nome e univoco. */
      recoveredByName,
      unobserved,
    },
    fields: ["belfiore", "cap"],
    /** `[codiceCatastale, cap]`, solo dove l'osservazione e unica. */
    unique,
    /** Codici catastali dei comuni con piu CAP: si sa che ci sono, non quali. */
    ambiguous,
  };
};

const main = async () => {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const fromIndex = args.indexOf("--from");
  const fromFile = fromIndex >= 0 ? args[fromIndex + 1] : null;

  const built = build(await loadSource(fromFile));
  const serialized = `${JSON.stringify(built, null, 0)}\n`;

  if (checkOnly) {
    const current = readFileSync(OUTPUT, "utf8");
    if (current === serialized) {
      console.log(
        `invariato: ${built.unique.length} comuni con CAP univoco, ` +
          `${built.ambiguous.length} con CAP multipli`,
      );
      return;
    }
    /*
      Un diff qui non e per forza un errore: IPA cambia ogni giorno e una
      nuova amministrazione in una citta puo aggiungere un CAP osservato. Va
      letto, non ignorato.
    */
    fail(
      "il dataset in repo differisce dalla fonte. Rigenera senza --check e " +
        "leggi il diff: IPA si aggiorna ogni giorno.",
    );
  }

  writeFileSync(OUTPUT, serialized);
  console.log(
    `scritto ${OUTPUT}\n` +
      `  ${built.unique.length} comuni con CAP univoco\n` +
      `  ${built.ambiguous.length} comuni con piu CAP (non si compila)\n` +
      `  ${built.joinedWith.recoveredByName} recuperati per nome univoco\n` +
      `  ${built.joinedWith.unobserved} comuni senza nessuna osservazione`,
  );
};

main().catch((error) => fail(error?.message || String(error)));
