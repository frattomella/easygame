/**
 * **Il piano di un cambio di appartenenza** (ADR-0194): puro, senza archivio.
 *
 * Un cambio di categoria non e `category_id = X`. E un'operazione sulle
 * appartenenze di un atleta — quali restano, quale e primaria, quali
 * spariscono — e il club deve poterla leggere **prima** di scriverla.
 * Questo modulo calcola, per un atleta con le sue appartenenze correnti e
 * un comando, l'insieme che ne risulta e il riepilogo di cio che cambia. Lo
 * stesso piano lo usano la scheda singola, il cambio in blocco (che lo
 * ripete per ogni atleta) e l'anteprima che precede la conferma: una
 * semantica, non tre.
 *
 * ## Le regole
 *
 * 1. **Al piu una primaria.** Il piano non produce mai due primarie; se le
 *    appartenenze correnti ne portano due (dato precedente all'indice
 *    parziale, o proiezione corrotta) l'atleta si **segnala** e non si tocca.
 * 2. **La primaria che smette di esserlo, per default, se ne va.** «Cambia
 *    categoria» vuol dire cambiare squadra, non aggiungerne una: la vecchia
 *    primaria non diventa secondaria da sola. Il club puo chiederlo
 *    (`keep_as_secondary`), e allora resta con la sua sede.
 * 3. **Le altre secondarie restano**, salvo che il club chieda di toglierle
 *    (`remove`). Un atleta che gioca davvero in due categorie non le perde
 *    perche ne cambia una terza.
 * 4. **Nessun doppione.** Se la categoria di destinazione e gia fra le
 *    appartenenze, la riga si **promuove** (o resta secondaria): non nasce
 *    una seconda riga per la stessa categoria. La sede della riga promossa
 *    diventa quella della destinazione, che e la squadra scelta.
 * 5. **Idempotente.** Destinazione gia primaria con lo stesso ruolo e la
 *    stessa sede: nessuna modifica, e il riepilogo lo dice.
 * 6. **Un atleta senza primaria ma con secondarie** non e un caso su cui
 *    indovinare in blocco: si segnala (`missing_primary`); assegnare una
 *    primaria a un atleta cosi e deterministico e si fa, ma il riepilogo
 *    lo dichiara.
 *
 * Il piano non sa niente della storia: presenze, allenamenti, gare
 * conservano il contesto che avevano (ADR-0194 §storia). «Rimuovi» toglie
 * una riga **corrente**, non un fatto passato.
 */

export type MembershipRole = "primary" | "secondary";
export type PreviousPrimaryPolicy = "remove" | "keep_as_secondary";
export type OtherSecondariesPolicy = "keep" | "remove";

/** La forma minima di una riga di appartenenza per il piano. */
export type PlannedMembership = {
  categoryId: string;
  categoryName: string;
  /** Il nome com'era sulla riga (ADR-0185 §8): si conserva, non si riscrive. */
  storedCategoryName?: string;
  isPrimary: boolean;
  siteId: string;
  /** L'identificativo della riga in archivio, se esiste gia. */
  rowId?: string | null;
};

export type MembershipChangeCommand =
  | {
      kind: "assign";
      target: { categoryId: string; categoryName: string; siteId: string };
      role: MembershipRole;
      previousPrimaryPolicy: PreviousPrimaryPolicy;
      otherSecondariesPolicy: OtherSecondariesPolicy;
    }
  | { kind: "remove"; categoryId: string };

export type MembershipChangeWarning =
  | "missing_primary"
  | "multiple_primaries"
  | "removing_primary"
  | "already_primary"
  | "already_secondary"
  | "not_a_member"
  /** Righe del club che il catalogo non conosce piu: restano com'erano (ADR-0186 §8), il piano non le tocca. */
  | "legacy_rows_kept"
  /** Due righe per la stessa categoria in grafie diverse: non si sceglie, si segnala. */
  | "duplicate_rows"
  /** Una riga del piano cadrebbe su una coppia (categoria, sede) che il club non ha. */
  | "placement_invalid"
  /** Una riga del piano e fuori dal perimetro di sede/categoria di chi opera. */
  | "out_of_scope"
  /** Le righe sono cambiate fra l'anteprima e la conferma. */
  | "changed_since_preview";

export type MembershipChangePlan = {
  /** Le appartenenze dopo il comando (vuoto se `blocked`). */
  after: PlannedMembership[];
  /** Vero quando l'atleta non si tocca: il motivo sta in `warnings`. */
  blocked: boolean;
  /** Vero quando `after` coincide con le correnti (niente da scrivere). */
  unchanged: boolean;
  summary: {
    primaryChanged: boolean;
    /** La destinazione era gia una riga dell'atleta ed e stata promossa a primaria. */
    promoted: boolean;
    /** E nata una riga nuova per la destinazione. */
    added: boolean;
    /** Le categorie tolte (la vecchia primaria, le altre secondarie, la riga rimossa). */
    removed: PlannedMembership[];
    /** La vecchia primaria tenuta come secondaria. */
    keptAsSecondary: PlannedMembership | null;
    /** Le secondarie non coinvolte rimaste al loro posto. */
    keptSecondaries: PlannedMembership[];
  };
  warnings: MembershipChangeWarning[];
};

const trim = (value: unknown) => String(value ?? "").trim();
const stessoIdentificativo = (a: unknown, b: unknown) => trim(a).toLowerCase() === trim(b).toLowerCase();

const copia = (riga: PlannedMembership, patch: Partial<PlannedMembership> = {}): PlannedMembership => ({
  categoryId: trim(riga.categoryId),
  categoryName: trim(riga.categoryName) || trim(riga.categoryId),
  ...(riga.storedCategoryName ? { storedCategoryName: riga.storedCategoryName } : {}),
  isPrimary: Boolean(riga.isPrimary),
  siteId: trim(riga.siteId),
  rowId: riga.rowId ?? null,
  ...patch,
});

const stessoInsieme = (a: readonly PlannedMembership[], b: readonly PlannedMembership[]) => {
  if (a.length !== b.length) return false;
  const chiave = (r: PlannedMembership) => `${trim(r.categoryId).toLowerCase()}|${r.isPrimary ? "P" : "S"}|${trim(r.siteId)}`;
  const insieme = new Set(a.map(chiave));
  return b.every((r) => insieme.has(chiave(r)));
};

const vuoto = (after: PlannedMembership[], warnings: MembershipChangeWarning[], blocked: boolean, unchanged: boolean): MembershipChangePlan => ({
  after,
  blocked,
  unchanged,
  summary: { primaryChanged: false, promoted: false, added: false, removed: [], keptAsSecondary: null, keptSecondaries: after.filter((r) => !r.isPrimary) },
  warnings,
});

/**
 * Il piano per **un** atleta. Le righe correnti si passano come stanno in
 * archivio; il piano non le muta.
 */
export const planMembershipChange = (
  current: readonly PlannedMembership[],
  command: MembershipChangeCommand,
): MembershipChangePlan => {
  const correnti = current.map((riga) => copia(riga));
  const primarie = correnti.filter((riga) => riga.isPrimary);

  if (primarie.length > 1) {
    /* Due primarie non esistono nell'archivio con l'indice; se arrivano da una proiezione, non si sceglie al posto del club. */
    return vuoto(correnti, ["multiple_primaries"], true, true);
  }
  const primaria = primarie[0] || null;
  const warnings: MembershipChangeWarning[] = [];
  if (!primaria && correnti.length > 0) warnings.push("missing_primary");

  if (command.kind === "remove") {
    const bersaglio = correnti.find((riga) => stessoIdentificativo(riga.categoryId, command.categoryId));
    if (!bersaglio) {
      return vuoto(correnti, [...warnings, "not_a_member"], false, true);
    }
    if (bersaglio.isPrimary) {
      /* La primaria non si toglie: si cambia. Togliendola l'atleta resterebbe senza, e una secondaria salirebbe per caso. */
      return vuoto(correnti, [...warnings, "removing_primary"], true, true);
    }
    const after = correnti.filter((riga) => riga !== bersaglio);
    return {
      after,
      blocked: false,
      unchanged: false,
      summary: {
        primaryChanged: false,
        promoted: false,
        added: false,
        removed: [bersaglio],
        keptAsSecondary: null,
        keptSecondaries: after.filter((riga) => !riga.isPrimary),
      },
      warnings,
    };
  }

  const target = {
    categoryId: trim(command.target.categoryId),
    categoryName: trim(command.target.categoryName) || trim(command.target.categoryId),
    siteId: trim(command.target.siteId),
  };
  const esistente = correnti.find((riga) => stessoIdentificativo(riga.categoryId, target.categoryId)) || null;
  const removed: PlannedMembership[] = [];
  let keptAsSecondary: PlannedMembership | null = null;

  if (command.role === "secondary") {
    if (esistente?.isPrimary) {
      /* Declassare la primaria a secondaria lascerebbe l'atleta senza primaria: non e questo comando. */
      return vuoto(correnti, [...warnings, "already_primary"], true, true);
    }
    if (esistente && esistente.siteId === target.siteId) {
      return vuoto(correnti, [...warnings, "already_secondary"], false, true);
    }
    const after = esistente
      ? correnti.map((riga) => (riga === esistente ? copia(riga, { siteId: target.siteId }) : riga))
      : [
          ...correnti,
          { categoryId: target.categoryId, categoryName: target.categoryName, storedCategoryName: target.categoryName, isPrimary: false, siteId: target.siteId, rowId: null },
        ];
    return {
      after,
      blocked: false,
      unchanged: false,
      summary: {
        primaryChanged: false,
        promoted: false,
        added: !esistente,
        removed: [],
        keptAsSecondary: null,
        keptSecondaries: after.filter((riga) => !riga.isPrimary && !stessoIdentificativo(riga.categoryId, target.categoryId)),
      },
      warnings,
    };
  }

  /* role === "primary" */
  const giaPrimaria = Boolean(esistente?.isPrimary);
  const nuovaPrimaria: PlannedMembership = esistente
    ? copia(esistente, { isPrimary: true, siteId: target.siteId })
    : { categoryId: target.categoryId, categoryName: target.categoryName, storedCategoryName: target.categoryName, isPrimary: true, siteId: target.siteId, rowId: null };

  const altre = correnti.filter((riga) => riga !== esistente && riga !== primaria);
  const after: PlannedMembership[] = [nuovaPrimaria];

  if (primaria && primaria !== esistente) {
    if (command.previousPrimaryPolicy === "keep_as_secondary") {
      keptAsSecondary = copia(primaria, { isPrimary: false });
      after.push(keptAsSecondary);
    } else {
      removed.push(primaria);
    }
  }

  if (command.otherSecondariesPolicy === "remove") {
    removed.push(...altre);
  } else {
    after.push(...altre);
  }

  const unchanged = stessoInsieme(correnti, after);
  if (giaPrimaria && unchanged) warnings.push("already_primary");

  return {
    after,
    blocked: false,
    unchanged,
    summary: {
      primaryChanged: !giaPrimaria,
      promoted: Boolean(esistente) && !giaPrimaria,
      added: !esistente,
      removed,
      keptAsSecondary,
      keptSecondaries: command.otherSecondariesPolicy === "remove" ? [] : altre,
    },
    warnings,
  };
};

/**
 * Il riepilogo di un cambio su piu atleti, nei termini che l'anteprima
 * mostra (§27): quanti cambiano primaria, quante righe vengono tolte, quante
 * promosse, quante secondarie restano, quanti sono gia a posto, quanti
 * chiedono attenzione.
 */
export const summarizeMembershipPlans = (
  plans: readonly { athleteId: string; plan: MembershipChangePlan }[],
) => {
  const riepilogo = {
    athletes: plans.length,
    updated: 0,
    unchanged: 0,
    blocked: 0,
    newPrimaries: 0,
    promoted: 0,
    added: 0,
    removedMemberships: 0,
    keptAsSecondary: 0,
    keptSecondaries: 0,
    warnings: 0,
  };
  for (const { plan } of plans) {
    if (plan.blocked) {
      riepilogo.blocked += 1;
      riepilogo.warnings += 1;
      continue;
    }
    if (plan.warnings.length) riepilogo.warnings += 1;
    if (plan.unchanged) {
      riepilogo.unchanged += 1;
      continue;
    }
    riepilogo.updated += 1;
    if (plan.summary.primaryChanged) riepilogo.newPrimaries += 1;
    if (plan.summary.promoted) riepilogo.promoted += 1;
    if (plan.summary.added) riepilogo.added += 1;
    riepilogo.removedMemberships += plan.summary.removed.length;
    if (plan.summary.keptAsSecondary) riepilogo.keptAsSecondary += 1;
    riepilogo.keptSecondaries += plan.summary.keptSecondaries.length;
  }
  return riepilogo;
};

export const MEMBERSHIP_WARNING_LABELS: Record<MembershipChangeWarning, string> = {
  missing_primary: "Senza categoria primaria: la nuova primaria viene assegnata, le altre restano com'erano",
  multiple_primaries: "Piu di una categoria primaria in archivio: non viene modificato",
  removing_primary: "La categoria primaria non si rimuove: si cambia",
  already_primary: "Gia nella categoria scelta come primaria",
  already_secondary: "Gia nella categoria scelta come secondaria",
  not_a_member: "Non appartiene alla categoria da rimuovere",
  legacy_rows_kept: "Ha una categoria non piu in catalogo: resta com'e, la toglie una bonifica",
  duplicate_rows: "Due righe per la stessa categoria in archivio: non viene modificato",
  placement_invalid: "La squadra risultante non e configurata dal club: non viene modificato",
  out_of_scope: "Fuori dal tuo perimetro di sede o categoria: non viene modificato",
  changed_since_preview: "Le sue categorie sono cambiate dopo l'anteprima: non viene modificato, ricalcola",
};
