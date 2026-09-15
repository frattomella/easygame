# Wave E — Audit di parità: Ruoli e accessi

> Inventario funzionale dell'implementazione V1 sul branch `feat/web-redesign`,
> scritto **prima** della migrazione al Web V2 (Addendum del brief). È il
> contratto di parità: niente sparisce. Nessuna proposta di design.
>
> Rotta coperta: `/dashboard/access-management` («Ruoli e accessi» nella
> barra laterale, gruppo *Impostazioni*; il nome della voce è fissato da
> PP-01 §M). File: `src/app/dashboard/access-management/page.tsx` (967
> righe, un solo componente di pagina più `EditorAssegnazione` inline).
> Domini letti per capire cosa il server accetta e rifiuta:
> `src/lib/access-roles.ts`, `src/lib/roles/custom-role.ts`,
> `src/lib/roles/access-scope.ts`, `src/lib/permissions/catalog.ts`,
> `src/lib/server/club-roles.ts`, le rotte `src/app/api/v1/club-roles/**`.
>
> Metodo: lettura integrale della pagina, delle librerie importate, delle
> quattro rotte HTTP e dei test che citano la pagina.

---

## Guscio

Il layout `src/app/dashboard/layout.tsx` monta `AccessAreaGuard`, `Sidebar`,
`DashboardChrome` (topbar; **nessuna banda di cielo** su questa rotta:
`isClubDashboardRoute` la esclude) e il `main`. La pagina si limita a
`DashboardPageContainer` + `SharedPageHeader title="Gestione accessi"
subtitle="Chi entra in questo club, con quale ruolo e su quale perimetro."
eyebrow="Sicurezza"`. Il titolo di pagina («Gestione accessi») e la voce di
menu («Ruoli e accessi») non coincidono in V1.

## 1. Dati mostrati

Una sola lettura: `apiRequest("/api/v1/club-roles/assignments")` →
`{ assignments, roles, scope_options, creator_user_id }` (l'ultimo non è
letto dalla pagina).

**`roles[]`** (`RuoloDiClub`): `id, slug, name, description|null, base_role,
base_role_label, is_active, permissions[], permission_labels[{key,label}],
contains_direction_keys, assigned_count`. Per ogni ruolo una card:

- nome + badge «da {base_role_label}» + badge «contiene permessi di
  direzione» (se `contains_direction_keys`) + badge rosso «disattivato» (se
  `!is_active`);
- descrizione (se presente);
- riga «{n} permessi · {n} persone · `{slug}`» (slug in monospazio);
- riga «**Oltre alle caselle**, il ruolo base porta: {PERIMETRO_DEL_RUOLO_BASE[base]}»
  (testo per `club_manager`, `collaborator`, `staff`, `trainer`; `—` se la
  base non è nota);
- una nuvola di badge con **tutte** le `permission_labels` (`title` = la
  chiave).

**`assignments[]`** (`Assegnazione`): `membership_id, user_id, email, name,
role, role_label, is_owner, custom_role_id, custom_role_name, permissions[],
scopes[{kind:"site"|"category", value}]`. L'API manda anche `is_primary` e
`granted_at`, che la V1 non mostra. Per ogni persona una card:

- nome (o email se il nome manca) + email;
- badge del ruolo (`role_label`; variante piena se `is_owner`);
- un badge per ogni voce di perimetro «Sede: {label}» / «Categoria: {label}»
  (etichetta risolta da `scope_options`, altrimenti il valore grezzo), oppure
  il badge «Tutto il club» quando `scopes` è vuoto.

**`scope_options`**: `{ site: [{id,label}], category: [{id,label}] }`, usate
per le etichette e per l'editor del perimetro.

**Ordine**: quello del server (`is_primary desc, created_at asc` per le
tessere; i ruoli come li dà `caricaRuoli`). Nessun ordinamento client.

## 2. Azioni

Intestazione (sotto il titolo):
- **Registro delle operazioni** (`Link` → `/audit`, `ScrollText`), **solo se**
  `roleHasPermission(ruoloAttivo, "audit.read")`.
- Paragrafo informativo: «Chi entra per la prima volta riceve un invito dalla
  propria scheda (atleta, allenatore, socio): il ruolo si assegna qui, dopo
  che l'accesso e stato accettato.»

Card «Ruoli del club» (intestazione), **solo se `sonoProprietario`**:
- **Clona «Segreteria»** e **Clona «Direttore Sportivo»** → aprono l'editor
  con la bozza del preset (`PRESET[].bozza`, `id: null`);
- **Nuovo ruolo** (`Plus`) → editor con `BOZZA_VUOTA` (`baseRole:
  "collaborator"`, nessuna chiave).
- Se non proprietario: testo «Creare e modificare un ruolo e riservato al
  proprietario del club.»

Per ruolo (**solo se `sonoProprietario`**): **Modifica** → editor con
`{id, name, description, baseRole: base_role, permissions}`; **Elimina**
(icona `Trash2`, rosso) → dialogo di conferma.

Card «Persone con accesso», per persona (nessun predicato client):
- **Ruolo e perimetro** (`UserCog`) → apre/chiude inline `EditorAssegnazione`
  sotto la card (uno alla volta: `inModifica`);
- **Revoca** (rosso) → dialogo di conferma.

## 3. Moduli

### Editor di ruolo (card «Nuovo ruolo» / «Modifica ruolo», inline sotto i ruoli)

Stato `Bozza = { id, name, description, baseRole, permissions[] }`.

| Campo | Controllo | Validazione client | Valore iniziale |
|---|---|---|---|
| Nome (`nome-ruolo`) | `Input`, placeholder «Segreteria» | nessuna (il server: `validateCustomRoleDraft` → nome obbligatorio, slug derivato, unicità «Esiste gia un ruolo «X» in questo club») | `""` / nome del ruolo / nome del preset |
| Parte da (`base-ruolo`) | `<select>` su `CUSTOM_ROLE_BASE_ROLES` (`club_manager, collaborator, staff, trainer`, etichette `getAccessRoleLabel`); **disabilitato in modifica** | cambiare la base **azzera** `permissions` | `collaborator` / `base_role` |
| nota sotto | in modifica: «Il ruolo di partenza non si cambia: cambierebbe i permessi di chi lo porta gia. Si crea un ruolo nuovo.»; in creazione: «Il ruolo personalizzato potra avere al massimo i permessi di quello scelto qui.» | | |
| Descrizione (`descrizione-ruolo`) | `Textarea rows=2`, placeholder «A cosa serve questo ruolo nel club» | nessuna | `""` / descrizione |
| Permessi | una sezione per dominio (`ETICHETTE_DOMINIO`), caselle in griglia `sm:grid-cols-2`; ogni casella: etichetta + chiave in monospazio + « · direzione» se `isDirectionPermission(key)` | l'elenco è `listGrantablePermissions(baseRole)` = chiavi del catalogo che appartengono alla base, **senza** le tre chiavi di legame (`consents.decide_own`, `documents.submit_own`, `rsvp.answer`) | spuntate = `bozza.permissions` |

Pulsanti: **Salva ruolo** (spinner `Loader2`, `disabled={salvataggio}`),
**Annulla** (chiude l'editor senza chiedere). Nessuna guardia sulle
modifiche non salvate.

Submit: corpo `{ name, description, base_role, permissions }` →
`POST /api/v1/club-roles` (nuovo) o `PATCH /api/v1/club-roles/{id}`
(modifica). Errore → toast `risposta.error.message`; successo → toast
«Ruolo aggiornato» / «Ruolo creato», editor chiuso, ricarica.

Server (`createClubRole`/`updateClubRole`): solo proprietario
(`OWNER_ONLY_ACTIONS.clubRoleCreate/Update`, altrimenti «Accesso negato:
soltanto il proprietario…»); `validateCustomRoleDraft` (base ammessa,
chiavi sottoinsieme della base, niente chiavi di legame); unicità del nome.

### Preset (§24 del mandato)

`PRESET`: **Segreteria** (base `collaborator`, 15 chiavi:
`documents.templates.read, documents.generate, documents.generated.read,
documents.generated.advance, documents.request, documents.review,
documents.read_dossier, appointments.read, appointments.read_own,
appointments.manage, consents.decide_for_others, consents.records.read,
members.register.read, clinical.status_read, accounts.athlete.manage`;
descrizione «Anagrafiche, fascicolo documentale, appuntamenti e consensi
delle famiglie.») e **Direttore Sportivo** (base `staff`, 7 chiavi:
`events.read, events.manage, events.convoke, events.attendance, rsvp.read,
clinical.status_read, appointments.read_own`; descrizione «Programmazione
sportiva: calendario, convocazioni, appello e risposte delle famiglie.»).
Sottotitoli dei pulsanti: «Atleti, documenti, iscrizioni, appuntamenti e
consensi. Niente compensi, niente proprieta.» / «Atleti, allenatori, eventi,
gare e programmazione. Niente pagamenti, niente contabilita.» (nella V1 sono
nel dato ma **non** mostrati). `tests/ui/wave6-superfici-6g.test.mjs`
verifica che ogni chiave dei preset appartenga alla base e che Segreteria
non porti `sport_work.*` e Direttore non porti `documents.review`.

### Editor di assegnazione (`EditorAssegnazione`, inline sotto la persona)

| Campo | Controllo | Valore iniziale |
|---|---|---|
| Ruolo (`ruolo-{membership_id}`) | `<select>` con `optgroup` «Ruoli standard» (`club_manager, collaborator, staff, trainer`) e «Ruoli del club» (i ruoli con `is_active`, valore = `slug`) | `persona.role` |
| Sedi | una casella per `opzioni.site` | spuntate = `scopes` con `kind: "site"` |
| Categorie | una casella per `opzioni.category` (`max-h-48 overflow-y-auto`) | spuntate = `scopes` con `kind: "category"` |
| nota | «Nessuna casella spuntata significa **tutto il club**. Con una o piu caselle il perimetro vale su **atleti**, **allenamenti e gare** e **documenti**: gli altri elenchi del club restano completi.» | |

I due blocchi sedi/categorie compaiono solo se le rispettive opzioni non
sono vuote. Pulsante **Salva accesso** → `POST /api/v1/club-roles/assignments`
con `{ user_id, role, scopes }` (il perimetro si scrive per **sostituzione**;
`[]` = tutto il club). Errore → toast del server; successo → toast «Accesso
aggiornato per {name||email}», editor chiuso, ricarica. Nessuna validazione
client, nessuna guardia dirty.

Server (`assignClubRole`): chi amministra gli accessi (`club_manager`/`owner`
**canonici**, mai un ruolo personalizzato); «un accesso non si concede a se
stessi»; il ruolo di club deve esistere ed essere attivo; `assertMayGrantRole`
(tetto del concedente; un ruolo con chiavi di direzione lo assegna solo il
proprietario); il perimetro concesso dev'essere dentro il proprio
(`accessScopeContains`); il fondatore del club non si restringe; un ruolo
alla volta per persona (assegnare **sostituisce** le altre tessere).

## 4. Filtri / ricerca / viste

**Nessuno**: due elenchi piatti, nessuna ricerca, nessuna colonna
configurabile.

## 5. Selezione multipla / azioni di massa

Nessuna.

## 6. Export / import

Nessuno.

## 7. Permessi (chiave/predicato esatto)

- Rotta in `MANAGEMENT_ADMIN_ONLY_PATH_PREFIXES` (`access-roles.ts`): la
  raggiungono solo i ruoli amministrativi canonici; un `custom:*` è escluso
  (`canAccessPath`, test `presidi-che-nessuno-copriva`, `ruoli-personalizzati`).
- `ruoloAttivo = readStoredActiveClub()?.role || ""` (letto una volta, `useMemo`).
- `sonoProprietario = isOwnerActor(ruoloAttivo)` → Clona/Nuovo/Modifica/
  Elimina ruolo (V1: **assenti**, con il testo «riservato al proprietario»).
- `roleHasPermission(ruoloAttivo, "audit.read")` → link «Registro delle
  operazioni» (**assente** senza la chiave).
- Assegnare/revocare: **nessun predicato client**; il server pretende
  `assertPuoAmministrareAccessi` (ruolo canonico con
  `canManageClubConfiguration`, cioè `owner`/`club_manager`) e risponde 403 con
  `Accesso negato: …`.
- Il **modello**: un ruolo di club è un **sottoinsieme** della base
  (ADR-0102); zero righe di perimetro = tutto il club (ADR-0103).

## 8. Stati (con il testo)

- Loading: «Carico i ruoli…» / «Carico gli accessi…» con `Loader2`.
- Errore di lettura: card rossa con `risposta.error.message` (gli elenchi
  restano vuoti).
- Ruoli vuoti: «Nessun ruolo personalizzato. I sette ruoli standard restano
  disponibili: un ruolo personalizzato serve quando a una persona vanno
  concessi **meno** permessi di quelli del suo ruolo, mai di piu.»
- Accessi vuoti: «Nessun accesso registrato per questo club.»
- Stato del ruolo: badge «disattivato» solo se `!is_active` (nessuna azione
  lo cambia dalla pagina); «contiene permessi di direzione».
- Perimetro: «Tutto il club» oppure le voci.
- Salvataggio ruolo: `salvataggio` (spinner nel pulsante).

## 9. Flussi distruttivi e conferme

- **Cancella ruolo**: `AlertDialog` «Cancellare il ruolo «{name}»?» / «Un
  ruolo assegnato non si puo cancellare: prima va revocato alle persone che
  lo portano.» / Annulla · Cancella → `DELETE /api/v1/club-roles/{id}`. Il
  server rifiuta se assegnato («Il ruolo «X» e assegnato a N persone:
  revocalo prima di cancellarlo»). Successo → toast «Ruolo «{name}»
  cancellato», ricarica.
- **Revoca accesso**: `AlertDialog` «Revocare l'accesso a {name||email}?» /
  «La persona non potra piu entrare in questo club. L'operazione resta nel
  registro.» / Annulla · Revoca → `DELETE /api/v1/club-roles/assignments/{membership_id}`.
  Server: non il proprio accesso, non il fondatore, il proprietario solo da un
  proprietario; ripulisce i riferimenti (`profile-account-links`). Successo →
  toast «Accesso revocato», ricarica.
- Nessun `window.confirm` (fissato dal test wave6).

## 10. Navigazione, parametri, deep link

In entrata: nessun parametro letto. In uscita: `/audit` (se `audit.read`).
Vi arrivano `ClubPersonAccessCard` (schede atleta/allenatore/socio) e la
barra laterale.

## 11. Schede/sezioni

Nessuna: tre card impilate (Ruoli del club · editor di ruolo se aperto ·
Persone con accesso).

## 12. Test collegati

- `tests/ui/wave6-superfici-6g.test.mjs` — legge la pagina **senza
  commenti**: niente `@example.com`, `Math.random`, `access_tokens` nel
  codice; `/api/v1/club-roles/assignments` e `apiRequest(` presenti, nessun
  `fetch(`; conferma con «AlertDialog» e non `confirm(`; ≥15 chiavi di
  catalogo citate; nessuna chiave di legame; le chiavi dei preset
  appartengono alla base (blocchi delimitati da `titolo: "Segreteria"`,
  `titolo: "Direttore Sportivo"`, `export default function`);
  `roleHasPermission(ruoloAttivo, "audit.read")` letterale; nessuna
  `grid-cols-N` senza breakpoint; nessuna `w-[NNNpx]`.
- `tests/ui/accessi-persone-schede.test.mjs` — la card d'accesso rimanda a
  `/dashboard/access-management` (non tocca la pagina).
- `tests/ui/navigazione-sotto-1024-e-768.test.mjs`, `tests/web/shell-navigation.test.mjs`,
  `tests/ui/dashboard-v2-parity.test.mjs` — la voce di menu e la rotta.
- `tests/auth/route-guards.test.mjs`, `tests/lib/presidi-che-nessuno-copriva.test.mjs`,
  `tests/lib/ruoli-personalizzati.test.mjs` — la guardia di rotta.
- `scripts/pp-02-censimento.mjs` — la pagina è censita (`impatto:
  presentazione`) perché il suo commento storico nomina `access_tokens`.

## 13. Inventario componenti

Importati: `DashboardPageContainer`, `SharedPageHeader`, `AlertDialog*`,
`Badge`, `Button`, `Card*`, `Checkbox`, `Input`, `Label`, `Textarea`,
`useToast`, `Link`; lib: `apiRequest`, `readStoredActiveClub`,
`CUSTOM_ROLE_BASE_ROLES`, `getAccessRoleLabel`, `normalizeAccessRole`,
`roleHasPermission`, `PermissionDomain`, `isDirectionPermission`,
`isOwnerActor`, `listGrantablePermissions`, `AccessScopeEntry`.

Specifici della rotta (si rimuovono con la V1): `EditorAssegnazione`, le
costanti `ETICHETTE_DOMINIO`, `PERIMETRO_DEL_RUOLO_BASE`, `PRESET`,
`BOZZA_VUOTA` e i tipi locali (si spostano nel modello V2). Nessun
componente condiviso con altre rotte.

## Sintesi

1. Una lettura (`GET /api/v1/club-roles/assignments`) e quattro scritture
   (`POST`/`PATCH`/`DELETE /api/v1/club-roles[/{id}]`, `POST /api/v1/club-roles/assignments`,
   `DELETE /api/v1/club-roles/assignments/{id}`), tutte via `apiRequest`.
2. Due elenchi senza filtri, ricerca, selezione o export.
3. Due moduli inline (ruolo, assegnazione) senza validazione client e senza
   guardia dirty; due conferme `AlertDialog`.
4. Predicati client: `isOwnerActor` (ruoli), `roleHasPermission(…,
   "audit.read")` (registro); assegnazioni senza predicato client.
5. Stati: attivo/disattivato del ruolo, «Tutto il club» del perimetro,
   «contiene permessi di direzione».
