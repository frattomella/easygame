import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * ADR-0194 — le superfici (§12–§18, §26, §33 a livello di sorgente): nessun
 * selettore di sede indipendente, la sede derivata dalla squadra ovunque,
 * l'editor delle appartenenze condiviso, il cambio in blocco con anteprima,
 * import ed export che parlano di squadre.
 */

const leggi = (p) => readFileSync(path.join(process.cwd(), p), "utf8");
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const editor = senzaCommenti(leggi("src/components/athletes/v2/AthleteCategoryMembershipEditor.tsx"));
const scheda = senzaCommenti(leggi("src/app/athletes/[id]/page.tsx"));
const cassetti = senzaCommenti(leggi("src/components/athletes/profile/v2/AthleteProfileDrawers.tsx"));
const creazione = senzaCommenti(leggi("src/components/forms/AthleteCreateForm.tsx"));
const nuovo = senzaCommenti(leggi("src/app/athletes/new/page.tsx"));
const elenco = senzaCommenti(leggi("src/app/athletes/page.tsx"));
const blocco = senzaCommenti(leggi("src/components/athletes/v2/bulk-category-drawer.tsx"));
const colonne = senzaCommenti(leggi("src/components/athletes/v2/athletes-grid-columns.tsx"));
const provaForm = senzaCommenti(leggi("src/components/trials/v2/TrialFormDrawer.tsx"));
const provaConverti = senzaCommenti(leggi("src/components/trials/v2/TrialConvertDrawer.tsx"));
const provaServer = senzaCommenti(leggi("src/lib/server/trial-athletes.ts"));
const campi = senzaCommenti(leggi("src/lib/forms/dynamic-fields.ts"));
const pratiche = senzaCommenti(leggi("src/lib/server/form-submissions.ts"));
const moduli = senzaCommenti(leggi("src/lib/server/forms.ts"));
const importazione = senzaCommenti(leggi("src/lib/athlete-import.ts"));
const writer = senzaCommenti(leggi("src/lib/server/athlete-category-memberships.ts"));
const registro = senzaCommenti(leggi("src/lib/server/resources.ts"));
const client = senzaCommenti(leggi("src/lib/simplified-db.ts"));

test("§26 — un editor solo, montato dalla scheda e dalla creazione: si sceglie la squadra, la sede si legge", () => {
  assert.match(cassetti, /<AthleteCategoryMembershipEditor/);
  assert.match(creazione, /<AthleteCategoryMembershipEditor/);
  assert.ok(!existsSync("src/components/athletes/profile/athlete-categories-panel.tsx"), "il pannello con il selettore di sede indipendente non esiste piu");
  assert.match(editor, /Imposta come primaria/);
  assert.match(editor, /Rimuovi/);
  assert.match(editor, /Aggiungi categoria/);
  assert.match(editor, /Cosa fare di «/, "quando la primaria cambia si chiede cosa fare della precedente");
  assert.match(editor, /\["remove", "Rimuovila"\]/, "default: rimuovila");
  assert.match(editor, /\["keep_as_secondary", "Mantienila come categoria secondaria"\]/);
  assert.match(editor, /planMembershipChange\(/, "lo stesso piano del server");
  assert.doesNotMatch(editor, /SiteSelect|onPrimarySiteChange/, "nessun selettore di sede: la sede e della squadra");
  assert.match(editor, /`Sede: \$\{placement\.target\.siteName\}`/, "la sede si mostra, derivata");
});

test("§13 — la scheda non ha piu «Categoria» + «Sede» indipendenti: passa l'indice delle squadre e riceve l'insieme", () => {
  assert.doesNotMatch(scheda, /handlePrimarySiteChange|primaryEditSiteId|onPrimarySiteChange/);
  assert.match(scheda, /useMembershipTargetIndex\(\{\s*categories: clubCategoryOptions,\s*groups: clubCategoryGroups,\s*sites: clubSites,\s*\}\)/);
  assert.match(scheda, /const handleMembershipsChange = \(next: EditorMembership\[\]\)/);
  assert.match(scheda, /site_id: membership\.siteId \|\| ""/, "la sede scritta e quella della squadra scelta");
});

test("§12 — nuovo atleta: squadra, non categoria + sede; la categoria suggerita si applica solo se nomina una squadra sola", () => {
  assert.match(creazione, /membershipIndex\?: MembershipTargetIndex/);
  assert.match(creazione, /squadre\.length === 1 \? squadre\[0\] : null/, "con due sedi la scelta e del club");
  assert.match(creazione, /Questa categoria si svolge in piu sedi: scegli la squadra/);
  assert.doesNotMatch(creazione, /id="categoryId"|secondaryCategoryOptions|AUTO_CATEGORY/);
  assert.match(nuovo, /site_id: m\.siteId \|\| ""/, "la creazione scrive la sede della squadra");
  assert.match(nuovo, /siteId: primaria \? primaria\.siteId \|\| null : trialToUse\.siteId \|\| null/, "la conversione da prova prende la sede della squadra scelta qui");
});

test("§7–§8 — il cambio in blocco: squadra, ruolo, due politiche visibili, anteprima del server, conferma", () => {
  assert.match(elenco, /<BulkCategoryDrawer[\s\S]*?index=\{membershipTargetIndex\}/);
  assert.doesNotMatch(elenco, /targetSiteId|"changeCategory"/, "il vecchio ciclo updateClubAthlete(category, site_id) non esiste piu");
  assert.match(blocco, /previewMembershipChange\(athleteIds, command\)/);
  assert.match(blocco, /applyMembershipChange\(athleteIds, command, preview\.batchId\)/);
  for (const testo of ["atleti verranno aggiornati", "nuove categorie primarie", "vecchie appartenenze rimosse", "verranno promosse a primarie", "altre categorie secondarie verranno mantenute", "ATTENZIONE"]) {
    assert.ok(blocco.includes(testo), `l'anteprima dice «${testo}»`);
  }
  assert.doesNotMatch(blocco, /bulk-site-target|isMultiSiteClub/);
});

test("§14/§18 — l'elenco e una riga per appartenenza: la sede e della riga, e l'export la porta", () => {
  assert.match(colonne, /id: "sede",\s*header: "Sede"/);
  assert.match(colonne, /exportValue: \(row\) => row\.siteName \|\| "-"/);
  assert.match(elenco, /siteName: membership\.siteId\s*\? siteIndex\.getSiteName\(membership\.siteId\)/, "il nome della sede, mai l'identificativo (§33.13)");
});

test("§16 — la persona in prova sceglie una squadra; sede e gruppo non sono due tendine; il server deriva la sede", () => {
  assert.match(provaForm, /targetOptions: readonly TrialTargetOption\[\]/);
  assert.doesNotMatch(provaForm, /id="trial-site"|id="trial-group"/, "niente selettore di sede o gruppo indipendente");
  assert.match(provaForm, /const scegliSquadra = /);
  assert.match(provaConverti, /targetOptions\.find\(\(t\) => t\.id === targetId\)/);
  assert.match(provaServer, /la sede indicata non e quella del gruppo scelto/);
  assert.match(provaServer, /squadre\.length === 1 && !squadre\[0\]\.implicit/, "una squadra sola: la sede e la sua");
  assert.match(provaServer, /gruppoDellaProva\?\.categoryId === categoria\.category_id \? gruppoDellaProva\.siteId/, "la conversione deriva la sede dal gruppo della prova");
});

test("§15 — iscrizione online: le opzioni sono le squadre, il campo «Sede» non scrive piu, nessuna copia in data.siteId", () => {
  assert.match(campi, /label: "Squadra dell'atleta \(categoria e sede\)"/);
  assert.match(campi, /key: "athlete\.siteId"[\s\S]*?writable: false/);
  assert.match(moduli, /targets\.targets\.map\(\(target\) => target\.label\)/, "le opzioni di categoria sono le etichette delle squadre");
  assert.match(pratiche, /options\.targets\.fromLabel\(answeredCategory\)/);
  assert.match(pratiche, /siteId: target && !target\.implicit \? target\.siteId : ""/);
  assert.match(pratiche, /delete patch\.data\.siteId;/);
  assert.doesNotMatch(pratiche, /patch\.data\.siteId = /, "nessun writer di data.siteId");
  assert.doesNotMatch(pratiche, /Sede assegnata a \$\{orphans\.length\}/, "una sede senza squadra non colloca nessuno");
});

test("§17 — l'import riconosce «Pulcini · S. Cosma» e rifiuta il nome nudo di una categoria con piu sedi", () => {
  assert.match(importazione, /options\.targets\.fromLabel\(rawCategory\)/);
  assert.match(importazione, /si svolge in piu sedi: scrivere la squadra/);
  assert.match(importazione, /siteId: string;/);
  assert.match(elenco, /targets=\{membershipTargetIndex\}/, "l'anteprima dell'import ha le squadre");
  assert.match(elenco, /site_id: row\.siteId \|\| ""/, "e la riga importata porta la sede riconosciuta");
});

test("§10/§24 — un writer solo, il vaglio delle coppie sul registro generico, il client manda l'insieme al server", () => {
  assert.match(writer, /export const applyMembershipChange/);
  assert.match(writer, /export const previewMembershipChange/);
  assert.match(writer, /export const replaceAthleteMembershipSet/);
  assert.match(writer, /bloccaSchede\(tx, ids\)/, "le schede si bloccano in ordine (ADR-0138)");
  assert.match(writer, /AUDIT_ACTIONS\.athleteMembershipsChanged/);
  assert.match(writer, /AUDIT_ACTIONS\.athleteMembershipsBulk/);
  assert.match(registro, /assertMembershipPlacementIsCanonical\(club, normalized, null\)/);
  assert.match(registro, /assertMembershipPlacementIsCanonical\(club, normalized, existing as any\)/);
  assert.match(client, /replaceAthleteMembershipsOnServer\(/);
  assert.doesNotMatch(client, /\.from\(ATHLETE_CATEGORY_MEMBERSHIPS_RESOURCE\)\s*\.insert\(payload\)/, "il client non inserisce piu riga per riga");
  assert.doesNotMatch(client, /currentPrimary\?\.siteId \?\? ""/, "la sede della primaria uscente non si porta dietro");
  assert.match(client, /\.filter\(\(membership\) => !membership\.isPrimary\)/, "la primaria uscente non scende a secondaria da sola (§6)");
});

test("§25 — nessun writer attivo di athletes.data.siteId / site_id; la lettura legacy resta e basta", () => {
  for (const [file, codice] of [["src/lib/server/form-submissions.ts", pratiche], ["src/lib/simplified-db.ts", client], ["src/lib/server/athlete-category-memberships.ts", writer]]) {
    assert.doesNotMatch(codice, /data\.siteId\s*=|data\.site_id\s*=/, `${file} scrive una copia della sede in data`);
  }
  assert.match(writer, /site_id: _legacySiteId, siteId: _legacySiteIdCamel, \.\.\.senzaSedeLegacy/, "il writer toglie la copia legacy quando riscrive la proiezione");
  const sedi = senzaCommenti(leggi("src/lib/club-sites.ts"));
  assert.match(sedi, /push\(readSiteReference\(raw\.data\)\)/, "la lettura del dato precedente resta (deprecata, non cancellata)");
});
