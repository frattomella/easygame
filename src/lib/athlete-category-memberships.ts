import {
  resolveCategoryReference,
  sameAnyCategory,
} from "@/lib/categories/identity";

export type AthleteCategoryMembership = {
  id: string;
  organizationId?: string | null;
  athleteId?: string | null;
  categoryId: string;
  categoryName: string;
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
export type ParticipationCategoryContext = "primary" | "secondary" | "extra";

type CategoryOptionLike = {
  id?: string | null;
  name?: string | null;
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
  categories: CategoryOptionLike[] = [],
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
  categories: CategoryOptionLike[] = [],
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
      isPrimary: primaryHint,
      siteId: "",
      source,
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  const identity = resolveCategoryIdentity(
    value.category_id ?? value.categoryId ?? value.id ?? value.value,
    value.category_name ??
      value.categoryName ??
      value.name ??
      value.label ??
      value.title,
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
  categories: CategoryOptionLike[] = [],
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

/**
 * **Il catalogo implicito: quello che le appartenenze stesse portano.**
 *
 * Un'appartenenza che porta un identificativo **e** un nome diverso da quello
 * — `{ categoryId: "category-1757…", categoryName: "Scoiattoli" }` — e essa
 * stessa una voce di catalogo: dice come si chiama quella categoria. Una che
 * porta lo stesso valore nei due campi non dice niente di piu del valore.
 *
 * Serve perche sei chiamanti su dodici il catalogo del club non ce l'hanno in
 * mano (`getAthleteCategoryRelationship`, la pagina Gare, quella Allenamenti,
 * `club-sites`, `audience`, i numeri di maglia): senza questo, la riga
 * fantasma «Scoiattoli» che il difetto ha gia scritto in archivio resterebbe
 * una seconda categoria per sempre.
 */
const catalogoImplicito = (memberships: AthleteCategoryMembership[]) =>
  memberships
    .filter(
      (membership) =>
        membership.categoryName &&
        normalizeReference(membership.categoryId) !==
          normalizeReference(membership.categoryName),
    )
    .map((membership) => ({
      id: membership.categoryId,
      name: membership.categoryName,
    }));

/**
 * **La chiave con cui due appartenenze sono la stessa.**
 *
 * L'identificativo, quando c'e. Un'appartenenza che porta solo un **nome** —
 * la riga che il difetto ha scritto, o il record di un club senza catalogo —
 * si riconosce nell'identificativo di chi quel nome ce l'ha come etichetta,
 * ma **solo se ne nomina una sola**: due omonime su due sedi restano due
 * squadre (ADR-0155).
 */
const chiaveDiIdentita = (
  membership: AthleteCategoryMembership,
  catalogo: CategoryOptionLike[],
) => {
  const propria =
    normalizeReference(membership.categoryId) ||
    normalizeReference(membership.categoryName);

  const portaGiaUnIdentificativo =
    membership.categoryName &&
    normalizeReference(membership.categoryId) !==
      normalizeReference(membership.categoryName);

  if (portaGiaUnIdentificativo) return propria;

  const identita = resolveCategoryIdentity(
    membership.categoryId,
    membership.categoryName,
    catalogo,
  );

  if (!identita.known || identita.ambiguous) return propria;

  return normalizeReference(identita.categoryId) || propria;
};

const dedupeMemberships = (
  memberships: AthleteCategoryMembership[],
  categories: CategoryOptionLike[] = [],
) => {
  const deduped = new Map<string, AthleteCategoryMembership>();
  const catalogo: CategoryOptionLike[] = [
    ...categories,
    ...catalogoImplicito(memberships),
  ];

  memberships.forEach((membership) => {
    const key = chiaveDiIdentita(membership, catalogo);
    if (!key) {
      return;
    }

    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, membership);
      return;
    }

    /*
      **Fra le due vince l'identita, non l'ordine di lettura.**

      Quando si fondono la riga identificata e quella che porta il solo nome, a
      sopravvivere deve essere l'identificativo: tenere «Scoiattoli» perche
      capitava di leggerlo per primo lascerebbe l'atleta agganciato a una
      stringa che il catalogo non conosce, e ogni salvataggio successivo la
      riscriverebbe in archivio.
    */
    const identificata = [existing, membership].find(
      (voce) =>
        voce.categoryName &&
        normalizeReference(voce.categoryId) !==
          normalizeReference(voce.categoryName),
    );

    deduped.set(key, {
      ...existing,
      id: existing.id || membership.id,
      categoryId:
        identificata?.categoryId || existing.categoryId || membership.categoryId,
      categoryName:
        identificata?.categoryName ||
        existing.categoryName ||
        membership.categoryName,
      organizationId: existing.organizationId || membership.organizationId,
      athleteId: existing.athleteId || membership.athleteId,
      isPrimary: existing.isPrimary || membership.isPrimary,
      siteId: existing.siteId || membership.siteId,
      source: existing.source === "legacy" ? membership.source : existing.source,
    });
  });

  const values = Array.from(deduped.values());
  if (values.length === 0) {
    return values;
  }

  let primaryAssigned = false;
  return values
    .map((membership, index) => {
      if (membership.isPrimary && !primaryAssigned) {
        primaryAssigned = true;
        return membership;
      }

      if (!primaryAssigned && index === 0) {
        primaryAssigned = true;
        return {
          ...membership,
          isPrimary: true,
        };
      }

      return {
        ...membership,
        isPrimary: false,
      };
    })
    .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary));
};

export const normalizeAthleteCategoryMemberships = (
  athleteOrMemberships: unknown,
  categories: CategoryOptionLike[] = [],
) => {
  if (Array.isArray(athleteOrMemberships)) {
    return dedupeMemberships(
      collectMemberships(athleteOrMemberships, categories, "membership"),
      categories,
    );
  }

  if (!isRecord(athleteOrMemberships)) {
    return [];
  }

  const athlete = athleteOrMemberships;
  const data = isRecord(athlete.data) ? athlete.data : {};
  const memberships: AthleteCategoryMembership[] = [];

  [
    athlete.category_memberships,
    athlete.categoryMemberships,
    athlete.memberships,
    data.categoryMemberships,
    data.category_memberships,
  ].forEach((source) => {
    collectMemberships(source, categories, "membership").forEach((membership) =>
      memberships.push(membership),
    );
  });

  if (Array.isArray(athlete.categories)) {
    collectMemberships(athlete.categories, categories, "data").forEach(
      (membership) => memberships.push(membership),
    );
  }

  if (Array.isArray(data.categories)) {
    collectMemberships(data.categories, categories, "data").forEach(
      (membership) => memberships.push(membership),
    );
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
    o non dice niente. La riconciliazione usa il catalogo del club quando c'e e,
    quando non c'e, il catalogo **implicito** che le righe stesse portano
    (`categoryId` + `categoryName`) — cosi la colonna con il solo nome ritrova la
    propria riga anche nei sei chiamanti che il catalogo non lo passano.

    Se il nome ne nomina due — due «Under 15» su due sedi — non ne nomina
    nessuna (ADR-0155) e la colonna viene **lasciata cadere**: le righe hanno gia
    detto in quali squadre sta l'atleta, e inventarne una terza per non buttare
    via una cache ambigua sarebbe la fusione al contrario.

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
      site_id: athlete.site_id ?? athlete.siteId ?? data.site_id ?? data.siteId,
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
      const rientra = riconciliaProiezione(legacy, memberships, categories);
      if (rientra) {
        pushMembership(memberships, rientra);
      }
    }
  }

  return dedupeMemberships(memberships, categories);
};

/**
 * **La colonna storica ritrova la propria riga, o non entra.**
 *
 * Restituisce la proiezione riscritta sull'identita della riga che la
 * riconosce — cosi `dedupeMemberships` le fonde e la sede eventualmente
 * dichiarata sulla colonna non va persa — oppure `null` quando nessuna riga la
 * riconosce.
 */
const riconciliaProiezione = (
  legacy: AthleteCategoryMembership,
  memberships: AthleteCategoryMembership[],
  categories: CategoryOptionLike[] = [],
) => {
  const catalogo: CategoryOptionLike[] = [
    ...categories,
    ...memberships.map((membership) => ({
      id: membership.categoryId,
      name: membership.categoryName,
    })),
  ];

  const identita = resolveCategoryIdentity(
    legacy.categoryId,
    legacy.categoryName,
    catalogo,
  );

  /* Un nome che ne nomina due non ne nomina nessuna: la colonna tace. */
  if (identita.ambiguous) return null;

  const chiave = normalizeReference(identita.categoryId);
  const riga = memberships.find(
    (membership) => normalizeReference(membership.categoryId) === chiave,
  );

  if (!riga) return null;

  /*
    **La bandiera «primaria» resta della riga.**

    La proiezione arriva sempre con `isPrimary: true`, perche la colonna storica
    dice per costruzione «questa e la sua categoria». Lasciargliela vorrebbe
    dire che una cache **non allineata** promuove una secondaria a primaria non
    appena l'ordine di lettura la mette davanti — cioe che la colonna comanda
    sulle righe, che e il verso opposto a quello vero. Della proiezione
    sopravvive solo la sede, e solo se la riga non ne dichiara una.
  */
  return {
    ...legacy,
    categoryId: riga.categoryId,
    categoryName: riga.categoryName || legacy.categoryName,
    isPrimary: riga.isPrimary,
  };
};

export const getPrimaryAthleteCategoryMembership = (
  athleteOrMemberships: unknown,
  categories: CategoryOptionLike[] = [],
) =>
  normalizeAthleteCategoryMemberships(athleteOrMemberships, categories).find(
    (membership) => membership.isPrimary,
  ) || null;

export const getAthleteCategoryLabels = (
  athleteOrMemberships: unknown,
  categories: CategoryOptionLike[] = [],
) =>
  normalizeAthleteCategoryMemberships(athleteOrMemberships, categories).map(
    (membership) => membership.categoryName,
  );

const getCategoryReferences = (
  category: CategoryOptionLike | string | null | undefined,
) =>
  (typeof category === "string" ? [category] : [category?.id, category?.name])
    .map(normalizeReference)
    .filter(Boolean);

export const getAthleteCategoryReferences = (
  athleteOrMemberships: unknown,
  categories: CategoryOptionLike[] = [],
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

  return "Primaria";
};
