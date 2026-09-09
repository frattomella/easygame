/**
 * **Le federazioni e gli enti di un club, e quale di loro nomina un
 * tesseramento.**
 *
 * ---
 *
 * ## Perche esiste
 *
 * Un tesseramento atleta portava la federazione come **stringa libera**: la
 * tendina della scheda offriva i nomi configurati dal club, e cio che finiva
 * nel record era il nome. Tre conseguenze, tutte silenziose:
 *
 * * rinominare un'affiliazione in `/organization` **orfanava** ogni
 *   tesseramento gia registrato, che continuava a nominare una federazione che
 *   il club non ha piu;
 * * la maschera di creazione atleta (`AthleteCreateForm`) usava un campo di
 *   testo libero con `placeholder="Es. FIP"`, quindi «FIP», «F.I.P.» e «Fip»
 *   erano tre enti diversi per il prodotto;
 * * niente impediva di scrivere un ente che il club **non ha**, perche non
 *   c'era nessun posto in cui la domanda «e uno dei tuoi?» venisse posta.
 *
 * `ClubFederationEntry` un `id` ce l'aveva gia (`club-profile.ts`), e nessuno
 * lo usava.
 *
 * ## La regola
 *
 * **L'identita di una federazione e il suo identificativo; il nome e
 * un'etichetta.** E la stessa regola delle categorie (ADR-0155), applicata al
 * secondo registro del club, e per la stessa ragione: due enti possono
 * chiamarsi in modo simile, un nome si corregge, un identificativo no.
 *
 * 1. ogni voce ha un identificativo. Le voci storiche che non ce l'hanno ne
 *    ricevono uno **derivato dal nome** (`fed:<nome normalizzato>`), non uno
 *    nuovo a ogni lettura: un id che cambia a ogni render non e un'identita;
 * 2. un riferimento si risolve per identificativo, oppure per un nome che ne
 *    nomina **una sola**. Un nome che ne nomina due non ne nomina nessuna;
 * 3. il tesseramento conserva **tutti e due**: `federationId` per il legame, e
 *    `federation` come etichetta congelata al momento della registrazione —
 *    cosi un ente tolto dal club non fa sparire la scritta da uno storico che
 *    dice cosa fu vero.
 *
 * ## Cosa non fa
 *
 * Non conosce i tesseramenti: chi li scrive e la scheda atleta, e chi vieta un
 * ente estraneo e la rotta generica, che chiede qui. Non e un catalogo
 * nazionale: le federazioni sono **configurazione del club**, e i due elenchi
 * preimpostati che vivono nelle pagine restano suggerimenti per chi compila.
 */

export type ClubFederation = {
  readonly id: string;
  readonly name: string;
  readonly registrationNumber: string;
  readonly affiliationDate: string;
};

const asText = (value: unknown) => String(value ?? "").trim();

const normalize = (value: unknown) => asText(value).toLowerCase();

/**
 * L'identificativo derivato, per le voci storiche che non ne hanno uno.
 *
 * Deterministico di proposito: `fed-${Date.now()}` — che e cio che la pagina
 * usa per le voci nuove — su una lettura darebbe un'identita diversa a ogni
 * caricamento, e nessun tesseramento riuscirebbe piu a ritrovare il proprio
 * ente.
 */
const derivedFederationId = (name: unknown) => `fed:${normalize(name)}`;

const readRawFederations = (clubData: any): unknown[] => {
  if (Array.isArray(clubData?.federations)) return clubData.federations;
  if (Array.isArray(clubData?.settings?.federations)) {
    return clubData.settings.federations;
  }
  return [];
};

/**
 * **Le federazioni del club, con un identificativo garantito.**
 *
 * Due percorsi storici — la colonna e le impostazioni — e due forme per voce,
 * stringa o oggetto. Si leggono entrambi. I duplicati si tolgono
 * sull'identificativo: una tendina che mostra «FIP» due volte fa dubitare che
 * siano due cose diverse.
 */
export const listClubFederations = (clubData: any): ClubFederation[] => {
  const federations: ClubFederation[] = [];
  const visti = new Set<string>();

  for (const raw of readRawFederations(clubData)) {
    const name =
      typeof raw === "string"
        ? asText(raw)
        : asText((raw as any)?.name) || asText((raw as any)?.title);

    if (!name) continue;

    const id =
      (typeof raw === "object" && raw ? asText((raw as any).id) : "") ||
      derivedFederationId(name);

    if (visti.has(normalize(id))) continue;
    visti.add(normalize(id));

    federations.push({
      id,
      name,
      registrationNumber:
        typeof raw === "object" && raw
          ? asText((raw as any).registrationNumber) ||
            asText((raw as any).registration_number)
          : "",
      affiliationDate:
        typeof raw === "object" && raw
          ? asText((raw as any).affiliationDate) ||
            asText((raw as any).affiliation_date)
          : "",
    });
  }

  return federations;
};

/**
 * **Quale federazione nomina questo riferimento?**
 *
 * `null` quando non ne nomina nessuna — perche il club non ce l'ha, oppure
 * perche il nome ne nomina due e sceglierne una sarebbe inventare un legame.
 */
export const resolveClubFederation = (
  reference: unknown,
  federations: readonly ClubFederation[],
): ClubFederation | null => {
  const grezzo = asText(
    typeof reference === "object" && reference
      ? (reference as any).federationId ??
          (reference as any).federation_id ??
          (reference as any).id ??
          (reference as any).federation ??
          (reference as any).name
      : reference,
  );

  if (!grezzo) return null;

  const perId = federations.find((voce) => normalize(voce.id) === normalize(grezzo));
  if (perId) return perId;

  const perNome = federations.filter(
    (voce) => normalize(voce.name) === normalize(grezzo),
  );

  return perNome.length === 1 ? perNome[0] : null;
};

/**
 * **Vero quando questo identificativo e di questo club.**
 *
 * Di proposito **non** passa da `resolveClubFederation`, che ripiega sul nome
 * (revisione ostile, M4): un `federationId` il cui valore coincide con
 * l'etichetta di un'altra federazione sarebbe stato accettato come se fosse
 * quella. La tesi del modulo e che l'identita e l'identificativo; la guardia
 * deve applicarla a se stessa.
 *
 * Il ripiego per nome resta dov'e utile — leggere un'etichetta — e non dove
 * decide un accesso.
 */
export const isFederationOfClub = (
  reference: unknown,
  federations: readonly ClubFederation[],
) => {
  const riferimento = normalize(reference);
  if (!riferimento) return false;

  return federations.some((voce) => normalize(voce.id) === riferimento);
};

/**
 * **L'etichetta con cui si legge la federazione di un tesseramento.**
 *
 * L'identificativo comanda; se il club ha tolto quell'ente, resta la scritta
 * congelata sul tesseramento — uno storico deve poter dire cosa fu vero anche
 * quando la configurazione e cambiata.
 */
export const readRegistrationFederationLabel = (
  registration: any,
  federations: readonly ClubFederation[],
) => {
  const risolta = resolveClubFederation(
    asText(registration?.federationId) || asText(registration?.federation_id),
    federations,
  );

  if (risolta) return risolta.name;

  const congelata = asText(registration?.federation);
  if (congelata) {
    const perNome = resolveClubFederation(congelata, federations);
    return perNome ? perNome.name : congelata;
  }

  return "";
};

/**
 * **Il riferimento che va scritto sul tesseramento**, dai due lati.
 *
 * Restituisce `null` quando il riferimento non nomina nessuna federazione del
 * club: chi scrive deve rifiutare, non ripiegare su una stringa.
 */
export const buildRegistrationFederationReference = (
  reference: unknown,
  federations: readonly ClubFederation[],
): { federationId: string; federation: string } | null => {
  const risolta = resolveClubFederation(reference, federations);
  if (!risolta) return null;

  return { federationId: risolta.id, federation: risolta.name };
};
