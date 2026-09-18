import {
  resolveCategoryReference,
  sameAnyCategory,
  type CategoryCatalogEntry,
} from "@/lib/categories/identity";

export type AthleteCategoryMembership = {
  id: string;
  organizationId?: string | null;
  athleteId?: string | null;
  categoryId: string;
  categoryName: string;
  /**
   * **Il nome com'era scritto sulla riga**, prima della risoluzione sul
   * catalogo (ADR-0185).
   *
   * `categoryName` e l'etichetta corrente della categoria — quella del
   * catalogo, quando c'e. Questo e cio che l'archivio dice: su una riga
   * `{ category_id: <id vero>, category_name: "Pulcini - S. Cosma" }` vale
   * «Pulcini - S. Cosma», cioe il nome che la categoria aveva prima di una
   * rinomina. E l'evidenza che permette a una riga storica con il **solo**
   * nome di riconoscersi nella propria gemella identificata: senza, la
   * risoluzione sul catalogo cancellava quel nome prima della dedupe e la
   * gemella restava orfana come seconda squadra.
   */
  storedCategoryName: string;
  isPrimary: boolean;
  /**
   * Sede in cui l'atleta svolge **questa** categoria. Vuota su un club
   * mono-sede e su tutto il dato precedente alle sedi: la stessa categoria in
   * due sedi resta una categoria sola, e cio che cambia e questo campo.
   * Vedi `@/lib/club-sites`.
   */
  siteId: string;
  source: "membership" | "data" | "legacy";
};

export type AthleteCategoryRelationship = "primary" | "secondary" | "none";
/**
 * `member`: la riga dell'evento dice che l'atleta **era** della categoria
 * (`is_extra_category = false`, fotografato alla registrazione, ADR-0194
 * §20) ma oggi non le appartiene piu: primaria o secondaria allora non si
 * sa, e non si inventa dall'appartenenza corrente.
 */
export type ParticipationCategoryContext = "primary" | "secondary" | "extra" | "member";

type CategoryOptionLike = CategoryCatalogEntry;

/**
 * **Perche un riferimento non e diventato un'appartenenza.**
 *
 * `ambiguous`: il nome ne nominava due (ADR-0155). `dangling`: il catalogo
 * del club c'e e non lo conosce — una categoria cancellata, o un'etichetta
 * scritta dove serviva un identificativo, senza una gemella che dica chi e.
 */
export type DanglingAthleteCategoryReference = {
  membership: AthleteCategoryMembership;
  reason: "ambiguous" | "dangling";
};

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeReference = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const firstNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    const candidate = String(value || "").trim();
    if (candidate) {
      return candidate;
    }
  }

  return "";
};

/**
 * **La risoluzione passa dalla primitiva del dominio, non da una mappa locale.**
 *
 * Qui c'era un `Map` che indicizzava il catalogo **per identificativo e per
 * nome nello stesso dizionario**, con l'ultimo che vinceva. Due categorie
 * omonime su due sedi — la configurazione ordinaria di una societa multi-sede —
 * facevano quindi risolvere ogni riferimento per nome sulla **seconda**, in
 * silenzio: e esattamente la fusione che ADR-0155 ha tolto da
 * `recordMatchesCategory` e da `resolveCategoryId`, sopravvissuta in un terzo
 * posto perche nessuno l'aveva censita.
 *
 * `resolveCategoryReference` e la primitiva canonica: un nome che ne nomina due
 * non ne nomina nessuna, e lo **dichiara** invece di sceglierne una.
 */
const resolveCategoryIdentity = (
  rawId: unknown,
  rawName: unknown,
  categories: readonly CategoryOptionLike[] = [],
) => {
  const riferimento = resolveCategoryReference(rawId, rawName, categories);

  return {
    categoryId: riferimento?.id || "",
    categoryName: riferimento?.name || "Categoria",
    known: Boolean(riferimento?.known),
    ambiguous: Boolean(riferimento?.ambiguous),
  };
};

const toMembership = (
  value: unknown,
  categories: readonly CategoryOptionLike[] = [],
  source: AthleteCategoryMembership["source"] = "membership",
  primaryHint = false,
): AthleteCategoryMembership | null => {
  if (typeof value === "string") {
    const identity = resolveCategoryIdentity(value, value, categories);
    if (!identity.categoryId) {
      return null;
    }

    return {
      id: `${identity.categoryId}:${source}`,
      categoryId: identity.categoryId,
      categoryName: identity.categoryName,
      storedCategoryName: value.trim(),
      isPrimary: primaryHint,
      siteId: "",
      source,
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  const storedName = firstNonEmptyString(
    /*
      Il nome com'era sulla riga sopravvive a un giro nel browser: chi rimanda
      un'appartenenza gia normalizzata porta `storedCategoryName`, e senza
      leggerlo il salvataggio riscriverebbe la riga con il nome corrente,
      cancellando l'alias di cui le righe gemelle di **altri** atleti hanno
      bisogno (revisione ostile H3).
    */
    value.storedCategoryName,
    value.stored_category_name,
    value.category_name,
    value.categoryName,
    value.name,
    value.label,
    value.title,
  );
  const identity = resolveCategoryIdentity(
    value.category_id ?? value.categoryId ?? value.id ?? value.value,
    storedName,
    categories,
  );

  if (!identity.categoryId) {
    return null;
  }

  return {
    id: String(value.id || `${identity.categoryId}:${source}`).trim(),
    organizationId:
      firstNonEmptyString(value.organization_id, value.organizationId) || null,
    athleteId: firstNonEmptyString(value.athlete_id, value.athleteId) || null,
    categoryId: identity.categoryId,
    categoryName: identity.categoryName,
    storedCategoryName: storedName,
    isPrimary: Boolean(
      value.is_primary ??
        value.isPrimary ??
        value.primary ??
        value.isPrimaryCategory ??
        primaryHint,
    ),
    siteId: firstNonEmptyString(value.site_id, value.siteId, value.sede_id),
    source,
  };
};

const pushMembership = (
  target: AthleteCategoryMembership[],
  membership: AthleteCategoryMembership | null,
) => {
  if (!membership || !membership.categoryId) {
    return;
  }

  target.push(membership);
};

const collectMemberships = (
  source: unknown,
  categories: readonly CategoryOptionLike[] = [],
  origin: AthleteCategoryMembership["source"] = "membership",
  primaryHint = false,
) => {
  const memberships: AthleteCategoryMembership[] = [];

  if (Array.isArray(source)) {
    source.forEach((entry, index) => {
      collectMemberships(
        entry,
        categories,
        origin,
        primaryHint || index === 0,
      ).forEach((membership) => memberships.push(membership));
    });
    return memberships;
  }

  if (typeof source === "string" || isRecord(source)) {
    pushMembership(memberships, toMembership(source, categories, origin, primaryHint));

    if (isRecord(source)) {
      const nestedSources = [
        source.payload,
        source.category,
        source.categories,
        source.memberships,
        source.categoryMemberships,
        source.category_memberships,
      ].filter((value) => value !== undefined);

      nestedSources.forEach((nested) => {
        collectMemberships(nested, categories, origin, primaryHint).forEach(
          (membership) => memberships.push(membership),
        );
      });
    }
  }

  return memberships;
};

/** Vero quando l'appartenenza porta un identificativo suo, distinto dal nome. */
const portaUnIdentificativo = (membership: AthleteCategoryMembership) =>
  Boolean(membership.categoryName) &&
  normalizeReference(membership.categoryId) !==
    normalizeReference(membership.categoryName);

/**
 * **Il catalogo implicito: quello che le appartenenze stesse portano.**
 *
 * Un'appartenenza che porta un identificativo **e** un nome diverso da quello
 * — `{ categoryId: "category-1757…", categoryName: "Scoiattoli" }` — e essa
 * stessa una voce di catalogo: dice come si chiama quella categoria. Una che
 * porta lo stesso valore nei due campi non dice niente di piu del valore.
 *
 * Porta anche il nome **com'era scritto sulla riga** (`storedCategoryName`),
 * come alias: dopo una rinomina la riga identificata dice ancora «Pulcini -
 * S. Cosma», e quella e l'unica evidenza con cui la riga gemella scritta con
 * il solo nome puo ritrovarla (ADR-0185). La risoluzione sul catalogo del club
 * riscrive `categoryName` sul nome corrente, e senza l'alias l'evidenza andava
 * persa proprio quando il catalogo c'era.
 *
 * Serve perche sei chiamanti su dodici il catalogo del club non ce l'hanno in
 * mano (`getAthleteCategoryRelationship`, la pagina Gare, quella Allenamenti,
 * `club-sites`, `audience`, i numeri di maglia): senza questo, la riga
 * fantasma «Scoiattoli» che il difetto ha gia scritto in archivio resterebbe
 * una seconda categoria per sempre.
 */
const catalogoImplicito = (
  memberships: readonly AthleteCategoryMembership[],
): CategoryOptionLike[] =>
  memberships.filter(portaUnIdentificativo).map((membership) => {
    const aliases: string[] = [];
    const stored = String(membership.storedCategoryName || "").trim();
    if (
      stored &&
      normalizeReference(stored) !== normalizeReference(membership.categoryName) &&
      normalizeReference(stored) !== normalizeReference(membership.categoryId)
    ) {
      aliases.push(stored);
    }

    return {
      id: membership.categoryId,
      name: membership.categoryName,
      aliases,
    };
  });

/**
 * **La chiave con cui due appartenenze sono la stessa.**
 *
 * L'identificativo, quando c'e. Un'appartenenza che porta solo un **nome** —
 * la riga che il difetto ha scritto, o il record di un club senza catalogo —
 * si riconosce nell'identificativo di chi quel nome ce l'ha come etichetta o
 * come alias, ma **solo se ne nomina una sola**: due omonime su due sedi
 * restano due squadre (ADR-0155).
 */
const chiaveDiIdentita = (
  membership: AthleteCategoryMembership,
  catalogo: readonly CategoryOptionLike[],
) => {
  const propria =
    normalizeReference(membership.categoryId) ||
    normalizeReference(membership.categoryName);

  if (portaUnIdentificativo(membership)) return propria;

  const identita = resolveCategoryIdentity(
    membership.categoryId,
    membership.categoryName,
    catalogo,
  );

  if (!identita.known || identita.ambiguous) return propria;

  return normalizeReference(identita.categoryId) || propria;
};

const fondiAppartenenze = (
  existing: AthleteCategoryMembership,
  membership: AthleteCategoryMembership,
): AthleteCategoryMembership => {
  /*
    **Fra le due vince l'identita, non l'ordine di lettura.**

    Quando si fondono la riga identificata e quella che porta il solo nome, a
    sopravvivere deve essere l'identificativo: tenere «Scoiattoli» perche
    capitava di leggerlo per primo lascerebbe l'atleta agganciato a una
    stringa che il catalogo non conosce, e ogni salvataggio successivo la
    riscriverebbe in archivio.
  */
  const identificata = [existing, membership].find(portaUnIdentificativo);

  return {
    ...existing,
    /*
      Anche la riga e la sede seguono l'identita: tenere quelle di chi capitava
      per primo faceva dipendere dall'ordine dell'heap quale riga sopravvive
      al salvataggio e in quale sede sta l'atleta (revisione ostile M3).
    */
    id: identificata?.id || existing.id || membership.id,
    categoryId:
      identificata?.categoryId || existing.categoryId || membership.categoryId,
    categoryName:
      identificata?.categoryName ||
      existing.categoryName ||
      membership.categoryName,
    storedCategoryName:
      identificata?.storedCategoryName ||
      existing.storedCategoryName ||
      membership.storedCategoryName,
    organizationId: existing.organizationId || membership.organizationId,
    athleteId: existing.athleteId || membership.athleteId,
    isPrimary: existing.isPrimary || membership.isPrimary,
    siteId: identificata?.siteId || existing.siteId || membership.siteId,
    source: existing.source === "legacy" ? membership.source : existing.source,
  };
};

const scegliPrimaria = (values: AthleteCategoryMembership[]) => {
  if (values.length === 0) {
    return values;
  }

  /*
    **La primaria si sceglie dopo aver guardato tutte, non camminando.**

    Qui la promozione dell'indice zero avveniva **dentro** lo stesso ciclo che
    cercava la primaria dichiarata: se la riga con `is_primary` stava in
    seconda posizione, la prima veniva promossa prima che il ciclo la vedesse,
    e la vera primaria veniva declassata.

    Non era teorico. `loadClubAthleteMemberships` legge le appartenenze
    **senza `ORDER BY`**, quindi l'ordine e quello dell'heap di Postgres, che
    cambia dopo ogni aggiornamento di riga. E il danno si fissava: ogni
    salvataggio della scheda riscrive `athletes.category_id` dalla primaria
    normalizzata, quindi bastava cambiare un avatar per spostare in archivio la
    categoria primaria di un atleta su una sua secondaria.

    Adesso la dichiarata si cerca su **tutte** le righe; l'indice zero si
    promuove solo se nessuna lo e.
  */
  const indiceDichiarata = values.findIndex((membership) => membership.isPrimary);
  const indicePrimaria = indiceDichiarata >= 0 ? indiceDichiarata : 0;

  return values
    .map((membership, index) => ({
      ...membership,
      isPrimary: index === indicePrimaria,
    }))
    .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary));
};

type Normalizzate = {
  memberships: AthleteCategoryMembership[];
  dangling: DanglingAthleteCategoryReference[];
};

const dedupeMemberships = (
  memberships: AthleteCategoryMembership[],
  categories: readonly CategoryOptionLike[] = [],
): Normalizzate => {
  const deduped = new Map<string, AthleteCategoryMembership>();
  const dangling: DanglingAthleteCategoryReference[] = [];
  const catalogoClub = (Array.isArray(categories) ? categories : []).filter(
    (voce) => voce?.id,
  );
  const catalogo: CategoryOptionLike[] = [
    ...catalogoClub,
    ...catalogoImplicito(memberships),
  ];
  const qualcunaIdentificata = memberships.some(portaUnIdentificativo);

  memberships.forEach((membership) => {
    const key = chiaveDiIdentita(membership, catalogo);
    if (!key) {
      return;
    }

    /*
      **Un nome che ne nomina due non e un'appartenenza** (ADR-0155).

      Vale per ogni sorgente, non solo per la colonna storica: una stringa in
      `data.categories` («Scoiattoli», con due Scoiattoli in catalogo) o una
      riga scritta con il solo nome non identificano nessuna squadra. Prima
      entravano come riga propria, e a schermo usciva «Scoiattoli · Secondaria»
      accanto a una primaria che era gia una delle due. Si scarta **solo** se
      l'atleta ha almeno un'appartenenza identificata: un club senza catalogo,
      con i soli nomi, non ha ambiguita conoscibili e continua come prima.
    */
    if (!portaUnIdentificativo(membership) && qualcunaIdentificata) {
      const identita = resolveCategoryIdentity(
        membership.categoryId,
        membership.categoryName,
        catalogo,
      );
      if (identita.ambiguous && !identita.known) {
        dangling.push({ membership, reason: "ambiguous" });
        return;
      }
    }

    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, membership);
      return;
    }

    deduped.set(key, fondiAppartenenze(existing, membership));
  });

  let values = Array.from(deduped.values());

  /*
    **Con il catalogo del club in mano, un riferimento che il catalogo non
    conosce e pendente, non una seconda squadra** (ADR-0185).

    `categories` e il catalogo del club — tutto, mai un sottoinsieme: e il
    contratto di questo parametro. Se c'e e non riconosce un'appartenenza,
    quella cita una categoria che il club non ha: cancellata, o un'etichetta
    scritta dove serviva un identificativo e senza una gemella che dica chi e.
    Una **secondaria** cosi non entra: esce fra i pendenti, per il censimento.
    La **primaria** resta, segnalata: toglierla farebbe salire una secondaria
    al suo posto in silenzio, e la scheda deve dire cio che l'archivio dice,
    non inventare una squadra.

    Senza catalogo non si giudica niente: le righe restano com'erano.
  */
  if (catalogoClub.length > 0) {
    const primaria = scegliPrimaria(values).find((voce) => voce.isPrimary);
    values = values.filter((membership) => {
      /*
        Si giudica sul catalogo del **club**, non su quello implicito: una
        riga identificata e sempre nel proprio catalogo implicito, e giudicarla
        li vorrebbe dire che una categoria cancellata non e mai pendente
        (revisione ostile L1). Gli alias del catalogo del club bastano a far
        riconoscere la gemella gia fusa.
      */
      const identita = resolveCategoryIdentity(
        membership.categoryId,
        membership.categoryName,
        catalogoClub,
      );
      if (identita.known) return true;

      const ePrimaria =
        primaria &&
        normalizeReference(primaria.categoryId) ===
          normalizeReference(membership.categoryId);
      dangling.push({
        membership,
        reason: identita.ambiguous ? "ambiguous" : "dangling",
      });
      return Boolean(ePrimaria);
    });
  }

  return { memberships: scegliPrimaria(values), dangling };
};

/**
 * **Una proiezione ritrova la propria riga, o entra da secondaria, o tace.**
 *
 * Vale per la colonna storica (`athletes.category_id`, `data.category`) e per
 * l'elenco delle etichette (`categories`, `data.categories`): sono **cache
 * derivate** che lo stesso salvataggio scrive dalle righe di
 * `athlete_category_memberships`. Le righe sono la fonte; la proiezione dice
 * al piu qualcosa che le righe non dicono.
 *
 * Restituisce la proiezione riscritta sull'identita della riga che la
 * riconosce — cosi la dedupe le fonde, e la sede eventualmente dichiarata
 * sulla colonna non va persa — oppure la proiezione da secondaria quando
 * nessuna riga la riconosce ma il riferimento e inequivocabile, oppure `null`
 * quando il nome ne nomina due.
 */
const riconciliaProiezione = (
  proiezione: AthleteCategoryMembership,
  memberships: readonly AthleteCategoryMembership[],
  categories: readonly CategoryOptionLike[] = [],
  /**
   * Solo la **colonna storica** entra da secondaria quando nessuna riga la
   * riconosce (C2, club migrato a meta). Un'etichetta di `data.categories`
   * o una voce di `data.categoryMemberships` che non ritrova la propria riga
   * e una cache rimasta indietro, e riscriverla come riga vera al salvataggio
   * successivo riaprirebbe la strada del fantasma (revisione ostile M2).
   */
  sconosciutaEntra = false,
) => {
  const catalogo: CategoryOptionLike[] = [
    ...categories,
    ...catalogoImplicito(memberships),
  ];

  const identita = resolveCategoryIdentity(
    proiezione.categoryId,
    proiezione.categoryName,
    catalogo,
  );

  /* Un nome che ne nomina due non ne nomina nessuna: la proiezione tace. */
  if (identita.ambiguous && !identita.known) return null;

  const chiave = normalizeReference(identita.categoryId);
  const riga = memberships.find(
    (membership) => normalizeReference(membership.categoryId) === chiave,
  );

  /*
    **Se non si riconosce in nessuna riga, entra come secondaria — non
    sparisce** (revisione ostile, C2).

    Su un club **migrato a meta** — `athletes.category_id` con la primaria
    vera, righe scritte solo per le secondarie — quella categoria spariva
    dalla scheda, e il salvataggio successivo fissava la perdita anche nella
    colonna. Entrare come secondaria e la scelta prudente: se la colonna era
    davvero la primaria si vede tutto e l'ordine si corregge in un clic; se
    era rimasta indietro si vede una categoria di troppo, che si toglie.
    Nessuna delle due cancella un dato. (Se poi il catalogo del club non la
    conosce, e la dedupe a dichiararla pendente.)
  */
  if (!riga) {
    if (!sconosciutaEntra) return null;
    /*
      Nessuna riga e dichiarata primaria e la colonna dice «questa e la sua
      categoria»: e l'unica dichiarazione che c'e, e resta (revisione ostile
      H1). Altrimenti l'indice zero — cioe l'ordine dell'heap — sceglierebbe la
      primaria al posto del club, e il primo salvataggio la scriverebbe.
    */
    const nessunaDichiarata = !memberships.some((voce) => voce.isPrimary);
    return { ...proiezione, isPrimary: nessunaDichiarata };
  }

  /*
    **La bandiera «primaria» resta della riga.**

    La proiezione arriva con la propria bandiera — la colonna storica dice per
    costruzione «questa e la sua categoria», la prima etichetta dell'elenco
    idem. Lasciargliela vorrebbe dire che una cache **non allineata** promuove
    una secondaria a primaria non appena l'ordine di lettura la mette davanti
    — cioe che la colonna comanda sulle righe, che e il verso opposto a quello
    vero. Della proiezione sopravvive solo la sede, e solo se la riga non ne
    dichiara una.
  */
  const nessunaDichiarata = !memberships.some((voce) => voce.isPrimary);
  return {
    ...proiezione,
    categoryId: riga.categoryId,
    categoryName: riga.categoryName || proiezione.categoryName,
    storedCategoryName: riga.storedCategoryName || proiezione.storedCategoryName,
    /* La colonna promuove la riga che riconosce solo se nessuna e dichiarata. */
    isPrimary: riga.isPrimary || (sconosciutaEntra && nessunaDichiarata),
  };
};

const normalizza = (
  athleteOrMemberships: unknown,
  categories: readonly CategoryOptionLike[] = [],
): Normalizzate => {
  if (Array.isArray(athleteOrMemberships)) {
    return dedupeMemberships(
      collectMemberships(athleteOrMemberships, categories, "membership"),
      categories,
    );
  }

  if (!isRecord(athleteOrMemberships)) {
    return { memberships: [], dangling: [] };
  }

  const athlete = athleteOrMemberships;
  const data = isRecord(athlete.data) ? athlete.data : {};
  const memberships: AthleteCategoryMembership[] = [];

  /*
    **Le righe sono la fonte; le altre grafie sono proiezioni delle righe.**

    `category_memberships` e la tabella (ADR-0038). `categoryMemberships`,
    `memberships` e le due chiavi in `data` le scrive lo stesso salvataggio
    **dalle** righe normalizzate — e il rollover di stagione riallinea le
    righe senza toccarle. Leggerle come sesta sorgente con la propria
    bandiera faceva vincere una cache rimasta indietro sull'ordine dell'heap
    (revisione ostile M1). Quando le righe ci sono, ogni altra voce deve
    riconoscersi in una di loro; quando non ci sono — il record che il client
    rimanda, o il club mai migrato — restano l'unica fonte, come prima.
  */
  collectMemberships(athlete.category_memberships, categories, "membership").forEach(
    (membership) => memberships.push(membership),
  );
  const proiezioniDiRiga: AthleteCategoryMembership[] = [];
  [
    athlete.categoryMemberships,
    athlete.memberships,
    data.categoryMemberships,
    data.category_memberships,
  ].forEach((source) => {
    collectMemberships(source, categories, "membership").forEach((membership) =>
      proiezioniDiRiga.push(membership),
    );
  });
  if (memberships.length === 0) {
    proiezioniDiRiga.forEach((membership) => pushMembership(memberships, membership));
  } else {
    proiezioniDiRiga.forEach((membership) => {
      pushMembership(
        memberships,
        riconciliaProiezione(membership, memberships, categories),
      );
    });
  }

  /*
    **L'elenco delle etichette e una proiezione, come la colonna.**

    `categories` / `data.categories` e cio che `hydrateAthleteWithMemberships`
    scrive **dalle** appartenenze normalizzate: un elenco di nomi, la primaria
    per prima. Trattarlo come una sorgente in piu, con la prima voce promossa a
    primaria, produceva due difetti: su un club con due «Scoiattoli» la stringa
    non risolveva e usciva come secondaria fantasma; e su una scheda letta
    senza catalogo la stringa poteva prendersi la primaria dalla riga vera.
    Quando le righe ci sono, ogni etichetta deve riconoscersi in una di loro
    (stessa regola della colonna); quando non ci sono — il club mai migrato —
    l'elenco resta la fonte e la prima e la primaria, come prima.
  */
  const etichette: AthleteCategoryMembership[] = [];
  [athlete.categories, data.categories].forEach((source) => {
    if (!Array.isArray(source)) return;
    collectMemberships(source, categories, "data").forEach((membership) =>
      etichette.push(membership),
    );
  });

  if (memberships.length === 0) {
    etichette.forEach((membership) => pushMembership(memberships, membership));
  } else {
    etichette.forEach((membership) => {
      pushMembership(
        memberships,
        riconciliaProiezione(membership, memberships, categories),
      );
    });
  }

  /*
    **La colonna storica e una proiezione delle appartenenze, non una in piu.**

    `athletes.category_id` / `data.category` sono una **cache derivata**: le
    scrive lo stesso `updateClubAthlete` che scrive le righe di
    `athlete_category_memberships`, e il rollover di stagione le riallinea
    **dalle righe**. Le righe sono la fonte, la colonna e cio che si legge
    senza una join.

    Trattarla come una sesta sorgente produceva il difetto di Fortitudo: se la
    colonna porta il **nome** («Scoiattoli») e la riga porta l'**identificativo**
    (un uuid), le due chiavi non coincidono, `dedupeMemberships` non le fonde, e
    la stessa categoria esce **due volte** — primaria come riga, secondaria come
    colonna. Peggio: `replaceAthleteMemberships` cancella e riscrive tutto cio
    che il normalizzatore restituisce, quindi al primo salvataggio successivo il
    fantasma diventava una **riga vera** con `category_id = "Scoiattoli"`, che
    l'indice unico non intercetta perche e una stringa diversa.

    Adesso: se le righe ci sono, la colonna deve **riconoscersi in una di loro**
    o entra da secondaria (C2). La riconciliazione usa il catalogo del club
    quando c'e e, quando non c'e, il catalogo **implicito** che le righe stesse
    portano (`categoryId` + `categoryName` + alias) — cosi la colonna con il
    solo nome ritrova la propria riga anche nei sei chiamanti che il catalogo
    non lo passano.

    Nessuna perdita: quando le righe **non** ci sono — il club mai migrato — la
    colonna resta l'unica fonte e diventa la primaria, come prima.
  */
  const legacy = toMembership(
    {
      category_id: athlete.category_id ?? data.category_id ?? data.categoryId,
      category_name:
        athlete.category_name ??
        data.category_name ??
        data.categoryName ??
        athlete.category ??
        data.category,
      is_primary: true,
      /*
        La copia legacy della sede (`data.siteId`) vale solo per il club mai
        migrato: con le righe presenti la sede e della riga, e una copia
        stantia non si riversa su una riga senza sede (revisione ostile B4).
      */
      site_id: athlete.site_id ?? athlete.siteId ?? (memberships.length ? "" : (data.site_id ?? data.siteId)),
      athlete_id: athlete.id,
      organization_id: athlete.organization_id || athlete.club_id,
    },
    categories,
    "legacy",
    true,
  );

  if (legacy) {
    if (memberships.length === 0) {
      pushMembership(memberships, legacy);
    } else {
      pushMembership(
        memberships,
        riconciliaProiezione(legacy, memberships, categories, true),
      );
    }
  }

  return dedupeMemberships(memberships, categories);
};

/**
 * **Le appartenenze di un atleta, come identita.**
 *
 * `categories` e il **catalogo del club** — tutto, mai un sottoinsieme. Con
 * il catalogo in mano ogni riferimento si risolve a una categoria del club;
 * cio che non si risolve non e un'appartenenza (vedi
 * `collectDanglingAthleteCategoryReferences`). Senza catalogo si lavora sui
 * nomi e sul catalogo implicito che le righe portano, come sempre.
 */
export const normalizeAthleteCategoryMemberships = (
  athleteOrMemberships: unknown,
  categories: readonly CategoryOptionLike[] = [],
) => normalizza(athleteOrMemberships, categories).memberships;

/**
 * **I riferimenti che non sono diventati appartenenze**, con il motivo.
 *
 * E il lato diagnostico di `normalizeAthleteCategoryMemberships`: serve al
 * censimento delle righe storiche (`scripts/censimento-appartenenze-legacy.mjs`)
 * e a nessuna schermata. Una riga qui e un dato da bonificare, non da mostrare.
 */
export const collectDanglingAthleteCategoryReferences = (
  athleteOrMemberships: unknown,
  categories: readonly CategoryOptionLike[] = [],
) => normalizza(athleteOrMemberships, categories).dangling;

export const getPrimaryAthleteCategoryMembership = (
  athleteOrMemberships: unknown,
  categories: readonly CategoryOptionLike[] = [],
) =>
  normalizeAthleteCategoryMemberships(athleteOrMemberships, categories).find(
    (membership) => membership.isPrimary,
  ) || null;

export const getAthleteCategoryLabels = (
  athleteOrMemberships: unknown,
  categories: readonly CategoryOptionLike[] = [],
) =>
  normalizeAthleteCategoryMemberships(athleteOrMemberships, categories).map(
    (membership) => membership.categoryName,
  );

/**
 * Le appartenenze nella forma delle **righe** di `athlete_category_memberships`.
 *
 * E cio che il writer inserisce e cio che finisce, come proiezione, in
 * `athletes.data.categoryMemberships`. Sta qui e non nel writer perche la
 * bonifica delle proiezioni (D-RD-16, fase B) deve produrre **la stessa
 * forma** che l'applicazione scrive a ogni salvataggio: due stesure
 * divergerebbero al primo campo aggiunto.
 *
 * **Il nome com'era sulla riga non si riscrive per caso** (ADR-0185). Dopo
 * una rinomina la riga porta ancora il nome vecchio, ed e l'evidenza con cui
 * le righe gemelle di **altri** atleti — scritte con il solo nome —
 * ritrovano la categoria vera. Un salvataggio che non tocca la categoria non
 * deve cancellarla: la bonifica dei nomi stantii e un passo a se.
 */
export const serializeAthleteMemberships = (
  memberships: readonly AthleteCategoryMembership[],
  {
    clubId,
    athleteId,
  }: {
    clubId?: string | null;
    athleteId?: string | null;
  } = {},
) =>
  memberships.map((membership) => ({
    id: membership.id,
    organization_id: membership.organizationId || clubId || null,
    athlete_id: membership.athleteId || athleteId || null,
    category_id: membership.categoryId,
    category_name: membership.storedCategoryName || membership.categoryName,
    is_primary: membership.isPrimary,
    site_id: membership.siteId || null,
  }));

/**
 * La proiezione delle appartenenze dentro `athletes.data`, derivata **1:1**
 * dalle appartenenze canoniche: `category`/`categoryName` dicono la
 * primaria, `categoryMemberships` sono le righe, `categories` le etichette.
 *
 * Nessun lettore la governa (ADR-0185 §8: con le righe presenti e una
 * proiezione), ma i consumatori diretti di `athletes.data` — export, mobile,
 * analitiche — la leggono com'e: deve dire cio che dicono le righe. La
 * scrive il writer a ogni salvataggio e la ricostruisce la bonifica di fase
 * B con questa stessa funzione.
 */
export const buildAthleteCategoryProjection = (
  memberships: readonly AthleteCategoryMembership[],
  ids: { clubId?: string | null; athleteId?: string | null } = {},
) => {
  const primary = memberships.find((membership) => membership.isPrimary) || null;
  return {
    category: primary?.categoryId ?? null,
    categoryName: primary?.categoryName ?? null,
    categoryMemberships: serializeAthleteMemberships(memberships, ids),
    categories: memberships.map((membership) => membership.categoryName),
  };
};

export const getAthleteCategoryReferences = (
  athleteOrMemberships: unknown,
  categories: readonly CategoryOptionLike[] = [],
) =>
  normalizeAthleteCategoryMemberships(athleteOrMemberships, categories).flatMap(
    (membership) =>
      [membership.categoryId, membership.categoryName]
        .map(normalizeReference)
        .filter(Boolean),
  );

/**
 * **Questo atleta e di questa categoria da primario, da secondario o per niente?**
 *
 * Il confronto lo fa `sameCategory`, non questa funzione. Qui c'era il
 * ripiegamento in casa che ADR-0155 ha tolto da sette consumatori e che il
 * censimento dell'eleggibilita non vedeva soltanto perche il file non portava
 * nessuno dei marcatori: identificativo ed etichetta finivano nello **stesso**
 * insieme e si intersecava. Su due «Under 15» di due sedi l'intersezione non e
 * vuota, e la risposta era «primaria» per la squadra sbagliata — cioe la
 * pettorina «Primaria» accanto al nome di un atleta convocato da un'altra
 * squadra.
 *
 * Il catalogo si compone dai due lati: quello che le appartenenze portano
 * (`catalogoImplicito`) e quello che il chiamante nomina. Senza, i sei
 * consumatori che il catalogo del club non ce l'hanno ricadrebbero sul nome
 * anche quando le due parti sanno benissimo dire chi sono.
 */
export const getAthleteCategoryRelationship = (
  athlete: unknown,
  categories: Array<CategoryOptionLike | string> = [],
): AthleteCategoryRelationship => {
  const richieste = (Array.isArray(categories) ? categories : []).filter(
    (category) =>
      typeof category === "string" ? category.trim() : Boolean(category),
  );

  if (richieste.length === 0) {
    return "none";
  }

  const memberships = normalizeAthleteCategoryMemberships(athlete);

  const catalogo: CategoryOptionLike[] = [
    ...catalogoImplicito(memberships),
    ...richieste
      .filter(
        (category): category is CategoryOptionLike =>
          typeof category !== "string" && Boolean(category?.id),
      )
      .map((category) => ({ id: category.id, name: category.name })),
  ];

  const matched = memberships.filter((membership) =>
    sameAnyCategory(
      {
        category_id: membership.categoryId,
        category_name: membership.categoryName,
      },
      richieste,
      catalogo,
    ),
  );

  if (matched.some((membership) => membership.isPrimary)) {
    return "primary";
  }

  if (matched.length > 0) {
    return "secondary";
  }

  return "none";
};

export const getParticipationCategoryContext = ({
  athlete,
  eventCategories = [],
  entry,
}: {
  athlete?: unknown;
  eventCategories?: Array<CategoryOptionLike | string>;
  entry?: Record<string, any> | null;
}): ParticipationCategoryContext => {
  const explicitType = firstNonEmptyString(
    entry?.categoryMembershipType,
    entry?.category_membership_type,
    entry?.relationshipToTrainingCategory,
    entry?.relationshipToMatchCategory,
    entry?.relationshipToEventCategory,
  ).toLowerCase();

  if (explicitType === "primary") {
    return "primary";
  }

  if (explicitType === "secondary") {
    return "secondary";
  }

  if (
    explicitType === "extra" ||
    entry?.isExtraCategory ||
    entry?.is_extra_category ||
    entry?.isManualExtra ||
    entry?.is_manual_extra
  ) {
    return "extra";
  }

  const relationship = getAthleteCategoryRelationship(athlete, eventCategories);
  if (relationship === "primary") {
    return "primary";
  }

  if (relationship === "secondary") {
    return "secondary";
  }

  /*
    Una riga registrata che dice «non extra» e la fotografia di allora
    (ADR-0194 §20): l'atleta era della categoria dell'evento anche se oggi
    non lo e piu. Senza riga, o con la colonna assente, vale l'appartenenza
    corrente come prima.
  */
  const fotografato = entry?.is_extra_category ?? entry?.isExtraCategory;
  const fattoRegistrato =
    ["present", "absent"].includes(String(entry?.status || "").toLowerCase()) ||
    Boolean(entry?.convocation_status || entry?.convocationStatus);
  if (fotografato === false && fattoRegistrato) {
    return "member";
  }

  return "extra";
};

export const getParticipationCategoryBadgeLabel = (
  context: ParticipationCategoryContext,
) => {
  if (context === "secondary") {
    return "Secondaria";
  }

  if (context === "extra") {
    return "Extra categoria";
  }

  if (context === "member") {
    return "Della categoria";
  }

  return "Primaria";
};

/**
 * **L'organico atteso si conta per identificativo** (ADR-0198 §6, UAT sul
 * QA UAT Club): con il catalogo della stagione in mano, «Pulcini» dell'anno
 * scorso nella proiezione di un atleta risolveva **per nome** sui Pulcini di
 * quest'anno, e il denominatore diceva 107 dove la squadra ne ha 13. Qui si
 * leggono i soli identificativi che l'atleta porta — righe, proiezione,
 * colonna — e un nome non entra. Chi non ha un identificativo da confrontare
 * ricade sul confronto per nome, come prima.
 */
export const athleteHasCategoryId = (athlete: unknown, categoryId: unknown) => {
  const target = String(categoryId ?? "").trim();
  if (!target || !isRecord(athlete)) return false;
  const data = isRecord(athlete.data) ? athlete.data : {};
  const rows = [
    ...(Array.isArray(athlete.category_memberships) ? athlete.category_memberships : []),
    ...(Array.isArray(athlete.categoryMemberships) ? athlete.categoryMemberships : []),
    ...(Array.isArray(data.categoryMemberships) ? data.categoryMemberships : []),
    ...(Array.isArray(data.category_memberships) ? data.category_memberships : []),
  ];
  const ids = new Set<string>();
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const id = String(row.category_id ?? row.categoryId ?? "").trim();
    if (id) ids.add(id);
  }
  for (const value of [athlete.category_id, athlete.categoryId, data.category, data.categoryId]) {
    const id = String(value ?? "").trim();
    if (id) ids.add(id);
  }
  return ids.has(target);
};

/** Vero se l'atleta porta almeno un identificativo di categoria: allora il confronto per nome non serve. */
export const athleteCarriesCategoryIds = (athlete: unknown) => {
  if (!isRecord(athlete)) return false;
  const data = isRecord(athlete.data) ? athlete.data : {};
  const rows = [
    ...(Array.isArray(athlete.category_memberships) ? athlete.category_memberships : []),
    ...(Array.isArray(athlete.categoryMemberships) ? athlete.categoryMemberships : []),
    ...(Array.isArray(data.categoryMemberships) ? data.categoryMemberships : []),
  ];
  return rows.some((row) => isRecord(row) && String(row.category_id ?? row.categoryId ?? "").trim()) ||
    Boolean(String(athlete.category_id ?? athlete.categoryId ?? "").trim());
};
