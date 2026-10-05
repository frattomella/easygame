import { redirect } from "next/navigation";

/**
 * **La seconda superficie del proprio account, ridotta a una porta** (PP-01 §J).
 *
 * Qui viveva una pagina di 447 righe che modificava la stessa riga `users` di
 * `/account`, e lo faceva peggio in ogni punto misurabile:
 *
 * - l'indirizzo di accesso era **in sola lettura**, e cambiarlo e la richiesta
 *   piu frequente che una segreteria riceve;
 * - il campo «password attuale» veniva raccolto e **non mandato da nessuna
 *   parte**;
 * - l'immagine si salvava in `users.profile_image`, che **non e una colonna**:
 *   il livello generico toglie cio che lo schema non conosce, quindi la foto
 *   restava solo nel `localStorage` di quel browser;
 * - la rotta che usa — `PATCH /api/v1/users/:id` — passa da
 *   `MANAGEMENT_ADMIN_ONLY_RESOURCES`, quindi per **cinque ruoli su sette** e
 *   per ogni ruolo personalizzato la pagina si apriva vuota e il salvataggio
 *   rispondeva 403, lasciando anche una riga di diniego nel registro;
 * - al salvataggio riuscito rimandava alla verifica del gettone di primo
 *   accesso, che non c'entra niente con «ho cambiato il mio cognome».
 *
 * `/account` fa tutto cio che faceva questa, in piu cambia l'indirizzo, mostra
 * lo stato di verifica di email e telefono, toglie l'immagine, e **funziona per
 * ogni ruolo**, perche passa da `PATCH /api/v1/auth/user`, che e una rotta
 * personale e non una risorsa amministrativa.
 *
 * **Perche un reindirizzamento e non una cancellazione.** L'indirizzo e
 * raggiungibile da fuori: un segnalibro, il messaggio di primo accesso di un
 * club, la cronologia del browser. Cancellare la cartella avrebbe trasformato
 * ognuno di quei percorsi in un 404 per guadagnare due file in meno. La porta
 * resta, e porta dove si lavora davvero.
 */
export default function ProfileRedirectPage() {
  redirect("/account?profile=1");
}
