import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  BOZZA_VUOTA,
  ETICHETTE_DOMINIO,
  PERIMETRO_DEL_RUOLO_BASE,
  PRESET,
  bozzaDaRuolo,
  commutaVoceDiPerimetro,
  corpoBozza,
  etichettePerimetro,
  nomeAssegnazione,
  opzioniRuoloAssegnabile,
  perimetroDelRuoloBase,
  perimetroRistretto,
  raggruppaPerDominio,
  sostituisciAsse,
  statoRuolo,
  validaBozza,
  valoriDiAsse,
} from "@/components/access-management/v2/access-model";
import { PERSON_STATUS } from "@/lib/web/status";
import { PERMISSION_CATALOG } from "@/lib/permissions/catalog";
import { listGrantablePermissions } from "@/lib/roles/custom-role";

/**
 * Parita della pagina «Ruoli e accessi» V2 con l'audit V1
 * (`docs/redesign/audit/wave-e-ruoli-e-accessi.md`).
 *
 * Il redesign cambia forma, non capacita: ogni etichetta, azione, campo,
 * endpoint e predicato di permesso che l'audit elenca deve restare nel
 * sorgente V2. Un test statico non prova che funzioni — lo fa il lead a
 * schermo — ma impedisce che una capacita sparisca per distrazione.
 */
const read = (relative) => readFileSync(path.join(process.cwd(), relative), "utf8");
const V2 = "src/components/access-management/v2";
const sources = {
  page: read("src/app/dashboard/access-management/page.tsx"),
  model: read(`${V2}/access-model.ts`),
  roleDrawer: read(`${V2}/role-drawer.tsx`),
  inspector: read(`${V2}/role-inspector.tsx`),
  assignment: read(`${V2}/assignment-drawer.tsx`),
  dialogs: read(`${V2}/access-dialogs.tsx`),
};
const everything = Object.values(sources).join("\n");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ------------------------------------------------------------ intestazione */

test("intestazione: il nome della voce, una sola azione primaria, i numeri e i due testi informativi", () => {
  assert.match(sources.page, /<PageHeader/);
  assert.match(sources.page, /title="Ruoli e accessi"/, "PP-01 §M: il nome resta «Ruoli e accessi»");
  assert.match(sources.page, /Chi entra in questo club, con quale ruolo e su quale perimetro\./);
  assert.equal((sources.page.match(/variant="primary"/g) || []).length, 2, "il primario di pagina e quello dello stato vuoto: nessun altro gradiente");
  assert.match(sources.page, /Nuovo ruolo/);
  assert.match(sources.page, /label="con perimetro ristretto"/);
  assert.match(sources.page, /label="con permessi di direzione"/);
  assert.match(sources.page, /Chi entra per la prima volta riceve un invito dalla propria scheda/);
  assert.match(sources.page, /Creare e modificare un ruolo è riservato al proprietario del club\./);
});

test("permessi: gli stessi predicati della V1, e un permesso negato e un elemento assente", () => {
  assert.match(sources.page, /const ruoloAttivo = useMemo\(\(\) => readStoredActiveClub\(\)\?\.role \|\| "", \[\]\)/);
  assert.match(sources.page, /const sonoProprietario = isOwnerActor\(ruoloAttivo\)/);
  assert.match(sources.page, /roleHasPermission\(ruoloAttivo, "audit\.read"\)/);
  assert.match(sources.page, /\{vedeRegistro \? \(/, "il registro compare solo con la chiave");
  assert.match(sources.page, /\{sonoProprietario \? \(\s*<Menu>/, "i modelli solo al proprietario");
  assert.match(sources.page, /hidden: \(\) => !sonoProprietario, onClick: \(row\) => setBozza\(bozzaDaRuolo\(row\)\)/);
  assert.match(sources.page, /label: "Elimina", icon: <Trash2 \/>, tone: "danger", hidden: \(\) => !sonoProprietario/);
  assert.match(sources.page, /canManage=\{sonoProprietario\}/, "l'ispettore mostra Modifica ed Elimina solo al proprietario");
  assert.doesNotMatch(senzaCommenti(everything), /disabled=\{!sonoProprietario\}/, "mai disabilitato: assente");
});

/* --------------------------------------------------------------- endpoint */

test("endpoint: una lettura e quattro scritture, tutte via apiRequest, nessun fetch diretto", () => {
  assert.match(sources.page, /apiRequest<LetturaAccessi>\("\/api\/v1\/club-roles\/assignments"\)/);
  assert.match(sources.page, /apiRequest\(`\/api\/v1\/club-roles\/\$\{valori\.id\}`, \{ method: "PATCH", body: corpo \}\)/);
  assert.match(sources.page, /apiRequest\("\/api\/v1\/club-roles", \{ method: "POST", body: corpo \}\)/);
  assert.match(sources.page, /apiRequest\(`\/api\/v1\/club-roles\/\$\{ruolo\.id\}`, \{ method: "DELETE" \}\)/);
  assert.match(sources.page, /apiRequest\("\/api\/v1\/club-roles\/assignments", \{\s*method: "POST",\s*body: \{ user_id: persona\.user_id, role: ruolo, scopes \},/);
  assert.match(sources.page, /apiRequest\(`\/api\/v1\/club-roles\/assignments\/\$\{persona\.membership_id\}`, \{ method: "DELETE" \}\)/);
  assert.doesNotMatch(senzaCommenti(everything), /\bfetch\(/);
  assert.deepEqual(corpoBozza({ id: null, name: "Segreteria", description: "d", baseRole: "collaborator", permissions: ["events.read"] }), {
    name: "Segreteria",
    description: "d",
    base_role: "collaborator",
    permissions: ["events.read"],
  });
});

test("toast: le stesse frasi della V1", () => {
  for (const frase of ['"Ruolo aggiornato" : "Ruolo creato"', "Ruolo «${ruolo.name}» cancellato", "Accesso aggiornato per ${nomeAssegnazione(persona)}", '"Accesso revocato"']) {
    assert.ok(sources.page.includes(frase), `manca il toast ${frase}`);
  }
  assert.match(sources.page, /showToast\("error", risposta\.error\.message\)/);
});

/* ------------------------------------------------------------- le griglie */

test("persone con accesso: la griglia porta nome, email, ruolo e perimetro; le azioni della V1", () => {
  assert.match(sources.page, /module="accessi"/);
  for (const column of ['id: "identity"', 'id: "role"', 'id: "perimeter"', 'id: "permissions"', 'id: "granted_at"']) {
    assert.ok(sources.page.includes(column), `manca la colonna ${column}`);
  }
  assert.match(sources.page, /label: "Ruolo e perimetro", icon: <UserCog \/>, primary: true/);
  assert.match(sources.page, /label: "Revoca accesso", icon: <UserX \/>, tone: "danger"/);
  assert.match(sources.page, /Nessun accesso registrato per questo club/);
  assert.match(sources.page, /label: "Perimetro ristretto", filters: \{ perimeter: "restricted" \}/);
  assert.match(sources.page, /requestedViewId=\{vistaAccessi\}/);
  assert.doesNotMatch(sources.page, /bulkActions=/, "la V1 non aveva azioni di massa: non si inventano");
  assert.doesNotMatch(sources.page, /export=\{/, "la V1 non aveva esportazione: non si inventa");
});

test("ruoli del club: la griglia porta base, stato, permessi, persone, direzione e slug; l'ispettore il resto", () => {
  assert.match(sources.page, /module="ruoli-club"/);
  for (const column of ['id: "identity"', 'id: "base"', 'id: "status"', 'id: "permissions"', 'id: "assigned"', 'id: "direction"', 'id: "slug"']) {
    assert.ok(sources.page.includes(column), `manca la colonna ${column}`);
  }
  assert.match(sources.page, /<StatusPill status=\{statoRuolo\(row\)\} \/>/);
  assert.match(sources.page, /contiene permessi di direzione/);
  assert.match(sources.page, /label: "Dettaglio", icon: <ChevronRight \/>, primary: true/);
  assert.match(sources.page, /Nessun ruolo personalizzato/);
  assert.match(sources.page, /I sette ruoli standard restano disponibili: un ruolo personalizzato serve quando a una persona vanno concessi meno permessi di quelli del suo ruolo, mai di più\./);
  assert.match(sources.inspector, /width="narrow"/);
  assert.match(sources.inspector, /perimetroDelRuoloBase\(ruolo\.base_role\)/, "«oltre alle caselle» resta scritto");
  assert.match(sources.inspector, /ruolo\.permission_labels\.map/, "tutte le etichette dei permessi");
  assert.match(sources.inspector, /ruolo\.slug/);
  assert.match(sources.inspector, /ruolo\.assigned_count/);
});

/* -------------------------------------------------------------- i moduli */

test("cassetto del ruolo: nome, base (bloccata in modifica), descrizione, caselle solo concedibili, guardia dirty", () => {
  assert.match(sources.roleDrawer, /width="wide"/, "decine di caselle: 720");
  assert.match(sources.roleDrawer, /dirty=\{dirty\}/);
  assert.match(sources.roleDrawer, /placeholder="Segreteria"/);
  assert.match(sources.roleDrawer, /placeholder="A cosa serve questo ruolo nel club"/);
  assert.match(sources.roleDrawer, /CUSTOM_ROLE_BASE_ROLES\.map/);
  assert.match(sources.roleDrawer, /Il ruolo di partenza non si cambia: cambierebbe i permessi di chi lo porta già\. Si crea un ruolo nuovo\./);
  assert.match(sources.roleDrawer, /Il ruolo personalizzato potrà avere al massimo i permessi di quello scelto qui\./);
  assert.match(sources.roleDrawer, /readOnly/, "in modifica la base e in sola lettura con il perche");
  assert.match(sources.roleDrawer, /aggiorna\(\{ baseRole: value, permissions: \[\] \}\)/, "cambiare la base azzera le caselle");
  assert.match(sources.roleDrawer, /listGrantablePermissions\(valori\?\.baseRole \|\| "collaborator"\)/);
  assert.match(sources.roleDrawer, /isDirectionPermission\(voce\.key\) \? " · direzione" : ""/);
  assert.match(sources.roleDrawer, /perimetroDelRuoloBase\(valori\.baseRole\)/);
  assert.match(sources.roleDrawer, /Salva ruolo/);
  assert.deepEqual(validaBozza({ ...BOZZA_VUOTA }, "ruolo"), [{ id: "ruolo-name", label: "Nome del ruolo" }]);
  assert.deepEqual(validaBozza({ ...BOZZA_VUOTA, name: "Segreteria" }, "ruolo"), []);
});

test("cassetto dell'assegnazione: ruolo (standard + del club attivi), sedi, categorie, la nota sul perimetro", () => {
  assert.match(sources.assignment, /width="default"/);
  assert.match(sources.assignment, /dirty=\{dirty\}/);
  assert.match(sources.assignment, /Salva accesso/);
  assert.match(sources.assignment, /label="Sedi"/);
  assert.match(sources.assignment, /label="Categorie"/);
  assert.match(sources.assignment, /Nessuna voce scelta significa/);
  assert.match(sources.assignment, /tutto il club/);
  assert.match(sources.assignment, /gli altri elenchi del club restano completi\./);
  assert.match(sources.assignment, /\{sedi\.length \|\| categorie\.length \? \(/, "i due assi compaiono solo se il club ha sedi o categorie");
  const opzioni = opzioniRuoloAssegnabile([
    { id: "1", slug: "custom:collaborator:segreteria", name: "Segreteria", base_role: "collaborator", base_role_label: "Collaboratore", is_active: true, description: null, permissions: [], permission_labels: [], contains_direction_keys: false, assigned_count: 0 },
    { id: "2", slug: "custom:staff:vecchio", name: "Vecchio", base_role: "staff", base_role_label: "Staff", is_active: false, description: null, permissions: [], permission_labels: [], contains_direction_keys: false, assigned_count: 0 },
  ]);
  assert.deepEqual(
    opzioni.map((o) => o.value),
    ["club_manager", "collaborator", "staff", "trainer", "custom:collaborator:segreteria"],
    "i quattro standard della V1 piu i ruoli del club attivi, per slug",
  );
});

test("perimetro: zero righe = tutto il club; gli assi si sostituiscono e si commutano per voce", () => {
  const opzioni = { site: [{ id: "s1", label: "Scauri" }], category: [{ id: "c1", label: "Under 15" }] };
  assert.deepEqual(etichettePerimetro({ scopes: [] }, opzioni), ["Tutto il club"]);
  assert.deepEqual(etichettePerimetro({ scopes: [{ kind: "site", value: "s1" }, { kind: "category", value: "c9" }] }, opzioni), ["Sede: Scauri", "Categoria: c9"]);
  assert.equal(perimetroRistretto({ scopes: [] }), false);
  assert.equal(perimetroRistretto({ scopes: [{ kind: "site", value: "s1" }] }), true);
  const uno = commutaVoceDiPerimetro([], "site", "s1");
  assert.deepEqual(uno, [{ kind: "site", value: "s1" }]);
  assert.deepEqual(commutaVoceDiPerimetro(uno, "site", "s1"), []);
  assert.deepEqual(valoriDiAsse([{ kind: "site", value: "s1" }, { kind: "category", value: "c1" }], "category"), ["c1"]);
  assert.deepEqual(sostituisciAsse([{ kind: "site", value: "s1" }, { kind: "category", value: "c1" }], "category", ["c2", "c3"]), [
    { kind: "site", value: "s1" },
    { kind: "category", value: "c2" },
    { kind: "category", value: "c3" },
  ]);
});

/* ------------------------------------------------------------- conferme */

test("conferme: cancellare un ruolo e revocare un accesso con i testi della V1 e i dialoghi del sistema", () => {
  assert.match(sources.dialogs, /Cancellare il ruolo «\$\{ruolo\?\.name \?\? ""\}»\?/);
  assert.match(sources.dialogs, /Un ruolo assegnato non si può cancellare: prima va revocato alle persone che lo portano\./);
  assert.match(sources.dialogs, /confirmLabel="Cancella"/);
  assert.match(sources.dialogs, /Revocare l'accesso a \$\{nome\}\?/);
  assert.match(sources.dialogs, /La persona non potrà più entrare in questo club\. L'operazione resta nel registro\./);
  assert.match(sources.dialogs, /confirmLabel="Revoca"/);
  assert.match(sources.dialogs, /typedConfirmation=\{nome\}/, "la revoca di un accesso e un'operazione ampia: conferma scritta");
  assert.doesNotMatch(senzaCommenti(everything), /window\.confirm|[^.\w]confirm\(|AlertDialog/, "nessuna conferma nativa ne il vecchio AlertDialog");
});

/* ---------------------------------------------------------------- modello */

test("modello: i due preset del §24, le etichette dei domini e il perimetro delle quattro basi", () => {
  assert.deepEqual(
    PRESET.map((p) => [p.titolo, p.bozza.baseRole, p.bozza.permissions.length]),
    [
      ["Segreteria", "collaborator", 15],
      ["Direttore Sportivo", "staff", 7],
    ],
  );
  const catalogo = new Set(PERMISSION_CATALOG.map((voce) => voce.key));
  for (const preset of PRESET) {
    const concedibili = new Set(listGrantablePermissions(preset.bozza.baseRole).map((voce) => voce.key));
    for (const chiave of preset.bozza.permissions) {
      assert.ok(catalogo.has(chiave), `${chiave} non e in catalogo`);
      assert.ok(concedibili.has(chiave), `${preset.titolo} non puo portare ${chiave}`);
    }
  }
  assert.equal(Object.keys(ETICHETTE_DOMINIO).length, 17); // + «Persone in prova» (ADR-0188)
  assert.deepEqual(Object.keys(PERIMETRO_DEL_RUOLO_BASE), ["club_manager", "collaborator", "staff", "trainer"]);
  assert.equal(perimetroDelRuoloBase("custom:staff:x"), PERIMETRO_DEL_RUOLO_BASE.staff);
  assert.equal(perimetroDelRuoloBase("owner"), "—");
  assert.equal(statoRuolo({ is_active: true }), PERSON_STATUS.active);
  assert.equal(statoRuolo({ is_active: false }), PERSON_STATUS.inactive);
  assert.equal(nomeAssegnazione({ name: "", email: "a@b.it" }), "a@b.it");
  const gruppi = raggruppaPerDominio(listGrantablePermissions("collaborator"));
  assert.ok(gruppi.length > 3);
  assert.ok(gruppi.every(([dominio]) => dominio in ETICHETTE_DOMINIO));
  const bozza = bozzaDaRuolo({ id: "1", slug: "s", name: "N", description: null, base_role: "staff", base_role_label: "Staff", is_active: true, permissions: ["events.read"], permission_labels: [], contains_direction_keys: false, assigned_count: 0 });
  assert.deepEqual(bozza, { id: "1", name: "N", description: "", baseRole: "staff", permissions: ["events.read"] });
});

/* ------------------------------------------------------------- disciplina */

test("disciplina V2: niente componenti V1, niente gradienti fuori sistema, usabile a 375 px", () => {
  assert.doesNotMatch(everything, /@\/components\/ui\/(card|badge|button|input|label|textarea|checkbox|alert-dialog)"/);
  assert.doesNotMatch(everything, /bg-gradient-to-|#[0-9a-fA-F]{6}\b/);
  assert.doesNotMatch(everything, /[!]"|[!]\s*<|[!]\s*$/m, "niente punti esclamativi nei testi");
  for (const [name, source] of Object.entries(sources)) {
    const griglieSenzaRottura = [...source.matchAll(/className="([^"]*\bgrid-cols-\d[^"]*)"/g)].filter((m) => !/\b(sm|md|lg|xl|laptop):grid-cols-/.test(m[1]));
    assert.deepEqual(griglieSenzaRottura, [], `${name}: una griglia a colonne fisse`);
  }
});
