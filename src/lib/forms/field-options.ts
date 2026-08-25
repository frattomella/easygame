/**
 * Le opzioni che non stanno nello schema: sede e categoria.
 *
 * **Perche esistono.** Un modulo a scelta multipla porta le sue opzioni
 * dentro la versione pubblicata, e deve essere cosi: se «Taglia» cambiasse
 * dopo la pubblicazione, le risposte gia arrivate citerebbero opzioni che il
 * modulo non offre piu. Sede e categoria sono l'eccezione. Non sono opinioni
 * di chi ha costruito il modulo: sono **anagrafica del club**, cambiano
 * quando il club apre una palestra o rinomina una categoria, e nessuno
 * ripubblica dodici moduli per questo. Congelarle nella versione produrrebbe
 * un modulo di iscrizione che a marzo propone le sedi di settembre.
 *
 * **Perche riempirle sul server e anche il controllo di sicurezza.** Le
 * opzioni entrano nello schema due volte: quando il modulo viene servito e
 * di nuovo, dalla stessa funzione e dalla stessa fonte, quando l'invio viene
 * validato. Chi compila non manda una sede: manda il testo di un'opzione, e
 * la validazione dei campi a scelta — quella che c'era gia — rifiuta un testo
 * che in quell'elenco non c'e. Un `site_id` inventato, o la sede di un altro
 * club, non hanno un percorso per entrare: non e che vengano respinti da un
 * controllo in piu, e che non sono mai stati un valore accettabile.
 *
 * **Perche un club con una sede sola non vede la domanda.** Chiedere di
 * scegliere fra una possibilita e una domanda che non porta informazione e
 * costa un errore di compilazione a chi la legge. Il campo sparisce dal
 * modulo servito, e all'approvazione la sede unica viene assegnata lo stesso:
 * il dato non si perde, la domanda si.
 *
 * Modulo **puro**: riceve elenchi gia letti, non conosce Prisma, si prova
 * senza database.
 */

import {
  getDynamicField,
  type DynamicFieldOptionsSource,
} from "./dynamic-fields";
import { fieldHasOptions, type FormField, type FormSchema } from "./model";

export type FormOptionCatalog = Record<DynamicFieldOptionsSource, string[]>;

export const EMPTY_FORM_OPTION_CATALOG: FormOptionCatalog = {
  club_sites: [],
  club_categories: [],
};

/**
 * Quante voci servono perche la domanda abbia senso.
 *
 * Una sede sola non si sceglie: e quella. Una categoria sola invece si
 * conferma — un club con una categoria puo comunque volerla scritta sul
 * modulo di iscrizione, ed e la sola cosa che quel campo dichiara.
 */
const MINIMUM_OPTIONS: Record<DynamicFieldOptionsSource, number> = {
  club_sites: 2,
  club_categories: 1,
};

const dedupe = (values: readonly (string | null | undefined)[]) => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const text = String(value ?? "").trim();
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    result.push(text);
  }

  return result;
};

export const buildFormOptionCatalog = (input: {
  siteNames?: readonly (string | null | undefined)[];
  categoryNames?: readonly (string | null | undefined)[];
}): FormOptionCatalog => ({
  club_sites: dedupe(input.siteNames || []),
  club_categories: dedupe(input.categoryNames || []),
});

/** La fonte delle opzioni di un campo, o `null` se le porta lo schema. */
export const getFieldOptionsSource = (
  field: Pick<FormField, "binding">,
): DynamicFieldOptionsSource | null =>
  getDynamicField(field.binding)?.optionsSource || null;

export const hasServerOptions = (field: Pick<FormField, "binding">) =>
  Boolean(getFieldOptionsSource(field));

/**
 * Lo schema come va servito e come va validato: **la stessa funzione per
 * entrambi**, perche un modulo validato con opzioni diverse da quelle che ha
 * mostrato e un modulo che rifiuta cio che ha appena proposto.
 *
 * I campi la cui fonte non ha abbastanza voci escono dallo schema. Restano
 * nella bozza e nella versione pubblicata — non si riscrive un dato
 * immutabile — ma non vengono ne mostrati ne richiesti.
 */
export const applyServerFieldOptions = (
  schema: FormSchema,
  catalog: FormOptionCatalog,
): FormSchema => {
  let changed = false;

  const fields = schema.fields.reduce<FormField[]>((accumulator, field) => {
    const source = getFieldOptionsSource(field);

    if (!source || !fieldHasOptions(field.type)) {
      accumulator.push(field);
      return accumulator;
    }

    const options = catalog[source] || [];
    changed = true;

    if (options.length < MINIMUM_OPTIONS[source]) {
      return accumulator;
    }

    accumulator.push({ ...field, options });
    return accumulator;
  }, []);

  return changed ? { ...schema, fields } : schema;
};
