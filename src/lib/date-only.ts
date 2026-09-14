/**
 * **La data civile, senza fuso** (bug UAT "date-only timezone shift":
 * selezionare giovedi 17 settembre in `AddMatchForm` produceva una gara
 * salvata il 16).
 *
 * Un selettore di calendario (`react-day-picker`, o un `<input
 * type="date">` letto e poi ricostruito) restituisce — o parte da — un
 * `Date` costruito a **mezzanotte locale**: `new Date(2026, 8, 17)` a Roma
 * e "Thu Sep 17 2026 00:00:00 GMT+0200". Chiamare `.toISOString()` su
 * quell'oggetto lo riconverte in un istante UTC vero — "2026-09-16
 * T22:00:00.000Z" — e un `.slice(0, 10)` o uno `split("T")[0]` successivo
 * legge il **giorno sbagliato**, quello prima, per ogni fuso che sta
 * avanti su UTC (tutta l'Italia, tutto l'anno: CET e UTC+1, CEST e UTC+2).
 *
 * La cifra civile che l'utente ha scelto non e mai stata un istante: e un
 * giorno di calendario. `formatLocalDateOnly` la legge dagli **accessori
 * locali** dell'oggetto (`getFullYear`/`getMonth`/`getDate`), non da quelli
 * UTC — lo stesso principio che il fuso `Europe/Rome` chiede quando le
 * cifre non sono ancora un istante.
 *
 * **Non e la stessa correzione dei `club_events`.** La riga
 * `src/lib/events/model.ts` (`toEventInstant`, `isWithinFieldAvailability`)
 * risolve un problema diverso: un istante gia scritto come cifre letterali
 * ("le cifre UTC di `club_events` SONO l'ora locale", per convenzione di
 * archivio) che non deve subire una seconda conversione. Qui il problema e
 * precedente: un `Date` **appena costruito nel browser**, che non deve
 * subire nemmeno la **prima**. Le due correzioni non si sostituiscono a
 * vicenda; risolvono due letture diverse dello stesso oggetto `Date`.
 *
 * **Dove NON usarla.** Un vero istante — `created_at`, `rsvp_deadline`
 * inteso come "le 21:00 di quel giorno a Roma", l'inizio o la fine di un
 * evento — non e una data civile: per quelli la cifra giusta resta quella
 * che il resto del dominio gia usa (le cifre letterali di `club_events`,
 * o un `.toISOString()` su un istante che e davvero tale). Trasformare
 * anche quelli in "solo data" perderebbe l'ora.
 */
export const formatLocalDateOnly = (value: Date): string => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

/**
 * "Oggi", come giorno civile del dispositivo — non `new Date().toISOString()
 * .slice(0, 10)`, che per un'ora o due dopo la mezzanotte locale (l'intera
 * finestra fra le 00:00 e l'offset UTC del fuso) risponde ancora "ieri".
 */
export const todayLocalDateOnly = (): string => formatLocalDateOnly(new Date());
