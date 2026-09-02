import { prisma } from "./prisma";
import {
  accessScopeValues,
  normalizeAccessScopes,
  type AccessScopeEntry,
} from "@/lib/roles/access-scope";

/**
 * **Il perimetro di un accesso, tradotto in una interrogazione.**
 *
 * La regola pura vive in `src/lib/roles/access-scope.ts` e risponde su una riga
 * gia in mano. Qui c'e la sua **unica** traduzione in Prisma, e il fatto che
 * sia unica e il punto del modulo.
 *
 * ## Perche esiste
 *
 * La forma SQL del perimetro era scritta dentro `resources.ts`, e la usava una
 * funzione sola. Quando e servita altrove — la coda documentale del club — le
 * strade erano due: importare seimila righe di registro generico, oppure
 * riscrivere il `where`. Un audit ostile aveva **appena** misurato cosa
 * succede a riscriverlo: la copia dentro `resources.ts` lasciava passare gli
 * atleti **senza sede**, contraddicendo la regola pura, e a decidere era la
 * copia piu larga.
 *
 * Due proprietari della stessa domanda danno due risposte, e quella che conta e
 * sempre la piu permissiva. Da qui in poi ce n'e uno.
 *
 * ## La regola, per intero
 *
 * Zero righe di perimetro significano **tutto il club**: e cio che hanno tutte
 * le tessere esistenti, ed e la scelta che rende il perimetro additivo. Un
 * perimetro dichiarato invece **fallisce chiuso**: una riga che non porta il
 * valore dell'asse ristretto non passa, perche un atleta senza sede non e «di
 * tutte le sedi», e un atleta di cui non si sa dire dove sia.
 *
 * I due assi sono in `AND` fra loro e in `OR` dentro se stessi: «sedi Nord e
 * Sud, categoria Pulcini» vuol dire Pulcini in una di quelle due sedi.
 */

type ScopeConPerimetro = {
  accessScopes?: readonly AccessScopeEntry[] | null;
};

/**
 * Le condizioni Prisma che restringono gli **atleti** al perimetro, o `null`
 * quando non c'e nessun perimetro da applicare.
 *
 * Si restituisce un elenco e non un oggetto perche il chiamante le somma alle
 * proprie con `AND`: un perimetro deve far vedere **meno**, mai di piu, e un
 * `Object.assign` cancellerebbe i filtri gia presenti.
 */
export const buildAthleteAccessScopeConditions = (
  scope: ScopeConPerimetro | undefined | null,
): Record<string, any>[] | null => {
  const perimetro = normalizeAccessScopes(scope?.accessScopes);
  if (!perimetro.length) return null;

  const condizioni: Record<string, any>[] = [];
  const sedi = accessScopeValues(perimetro, "site");
  const categorie = accessScopeValues(perimetro, "category");

  if (sedi.length) {
    condizioni.push({
      category_memberships: { some: { site_id: { in: sedi } } },
    });
  }

  if (categorie.length) {
    /*
      La categoria si guarda in due posti: la colonna `athletes.category_id`,
      che e la categoria principale del dato precedente alle appartenenze
      multiple, e le righe di `athlete_category_memberships`. Cercare solo la
      prima perderebbe gli atleti la cui appartenenza a quella categoria e
      secondaria; solo le seconde perderebbero l'archivio storico.
    */
    condizioni.push({
      OR: [
        { category_id: { in: categorie } },
        { category_memberships: { some: { category_id: { in: categorie } } } },
      ],
    });
  }

  return condizioni.length ? condizioni : null;
};

/**
 * Gli identificativi degli atleti dentro il perimetro, o `null` quando non c'e
 * nessun perimetro.
 *
 * `null` e diverso da `[]`, e la differenza conta: `null` vuol dire «non
 * restringere», `[]` vuol dire «nessun atleta passa». Un chiamante che
 * confondesse i due farebbe vedere tutto il club a chi non deve vedere niente.
 *
 * Serve ai domini che non interrogano `athletes` — la coda documentale, per
 * esempio, cerca in `document_requests` e conosce solo il `subject_id`. Li il
 * perimetro non si puo esprimere come `where` sulla stessa tabella, e passa da
 * un elenco di identificativi.
 */
/**
 * **Il perimetro sulla tabella che lo definisce.**
 *
 * `athlete_category_memberships` non e una risorsa come le altre: e la
 * tabella che `buildAthleteAccessScopeConditions` interroga per decidere chi
 * passa. Il registro generico la serviva **senza filtro**, e quindi dava a
 * chi e recintato la mappa completa `atleta -> sede/categoria` del club:
 * l'elenco esatto degli identificativi che ogni altra porta accetta.
 *
 * Qui il perimetro si applica alle colonne della riga stessa, non passando
 * dall'atleta — e la stessa regola che `assertMembershipWithinAccessScope`
 * applica gia in scrittura, dalla parte della lettura.
 *
 * Sta in questo modulo e non nel registro perche il **vocabolario** del
 * perimetro ha un proprietario solo: averlo in due file e gia costato una
 * divergenza, e il presidio la impedisce.
 */
export const buildMembershipAccessScopeConditions = (
  scope: ScopeConPerimetro | undefined | null,
) => {
  const perimetri = normalizeAccessScopes(scope?.accessScopes);
  if (!perimetri.length) return null;

  const condizioni: Record<string, unknown>[] = [];
  const sedi = accessScopeValues(perimetri, "site");
  const categorie = accessScopeValues(perimetri, "category");

  if (sedi.length) condizioni.push({ site_id: { in: sedi } });
  if (categorie.length) condizioni.push({ category_id: { in: categorie } });

  return condizioni.length ? condizioni : null;
};

export const athleteIdsWithinAccessScope = async (
  organizationId: string,
  scope: ScopeConPerimetro | undefined | null,
): Promise<string[] | null> => {
  const condizioni = buildAthleteAccessScopeConditions(scope);
  if (!condizioni) return null;

  const righe = await prisma.athlete.findMany({
    where: { organization_id: organizationId, AND: condizioni },
    select: { id: true },
  });

  return righe.map((riga) => riga.id);
};

/**
 * Vero se **quella** riga sta dentro il perimetro, o se perimetro non ce n'e.
 *
 * Esiste accanto a `athleteIdsWithinAccessScope` per una ragione di costo: quando
 * la domanda riguarda un atleta solo — una lettura per identificativo — caricare
 * tutti gli identificativi del perimetro per poi cercarci dentro e leggere un
 * club intero per rispondere su una riga.
 *
 * La domanda si stringe quindi all'unica riga in questione, con le **stesse**
 * condizioni dell'elenco: un secondo giudizio scritto in TypeScript sarebbe la
 * terza risposta alla stessa domanda, e le prime due sono gia divergite una
 * volta.
 */
export const athleteWithinAccessScope = async (
  organizationId: string,
  athleteId: string,
  scope: ScopeConPerimetro | undefined | null,
): Promise<boolean> => {
  const condizioni = buildAthleteAccessScopeConditions(scope);
  if (!condizioni) return true;

  const dentro = await prisma.athlete.count({
    where: { id: athleteId, organization_id: organizationId, AND: condizioni },
  });

  return dentro > 0;
};

/**
 * **Il perimetro non si allarga da dentro.**
 *
 * Il perimetro di sede si calcola su `athlete_category_memberships.site_id`.
 * Quella tabella e servita dal registro generico ed e aperta in scrittura alla
 * gestione: un ruolo perimetrato sulla sede Nord creava una riga di
 * appartenenza per un atleta della sede Sud, con `site_id` **la propria** sede,
 * e da quel momento tutte le porte chiuse gli si aprivano **a buon diritto**.
 *
 * Il confine non veniva aggirato: veniva **spostato**. E la stessa forma con
 * cui una tessera di club poteva essere riscritta da chi la portava — con la
 * differenza che qui non serviva nemmeno toccare la propria riga.
 *
 * La regola: chi ha un perimetro puo scrivere un'appartenenza **solo** dentro
 * il proprio perimetro, su entrambi gli assi. Chi non ne ha uno non e toccato.
 *
 * Solleva con «Accesso negato» perche il route handler generico lo mappi su
 * 403.
 */
export const assertMembershipWithinAccessScope = (
  scope: ScopeConPerimetro | undefined | null,
  riga: { site_id?: unknown; category_id?: unknown },
) => {
  const perimetro = normalizeAccessScopes(scope?.accessScopes);
  if (!perimetro.length) return;

  const sedi = accessScopeValues(perimetro, "site");
  const categorie = accessScopeValues(perimetro, "category");

  const sede = String(riga.site_id ?? "").trim();
  const categoria = String(riga.category_id ?? "").trim();

  /*
    Un asse ristretto pretende un valore **dichiarato e dentro**: una riga
    senza sede, scritta da chi e perimetrato su una sede, e proprio il modo in
    cui il recinto si scioglierebbe — la riga passerebbe i filtri di lettura
    che accettano l'assenza, e la persona si ritroverebbe l'atleta dentro.
  */
  if (sedi.length && (!sede || !sedi.includes(sede))) {
    throw new Error(
      "Accesso negato: un'appartenenza si scrive dentro il proprio perimetro di sede, e questa ne dichiara un'altra",
    );
  }

  if (categorie.length && (!categoria || !categorie.includes(categoria))) {
    throw new Error(
      "Accesso negato: un'appartenenza si scrive dentro il proprio perimetro di categoria, e questa ne dichiara un'altra",
    );
  }
};
