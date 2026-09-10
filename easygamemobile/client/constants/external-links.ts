/**
 * I link esterni business-critical del mobile, in un solo posto (WP12).
 *
 * Prima di questo file `support@easygame.it` viveva duplicato in
 * `AccountHubScreen` (come `mailto:`) e in `TrainerProfileDashboardScreen`
 * (come testo) — due stringhe che una modifica futura avrebbe potuto far
 * divergere senza che nessuno se ne accorgesse.
 *
 * Nessun meccanismo di configurazione remota esiste ne lato Web ne lato
 * mobile oggi: questa resta una fonte singola **locale**, non una feature di
 * remote-config. Il giorno in cui servisse cambiare questo indirizzo senza
 * una nuova build, o aggiungere un secondo link business-critical, la
 * migrazione a una configurazione remota parte da qui — un solo file da
 * aggiornare, non una ricerca a tappeto nelle schermate.
 */
export const SUPPORT_EMAIL = "support@easygame.it";
export const SUPPORT_MAILTO_URL = `mailto:${SUPPORT_EMAIL}`;
