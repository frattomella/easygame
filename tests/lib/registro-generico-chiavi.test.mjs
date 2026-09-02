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
