/**
 * **La proiezione: da righe a voci** (49 §D, §E, §F).
 *
 * ---
 *
 * `athletes.data.guardians[]` e una **proiezione in sola lettura** di
 * `athlete_guardians`. Non e autorita di sicurezza — nessun lettore che decida
 * un accesso puo dedurla da qui — ma tre lettori la interrogano **per posto**,
 * e da quel momento la fusione delle righe che condividono una posizione e
 * diventata una decisione: chi compare su una ricevuta, quale genitore riempie
 * `parent.N`, quale riga un modulo gia salvato stava modificando.
 *
 * Questo file e **puro**: riceve le righe gia lette e restituisce le voci.
 * Stava dentro `refreshGuardianProjection` come chiusura, e li nessuna sonda
 * poteva interrogarlo senza prima scrivere un club, un atleta e tre righe.
 *
 * ## Le tre regole della fusione
 *
 * 1. **i marchi si piegano con la stessa domanda che li legge** — un marchio
 *    vale per la voce solo se `isGuardianExcluded` vale per **tutte** le righe
 *    che ci stanno dietro (§C);
 * 2. **l'anagrafica viene da una riga sola**, la prima non esclusa, e i suoi
 *    campi vuoti **restano vuoti**: ereditarli da una riga esclusa ha prodotto
 *    la ricevuta intestata al padre con il codice fiscale della madre revocata
 *    (§E);
 * 3. **chi sta dietro non sparisce**, ma sta in un campo suo — `escluseDietro`
 *    — che i lettori fiscali e documentali non guardano, e che non si
 *    persiste (§F).
 *
 * ## Perche si sceglie sulla riga e non sull'accumulatore
 *
 * La stesura precedente ripiegava marchi e anagrafica **a ogni passo**, e
 * interrogava poi l'accumulatore. Con tre righe sulla stessa posizione — un
 * recapito, una revocata e una **viva** — al secondo passo l'accumulatore
 * perdeva tutti e due i marchi, al terzo la domanda «l'accumulato e escluso?»
 * rispondeva falso, e la riga viva non vinceva piu. Qui le righe di una
 * posizione si raccolgono **prima** e si decide **una volta**: un accumulatore
 * che porta una risposta gia piegata non e la domanda che si voleva fare.
 */

import { foldGuardianExclusionMarks, isGuardianExcluded } from "./exclusion";

/** Una riga di `athlete_guardians`: l'autorita del dominio. */
export type GuardianRow = {
  id: string;
  organization_id: string;
  athlete_id: string;
  identity_key: string;
  user_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  relationship: string | null;
  contact_only: boolean;
  linked_at: Date | null;
  revoked_at: Date | null;
  access_token_value: string | null;
  access_token_status: string | null;
  access_token_expires_at: Date | null;
  access_token_generated_at: Date | null;
  legacy_id: string | null;
  data: unknown;
  position: number;
};

/**
 * Il gettone vivo che nomina una riga, gia risolto da chi conosce l'archivio.
 *
 * La risoluzione sta **fuori** perche e l'unica parte che conosce
 * `club_resource_items`: tenerla qui renderebbe questo file impuro senza
 * aggiungere niente.
 */
export type GuardianLiveInvite = {
  id: string;
  value: string | null;
  status: string;
  expiresAt: string | null;
};

const iso = (valore: Date | null | undefined): string | null =>
  valore ? new Date(valore).toISOString() : null;

/**
 * **Una riga, nella forma che il blob aveva.**
 *
 * Riproduce **tutto**, marchi compresi: e la condizione perche i lettori
 * storici si comportino esattamente come prima invece che «quasi». Una
 * proiezione che nascondesse le righe revocate cambierebbe, senza dirlo, chi
 * compare su un documento e chi riceve un avviso.
 */
/**
 * **Il residuo non porta metadati di sicurezza, mai.**
 *
 * I campi senza colonna vengono per primi nella proiezione, e cio che segue li
 * vince: e la difesa perche un residuo storico non sovrascriva un dato che la
 * tabella governa. Regge finche la proiezione **riemette** la chiave — e per
 * le grafie della **riga** non lo fa: `revoked_at` e `revokedAt` non compaiono
 * fra i campi della voce, quindi un residuo che li portasse sopravviveva, e
 * `isGuardianExcluded` — che e totale sulle due forme, e deve esserlo — li
 * leggeva come un marchio.
 *
 * Esito misurato: un tutore **vivo** risultava escluso. Spariva dal
 * destinatario fiscale, dai segnaposto e dal soggetto di una pratica; con
 * `billingGuardianIndex` puntato su di lui, chi paga cambiava persona su ogni
 * ricevuta emessa da li in avanti.
 *
 * La scrittura di quelle chiavi e gia chiusa (`CHIAVI_CON_UNA_COLONNA`), ma un
 * elenco di chiavi vietate protegge solo cio che **nascera**: qui si toglie
 * anche a cio che e gia in archivio, e senza una migrazione. Un'invariante non
 * deve dipendere da un censimento dei dati.
 */
const CHIAVI_DI_SICUREZZA_NEL_RESIDUO = [
  "accessRevokedAt",
  "access_revoked_at",
  "revokedAt",
  "revoked_at",
  "contactOnly",
  "contact_only",
  "linkedUserId",
  "linked_user_id",
  "userId",
  "user_id",
  "identityKey",
  "identity_key",
  "escluseDietro",
] as const;

const residuoSicuro = (valore: unknown): Record<string, unknown> => {
  if (!valore || typeof valore !== "object" || Array.isArray(valore)) return {};

  const pulito = { ...(valore as Record<string, unknown>) };
  for (const chiave of CHIAVI_DI_SICUREZZA_NEL_RESIDUO) delete pulito[chiave];
  return pulito;
};

export const projectGuardianRow = (
  riga: GuardianRow,
): Record<string, unknown> => ({
  /*
    I campi senza colonna vengono per primi: cio che segue li **vince**, cosi
    un residuo storico non puo sovrascrivere un dato che la tabella governa. E
    cio che la tabella governa e **stato tolto** dal residuo, perche non tutte
    le grafie che decidono vengono riemesse qui sotto.
  */
  ...residuoSicuro(riga.data),
  id: riga.id,
  name: riga.first_name,
  surname: riga.last_name,
  relationship: riga.relationship,
  email: riga.email,
  phone: riga.phone,
  linkedUserId: riga.user_id,
  /*
    **L'indirizzo di recapito e l'indirizzo che apre sono due cose diverse**, e
    il blob le teneva in due chiavi: `email` resta dopo una revoca — al club
    serve per scrivere a quella persona — mentre `linkedUserEmail` e il legame,
    e con la revoca cade.

    La tabella ne ha una colonna sola perche sono lo stesso testo; qui la
    proiezione le separa di nuovo, con la **stessa** domanda che decide tutto
    il resto: un indirizzo apre solo se la riga non e esclusa.
  */
  linkedUserEmail: isGuardianExcluded(riga) ? null : riga.email,
  linkedAt: iso(riga.linked_at),
  accessRevokedAt: iso(riga.revoked_at),
  /*
    Un segno **falso** deve arrivare a destinazione, e non mancare: un lettore
    che non trova la chiave e un lettore che decide da solo cosa voglia dire.
  */
  contactOnly: Boolean(riga.contact_only),
  parentAccessTokenValue: riga.access_token_value,
  parentAccessTokenStatus: riga.access_token_status,
  parentAccessTokenExpiresAt: iso(riga.access_token_expires_at),
  parentAccessTokenGeneratedAt: iso(riga.access_token_generated_at),
});

/**
 * **Le voci di `athletes.data.guardians[]`, dalle righe.**
 *
 * **Perche si fonde per posizione.** Il travaso ha prodotto due righe con la
 * stessa posizione da ogni voce del blob che dichiarava piu di un
 * identificativo utente. Non fonderle faceva passare la scheda da due voci a
 * tre al primo salvataggio, e ogni lettore posizionale slittava di uno — il
 * destinatario fiscale di una ricevuta compreso. L'autorita resta una riga per
 * identita; cio che si perde nella ricomposizione non decide niente, perche li
 * nessuno decide un accesso.
 *
 * L'ordine delle righe dentro una posizione e quello con cui il chiamante le
 * passa, e decide chi vince a parita: e `ORDINE_STABILE`, non un caso.
 */
export const projectGuardianEntries = (
  righe: readonly GuardianRow[],
  invito: (riga: GuardianRow) => GuardianLiveInvite | null = () => null,
): Record<string, unknown>[] => {
  const perPosto = new Map<number, GuardianRow[]>();
  for (const riga of righe) {
    const posto = Number(riga.position ?? 0);
    const gia = perPosto.get(posto);
    if (gia) gia.push(riga);
    else perPosto.set(posto, [riga]);
  }

  return [...perPosto.entries()]
    .sort(([sinistra], [destra]) => sinistra - destra)
    .map(([, dietro]) => {
      /*
        **L'anagrafica viene da una riga sola: la prima non esclusa.**

        La prima stesura sceglieva quale anagrafica «tenere» e poi la
        sovrapponeva all'altra: ogni campo che la riga viva aveva vuoto veniva
        **ereditato** da quella esclusa. E il caso ordinario — il club ha il
        codice fiscale della madre e non quello del padre — e l'esito misurato
        era una ricevuta intestata al **padre** con il **codice fiscale e
        l'indirizzo della madre**: un dato personale di una persona esclusa
        consegnato ad altri, e un documento fiscalmente falso.

        Si sceglie percio, non si sovrappone: i campi vuoti della riga viva
        restano vuoti.
      */
      const scelta = dietro.find((riga) => !isGuardianExcluded(riga)) ?? dietro[0];
      const vivo = invito(scelta);

      const voce: Record<string, unknown> = {
        ...projectGuardianRow(scelta),
        ...(vivo
          ? {
              parentAccessTokenRecordId: String(vivo.id),
              parentAccessTokenValue: vivo.value ?? null,
              parentAccessTokenStatus: String(vivo.status || "active"),
              parentAccessTokenExpiresAt: vivo.expiresAt ?? null,
            }
          : {
              parentAccessTokenRecordId: null,
              parentAccessTokenValue: null,
              parentAccessTokenStatus: null,
            }),
      };

      /*
        **La traccia di chi sta dietro, senza la fuga di dati** (§F).

        La scheda deve poter dire che dietro una voce c'e qualcuno che il club
        ha escluso — altrimenti la porta che **revoca** ragiona per posizione
        su qualcosa che la porta che **mostra** non dichiara. La traccia sta in
        un campo suo: metterla nei campi della voce sarebbe il difetto del giro
        prima, dove il codice fiscale dell'esclusa finiva sulla ricevuta.

        Vale solo per una voce **fusa**: una riga esclusa che sta da sola al
        proprio posto non ha nessuno «dietro» di cui la scheda debba dire.
      */
      const escluseDietro =
        dietro.length > 1
          ? dietro
              .filter((riga) => isGuardianExcluded(riga))
              .map((riga) => ({
                id: riga.id,
                name: riga.first_name,
                surname: riga.last_name,
                accessRevokedAt: iso(riga.revoked_at),
                contactOnly: Boolean(riga.contact_only),
              }))
          : [];

      const marchi = foldGuardianExclusionMarks(dietro);

      return {
        ...voce,
        ...(escluseDietro.length ? { escluseDietro } : {}),
        contactOnly: marchi.contactOnly,
        accessRevokedAt: marchi.accessRevokedAt,
      };
    });
};
