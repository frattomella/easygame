/**
 * **L'attore di sistema: chi agisce quando non agisce nessuno.**
 *
 * ---
 *
 * ## Il difetto che chiude
 *
 * `training-automation.ts` generava allenamenti scrivendo **a mano**
 * `clubs.trainings`. Quella colonna e pero una proiezione in sola lettura con
 * uno scrittore solo (ADR-0098), e il registro generico la difende in due
 * punti — `CLUB_PROJECTED_FIELDS` e `assertNotDomainOwnedModel`. La
 * generazione era l'unica porta che quella difesa la aggirava, e le
 * conseguenze erano due: cio che generava non aveva una riga in `club_events`,
 * quindi presenze, convocazioni e RSVP rispondevano «Evento non trovato»; e la
 * prima proiezione successiva lo **cancellava**, senza errore e senza audit.
 *
 * La correzione ovvia — far passare la generazione dal comando canonico — si
 * ferma subito su una domanda che il prodotto non aveva mai dovuto rispondere:
 * **con quale autorita scrive un lavoro che nessuno ha chiesto?** Il comando
 * pretende uno scope, e uno scope nasce da una sessione. Il cron non ne ha una.
 *
 * ## Le tre risposte sbagliate
 *
 * 1. **Fingere il proprietario.** Uno scope con `activeRole: "owner"` passa
 *    ogni guardia, e da quel momento l'audit dice che un essere umano ha fatto
 *    una cosa che non ha fatto. Un registro che mente su chi ha agito e peggio
 *    di un registro assente, perche lo si crede.
 * 2. **Un cancello globale.** Un `if (isSystem) return;` dentro le guardie
 *    trasforma «il sistema puo fare questa cosa» in «il sistema puo fare
 *    tutto», e la seconda non e mai stata decisa da nessuno.
 * 3. **Coniare una sessione.** Un utente di servizio con una password e un
 *    gettone e una credenziale in piu da custodire, e una identita che puo
 *    accedere anche da fuori.
 *
 * ## La forma scelta
 *
 * Un contesto **esplicito**, che non e un ruolo e non e un'utenza:
 *
 * - **vive solo sul server.** Non nasce da una richiesta, non si serializza
 *   verso il browser, non ha un gettone;
 * - **e legato a un club solo.** `organizationId` e obbligatorio, e chi lo
 *   riceve confronta quel valore con il club su cui sta per scrivere: un
 *   contesto di un club non puo toccare un altro club;
 * - **porta un elenco chiuso di capacita.** Non «il sistema», ma «questo
 *   lavoro, per questa cosa». Una capacita nuova si dichiara qui, e un dominio
 *   che non la riconosce continua a rifiutare;
 * - **la traduzione capacita → permesso vive nel dominio che concede**, non
 *   qui. Questo modulo dice *chi* sta agendo; e `events.ts` a dire quali dei
 *   **suoi** permessi la capacita `training_automation.generate` puo
 *   esercitare, e sono uno solo. Cosi non esiste un posto in cui aggiungere
 *   una capacita apra qualcosa che il suo dominio non ha approvato.
 *
 * ## Cio che questo modulo **non** e
 *
 * Non e un'autorizzazione. Non risponde «puo?»: risponde «chi e, e cosa ha
 * dichiarato di voler fare». A rispondere «puo?» resta ogni dominio, con le
 * guardie che ha gia — ed e per questo che il comando canonico continua a
 * possedere validazione e persistenza (CLAUDE.md §2).
 */

/**
 * **Le capacita che un lavoro di sfondo puo esercitare. Elenco chiuso.**
 *
 * La regola per aggiungerne una: deve nominare **un'azione**, non un dominio.
 * `training_automation.generate` va bene; `events.write` no, perche sarebbe il
 * cancello globale scritto in un'altra grafia.
 */
export const SYSTEM_CAPABILITIES = [
  /** Generare gli allenamenti ricorrenti dal calendario settimanale del club. */
  "training_automation.generate",
] as const;

export type SystemCapability = (typeof SYSTEM_CAPABILITIES)[number];

const CAPACITA_NOTE = new Set<string>(SYSTEM_CAPABILITIES);

/**
 * **Chi compare nell'audit.**
 *
 * Non e un identificativo di utenza e non deve somigliarne a una: nessuna riga
 * di `users` porta questo valore, e la ricerca per attore non lo confonde con
 * una persona. `actorUserId` resta `null`, perche non c'e nessun utente.
 */
export const SYSTEM_ACTOR_ROLE = "system:automation";

export type SystemExecutionContext = {
  readonly kind: "system";
  /** Il club, e **uno solo**. Obbligatorio: senza, non si costruisce. */
  readonly organizationId: string;
  /** Il nome del lavoro, per l'audit e per i log. */
  readonly job: string;
  /** Cio che questo lavoro ha dichiarato di voler fare. */
  readonly capabilities: ReadonlySet<SystemCapability>;
};

const testo = (valore: unknown) => String(valore ?? "").trim();

/**
 * **Costruisce un contesto, o non lo costruisce.**
 *
 * Fallisce chiuso su tutte e tre le condizioni: senza club, senza nome del
 * lavoro, o con una capacita che l'elenco non conosce. La terza conta piu
 * delle altre due: un refuso in una capacita produrrebbe altrimenti un
 * contesto che non puo fare niente e che nessuno vede fallire — la difesa
 * inerte che questo repository ha imparato a temere (ADR-0147).
 */
export const createSystemExecutionContext = ({
  organizationId,
  job,
  capabilities,
}: {
  organizationId: string;
  job: string;
  capabilities: readonly SystemCapability[];
}): SystemExecutionContext => {
  const club = testo(organizationId);
  if (!club) {
    throw new Error(
      "Contesto di sistema senza club: l'identificativo dell'organizzazione e obbligatorio",
    );
  }

  const lavoro = testo(job);
  if (!lavoro) {
    throw new Error("Contesto di sistema senza nome del lavoro");
  }

  if (!capabilities.length) {
    throw new Error(
      `Contesto di sistema senza capacita (${lavoro}): un contesto che non puo fare niente e un errore, non un contesto`,
    );
  }

  for (const capacita of capabilities) {
    if (!CAPACITA_NOTE.has(capacita)) {
      throw new Error(
        `Capacita di sistema sconosciuta: ${capacita}. Le capacita si dichiarano in src/lib/server/system-actor.ts`,
      );
    }
  }

  return Object.freeze({
    kind: "system" as const,
    organizationId: club,
    job: lavoro,
    capabilities: new Set(capabilities),
  });
};

/** **E un contesto di sistema?** Vale come guardia di tipo, non come permesso. */
export const isSystemExecutionContext = (
  valore: unknown,
): valore is SystemExecutionContext =>
  Boolean(
    valore &&
      typeof valore === "object" &&
      (valore as any).kind === "system" &&
      typeof (valore as any).organizationId === "string" &&
      (valore as any).organizationId.length > 0 &&
      (valore as any).capabilities instanceof Set,
  );

/**
 * **Questo contesto ha dichiarato questa capacita, su questo club?**
 *
 * Le due domande sono una sola apposta. Separarle vorrebbe dire che da qualche
 * parte esiste un chiamante che verifica la capacita e si dimentica il club, e
 * quello sarebbe il varco cross-club: un lavoro avviato per il club A che
 * scrive nel club B.
 */
export const systemContextAllows = (
  contesto: unknown,
  capacita: SystemCapability,
  organizationId: string,
): contesto is SystemExecutionContext => {
  if (!isSystemExecutionContext(contesto)) return false;

  const club = testo(organizationId);
  if (!club || contesto.organizationId !== club) return false;

  return contesto.capabilities.has(capacita);
};
