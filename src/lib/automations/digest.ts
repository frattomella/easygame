/**
 * Il **riepilogo giornaliero** alla societa (G-58).
 *
 * ## Perche una email al giorno e non trenta
 *
 * Le automazioni destinate alla societa producono una riga per ogni scadenza
 * che riguarda il club. Trenta notifiche in una notte non si leggono, e la
 * conseguenza non e che se ne leggono venti: e che si smette di leggerle tutte,
 * compresa quella che contava.
 *
 * ## Perche il raggruppamento e per club e non per regola
 *
 * Il difetto non appartiene alla singola automazione: cinque regole che
 * mandano sei messaggi ciascuna fanno trenta email anche se nessuna delle
 * cinque, da sola, e rumorosa. Chi riceve ha una casella sola, quindi il
 * riepilogo e uno solo — e le regole che vi partecipano lo dichiarano con la
 * loro modalita di consegna.
 *
 * Modulo **puro**: nessun Prisma, nessuna rete, nessun DOM.
 */

import { escapeHtml } from "@/lib/documents/document-view";
import {
  AUTOMATION_TRIGGERS,
  AUTOMATION_TRIGGER_KINDS,
  type AutomationTriggerKind,
} from "./catalog";

/** Una riga del riepilogo: un fatto, su una persona, con la sua data. */
export type DigestEntry = {
  triggerKind: AutomationTriggerKind;
  /** Il nome della persona a cui il fatto si riferisce. */
  subjectName: string;
  /** La frase che descrive il fatto: «Rata di novembre, 130,00 euro». */
  detail: string;
  /** La data dell'occorrenza, gia formattata. Vuota quando non ce n'e una. */
  when: string;
};

export type DigestGroup = {
  triggerKind: AutomationTriggerKind;
  label: string;
  entries: DigestEntry[];
};

export type DailyDigest = {
  subject: string;
  text: string;
  html: string;
  groups: DigestGroup[];
  total: number;
};

const asText = (value: unknown) => String(value ?? "").trim();

/**
 * Le righe raggruppate per fatto, **nell'ordine del catalogo**.
 *
 * L'ordine e quello dei trigger e non quello di arrivo: il riepilogo di
 * martedi deve avere la stessa forma di quello di lunedi, altrimenti chi lo
 * legge ogni mattina deve rileggerlo tutto per trovare la sezione che gli
 * interessa.
 */
export const groupDigestEntries = (
  entries: readonly DigestEntry[],
): DigestGroup[] =>
  AUTOMATION_TRIGGER_KINDS.map((kind) => ({
    triggerKind: kind,
    label: AUTOMATION_TRIGGERS[kind].label,
    entries: entries
      .filter((entry) => entry.triggerKind === kind)
      .slice()
      .sort(
        (left, right) =>
          asText(left.subjectName).localeCompare(asText(right.subjectName)) ||
          asText(left.when).localeCompare(asText(right.when)) ||
          asText(left.detail).localeCompare(asText(right.detail)),
      ),
  })).filter((group) => group.entries.length > 0);

const describeEntry = (entry: DigestEntry) => {
  const parts = [asText(entry.subjectName), asText(entry.detail)].filter(Boolean);
  const line = parts.join(" - ");
  const when = asText(entry.when);
  return when ? `${line} (${when})` : line;
};

/**
 * Il riepilogo come una email.
 *
 * **Non passa dai modelli di messaggio.** Un modello con i segnaposto parla di
 * **una** posizione: qui le posizioni sono trenta, e un `{{athlete.first_name}}`
 * non avrebbe un valore vero. Il riepilogo e testo del prodotto verso la
 * segreteria, non un messaggio del club verso una famiglia — e per questo non
 * e configurabile e non deve esserlo.
 *
 * Restituisce `null` quando non c'e niente da riassumere: un riepilogo vuoto e
 * una email che insegna a ignorare le email.
 */
export const buildDailyDigest = ({
  clubName,
  dayLabel,
  entries,
}: {
  clubName: string;
  /** Il giorno, gia scritto come si legge: `30/11/2026`. */
  dayLabel: string;
  entries: readonly DigestEntry[];
}): DailyDigest | null => {
  const groups = groupDigestEntries(entries);
  const total = groups.reduce((sum, group) => sum + group.entries.length, 0);

  if (total === 0) return null;

  const club = asText(clubName) || "Il tuo club";
  const subject = `${club}: riepilogo del ${dayLabel} (${total} ${total === 1 ? "avviso" : "avvisi"})`;

  const textLines: string[] = [
    `Riepilogo delle automazioni di ${club} del ${dayLabel}.`,
    "",
  ];
  const htmlParts: string[] = [
    `<p>Riepilogo delle automazioni di ${escapeHtml(club)} del ${escapeHtml(dayLabel)}.</p>`,
  ];

  for (const group of groups) {
    textLines.push(`${group.label} (${group.entries.length})`);
    htmlParts.push(
      `<p><strong>${escapeHtml(group.label)} (${group.entries.length})</strong></p>`,
    );

    const items: string[] = [];
    for (const entry of group.entries) {
      const line = describeEntry(entry);
      textLines.push(`- ${line}`);
      items.push(`<li>${escapeHtml(line)}</li>`);
    }

    htmlParts.push(`<ul>${items.join("")}</ul>`);
    textLines.push("");
  }

  return {
    subject,
    text: textLines.join("\n").trimEnd(),
    html: htmlParts.join(""),
    groups,
    total,
  };
};
