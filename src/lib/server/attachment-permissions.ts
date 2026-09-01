import { canAccessClubResource, type ResourceAction } from "@/lib/access-roles";

/**
 * **Il permesso di un allegato e quello della cosa a cui e attaccato.**
 *
 * ---
 *
 * ## Il difetto che questo modulo chiude
 *
 * La rotta degli allegati sorvegliava due soli `owner_type`: gli annunci —
 * perche seguono il pubblico della bacheca — e i tipi posseduti dal club.
 * Tutto il resto non aveva **nessun** controllo di ruolo: bastava appartenere
 * al club.
 *
 * Un audit indipendente lo ha eseguito con un account che nel club era
 * soltanto **genitore**:
 *
 *     GET    /api/v1/attachments        -> l'indice di ogni allegato del club
 *     GET    /api/v1/attachments/<id>   -> i byte di una carta d'identita
 *     DELETE /api/v1/attachments/<id>   -> distrutta
 *     PUT    /api/v1/attachments/<id>   -> i byte di un certificato medico,
 *                                          riscritti dal genitore
 *
 * Nessun filtro serviva: l'elenco senza parametri restituiva il club intero. E
 * le letture non lasciano traccia — l'audit registra creazione, modifica e
 * cancellazione, non la lettura — quindi qualcuno che scarica i documenti
 * d'identita di tutti i tesserati non produce **nessuna** riga.
 *
 * ## Perche era invisibile
 *
 * La rotta dedicata lo faceva bene: `GET /api/athletes/:id/documents` rifiuta
 * il genitore. Il gemello generico consegnava gli stessi file alla stessa
 * persona. E la forma che questa Wave ha incontrato piu volte — la correzione
 * messa su una porta e non sull'altra — e la ragione per cui il permesso ora
 * vive in un modulo, non in una rotta.
 *
 * ## La regola
 *
 * Un allegato non ha permessi propri: li **eredita** da cio a cui e attaccato.
 * Un documento di un atleta si legge se si leggono gli atleti; il contratto di
 * un collaboratore, se si legge il lavoro sportivo. Un `owner_type` che questo
 * elenco non conosce e trattato come il piu riservato che ci sia — perche non
 * sapere a chi appartiene un file non e una ragione per mostrarlo.
 */
/*
  Le chiavi sono **esattamente** i valori di `ATTACHMENT_OWNER_TYPES`
  (`src/lib/attachments.ts`) meno i due che hanno regole proprie, `club` e
  `announcement`. Prima ce n'erano il doppio — plurali e nomi di cose che non
  sono `owner_type` (`medical_certificate`, `sponsor`, `invoice`, `receipt`,
  `payment`, `form_submission`) — e `createAttachment` li rifiuta tutti: erano
  righe che non potevano corrispondere a niente. Una tabella dei permessi che
  elenca porte inesistenti fa credere di aver deciso su casi su cui non ha
  deciso, e infatti il test scritto insieme a questo modulo verificava
  `medical_certificate`, cioe un tipo che non esiste.
*/
const RISORSA_PER_TIPO: Record<string, string> = {
  athlete: "athletes",
  guardian: "athletes",
  member: "members",
  /*
    **`staff` non e il nome di una risorsa: la risorsa e `staff_members`.**

    Finche `canAccessClubResource` rispondeva `true` a segreteria e
    collaboratore per qualunque nome sconosciuto, la differenza non si vedeva:
    il permesso arrivava dal ramo permissivo e non dalla riga giusta della
    matrice. Chiuso quel ramo (W5-71), un nome sbagliato smette di essere
    innocuo — ed e esattamente il tipo di difetto che l'allow-by-default
    teneva nascosto.
  */
  staff: "staff_members",
  trainer: "trainers",
  sport_work_person: "sport_work",
  sport_work_relationship: "sport_work",
  form: "forms",
  /*
    `other` e il valore predefinito del caricamento: un file di cui nessuno ha
    dichiarato a che cosa appartiene. Lo governa quindi chi amministra il club,
    che e la stessa regola del tipo sconosciuto — ma detta qui invece che
    ricavata dal fallback, perche `other` non e sconosciuto: e previsto, ed e
    una scelta che valga la pena leggere.
  */
  other: "clubs",
};

/**
 * Vero se il ruolo attivo puo fare quell'azione sugli allegati di quel tipo.
 *
 * I due tipi posseduti dal club — `club` e `announcement` — non passano di
 * qui: hanno gia le loro regole, la firma sociale e il pubblico della bacheca.
 */
export const canAccessAttachmentOwner = (
  activeRole: string | null | undefined,
  ownerType: unknown,
  action: ResourceAction,
) => {
  const tipo = String(ownerType ?? "").trim().toLowerCase();
  if (tipo === "club" || tipo === "announcement") return true;

  const risorsa = RISORSA_PER_TIPO[tipo];
  if (!risorsa) {
    /*
      Un tipo sconosciuto si tratta come il piu riservato: lo governa chi
      amministra il club. Aggiungerne uno nuovo senza dichiararlo qui lo rende
      quindi **piu** chiuso, non piu aperto — che e il verso giusto in cui
      sbagliare.
    */
    return canAccessClubResource(activeRole, "clubs", action);
  }

  return canAccessClubResource(activeRole, risorsa, action);
};

/**
 * I tipi per cui questo modulo ha deciso **esplicitamente**.
 *
 * Non e la stessa cosa di «i tipi che ricevono un rifiuto»: un tipo mai
 * dichiarato ricade su `clubs` e si comporta bene lo stesso, ed e proprio
 * questo che rende invisibile una dimenticanza. Esporre l'elenco permette al
 * test di confrontarlo con `ATTACHMENT_OWNER_TYPES` e accorgersi di un
 * `owner_type` nuovo su cui nessuno ha deciso niente.
 */
export const ATTACHMENT_OWNER_TYPES_DECLARED = Object.freeze(
  Object.keys(RISORSA_PER_TIPO),
);

/** Il messaggio di rifiuto, che nomina la cosa e non il file. */
export const attachmentDenied = (ownerType: unknown) =>
  new Error(
    `Accesso negato: gli allegati di «${String(ownerType ?? "questo tipo").trim() || "questo tipo"}» ` +
      "li vede chi puo vedere cio a cui sono attaccati",
  );
