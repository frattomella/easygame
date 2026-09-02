import test from "node:test";
import assert from "node:assert/strict";

import {
  MANAGEMENT_OPEN_RESOURCES,
  isManagementAdminOnlyResource,
} from "../../src/lib/access-roles.ts";
import {
  PERMISSION_CATALOG,
  RESOURCE_PERMISSION_KEYS,
  customRoleReachesResource,
} from "../../src/lib/permissions/catalog.ts";

/**
 * **La mappa fra una risorsa del registro generico e la chiave che la governa.**
 *
 * Il registro generico non era governato da chiavi: `canAccessClubResource`
 * passa da `normalizeAccessRole`, che di un gettone `custom:collaborator:<slug>`
 * risponde `collaborator`. Una revisione lo ha misurato — un ruolo di club con
 * **zero chiavi** leggeva l'anagrafica di un minore, le note di segreteria e i
 * compensi degli allenatori, e scriveva sconti — e la conclusione non e stata
 * «aggiungiamo un controllo su quelle quattro»: e stata che serviva una
 * dichiarazione **completa**.
 *
 * Questi controlli tengono la dichiarazione completa e onesta. Il secondo e il
 * piu importante: un `keys: []` e una risposta legittima — non tutte le risorse
 * hanno una chiave — ma deve portare il **motivo** scritto, altrimenti diventa
 * il posto in cui si nasconde cio che non si e voluto decidere.
 */

const CHIAVI_DI_CATALOGO = new Set(PERMISSION_CATALOG.map((voce) => voce.key));

test("ogni risorsa aperta alla gestione e dichiarata", () => {
  const mancanti = [...MANAGEMENT_OPEN_RESOURCES].filter(
    (risorsa) => !Object.prototype.hasOwnProperty.call(RESOURCE_PERMISSION_KEYS, risorsa),
  );

  assert.deepEqual(
    mancanti.sort(),
    [],
    "risorse aperte alla gestione che nessuno ha dichiarato in RESOURCE_PERMISSION_KEYS: " +
      "dichiara la chiave che le governa, oppure `keys: []` con il motivo. " +
      "Chi ne aggiunge una e non la dichiara la trova qui, che e il verso giusto in cui sbagliare",
  );
});

test("una risorsa senza chiave dice perche", () => {
  const mute = Object.entries(RESOURCE_PERMISSION_KEYS)
    .filter(([, voce]) => !voce.keys.length && !String(voce.reason || "").trim())
    .map(([risorsa]) => risorsa);

  assert.deepEqual(
    mute,
    [],
    "queste risorse dichiarano «nessuna chiave» senza dire perche: " +
      "un elenco di eccezioni senza motivo e il posto in cui si nasconde cio che non si e deciso",
  );
});

test("le chiavi dichiarate esistono davvero nel catalogo", () => {
  const inventate = Object.entries(RESOURCE_PERMISSION_KEYS)
    .flatMap(([risorsa, voce]) =>
      voce.keys
        .filter((chiave) => !CHIAVI_DI_CATALOGO.has(chiave))
        .map((chiave) => `${risorsa} -> ${chiave}`),
    );

  assert.deepEqual(
    inventate,
    [],
    "chiavi che il catalogo non conosce: una chiave inesistente non nega niente, " +
      "perche `roleHasPermission` non la trova su nessun ruolo",
  );
});

test("nessuna risorsa riservata alla direzione compare nella mappa", () => {
  /*
    Le riservate non si concedono con una chiave: sono il perimetro della
    direzione **canonica**, e `canAccessClubResource` le nega a un ruolo
    personalizzato prima di arrivare qui. Dichiararle qui con una chiave
    direbbe che si possono delegare, che e falso.
  */
  const confuse = Object.keys(RESOURCE_PERMISSION_KEYS).filter((risorsa) =>
    isManagementAdminOnlyResource(risorsa),
  );

  assert.deepEqual(
    confuse,
    [],
    "queste risorse sono riservate alla direzione e non si delegano con una chiave",
  );
});

/**
 * **Le risorse che una chiave la governano davvero.**
 *
 * Il resto di questo file verifica che l elenco sia **ben formato**: completo,
 * con i motivi scritti, senza chiavi inventate. Una revisione ha misurato cosa
 * manca a quella verifica: degradare una voce a `keys: []` con un motivo
 * qualunque la soddisfa — provato su `discounts`, la risorsa che il commit di
 * quella correzione cita per nome — e un ruolo con zero chiavi torna a
 * scrivere sconti, con sei gate verdi.
 *
 * Un elenco che si autodichiara non e un presidio. Questo e il **pin**: sono
 * fatti sul prodotto, e cambiarli deve costare una discussione.
 */
const GOVERNATE_DA_UNA_CHIAVE = new Map([
  ["members", "il libro soci"],
  ["medical_certificates", "il certificato medico"],
  ["simplified_certificates", "il certificato medico"],
  ["club_events", "gli eventi del club"],
  ["club_event_participants", "chi partecipa a un evento"],
  ["training_attendance", "le presenze"],
  ["payments", "le rate di una famiglia"],
  ["simplified_payments", "le rate di una famiglia"],
  ["payment_plans", "i piani di pagamento"],
  ["transactions", "i movimenti"],
  ["transfers", "i giroconti"],
  ["invoices", "le fatture"],
  ["receipts", "le ricevute"],
  ["expected_income", "le entrate previste"],
  ["expected_expenses", "le uscite previste"],
  ["discounts", "gli sconti applicati a una famiglia"],
  ["sponsor_payments", "gli incassi da sponsor"],
]);

test("le risorse governate da una chiave non si degradano a «nessuna chiave»", () => {
  const senzaChiave = [...GOVERNATE_DA_UNA_CHIAVE.keys()].filter((risorsa) => {
    const voce = RESOURCE_PERMISSION_KEYS[risorsa];
    return !voce || !voce.keys.length;
  });

  assert.deepEqual(
    senzaChiave,
    [],
    "queste risorse sono governate da una chiave e adesso dichiarano di non esserlo: " +
      senzaChiave.join(", ") +
      ". Se la decisione e cambiata davvero, cambiala **qui** dicendo perche: " +
      "l elenco di sopra si autodichiara, questo no",
  );
});

test("e chi non ha quella chiave non le raggiunge, una per una", () => {
  /*
    La prova **comportamentale**, su tutte e diciassette invece che su una. Era
    cablata su `members`, e per le altre sedici la dichiarazione era anche la
    prova: circolare.
  */
  const senzaChiavi = "custom:collaborator:vuoto#";
  const raggiunte = [...GOVERNATE_DA_UNA_CHIAVE.keys()].filter((risorsa) =>
    customRoleReachesResource(senzaChiavi, risorsa),
  );

  assert.deepEqual(
    raggiunte,
    [],
    "un ruolo con zero chiavi raggiunge risorse che una chiave governa: " +
      raggiunte.join(", "),
  );

  /* E con la chiave giusta le raggiunge, altrimenti la regola nega e basta. */
  for (const [risorsa] of GOVERNATE_DA_UNA_CHIAVE) {
    const chiavi = RESOURCE_PERMISSION_KEYS[risorsa].keys;
    const conLaChiave = `custom:club_manager:pieno#${chiavi.join(",")}`;
    assert.equal(
      customRoleReachesResource(conLaChiave, risorsa),
      true,
      `chi porta ${chiavi.join(" o ")} deve raggiungere «${risorsa}»`,
    );
  }
});

test("un ruolo personalizzato senza la chiave non raggiunge la risorsa che la richiede", () => {
  /*
    La prova comportamentale della mappa, sulla funzione che le rotte usano.
    Senza, i tre controlli qui sopra direbbero soltanto che l'elenco e ben
    scritto.
  */
  const conLaChiave = "custom:collaborator:segreteria#members.register.read";
  const senzaLaChiave = "custom:collaborator:vuoto#";

  assert.equal(customRoleReachesResource(conLaChiave, "members"), true);
  assert.equal(customRoleReachesResource(senzaLaChiave, "members"), false);

  /* E cio che nessuna chiave governa resta al ruolo base, come dichiarato. */
  assert.equal(customRoleReachesResource(senzaLaChiave, "categories"), true);
  assert.equal(customRoleReachesResource(senzaLaChiave, "athletes"), true);
});
