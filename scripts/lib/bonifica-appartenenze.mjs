/**
 * **D-RD-16 — il pianificatore della bonifica. Puro: nessun database, nessuna
 * scrittura.** Riceve le righe com'erano lette e restituisce le mutazioni che
 * la bonifica farebbe, una per una, con prima/dopo, regola e motivo.
 *
 * Il piano: `docs/redesign/D-RD-16-piano-bonifica-appartenenze.md`. Le regole
 * sono quelle del §3, nell'ordine in cui il piano le scrive:
 *
 * - **R1** l'etichetta e il nome corrente di **una sola** categoria;
 * - **R2** R1 non trova niente e l'etichetta e il `category_name` che righe
 *   **identificate** portano ancora, per **una sola** categoria vera;
 * - **R3** R1 ne trova **piu di una**, e l'atleta — dopo R1/R2 applicate alle
 *   sue altre righe — ne possiede **una sola**: quella. Si **segnala**: non
 *   si approva da sola;
 * - **R0** altrimenti: la riga non si tocca e l'esecuzione non parte.
 *
 * Azione: se l'atleta ha gia la categoria vera → `DELETE` della copia;
 * altrimenti `UPDATE` del `category_id` (il `category_name` resta com'e: e
 * l'alias con cui R2 legge le altre gemelle, ADR-0185 §8).
 *
 * Il modulo lavora sulle righe **grezze**, non sul normalizzatore
 * dell'applicazione: la bonifica deve essere spiegabile in SQL, e il
 * censimento (`scripts/censimento-appartenenze-legacy.mjs`, che invece usa
 * il normalizzatore) e il controllo incrociato, non la fonte.
 */

const normalizza = (value) => String(value ?? "").trim().toLowerCase();

const ordinaRighe = (a, b) =>
  Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)) ||
  String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) ||
  String(a.id).localeCompare(String(b.id));

const copia = (riga) => JSON.parse(JSON.stringify(riga));

/**
 * Il catalogo indicizzato: identificativi, nomi correnti, alias.
 *
 * Gli alias si leggono **solo** dalle righe identificate (`category_id` nel
 * catalogo): una riga storica non e evidenza di niente.
 */
export const indicizzaCatalogo = (catalogo, righe) => {
  const ids = new Set();
  const nomePerId = new Map();
  const perNome = new Map();
  for (const voce of catalogo) {
    const id = String(voce?.id ?? "").trim();
    if (!id) continue;
    ids.add(id);
    nomePerId.set(id, String(voce?.name ?? "").trim());
    const chiave = normalizza(voce?.name);
    if (!chiave) continue;
    if (!perNome.has(chiave)) perNome.set(chiave, []);
    if (!perNome.get(chiave).includes(id)) perNome.get(chiave).push(id);
  }
  const alias = new Map();
  for (const riga of righe) {
    if (!ids.has(String(riga.category_id))) continue;
    const chiave = normalizza(riga.category_name);
    if (!chiave) continue;
    if (!alias.has(chiave)) alias.set(chiave, new Set());
    alias.get(chiave).add(String(riga.category_id));
  }
  return { ids, nomePerId, perNome, alias };
};

const risolviR1R2 = (etichetta, indice) => {
  const chiave = normalizza(etichetta);
  const perNome = indice.perNome.get(chiave) || [];
  if (perNome.length === 1) {
    return { regola: "R1", target: perNome[0], determinismo: "HIGH", candidati: perNome,
      motivo: "l'etichetta e il nome corrente di una sola categoria del catalogo" };
  }
  if (perNome.length > 1) {
    return { regola: "R3?", target: "", determinismo: "NONE", candidati: perNome,
      motivo: `il nome corrente ne nomina ${perNome.length}: si decide con il contesto dell'atleta (R3)` };
  }
  const perAlias = Array.from(indice.alias.get(chiave) || []);
  if (perAlias.length === 1) {
    return { regola: "R2", target: perAlias[0], determinismo: "HIGH", candidati: perAlias,
      motivo: "nessun nome corrente risponde; righe identificate di altri atleti portano ancora questo nome per una sola categoria vera" };
  }
  if (perAlias.length > 1) {
    return { regola: "R0", target: "", determinismo: "NONE", candidati: perAlias,
      motivo: `l'alias risponde a ${perAlias.length} categorie: nessuna scelta automatica` };
  }
  return { regola: "R0", target: "", determinismo: "NONE", candidati: [],
    motivo: "nessuna categoria del catalogo risponde a questo nome, ne per nome corrente ne per alias" };
};

/**
 * Il piano per un club.
 *
 * @param {{ organizationId: string, catalogo: {id:string,name:string}[], righe: object[], atleti: object[] }} dati
 *   `righe`: **tutte** le righe `athlete_category_memberships` del club;
 *   `atleti`: le righe `athletes` del club (`id`, `category_id`, `category_name`).
 */
export const pianificaBonifica = ({ organizationId, catalogo, righe, atleti }) => {
  const indice = indicizzaCatalogo(catalogo, righe);
  const mutazioni = [];
  const revisione = [];
  const daConfermare = [];
  const distribuzione = { R1: 0, R2: 0, R3: 0, R0: 0 };

  const righeDelClub = righe.filter((r) => String(r.organization_id) === String(organizationId));
  const perAtleta = new Map();
  for (const riga of righeDelClub) {
    const chiave = String(riga.athlete_id);
    if (!perAtleta.has(chiave)) perAtleta.set(chiave, []);
    perAtleta.get(chiave).push(riga);
  }

  const storiche = righeDelClub.filter((r) => !indice.ids.has(String(r.category_id)));
  /* Lo stato «dopo» delle righe di ogni atleta, per decidere gemella/aggiornamento e per R3. */
  const possiede = new Map(); // athlete_id -> Map(category_id -> riga risultante)
  const decisioni = new Map(); // riga.id -> decisione

  for (const [athleteId, righeAtleta] of perAtleta) {
    const m = new Map();
    for (const r of righeAtleta) if (indice.ids.has(String(r.category_id))) m.set(String(r.category_id), copia(r));
    possiede.set(athleteId, m);
  }

  const decidiAzione = (riga, risoluzione, conferma) => {
    const athleteId = String(riga.athlete_id);
    const proprie = possiede.get(athleteId);
    const gemella = proprie.get(risoluzione.target);
    const base = {
      regola: risoluzione.regola,
      determinismo: risoluzione.determinismo,
      candidati: risoluzione.candidati,
      motivo: risoluzione.motivo,
      confermaManuale: conferma,
    };
    if (gemella) {
      mutazioni.push({
        tabella: "athlete_category_memberships",
        riga: String(riga.id),
        athlete_id: athleteId,
        operazione: "DELETE",
        prima: copia(riga),
        dopo: null,
        target: risoluzione.target,
        gemella: String(gemella.id),
        ...base,
        motivo: `${base.motivo}; l'atleta ha gia la riga identificata ${gemella.id} per ${risoluzione.target}: questa e una copia`,
      });
      /* La copia era primaria o portava una sede e la gemella no: si trasferisce prima di cancellare. */
      const aggiornaGemella = {};
      if (riga.is_primary && !gemella.is_primary) aggiornaGemella.is_primary = true;
      if (riga.site_id && !gemella.site_id) aggiornaGemella.site_id = riga.site_id;
      if (Object.keys(aggiornaGemella).length) {
        const primaGemella = copia(gemella);
        Object.assign(gemella, aggiornaGemella);
        mutazioni.push({
          tabella: "athlete_category_memberships",
          riga: String(gemella.id),
          athlete_id: athleteId,
          operazione: "UPDATE",
          prima: primaGemella,
          dopo: copia(gemella),
          campi: aggiornaGemella,
          target: risoluzione.target,
          regola: risoluzione.regola,
          determinismo: risoluzione.determinismo,
          candidati: risoluzione.candidati,
          confermaManuale: conferma,
          motivo: `la copia ${riga.id} portava ${Object.keys(aggiornaGemella).join(", ")} che la gemella non aveva: si trasferisce prima di cancellarla`,
        });
      }
      return;
    }
    const dopo = { ...copia(riga), category_id: risoluzione.target };
    proprie.set(risoluzione.target, dopo);
    mutazioni.push({
      tabella: "athlete_category_memberships",
      riga: String(riga.id),
      athlete_id: athleteId,
      operazione: "UPDATE",
      prima: copia(riga),
      dopo,
      campi: { category_id: risoluzione.target },
      target: risoluzione.target,
      ...base,
      motivo: `${base.motivo}; l'atleta non ha una riga identificata per ${risoluzione.target}: si aggiorna l'identificativo, il nome resta com'e`,
    });
  };

  /* Passata 1: R1 / R2, per atleta in ordine stabile (prima la primaria). */
  const rinviate = [];
  for (const riga of [...storiche].sort(ordinaRighe)) {
    const ris = risolviR1R2(riga.category_id, indice);
    decisioni.set(String(riga.id), ris);
    if (ris.regola === "R3?") { rinviate.push(riga); continue; }
    if (ris.regola === "R0") {
      distribuzione.R0 += 1;
      revisione.push({ tabella: "athlete_category_memberships", riga: String(riga.id), athlete_id: String(riga.athlete_id),
        etichetta: riga.category_id, is_primary: Boolean(riga.is_primary), regola: "R0", candidati: ris.candidati, motivo: ris.motivo, prima: copia(riga) });
      continue;
    }
    distribuzione[ris.regola] += 1;
    decidiAzione(riga, ris, false);
  }

  /* Passata 2: R3 — il contesto dell'atleta dopo la passata 1. */
  for (const riga of rinviate) {
    const ris = decisioni.get(String(riga.id));
    const proprie = possiede.get(String(riga.athlete_id));
    const possedute = ris.candidati.filter((id) => proprie.has(id));
    if (possedute.length === 1) {
      const target = possedute[0];
      const r3 = {
        regola: "R3", target, determinismo: "MEDIUM", candidati: ris.candidati,
        motivo: `il nome ne nomina ${ris.candidati.length} (${ris.candidati.join(", ")}); dopo R1/R2 l'atleta possiede solo ${target}`,
      };
      distribuzione.R3 += 1;
      daConfermare.push(String(riga.id));
      decidiAzione(riga, r3, true);
      continue;
    }
    distribuzione.R0 += 1;
    revisione.push({ tabella: "athlete_category_memberships", riga: String(riga.id), athlete_id: String(riga.athlete_id),
      etichetta: riga.category_id, is_primary: Boolean(riga.is_primary), regola: "R0", candidati: ris.candidati,
      motivo: possedute.length === 0
        ? `il nome ne nomina ${ris.candidati.length} e l'atleta non ne possiede nessuna: nessuna scelta automatica`
        : `il nome ne nomina ${ris.candidati.length} e l'atleta le possiede tutte e ${possedute.length}: nessuna scelta automatica`,
      prima: copia(riga) });
  }

  /* Colonna `athletes.category_id`: la primaria dell'atleta dopo la fase A. */
  for (const atleta of atleti) {
    const categoria = String(atleta.category_id ?? "").trim();
    if (!categoria || indice.ids.has(categoria)) continue;
    const proprie = possiede.get(String(atleta.id)) || new Map();
    const primarie = Array.from(proprie.values()).filter((r) => r.is_primary);
    if (primarie.length !== 1) {
      distribuzione.R0 += 1;
      revisione.push({ tabella: "athletes", riga: String(atleta.id), athlete_id: String(atleta.id), etichetta: categoria, regola: "R0",
        candidati: primarie.map((r) => r.category_id),
        motivo: primarie.length === 0 ? "l'atleta non avra una riga primaria identificata dopo la fase A" : "l'atleta avrebbe piu di una primaria",
        prima: { category_id: atleta.category_id, category_name: atleta.category_name } });
      continue;
    }
    const primaria = primarie[0];
    const dopo = { category_id: primaria.category_id, category_name: indice.nomePerId.get(primaria.category_id) || primaria.category_name };
    mutazioni.push({
      tabella: "athletes",
      riga: String(atleta.id),
      athlete_id: String(atleta.id),
      operazione: "UPDATE",
      prima: { category_id: atleta.category_id, category_name: atleta.category_name },
      dopo,
      campi: dopo,
      target: primaria.category_id,
      regola: "colonna",
      determinismo: "HIGH",
      candidati: [primaria.category_id],
      confermaManuale: false,
      motivo: `la colonna e una proiezione della riga primaria (${primaria.id}), che dopo la fase A e ${primaria.category_id}`,
    });
  }

  const conteggi = {
    righePrima: righeDelClub.length,
    storiche: storiche.length,
    update: mutazioni.filter((m) => m.tabella === "athlete_category_memberships" && m.operazione === "UPDATE" && m.campi?.category_id).length,
    updateGemella: mutazioni.filter((m) => m.tabella === "athlete_category_memberships" && m.operazione === "UPDATE" && !m.campi?.category_id).length,
    delete: mutazioni.filter((m) => m.operazione === "DELETE").length,
    colonne: mutazioni.filter((m) => m.tabella === "athletes").length,
    revisione: revisione.length,
    righeDopoAttese: 0,
  };
  conteggi.righeDopoAttese = conteggi.righePrima - conteggi.delete;

  return { organizationId, mutazioni, revisione, daConfermare, distribuzione, conteggi, indice };
};

/** Le `--attese` come stringa canonica: `update=1,delete=212,colonne=2`. */
export const atteseDaConteggi = (conteggi) =>
  `update=${conteggi.update},delete=${conteggi.delete},colonne=${conteggi.colonne}`;

export const leggiAttese = (testo) => {
  const out = {};
  for (const pezzo of String(testo ?? "").split(",")) {
    const [k, v] = pezzo.split("=").map((s) => String(s ?? "").trim());
    if (!k) continue;
    if (!/^\d+$/.test(v ?? "")) throw new Error(`--attese: valore non numerico per ${k}`);
    out[k] = Number(v);
  }
  for (const k of ["update", "delete", "colonne"]) if (!(k in out)) throw new Error(`--attese: manca ${k}`);
  return out;
};

/**
 * Applica il piano **in memoria** e restituisce lo stato dopo. Serve al
 * dry-run per le validazioni e per la prova di idempotenza: nessun database.
 */
export const applicaInMemoria = ({ righe, atleti }, mutazioni) => {
  const righeDopo = new Map(righe.map((r) => [String(r.id), copia(r)]));
  const atletiDopo = new Map(atleti.map((a) => [String(a.id), copia(a)]));
  for (const m of mutazioni) {
    if (m.tabella === "athlete_category_memberships") {
      if (m.operazione === "DELETE") { righeDopo.delete(m.riga); continue; }
      const riga = righeDopo.get(m.riga);
      if (!riga) throw new Error(`mutazione su riga assente: ${m.riga}`);
      Object.assign(riga, m.campi);
      continue;
    }
    if (m.tabella === "athletes") {
      const a = atletiDopo.get(m.riga);
      if (!a) throw new Error(`mutazione su atleta assente: ${m.riga}`);
      Object.assign(a, m.campi);
    }
  }
  return { righe: Array.from(righeDopo.values()), atleti: Array.from(atletiDopo.values()) };
};

/**
 * Le mutazioni inverse, dall'ultima alla prima: un `DELETE` torna `INSERT`
 * della riga com'era, un `UPDATE` torna `UPDATE` con i valori di prima.
 */
export const invertiMutazioni = (mutazioni) =>
  [...mutazioni].reverse().map((m) => {
    if (m.operazione === "DELETE") {
      return { tabella: m.tabella, riga: m.riga, operazione: "INSERT", valori: copia(m.prima), inverteDi: m.riga };
    }
    const campi = {};
    for (const k of Object.keys(m.campi || {})) campi[k] = m.prima[k] ?? null;
    return { tabella: m.tabella, riga: m.riga, operazione: "UPDATE", campi, inverteDi: m.riga };
  });

export const applicaInversaInMemoria = ({ righe, atleti }, inverse) => {
  const righeDopo = new Map(righe.map((r) => [String(r.id), copia(r)]));
  const atletiDopo = new Map(atleti.map((a) => [String(a.id), copia(a)]));
  for (const op of inverse) {
    if (op.tabella === "athlete_category_memberships") {
      if (op.operazione === "INSERT") { righeDopo.set(op.riga, copia(op.valori)); continue; }
      Object.assign(righeDopo.get(op.riga), op.campi);
      continue;
    }
    Object.assign(atletiDopo.get(op.riga), op.campi);
  }
  return { righe: Array.from(righeDopo.values()), atleti: Array.from(atletiDopo.values()) };
};

/**
 * V1–V5 del piano (§9) su uno stato in memoria. V6 (l'audit non tocca altri
 * club) e una query sulla tabella di audit e vive nello script.
 */
export const validaStato = ({ organizationId, catalogo, righe, atleti }, attese = {}) => {
  const ids = new Set(catalogo.map((c) => String(c.id)));
  const delClub = righe.filter((r) => String(r.organization_id) === String(organizationId));
  const fuoriCatalogo = delClub.filter((r) => !ids.has(String(r.category_id)));
  const primarie = delClub.filter((r) => Boolean(r.is_primary));
  const perAtleta = new Map();
  for (const r of delClub) {
    const k = String(r.athlete_id);
    perAtleta.set(k, (perAtleta.get(k) || 0) + (r.is_primary ? 1 : 0));
  }
  const atletiSenzaUnaPrimaria = Array.from(perAtleta.entries()).filter(([, n]) => n !== 1).map(([id]) => id);
  const colonneFuoriCatalogo = atleti.filter((a) => a.category_id && !ids.has(String(a.category_id)));
  const primariaPerAtleta = new Map(primarie.map((r) => [String(r.athlete_id), String(r.category_id)]));
  const colonneDiscordi = atleti.filter((a) => primariaPerAtleta.has(String(a.id)) && String(a.category_id ?? "") !== primariaPerAtleta.get(String(a.id)));

  const esito = (nome, valore, atteso, dettaglio) => ({ nome, valore, atteso, ok: atteso === undefined ? true : valore === atteso, dettaglio });
  return [
    esito("V1 righe fuori catalogo", fuoriCatalogo.length, attese.V1, fuoriCatalogo.slice(0, 5).map((r) => r.id)),
    esito("V2 righe totali del club", delClub.length, attese.V2),
    esito("V3 primarie", primarie.length, attese.V3),
    esito("V3b atleti con 0 o 2 primarie", atletiSenzaUnaPrimaria.length, 0, atletiSenzaUnaPrimaria.slice(0, 5)),
    esito("V4 athletes.category_id fuori catalogo", colonneFuoriCatalogo.length, attese.V4, colonneFuoriCatalogo.slice(0, 5).map((a) => a.id)),
    esito("V5 athletes.category_id diverso dalla primaria", colonneDiscordi.length, attese.V5, colonneDiscordi.slice(0, 5).map((a) => a.id)),
  ];
};
