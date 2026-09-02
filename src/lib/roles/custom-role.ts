import {
  CUSTOM_ROLE_BASE_ROLES,
  buildCustomRoleSlug,
  isOwnerAccessRole,
  normalizeAccessRole,
  parseCustomRoleValue,
  slugifyCustomRoleName,
  type CanonicalAccessRole,
} from "@/lib/access-roles";
import {
  PERMISSION_CATALOG,
  getPermissionEntry,
  type PermissionEntry,
} from "@/lib/permissions/catalog";

/**
 * **Il ruolo personalizzato come dominio puro** (Wave 6, lane 6G, blocker W6-1).
 *
 * Qui vivono le regole che decidono **cosa un ruolo di club puo contenere** e
 * **chi lo puo concedere**. Nessun Prisma, nessuna rete, nessun DOM: le stesse
 * regole servono al server che scrive, alla rotta che nega e alla schermata che
 * disegna le caselle, e tre copie della stessa regola divergono alla prima
 * modifica.
 *
 * `src/lib/access-roles.ts` resta il proprietario dei **sette canonici** e della
 * grammatica dello slug; questo modulo e il proprietario del **ciclo di vita**
 * di un ruolo di club (CLAUDE.md §2, [41] §7).
 *
 * ---
 *
 * ## La regola, in una riga (§10.1 del piano)
 *
 * > Un ruolo personalizzato e un **sottoinsieme** delle chiavi del suo
 * > `base_role`, mai un soprainsieme. Non puo contenere una chiave di legame.
 * > Non puo contenere una chiave riservata al proprietario.
 */

export type CustomRoleDraft = {
  name: string;
  description?: string | null;
  baseRole: string;
  permissions: readonly string[];
};

/**
 * **Le tre chiavi di legame, elencate a mano e non dedotte.**
 *
 * Il piano le nomina per nome (§10.2), e la tentazione sarebbe dedurle dal
 * campo `byLink` del catalogo. Sarebbe **sbagliato**, e vale la pena scriverlo
 * perche l'errore e credibile: `byLink` significa «questa chiave si ottiene
 * **anche** dal legame», ed e vero per `documents.read_dossier`,
 * `clinical.status_read`, `events.read`, `appointments.read_own` — chiavi che
 * restano perfettamente di ruolo e che una segreteria deve poter avere.
 *
 * Le tre qui sotto sono un'altra cosa: il legame non e una strada in piu, e
 * **l'unica**. `consents.decide_own` ha `roles: []` di proposito, `rsvp.answer`
 * e solo di genitore e atleta, `documents.submit_own` protegge il deposito del
 * proprio documento. Concederle a un ruolo direbbe che chiunque porti quel
 * ruolo puo decidere per **chiunque**, mentre la verita e che puo decidere chi
 * e legato a **quell'** atleta: sarebbero permessi piu larghi di quello che
 * sembrano. E la trappola che [40] §6 nomina per nome.
 */
export const LINK_GATED_PERMISSION_KEYS: readonly string[] = [
  "consents.decide_own",
  "documents.submit_own",
  "rsvp.answer",
];

export const isLinkGatedPermission = (key: string) =>
  LINK_GATED_PERMISSION_KEYS.includes(String(key || "").trim());

/**
 * **Le chiavi di direzione**: quelle che nessun ruolo diverso da proprietario e
 * gestore porta.
 *
 * Non sono vietate a un ruolo personalizzato — un club puo volere un «controllo
 * interno» che legge il registro e non tocca nient'altro — ma **assegnarlo e un
 * atto del proprietario** (§10.4). Si ricavano dal catalogo invece di
 * elencarle: una chiave nuova riservata alla direzione entra in questo insieme
 * il giorno in cui nasce, senza che nessuno se ne debba ricordare.
 */
export const isDirectionPermission = (key: string) => {
  const entry = getPermissionEntry(String(key || "").trim());
  if (!entry) return false;
  return entry.roles.every(
    (role) => role === "owner" || role === "club_manager",
  );
};

/**
 * Le chiavi che si possono davvero mettere su un ruolo con questa base.
 *
 * E l'elenco che la schermata disegna, e non e una vista «di comodo»: mostrare
 * una casella che il server rifiuterebbe — o peggio, una che il server
 * ignorerebbe — sarebbe la stessa promessa vuota che questa lane e stata
 * chiamata a smontare.
 */
export const listGrantablePermissions = (
  baseRole: string | null | undefined,
): readonly PermissionEntry[] => {
  const base = normalizeAccessRole(baseRole);
  if (!base) return [];

  return PERMISSION_CATALOG.filter(
    (entry) =>
      entry.roles.includes(base) && !isLinkGatedPermission(entry.key),
  );
};

export const isAllowedCustomRoleBase = (
  baseRole: string | null | undefined,
): baseRole is CanonicalAccessRole =>
  CUSTOM_ROLE_BASE_ROLES.includes(
    normalizeAccessRole(baseRole) as CanonicalAccessRole,
  );

/**
 * L'errore del dominio dei ruoli.
 *
 * Contiene sempre `Accesso negato` quando e un rifiuto di autorizzazione,
 * perche e la stringa con cui il route handler mappa il 403 (CLAUDE.md §8). Un
 * ruolo scritto male e invece una **richiesta sbagliata**, e resta un 400: chi
 * spunta una casella impossibile non sta tentando una scalata, sta sbagliando a
 * compilare.
 */
export const roleDenied = (message: string) =>
  new Error(`Accesso negato: ${message}`);

export type CustomRoleValidation = {
  slug: string;
  baseRole: CanonicalAccessRole;
  name: string;
  description: string | null;
  permissions: readonly string[];
  containsDirectionKeys: boolean;
};

/**
 * Valida una bozza di ruolo e ne restituisce la forma canonica.
 *
 * Solleva un errore parlante alla prima regola violata: un elenco di errori
 * sarebbe piu gentile e questa funzione la chiamano anche le guardie, dove il
 * primo motivo basta e il secondo e rumore.
 */
export const validateCustomRoleDraft = (
  draft: CustomRoleDraft,
): CustomRoleValidation => {
  const nome = String(draft.name || "").trim();
  if (nome.length < 3) {
    throw new Error("Il nome del ruolo deve avere almeno tre caratteri");
  }
  if (nome.length > 60) {
    throw new Error("Il nome del ruolo non puo superare i sessanta caratteri");
  }

  const base = normalizeAccessRole(draft.baseRole);
  if (!isAllowedCustomRoleBase(base)) {
    throw new Error(
      `Il ruolo base «${draft.baseRole}» non e clonabile: si parte da ${CUSTOM_ROLE_BASE_ROLES.join(", ")}`,
    );
  }

  const slug = buildCustomRoleSlug(base, nome);
  if (!slug || !slugifyCustomRoleName(nome)) {
    throw new Error(
      "Il nome del ruolo deve contenere almeno una lettera o una cifra",
    );
  }

  const chiavi = Array.from(
    new Set(
      (draft.permissions || [])
        .map((chiave) => String(chiave || "").trim())
        .filter(Boolean),
    ),
  ).sort();

  if (!chiavi.length) {
    throw new Error(
      "Un ruolo senza nessun permesso non concede niente: scegline almeno uno",
    );
  }

  const concedibili = new Set(
    listGrantablePermissions(base).map((entry) => entry.key),
  );

  for (const chiave of chiavi) {
    if (!getPermissionEntry(chiave)) {
      throw new Error(`Il permesso «${chiave}» non esiste nel catalogo`);
    }
    if (isLinkGatedPermission(chiave)) {
      throw new Error(
        `Il permesso «${chiave}» nasce dal legame con un atleta, non da un ruolo: concederlo lo renderebbe piu largo di quello che sembra`,
      );
    }
    if (!concedibili.has(chiave)) {
      throw new Error(
        `Il permesso «${chiave}» non appartiene al ruolo base «${base}»: un ruolo personalizzato e un sottoinsieme, mai un soprainsieme`,
      );
    }
  }

  const descrizione = String(draft.description || "").trim();

  return {
    slug,
    baseRole: base as CanonicalAccessRole,
    name: nome,
    description: descrizione ? descrizione.slice(0, 300) : null,
    permissions: chiavi,
    containsDirectionKeys: chiavi.some(isDirectionPermission),
  };
};

/* ===================================================================== */
/*  Gli atti riservati al proprietario (§10.4)                           */
/* ===================================================================== */

/**
 * **`isOwnerAccessRole` aveva zero chiamanti**, e `owner` era funzionalmente
 * indistinguibile da `club_manager`: le sole differenze erano strutturali, via
 * `clubs.creator_id`. Da qui l'elenco **chiuso** degli atti che soltanto il
 * proprietario compie.
 *
 * Chiuso vuol dire che si allunga con una riga qui e non con un `if` sparso:
 * il giorno in cui qualcuno aggiunge un atto di direzione e questo elenco non
 * lo nomina, l'atto **non** e riservato, e si vede.
 */
export const OWNER_ONLY_ACTIONS = {
  clubRoleCreate: "creare un ruolo personalizzato",
  clubRoleUpdate: "modificare un ruolo personalizzato",
  clubRoleDelete: "cancellare un ruolo personalizzato",
  grantOwner: "assegnare o revocare il ruolo di proprietario",
  assignDirectionRole:
    "assegnare un ruolo personalizzato che contiene permessi di direzione",
  organizationDelete: "cancellare l'organizzazione",
  platformConfiguration:
    "cambiare le configurazioni di piattaforma e di fatturazione",
} as const;

export type OwnerOnlyAction =
  (typeof OWNER_ONLY_ACTIONS)[keyof typeof OWNER_ONLY_ACTIONS];

/**
 * Vero se chi sta operando e **proprietario del club attivo**.
 *
 * Il ruolo attivo `owner` lo risolve `resolveOrganizationScopeForUser` soltanto
 * a chi possiede davvero il club — per ownership implicita
 * (`clubs.creator_id`) o per una tessera `owner` — e questa e l'unica domanda
 * da porre: un ruolo personalizzato non puo mai normalizzarsi a `owner`, perche
 * `owner` non e una base ammessa.
 */
export const isOwnerActor = (role: string | null | undefined) =>
  isOwnerAccessRole(role) && !parseCustomRoleValue(role);

export const assertOwnerOnlyAction = (
  role: string | null | undefined,
  action: OwnerOnlyAction,
) => {
  if (!isOwnerActor(role)) {
    throw roleDenied(`soltanto il proprietario del club puo ${action}`);
  }
};

/* ===================================================================== */
/*  Il tetto sulla concessione (§10.4, chiude il buco di §4)             */
/* ===================================================================== */

/**
 * Vero se il ruolo **attivo** porta la chiave.
 *
 * Passa dal catalogo — quindi dalla stessa regola di `roleHasPermission`, che
 * per un ruolo personalizzato risponde gia ristretto — e non da una seconda
 * tabella: un gestore con un ruolo personalizzato non deve poter concedere le
 * chiavi del proprio ruolo base che a lui sono state tolte.
 */
const roleCarriesPermission = (
  role: string | null | undefined,
  key: string,
) => {
  const entry = getPermissionEntry(key);
  if (!entry) return false;

  const personalizzato = parseCustomRoleValue(role);
  if (personalizzato) {
    return (
      entry.roles.includes(personalizzato.baseRole) &&
      personalizzato.permissions.includes(key)
    );
  }

  const normalizzato = normalizeAccessRole(role);
  if (!normalizzato) return false;
  return entry.roles.includes(normalizzato);
};

export type GrantedRoleDescriptor = {
  /** Il valore che finirebbe in `organization_users.role`. */
  role: string;
  /**
   * Le chiavi del ruolo personalizzato, quando il ruolo concesso e uno di
   * quelli. Per un canonico resta vuoto: le sue chiavi le dice il catalogo.
   */
  permissions?: readonly string[];
};

/**
 * **Nessuno concede un ruolo che non possiede.**
 *
 * ## Il buco che questa funzione chiude
 *
 * `assertConcessioneDiAccessoLecita` verificava che il concedente fosse
 * `owner || club_manager` e **non confrontava il ruolo concesso con quello
 * posseduto**: un `club_manager` poteva quindi creare una tessera
 * `role: "owner"` per chiunque. Il codice lo sapeva e lo accettava con una
 * motivazione datata — «piccola oggi, perche owner e club_manager hanno gli
 * stessi diritti, e una scalata il giorno in cui non li avranno piu».
 *
 * Con §10.4 quel giorno e arrivato: sette atti sono soltanto del proprietario,
 * e la motivazione non regge piu.
 *
 * ## Le quattro condizioni
 *
 * 1. si concede solo amministrando il club attivo (`owner` o `club_manager`);
 * 2. `owner` lo concede **solo** un `owner`;
 * 3. un ruolo personalizzato che contiene chiavi di **direzione** lo assegna
 *    solo un `owner`;
 * 4. **nessuna chiave che il concedente non abbia**: un gestore non puo
 *    fabbricare un ruolo con un permesso che a lui e negato, perche altrimenti
 *    basterebbe assegnarlo a un complice — o a se stesso il giorno dopo — per
 *    ottenerlo.
 *
 * L'auto-promozione resta impedita a monte, dal chiamante: una tessera non si
 * firma da soli.
 */
export const assertMayGrantRole = (
  actorRole: string | null | undefined,
  granted: GrantedRoleDescriptor,
) => {
  const concesso = String(granted.role || "").trim();
  const concessoNormalizzato = normalizeAccessRole(concesso);

  if (!concessoNormalizzato) {
    throw roleDenied(`«${concesso || "(vuoto)"}» non e un ruolo riconosciuto`);
  }

  if (concessoNormalizzato === "owner") {
    if (!isOwnerActor(actorRole)) {
      throw roleDenied(
        `soltanto il proprietario del club puo ${OWNER_ONLY_ACTIONS.grantOwner}`,
      );
    }
    return;
  }

  if (!isOwnerActor(actorRole) && normalizeAccessRole(actorRole) !== "club_manager") {
    throw roleDenied("l'accesso a un club lo concede chi lo amministra");
  }

  const personalizzato = parseCustomRoleValue(concesso);

  if (!personalizzato) {
    /*
      **Il ramo canonico usciva senza controlli, e li stava la scalata.**

      Le due condizioni qui sotto — niente chiavi di direzione, e nessuna
      chiave che il concedente non abbia — giravano **solo** se il ruolo
      concesso era personalizzato. Un ruolo canonico usciva dopo il solo
      «sono owner o club_manager» — e `normalizeAccessRole` di un gettone
      `custom:club_manager:segreteria#...` risponde `club_manager`.

      Conseguenza, trovata da due revisioni indipendenti: il titolare di una
      «Segreteria» basata su `club_manager` **con zero chiavi** poteva
      concedere `club_manager` **canonico e pieno** a una seconda utenza
      propria. L'auto-assegnazione era vietata; concederlo a un complice no. Da
      li: dato clinico dei minori, incassi, storni, e la cancellazione
      irreversibile del fascicolo di una persona.

      La regola che chiude la classe e la stessa gia scritta per i ruoli
      personalizzati, detta per intero: **chi concede un ruolo deve portare
      tutto quello che quel ruolo porta**. Un concedente canonico non cambia
      comportamento — `club_manager` porta un soprainsieme delle chiavi di ogni
      altro ruolo canonico, verificato sul catalogo — mentre un ruolo
      personalizzato **ristretto** non puo piu concedere il proprio ruolo base
      intero, che e esattamente cio che significa «ristretto».
    */
    const attorePersonalizzato = parseCustomRoleValue(actorRole);
    if (!attorePersonalizzato) return;

    for (const entry of PERMISSION_CATALOG) {
      if (!entry.roles.includes(concessoNormalizzato)) continue;
      /*
        **Le chiavi di legame non contano nel confronto, e ignorarlo rompeva
        tutto.**

        Una chiave `byLink` — rispondere a una convocazione, decidere un
        consenso per se — non nasce dal **ruolo**: nasce dal legame con un
        atleta. Nessuno la porta per ruolo, nemmeno chi la esercita.

        La prima stesura di questo ciclo non le escludeva, e la conseguenza e
        stata misurata da una revisione ostile: un amministratore con ruolo
        personalizzato — anche con **tutte** e trentasette le chiavi del
        catalogo — non poteva assegnare `parent` ne `athlete`, perche
        `rsvp.answer` e di legame e «non la porta». Quattro voci nella tendina
        dei ruoli standard, tutte e quattro rifiutate: la stessa classe di
        difetto che questa Wave chiude — un comando che non fa cio che dice —
        introdotta dalla correzione di un'altra.

        `listGrantablePermissions` le escludeva gia, ed e l'elenco che la
        schermata disegna: le due regole devono guardare le stesse chiavi.
      */
      if (isLinkGatedPermission(entry.key)) continue;
      if (!roleCarriesPermission(actorRole, entry.key)) {
        throw roleDenied(
          `non si concede il ruolo «${concessoNormalizzato}», che porta il permesso «${entry.key}» che il ruolo attivo non ha`,
        );
      }
    }
    return;
  }

  const chiavi = Array.from(
    new Set(
      (granted.permissions || [])
        .map((chiave) => String(chiave || "").trim())
        .filter(Boolean),
    ),
  );

  if (chiavi.some(isDirectionPermission) && !isOwnerActor(actorRole)) {
    throw roleDenied(
      `soltanto il proprietario del club puo ${OWNER_ONLY_ACTIONS.assignDirectionRole}`,
    );
  }

  for (const chiave of chiavi) {
    if (isLinkGatedPermission(chiave)) {
      throw roleDenied(
        `«${chiave}» nasce dal legame con un atleta e non si concede a un ruolo`,
      );
    }
    if (!roleCarriesPermission(actorRole, chiave)) {
      throw roleDenied(
        `non si concede il permesso «${chiave}», che il ruolo attivo non ha`,
      );
    }
  }
};
