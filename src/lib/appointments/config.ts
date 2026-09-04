/**
 * **La configurazione degli appuntamenti di un club** (PP-02 §K).
 *
 * ---
 *
 * ## Cosa mancava
 *
 * Il dominio degli appuntamenti e completo — slot, stati, transizioni, indice
 * unico, audit, notifiche — e la sua **configurazione** rispondeva a cinque
 * delle sei domande che una segreteria si fa: chi riceve, dove, per quanto,
 * quando, e se la fascia e attiva. Le due che mancavano:
 *
 * 1. **Il tipo di appuntamento.** La famiglia scriveva un motivo a testo
 *    libero, e in coda arrivavano «info», «parlare col mister», «pagamento?».
 *    Il club non poteva dire quali motivi accetta, e chi riceve la richiesta
 *    doveva interpretarla prima di poterla assegnare.
 *
 * 2. **Se le famiglie possono prenotare, punto.** Esisteva `active` sulla
 *    fascia, che significa «questa fascia vale»: non e la stessa domanda. Un
 *    club che voleva chiudere le prenotazioni doveva disattivare le fasce a una
 *    a una, e riaprirle a una a una.
 *
 * ## Perche e configurazione e non una tabella
 *
 * Perche e un elenco corto che il club scrive per se — cinque o sei voci — e
 * non ha una storia da conservare: cambiarne una non deve riscrivere gli
 * appuntamenti gia presi, che portano il **motivo** con se. E la stessa forma
 * con cui vivono le categorie, le sedi e i piani di pagamento.
 *
 * ## Il ripiego, dichiarato
 *
 * `familyBookingEnabled` vale **`true`** quando non c'e: chi non ha mai avuto
 * un interruttore non puo aver espresso una scelta, e spegnere le prenotazioni
 * a ogni club che non ha ancora aperto questa schermata sarebbe togliere una
 * funzione per farne rispettare una che nessuno ha impostato. E la stessa
 * decisione di W6-D03 sulle strutture, e va detta ai club al rilascio.
 *
 * Un club **senza tipi configurati** non vincola il motivo: la famiglia
 * continua a scriverlo. I tipi restringono; la loro assenza non e un divieto.
 */

const asText = (value: unknown) => String(value ?? "").trim();

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

/**
 * **Un tipo e un nome, e basta.**
 *
 * La prima stesura portava anche durata, sede e operatore. Sono tre campi che
 * **nessuno legge**: chi riceve, dove e per quanto lo dice la **fascia**
 * (`appointment_slots`), che e dove quei tre valori sono gia onorati dal
 * calcolo della disponibilita. Averli anche qui voleva dire mostrarli al club
 * come se decidessero qualcosa — «30 min» accanto al motivo, nella tendina
 * della famiglia — mentre la durata reale resta quella della fascia scelta.
 *
 * E la forma piu comune di funzione incompleta che questo repository conosce
 * (CLAUDE.md §11): non il codice mancante, ma il campo che **sembra**
 * governare qualcosa. Onorarli avrebbe voluto dire riscrivere il calcolo degli
 * slot, che e un lavoro con il suo perimetro; toglierli e stato piu onesto che
 * lasciarli in attesa — e ha tolto anche l'unico dato di persona che la rotta
 * di lettura faceva uscire, l'identificativo dell'operatore.
 */
export type AppointmentType = {
  id: string;
  /** Cio che la famiglia sceglie: «Colloquio con la segreteria». */
  name: string;
  /**
   * **Prenotabile dalla famiglia.**
   *
   * Un tipo non prenotabile resta buono per la segreteria, che lo usa quando
   * fissa un appuntamento dal desk: e il caso di «Convocazione», che il club
   * decide e la famiglia non chiede.
   */
  bookable: boolean;
};

export type AppointmentsConfig = {
  /** Le famiglie possono chiedere un appuntamento. */
  familyBookingEnabled: boolean;
  types: AppointmentType[];
};

export const DEFAULT_APPOINTMENTS_CONFIG: AppointmentsConfig = {
  familyBookingEnabled: true,
  types: [],
};

export const normalizeAppointmentType = (
  value: unknown,
): AppointmentType | null => {
  const record = asRecord(value);
  const name = asText(record.name).slice(0, 120);
  if (!name) return null;

  return {
    id:
      asText(record.id) ||
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60),
    name,
    bookable: record.bookable === false ? false : true,
  };
};

export const normalizeAppointmentsConfig = (
  value: unknown,
): AppointmentsConfig => {
  const record = asRecord(value);
  const tipi = Array.isArray(record.types) ? record.types : [];

  /*
    Deduplicato per identificativo: due voci con lo stesso id sono due nomi per
    la stessa scelta, e la seconda vincerebbe a caso a seconda di chi cerca.
  */
  const visti = new Set<string>();
  const types: AppointmentType[] = [];
  for (const voce of tipi) {
    const tipo = normalizeAppointmentType(voce);
    if (!tipo) continue;

    /*
      **Uno slug che collide non fa sparire la voce.**

      L'identificativo si ricava dal nome, e due nomi diversi possono ridurvisi
      allo stesso — «Colloquio!» e «Colloquio?». Scartare il secondo faceva
      rispondere «aggiunto» a un pulsante che non aggiungeva niente. Adesso si
      numera: la voce entra, e chi l'ha scritta la vede.
    */
    let id = tipo.id || "motivo";
    if (visti.has(id)) {
      let contatore = 2;
      while (visti.has(`${id}-${contatore}`)) contatore += 1;
      id = `${id}-${contatore}`;
    }

    visti.add(id);
    types.push({ ...tipo, id });
  }

  return {
    /*
      **Solo un booleano decide.** `=== false` accettava `"false"`, `0` e
      `null` come «acceso»: un client che non sia il browser mandava
      `{"familyBookingEnabled":"false"}` e riaccendeva le prenotazioni credendo
      di spegnerle. Cio che non e un booleano non e una scelta, ed e assenza —
      che vale «acceso», come per un club che non ha mai aperto la schermata.
    */
    familyBookingEnabled:
      typeof record.familyBookingEnabled === "boolean"
        ? record.familyBookingEnabled
        : true,
    types,
  };
};

/** I tipi che una famiglia puo scegliere. */
export const bookableAppointmentTypes = (config: AppointmentsConfig) =>
  config.types.filter((tipo) => tipo.bookable);

export const findAppointmentType = (
  config: AppointmentsConfig,
  id: unknown,
): AppointmentType | null => {
  const cercato = asText(id).toLowerCase();
  if (!cercato) return null;
  return (
    config.types.find((tipo) => tipo.id.toLowerCase() === cercato) || null
  );
};
