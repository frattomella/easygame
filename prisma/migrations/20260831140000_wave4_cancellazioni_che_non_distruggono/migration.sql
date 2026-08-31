-- ===========================================================================
-- Due cancellazioni che distruggevano piu di quello che chiedevano
-- ===========================================================================
--
-- Il filo comune, trovato da un audit su export e cancellazione: **ogni
-- guardia di questo prodotto e scritta sul nome della risorsa che si
-- cancella, mentre Postgres distrugge per raggiungibilita.** Le guardie
-- fiscali sanno rifiutare `DELETE /api/v1/invoices/<emessa>`; non sanno niente
-- di cio che una cancellazione due livelli piu su si porta dietro.
--
-- ---------------------------------------------------------------------------
-- 1. Cancellare una persona pubblicava le sue notifiche
-- ---------------------------------------------------------------------------
--
-- `notifications.user_id` era `ON DELETE SET NULL`. Ma in questo modello
-- `user_id = NULL` significa «di societa», e l'area genitore lo legge come
-- **«di tutti»**: `getParentDashboardData` interroga
-- `OR: [{ user_id: userId }, { user_id: NULL }]` e restituisce la riga intera,
-- campo `data` compreso.
--
-- Cancellare l'account di una segretaria — la normale uscita di una persona, o
-- una richiesta di cancellazione — trasformava quindi **ogni** notifica mai
-- indirizzata a lei in una notifica per tutte le famiglie del club: nome del
-- genitore, indirizzo, telefono, nome del minore, motivo dell'appuntamento,
-- importi scoperti. La cancellazione pubblicava i dati invece di toglierli.
--
-- La dodicesima tornata aveva dato un proprietario a questa regola e corretto
-- i tre scrittori applicativi. Il quarto scrittore era il **database**, e
-- nessun modulo poteva vederlo.
--
-- Una notifica indirizzata a qualcuno che non c'e piu non ha nessun
-- significato residuo: se ne va con lui.

ALTER TABLE "notifications"
  DROP CONSTRAINT IF EXISTS "notifications_user_id_fkey";
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Le righe gia orfane non si possono attribuire a nessuno — l'informazione di
-- chi fossero e stata distrutta dal vincolo precedente — ma **non devono
-- restare leggibili da tutti**. Restano solo quelle che un club ha scritto
-- deliberatamente come «di societa», che sono quelle con un `organization_id`
-- e un tipo di dominio; le altre erano private e adesso non sono di nessuno.
--
-- Non si cancella niente qui: dire quali righe fossero private e quali di
-- societa non e piu possibile, e cancellare in blocco distruggerebbe anche
-- avvisi legittimi. La bonifica, se il club la vuole, e una decisione sua.

-- ---------------------------------------------------------------------------
-- 2. Cancellare un atleta distruggeva l'attribuzione di denaro pubblico
-- ---------------------------------------------------------------------------
--
-- La catena: `athletes` -> `funding_accruals` (CASCADE) ->
-- `funding_settlement_lines` (CASCADE). Cancellare un atleta — cosa che la
-- **segreteria** puo fare, perche `athletes` non e fra le risorse riservate —
-- si portava via le righe che attribuiscono una liquidazione gia erogata.
--
-- La testata della liquidazione sopravvive con l'importo intero versato
-- dall'ente; le righe che lo giustificano spariscono. Il totale «liquidato»
-- non si puo piu attribuire a nessuno, e la riconciliazione che il club
-- consegna al finanziatore perde beneficiari **in silenzio**. Lo dice gia lo
-- schema di quel modello: «senza queste righe "liquidato" sarebbe un totale
-- che non si puo attribuire a nessuno».
--
-- `RESTRICT` puo mordere solo dove esistono righe liquidate: l'unico percorso
-- applicativo che cancella i maturati e quello «nessuno storico», che per
-- costruzione non ne ha.

ALTER TABLE "funding_settlement_lines"
  DROP CONSTRAINT IF EXISTS "funding_settlement_lines_accrual_id_fkey";
ALTER TABLE "funding_settlement_lines"
  ADD CONSTRAINT "funding_settlement_lines_accrual_id_fkey"
  FOREIGN KEY ("accrual_id") REFERENCES "funding_accruals" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
