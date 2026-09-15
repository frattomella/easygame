# Wave E — Audit di parità: Account (home account)

> Inventario funzionale dell'implementazione V1 sul branch `feat/web-redesign`,
> scritto **prima** della migrazione al Web V2. È il contratto di parità:
> niente sparisce. Nessuna proposta di design.
>
> Rotte coperte: `/account` (`src/app/account/page.tsx` →
> `src/components/account/account-home-screen.tsx`, 1611 righe),
> `/create-club` (`create-club-redirect.tsx` → `/account?openCreateClub=1`),
> `/profile/[userId]` (`redirect("/account?profile=1")`, resta com'è: PP-01
> §J). Componenti: `account-profile-dialog.tsx` (261),
> `account-create-club-dialog.tsx` (512), `account-redeem-access-dialog.tsx`
> (135), modello puro `account-shared.ts` (421). Vi arrivano il menu account
> del guscio (`Topbar`: «Profilo» → `/account?profile=1`, «I miei club» →
> `/account`), `MobileTopBar` e il cambio club della barra laterale.

---

## Guscio

Nessun `Sidebar`/`Header`: la pagina è **fuori dal club** e monta un proprio
header (`EasyGameWordmark`, «Assistenza» → `window.open("https://www.cedisoft.it/contatti/")`,
menu account con avatar/iniziali: nome + email, «Profilo account», «Assistenza»,
«Esci dall'account» → `signOut()`), su `bg-[var(--eg-paper)]`, contenuto
`max-w-6xl`. Senza utente (`!user?.id` a caricamento finito) →
`router.replace("/login")`.

## 1. Dati mostrati

- **Utente** (`useAuth().user`): `user_metadata.firstName/lastName/phone/avatarUrl/
  emailVerified/phoneVerified/clubSlotLimit/role`, `email`. Nome mostrato =
  «Nome Cognome» del modulo profilo, altrimenti `user_metadata.name`, poi
  email, poi «Utente EasyGame»; saluto «Ciao, {primo nome}» («EasyGamer» se
  vuoto).
- **Club** (`fetchMemberships(user.id)` → `GET /api/v1/auth/memberships`,
  classificati da `classifyMembershipResponse`): ogni tessera →
  `mapMembershipToClub` (`AccountClub`: id, nome, ruolo normalizzato e
  etichetta, `isPrimary`, logo, città, provincia, contatti, `createdAt`,
  `ownerId`, `membershipId` (null per ownership), `accessKind`
  `ownership|membership`, `accessKey`, stagione attiva (id ed etichetta da
  `normalizeClubSeasons(settings)`), `linkedAthleteId(s)`,
  `linkedProfiles[{kind: athlete|guardian|trainer, id, name}]`). Ordinati con
  `sortClubs` (primario in cima, poi alfabetico).
  - **Club di proprietà** = `accessKind === "ownership"`.
  - **Accessi assegnati** = il resto, escluse le tessere `owner` del creatore.
- **Hero**: occhiello «Home account», «Ciao, {nome}», testo «Da qui entri nei
  club che possiedi e in quelli dove ti hanno assegnato un accesso. Ogni club
  porta con se il suo ruolo e la sua stagione attiva.», immagine decorativa
  `/images/account/account-hero.png` (solo `xl`).
- **Riga club**: logo (o iniziali), nome, badge «Aperto» se `activeClub.id ===
  club.id`, badge ruolo («Proprietà» con corona per i propri club, altrimenti
  `roleLabel`), «città, provincia», etichetta stagione attiva, riga «{Tutore
  di | La tua scheda | Scheda allenatore | Profili collegati} {nomi}»
  (`etichettaProfili`; i nomi vanno a capo, `data-testid="profili-collegati"`).
- **Pannello proprietà**: titolo con contatore, «I club che hai creato e
  amministri come proprietario.», riga «{n} slot disponibili su {limite}» se
  `clubSlotLimit` (da `user_metadata.clubSlotLimit`, numero > 0).
- **Pannello accessi**: «I club dove qualcun altro ti ha dato un ruolo.».
- **Avvisi**: «Telefono non verificato» (warning; «Finché non verifichi il
  numero non potrai rientrare al prossimo accesso.») **sopra** «Email non
  verificata» (info; «Non abbiamo ancora confermato {email}. Puoi usare
  EasyGame lo stesso, ma un indirizzo non verificato non vale come prova della
  tua identità.»), ciascuno solo se non verificato (`user_metadata` o segno
  locale `verificatoOra`).
- Riga «Non conosci nessuna password di questo account — per esempio perché
  accedi con Google o Microsoft? **Ricevi un link per impostarla**. Serve per
  cambiare email o cellulare.» (sempre visibile, sotto gli avvisi).

## 2. Azioni

- **Apri club** (clic sulla riga): `POST /api/v1/auth/memberships/activate`
  `{organization_id, role, membership_id?, access_kind}` →
  `syncActiveClubLocally` (scrive `localStorage.activeClub` e
  `activeClub_{userId}`, `setActiveClub`, ricalcola `isPrimary`) →
  `getAccessRedirectPath(resolved_role, {organizationId, linkedAthleteId(s)})`
  → `router.push`; se il percorso è `/account` → toast «Accesso attivato, ma il
  profilo collegato non è disponibile»; errore → toast messaggio o «Errore
  cambio club attivo». Spinner sulla riga (`switchingClubId`).
- **Crea club** (pannello proprietà, stato vuoto, `?openCreateClub=1`) → dialogo.
- **Aggiungi accesso** / **Inserisci un token** → dialogo token.
- **Elimina accesso** (solo accessi assegnati, icona cestino, `aria-label`
  «Elimina l'accesso {ruolo} a {club}») → `window.confirm("Eliminare l'accesso
  {ruolo} a {club}? Il profilo collegato verra scollegato dal tuo account, ma
  non verra eliminato dal club.")` → `POST /api/v1/auth/memberships/delete`
  `{membership_id, organization_id, role}`; se era l'accesso attivo →
  rimuove `activeClub` dal `localStorage` e `setActiveClub(null)`; ricarica;
  toast «Accesso eliminato e profilo scollegato» / errore «Errore eliminazione
  accesso» / «Accesso assegnato non valido» se manca `membershipId`.
- **Verifica telefono / Verifica email** → `POST /api/v1/auth/verify/{channel}/send`
  `{userId}`; toast «Ti abbiamo inviato un codice via SMS/email.»; apre la
  casella del codice (anche su errore `RESEND_TOO_SOON`); **Conferma** →
  `POST /api/v1/auth/verify/{channel}/confirm` `{userId, code}` → toast
  «Telefono verificato»/«Email verificata» (errore: messaggio o «Codice non
  valido»); **Rimanda il codice** → nuovo send.
- **Ricevi un link per impostarla** → `POST /api/v1/auth/password/forgot`
  `{email}` → toast «Se serve, ti abbiamo scritto a {email}: apri il link per
  impostare una password.» (errore: messaggio o «Invio non riuscito»).
- **Riprova** (errore memberships): `loadMemberships()`.
- Menu account: **Profilo account** (dialogo), **Assistenza**, **Esci
  dall'account** (`signOut`).
- **Ricerca** (`Cerca per nome, citta o ruolo`, solo con ≥5 club totali):
  filtra entrambi i pannelli su nome, città, provincia, etichetta ruolo.

## 3. Moduli

### Profilo account (`AccountProfileDialog`, modale)

| Campo | Controllo | Valore iniziale |
|---|---|---|
| Immagine | `AvatarUpload` (+ «Rimuovi immagine») | `user_metadata.avatarUrl` |
| Nome (`profile-first-name`) / Cognome (`profile-last-name`) | `Input` | metadata |
| Email di accesso (`profile-email`, `type=email`) | `Input` | `user.email` |
| Cellulare (`profile-phone`, `type=tel`) | `Input` | metadata |
| Password attuale (`profile-current-password`, `current-password`) | placeholder «Serve per cambiare email, cellulare o password» | `""` |
| Nuova password (`profile-new-password`) | placeholder «Lascia vuoto se non vuoi cambiarla» | `""` |
| Conferma password (`profile-confirm-password`) | placeholder «Ripeti la nuova password» | `""` |

Badge «Email verificata / Email da verificare», «Cellulare verificato /
Cellulare da verificare»; tre riquadri: «Sicurezza — Cambiando email o
cellulare, EasyGame richiede una nuova verifica.», «Stato account — Ruolo
base: {user_metadata.role || "user"}», «Club attivo — {nome | Nessun club
attivo selezionato}». Pulsanti «Chiudi», «Salva profilo».

Validazione (`saveProfile`): `newPassword !== confirmPassword` → «Le password
non coincidono»; se cambia email, cellulare o password e manca la password
attuale → «Per cambiare email, cellulare o password serve la password attuale.
Se non ne hai una, usa «Ricevi un link per impostarla».». Submit:
`supabase.auth.updateUser({ email, password?, currentPassword? (solo se
serve), data: {firstName, lastName, phone, avatarUrl|null} })` →
`PATCH /api/v1/auth/user`. Successo: azzera le password, chiude, toast
«Profilo aggiornato. Email e telefono richiederanno una nuova verifica.» (se
cambiati) o «Profilo aggiornato correttamente»; errore: messaggio o «Errore
aggiornamento profilo». **Nessuna credenziale in `localStorage`** (test
`credenziali-fuori-dal-browser`).

### Crea club (`AccountCreateClubDialog`, modale a 6 schede `CREATE_CLUB_TABS`)

Stato `ClubCreateFormState` (`createClubDefaults(user)`: `type "Dilettante"`,
`country/legalCountry "Italia"`, `contactEmail/contact1Email = user.email`,
`contactPhone/contact1Phone = metadata.phone`).

- **Generali**: Nome club\* (`club-name`, «Es. EasyGame Academy»), Tipologia\*
  (`club-type`, «Es. Dilettante», chip preset `CLUB_TYPE_PRESETS`), Anno
  fondazione (`number`, «Es. 2012»), Indirizzo\* (`club-address`),
  `AssistedAddressFields idPrefix="club"` (CAP, città, provincia, regione,
  paese). **Nascosto** (`className="hidden"`): `LogoUpload` (logo), «Campi
  chiave», «Slot account» — codice presente ma non raggiungibile.
- **Dati fiscali**: Ragione sociale, PEC (`email`), Partita IVA, Codice
  fiscale, Regime fiscale, Codice ATECO, Codice SDI; «Sede legale e
  rappresentante»: Indirizzo sede legale (`legal-address`), Città/CAP/Regione/
  Provincia/Paese sede legale, Nome/Cognome/Codice fiscale rappresentante.
- **Dati bancari**: Nome banca, IBAN.
- **Contatti**: Email contatto\* (`email`), Telefono contatto\*; «Contatto
  amministrativo» (Nome contatto, Telefono, Email); «Secondo contatto» (idem —
  etichette ripetute, id unici via `useId`).
- **Federazione**: elenco `federations[]` (Federazione con chip
  `FEDERATION_PRESETS`, Numero iscrizione, Data affiliazione `date`,
  Rimuovi), «Aggiungi federazione», vuoto «Nessuna affiliazione inserita per
  ora.».
- **Social**: Sito web, Facebook, Instagram, X / Twitter, YouTube.

Validazione (`createOwnedClub`): slot esauriti → «Hai esaurito gli slot
disponibili per i club»; `CREATE_CLUB_REQUIRED_FIELDS` (nome, tipologia,
indirizzo, città, provincia, email e telefono di contatto) → apre la scheda
del primo mancante (`setCreateClubTab(missing[0].tab)`) e toast «Manca ancora
un dato obbligatorio: X.» / «Mancano ancora N dati obbligatori: X, Y.».
Submit: `POST /api/v1/clubs` `{mode: "create", data: buildClubPayload(form,
user, shouldBePrimary)}` (`shouldBePrimary` = nessun club) → il club creato
diventa attivo (`syncActiveClubLocally(createdSummary)`), ricarica, reset,
toast «Club {nome} creato. Ti accompagniamo nella configurazione iniziale.»,
`router.push("/onboarding")`. Errore: messaggio o «Errore creazione club».
Pulsanti «Chiudi», «Crea club».

### Aggiungi accesso (`AccountRedeemAccessDialog`)

Campo **Token** (`access-token`, «Es. EGCLUB8H2K9», maiuscolo). Testo: «Inserisci
il token che il club ti ha condiviso. Se il token e valido e non scaduto, il
ruolo viene aggiunto al tuo account.», «Il token puo avere una scadenza…».
Vuoto → «Inserisci il token condiviso dal club». Submit: `POST
/api/v1/auth/access/redeem` `{token}` → la tessera diventa attiva se
`isPrimary` o nessun club attivo; ricarica; toast «Accesso aggiunto
correttamente al tuo account» / «Errore collegamento al club». Tre riquadri
informativi **nascosti** (`hidden`).

### Casella del codice di verifica (`VerificationNotice`)

`Codice a 6 cifre` (`inputmode numeric`, `one-time-code`, `maxLength 6`),
«Conferma» (disabilitato senza codice), «Rimanda il codice».

## 4. Filtri / ricerca / viste

Solo la ricerca testuale (≥5 club). Nessun filtro, vista o colonna.

## 5. Selezione multipla / azioni di massa

Nessuna.

## 6. Export / import

Nessuno.

## 7. Permessi

Pagina personale: serve solo la sessione (`user.id`), nessun ruolo. **Nessun
predicato client**; «Elimina accesso» solo sugli accessi assegnati (non sulla
proprietà, che non ha `membershipId`). Server: le rotte `auth/*` sono
personali; `POST /api/v1/clubs` crea con `memberships: [{role: "owner"}]`.

## 8. Stati (con il testo)

- Loading: `PanelSkeleton` (3 righe) in entrambi i pannelli mentre
  `loading || membershipsStatus === "loading"`.
- Errore bloccante (`error` senza dati già caricati): «Non riusciamo a
  caricare i tuoi club» + messaggio (o «Si e verificato un errore durante il
  caricamento. Nessun dato e stato modificato.») + **Riprova**.
- Errore non bloccante (con dati): banner `role="alert"` «Aggiornamento dei
  club non riuscito: i dati mostrati potrebbero non essere aggiornati.» +
  Riprova; toast dell'errore.
- Vuoto proprietà: «Non hai ancora creato un club» / «Crea il tuo club:
  bastano nome, sede e contatti, il resto si completa dopo.» / «Crea un club».
- Vuoto accessi: «Nessun accesso assegnato» / «Se una societa ti ha invitato,
  inserisci il token che ti ha condiviso.» / «Inserisci un token».
- Ricerca senza esito (pannello con club): «Nessun club corrisponde alla ricerca.».
- Riga: «Aperto» (club attivo), spinner in cambio, spinner in eliminazione.
- Verifiche: pending sul pulsante; casella aperta.

## 9. Flussi distruttivi

**Elimina accesso**: `window.confirm` (vedi §2) → `POST /api/v1/auth/memberships/delete`.
Nessun altro.

## 10. Navigazione e parametri

In entrata: `?openCreateClub=1` (apre Crea club; poi `history.replaceState` a
`/account`), `?profile=1` (apre Profilo; idem). `/create-club` → redirect a
`/account?openCreateClub=1` («Reindirizzamento alla home account...»);
`/profile/[userId]` → `/account?profile=1`. In uscita: `/login` (senza
sessione), il percorso del ruolo (`getAccessRedirectPath`), `/onboarding`
(dopo la creazione), il sito di assistenza (nuova scheda).

## 11. Schede/sezioni

Due pannelli affiancati (`xl:grid-cols-2`); il dialogo Crea club ha sei schede.

## 12. Test collegati

- `tests/ui/account-onboarding-and-admin.test.mjs` — legge
  `account-home-screen.tsx`: niente esadecimali, `font-display`, `var(--eg-`;
  `function PanelSkeleton`, `function PanelEmptyState`, `membershipsStatus ===
  "error" && !hasLoadedMemberships`, `role="alert"`;
  `router.push("/onboarding")`, `syncActiveClubLocally(createdSummary);`.
- `tests/ui/avvisi-recapito-non-verificato.test.mjs` — stesso file: i due
  `title=`/`ctaLabel=`, i testi delle conseguenze, ordine telefono < email,
  `{!phoneVerified ? (<VerificationNotice`, `Ricevi un link per impostarla` +
  `requestPasswordLink` dopo l'avviso email; corpo di `VerificationNotice`
  con `flex flex-wrap items-center gap-3`, `min-w-0 flex-1`, `flex flex-col
  gap-2 sm:flex-row`, nessuna `w-[NNNpx]`, un solo componente, niente hex.
- `tests/ui/club-create-dialog.test.mjs` — `account-create-club-dialog.tsx`:
  `useId`, `campo-${generatedId}`, due `label="Nome contatto"`;
  `account-shared.ts`: `CREATE_CLUB_REQUIRED_FIELDS`/`CREATE_CLUB_TABS`; home
  screen: `const missing = CREATE_CLUB_REQUIRED_FIELDS.filter(`,
  `setCreateClubTab(missing[0].tab);`, `missing.length === 1`,
  `.map((entry) => entry.label)`.
- `tests/ui/pp-01-superfici.test.mjs` §J — home screen contiene
  `params.get("profile") === "1"`; `/profile/[userId]` resta un redirect.
- `tests/server/profili-collegati-account.test.mjs` — home screen:
  `data-testid="profili-collegati"`, legge `club.linkedProfiles`, nessun
  `truncate` nel blocco, `break-words`.
- `tests/ui/topbar-club-vs-platform.test.mjs` — `components/account/` è una
  superficie d'identità: nessuna `text-[NNpx]` salvo i file elencati in
  `WEB_V2_SURFACES`.
- `tests/auth/credenziali-fuori-dal-browser.test.mjs` — le chiavi
  `activeClub` / `activeClub_${}` scritte qui sono dichiarate; nessuna
  credenziale in un archivio del browser.

## 13. Inventario componenti

Condivisi (si riusano): `AvatarUpload`, `LogoUpload`, `AssistedAddressFields`,
`EasyGameWordmark` (identità), `useAuth`, `useToast`; lib: `apiRequest`,
`fetchMemberships`, `classifyMembershipResponse`, `getAccessRedirectPath`,
`getAccessRoleLabel`, `supabase.auth.updateUser`, `account-shared.ts`
(modello puro, resta). Specifici della rotta (si rimuovono): i tre dialoghi,
`ClubRow`, `ClubAvatar`, `RoleBadge`, `AccessPanel`, `PanelSkeleton`,
`PanelEmptyState`, `InputWithLabel`, `CardPanel`, il `window.confirm`,
l'immagine hero.

## Cosa non esiste in V1

Nessuna modifica di un club dalla home (vive in `/organization`); nessuna
cancellazione di un club di proprietà; nessun cambio di club primario
esplicito (il primario è l'ultimo aperto).

## Sintesi

1. Una pagina personale fuori dal club: due elenchi di tessere (proprietà,
   assegnate), tre moduli (profilo, nuovo club a sei schede, token) e due
   avvisi di verifica con la casella del codice in linea.
2. Sette endpoint `auth/*` + `POST /api/v1/clubs`, tutti via `apiRequest` o
   l'adapter `supabase`; l'attivazione scrive `localStorage.activeClub`.
3. Un solo flusso distruttivo (eliminare un accesso assegnato) con `window.confirm`.
4. Difetti V1: logo del club e riquadri informativi montati ma `hidden`;
   nessuna guardia dirty sui tre moduli; il modale Crea club è un modale
   lungo a schede (deprecato).
