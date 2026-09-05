/**
 * **Email Template Core — un solo posto in cui si scrive HTML per la posta.**
 *
 * Modulo puro: nessun Prisma, nessuna rete, nessun DOM. Si prova senza
 * database e si chiama dall'anteprima esattamente come dall'invio vero.
 *
 * ## Perche esiste
 *
 * Prima di PP-05B l'HTML delle email nasceva in tre posti diversi:
 * `layout.ts` metteva un guscio con il logotipo EasyGame, e dentro ci finiva
 * una stringa composta a mano da chi chiamava — `auth-workflows.ts`,
 * `athlete-accounts.ts`, `email-service.ts` — ognuna con il proprio `<p>`, il
 * proprio pulsante finto e il proprio `escapeHtml` (o senza). Tre conseguenze:
 *
 * 1. **l'escaping era una scelta di chi chiamava.** Il nome di un club, il
 *    nome di un atleta e l'oggetto di una comunicazione arrivano da un modulo
 *    di testo compilato da una persona: se un chiamante dimentica di sfuggirli,
 *    quel messaggio porta HTML altrui dentro la casella di posta di qualcun
 *    altro. Qui l'escaping **non e** una scelta: i blocchi prendono testo, non
 *    markup, e lo sfuggono loro;
 * 2. **il guscio era sempre EasyGame**, anche quando il messaggio partiva da un
 *    club. La famiglia riceveva la comunicazione della propria societa con il
 *    logotipo di un fornitore che non conosce;
 * 3. **niente testo semplice.** `text` si scriveva a mano accanto all'HTML e
 *    divergeva alla prima modifica, quando c'era.
 *
 * ## Le regole del formato, e perche sono queste
 *
 * I client di posta non sono browser. Gmail rimuove `<style>` in una parte dei
 * suoi contesti, Outlook su Windows compone con il motore di Word — che non
 * conosce `flex`, non conosce `grid`, ignora `max-width` sui `div` e sbaglia i
 * margini. Quindi:
 *
 * - **tabelle** per l'impaginazione, non `div` con `display`;
 * - **stili in linea**, mai `<style>` come unica strada;
 * - larghezza fissa a 600 px sulla tabella interna e `width="100%"` su quella
 *   esterna: e il modo in cui una email diventa leggibile su un telefono senza
 *   una media query, che meta dei client non applicherebbe;
 * - nessuna immagine che porti informazione. Le immagini partono spente in
 *   quasi tutti i client: cio che si vede a immagini spente deve bastare.
 *
 * ## Cosa questo modulo si rifiuta di fare
 *
 * Non manda niente — l'invio resta di `email-service.ts`, punto unico — e non
 * legge il database: il marchio glielo passa chi chiama, gia risolto.
 */

/* ------------------------------------------------------------------ *
 *  Sicurezza del contenuto
 * ------------------------------------------------------------------ */

/**
 * L'escaping, in un posto solo.
 *
 * Comprende l'apostrofo singolo: un valore che finisce dentro un attributo
 * quotato con `"` non ne ha bisogno, ma questo modulo mette valori anche in
 * `alt` e in `title`, e un giorno qualcuno usera l'apostrofo per quotare.
 * Sfuggire di piu non rompe niente; sfuggire di meno rompe tutto.
 */
export const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * **Gli unici schemi che possono diventare un `href`.**
 *
 * `javascript:` in una email non esegue quasi mai — i client lo tolgono — ma
 * «quasi mai» non e un presidio, e la stessa stringa passa dall'anteprima, che
 * e una pagina vera dentro un browser vero. `data:` non e teorico: un `data:`
 * con dentro HTML e una pagina completa che si apre dal messaggio.
 *
 * I link arrivano da un modulo di testo compilato in interfaccia
 * (`payment.link`, i segnaposto delle comunicazioni di club): sono contenuto
 * di un utente, non una costante del codice.
 */
const SCHEMI_AMMESSI = new Set(["http:", "https:", "mailto:"]);

/**
 * Un URL che si puo scrivere in un `href`, oppure `null`.
 *
 * `null` non e un errore: chi chiama mostra l'etichetta senza il collegamento,
 * che e meglio di un messaggio che non parte e molto meglio di un link che non
 * si sa dove porta.
 */
export const sanitizeEmailUrl = (value: unknown): string | null => {
  const grezzo = String(value ?? "").trim();
  if (!grezzo) return null;
  try {
    const url = new URL(grezzo);
    return SCHEMI_AMMESSI.has(url.protocol) ? url.toString() : null;
  } catch {
    /*
      Un URL relativo non e ammesso di proposito: in una casella di posta non
      esiste una pagina corrente da cui risolverlo, e `/paga` diventerebbe un
      link rotto invece che un link mancante — piu difficile da notare.
    */
    return null;
  }
};

/**
 * Un colore che si puo scrivere in uno stile in linea, oppure `null`.
 *
 * Solo esadecimale: `red` funzionerebbe, ma il valore arriva dalla
 * configurazione di un club e la lista dei nomi CSS validi e lunga quanto la
 * superficie di cio che va poi controllato. Tre o sei cifre esadecimali sono
 * un insieme che si legge in una riga e che non contiene ne `;` ne `)`, cioe
 * i due caratteri con cui si esce da uno stile in linea.
 */
export const sanitizeEmailColor = (value: unknown): string | null => {
  const grezzo = String(value ?? "").trim();
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(grezzo) ? grezzo : null;
};

/* ------------------------------------------------------------------ *
 *  Il marchio
 * ------------------------------------------------------------------ */

/** La tavolozza EasyGame, in valori email-safe (nessuna variabile CSS). */
export const EASYGAME_EMAIL_PALETTE = {
  accent: "#1d4ed8",
  ink: "#0f172a",
  muted: "#64748b",
  faint: "#94a3b8",
  paper: "#f8fafc",
  card: "#ffffff",
  line: "#e2e8f0",
} as const;

/**
 * I due modi in cui una email di EasyGame puo presentarsi (ADR-0133).
 *
 * `easygame` — la manda EasyGame: account, sicurezza, verifica dei recapiti,
 * reimpostazione della password, servizi di piattaforma. Il mittente e
 * EasyGame e il destinatario deve riconoscerlo.
 *
 * `club` — la manda la societa: comunicazioni, solleciti, promemoria, inviti.
 * Il destinatario ha un rapporto con il club, non con noi; il messaggio porta
 * il nome del club. Il riferimento a EasyGame resta nel piede pagina, discreto
 * e **non rimovibile** in V1: e la sola riga che dice a una famiglia da dove
 * arriva davvero il messaggio, e serve a lei prima che a noi.
 */
export type EmailBrand =
  | { mode: "easygame" }
  | {
      mode: "club";
      clubName: string;
      /** Ammesso solo se assoluto e sulla nostra origine: vedi `resolveBrandLogo`. */
      logoUrl?: string | null;
      /** Esadecimale; qualunque altra cosa ricade sull'accento EasyGame. */
      accentColor?: string | null;
    };

export const EASYGAME_BRAND: EmailBrand = { mode: "easygame" };

const baseUrlApplicazione = () =>
  (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001").replace(
    /\/+$/,
    "",
  );

/** Logotipo blu: le email hanno sempre sfondo chiaro. */
export const getEmailLogoUrl = () =>
  `${baseUrlApplicazione()}/images/brand/logotipo-b.png`;

/**
 * **Il logo di un club diventa un `<img>` solo se e roba nostra.**
 *
 * Tre motivi, in ordine di gravita:
 *
 * 1. **un'immagine remota e un tracciatore.** Un `<img>` che punta a un host
 *    scelto da chi compone il messaggio dice a quell'host quando il messaggio
 *    e stato aperto, da quale indirizzo IP e con quale client. In una
 *    comunicazione che parte verso le famiglie di un club — spesso minori —
 *    questo e un trasferimento di dati personali a un terzo che nessuno ha
 *    dichiarato;
 * 2. **oggi `clubs.logo_url` e un data URL**, e i data URL nelle immagini sono
 *    bloccati da Gmail e da Outlook: renderizzarli produrrebbe un rettangolo
 *    vuoto in cima a ogni messaggio, cioe l'aspetto di un messaggio rotto;
 * 3. un URL esterno che smette di rispondere lascia lo stesso rettangolo
 *    vuoto, e nessuno se ne accorge finche non lo segnala una famiglia.
 *
 * Il ripiego non e un buco: e il **nome del club scritto in lettere**, che si
 * legge anche a immagini spente — cioe nella condizione predefinita della
 * maggior parte dei client. Quando i loghi dei club avranno un archivio
 * servito dalla nostra origine, questa funzione li lascera passare senza che
 * cambi nient'altro.
 */
export const resolveBrandLogo = (
  brand: EmailBrand,
): { kind: "image"; url: string; alt: string } | { kind: "text"; text: string } => {
  if (brand.mode === "easygame") {
    return { kind: "image", url: getEmailLogoUrl(), alt: "EasyGame" };
  }

  const nome = String(brand.clubName || "").trim() || "Il tuo club";
  const candidato = sanitizeEmailUrl(brand.logoUrl);
  if (!candidato) return { kind: "text", text: nome };

  try {
    const nostra = new URL(baseUrlApplicazione());
    const suo = new URL(candidato);
    if (suo.origin === nostra.origin && suo.protocol !== "mailto:") {
      return { kind: "image", url: candidato, alt: nome };
    }
  } catch {
    /* Base URL malformata: si ricade sul nome, che non puo sbagliare. */
  }

  return { kind: "text", text: nome };
};

/** L'accento effettivo: quello del club se e leggibile, altrimenti il nostro. */
export const resolveBrandAccent = (brand: EmailBrand) =>
  (brand.mode === "club" ? sanitizeEmailColor(brand.accentColor) : null) ||
  EASYGAME_EMAIL_PALETTE.accent;

/* ------------------------------------------------------------------ *
 *  I blocchi
 * ------------------------------------------------------------------ */

/**
 * Un'email si compone di blocchi, e un blocco prende **testo**, non markup.
 *
 * E la differenza che rende impossibile dimenticare l'escaping: chi scrive un
 * messaggio non ha in mano una stringa HTML da concatenare, ha un elenco di
 * cose da dire.
 */
export type EmailBlock =
  /** Il titolo del messaggio. Uno solo, in cima, quasi sempre. */
  | { kind: "heading"; text: string }
  /** Un paragrafo. */
  | { kind: "text"; text: string }
  /** Un elenco puntato. */
  | { kind: "list"; items: string[] }
  /**
   * Il pulsante. `url` passa da `sanitizeEmailUrl`: se non passa, resta
   * l'etichetta e sotto l'indirizzo in chiaro, perche un messaggio che dice
   * «clicca qui» senza il qui e peggio di uno che scrive l'indirizzo.
   */
  | { kind: "cta"; label: string; url: string }
  /** Il codice OTP: grande, spaziato, selezionabile. */
  | { kind: "code"; value: string }
  /** Il riquadro informativo: un titolo facoltativo e delle righe. */
  | { kind: "info"; title?: string; lines: string[] }
  /** La riga di separazione. */
  | { kind: "divider" }
  /** Una nota in piccolo, sotto il contenuto e sopra il piede pagina. */
  | { kind: "footnote"; text: string }
  /**
   * **L'unica via d'uscita, e serve una ragione per usarla.**
   *
   * Esiste per il solo caso in cui l'HTML e gia stato reso da un altro dominio
   * che se ne assume la responsabilita: i modelli di messaggio del club
   * (`renderMessageTemplate`), che sfuggono i valori dei segnaposto per conto
   * proprio prima di comporre. Chi passa di qui **deve** portare anche il
   * `text`, altrimenti il testo semplice di quel messaggio sarebbe vuoto.
   */
  | { kind: "raw"; html: string; text: string };

/* ------------------------------------------------------------------ *
 *  Il rendering
 * ------------------------------------------------------------------ */

const FONT = "Arial, Helvetica, sans-serif";

const renderBlockHtml = (block: EmailBlock, accent: string): string => {
  const P = EASYGAME_EMAIL_PALETTE;
  switch (block.kind) {
    case "heading":
      return `<h1 style="margin:0 0 16px;font-family:${FONT};font-size:20px;line-height:28px;font-weight:bold;color:${P.ink};">${escapeHtml(block.text)}</h1>`;

    case "text":
      return `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:23px;color:${P.ink};">${escapeHtml(block.text)}</p>`;

    case "list":
      return `<ul style="margin:0 0 16px;padding-left:20px;font-family:${FONT};font-size:15px;line-height:23px;color:${P.ink};">${block.items
        .map((item) => `<li style="margin:0 0 4px;">${escapeHtml(item)}</li>`)
        .join("")}</ul>`;

    case "cta": {
      const url = sanitizeEmailUrl(block.url);
      if (!url) {
        /*
          Il link non passa il filtro. Non si tace: si mostra l'etichetta come
          testo. Un pulsante che sembra un pulsante e non porta da nessuna
          parte e la forma peggiore di questo errore.
        */
        return `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:23px;color:${P.muted};">${escapeHtml(block.label)}</p>`;
      }
      /*
        Il pulsante e una tabella, non un `<a>` con `padding`: Outlook su
        Windows ignora il padding di un elemento in linea e produrrebbe una
        scritta blu senza area cliccabile. Sotto, l'indirizzo per esteso —
        serve a chi legge in testo semplice, a chi ha le immagini spente, e a
        chi vuole vedere dove sta andando prima di andarci.
      */
      return [
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;"><tr>`,
        `<td align="center" bgcolor="${accent}" style="border-radius:8px;">`,
        `<a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(block.label)}</a>`,
        `</td></tr></table>`,
        `<p style="margin:0 0 16px;font-family:${FONT};font-size:12px;line-height:18px;color:${P.muted};word-break:break-all;">${escapeHtml(url)}</p>`,
      ].join("");
    }

    case "code":
      /*
        `letter-spacing` non e supportato ovunque, ed e per questo che il
        codice e grande e in grassetto **anche senza**: la spaziatura e un
        miglioramento, non il modo in cui il codice si legge.
      */
      return `<p style="margin:0 0 16px;padding:14px 18px;background:${P.paper};border:1px solid ${P.line};border-radius:8px;font-family:${FONT};font-size:28px;line-height:34px;font-weight:bold;letter-spacing:6px;text-align:center;color:${P.ink};">${escapeHtml(block.value)}</p>`;

    case "info":
      return [
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;background:${P.paper};border:1px solid ${P.line};border-radius:8px;"><tr><td style="padding:14px 16px;">`,
        block.title
          ? `<p style="margin:0 0 6px;font-family:${FONT};font-size:13px;line-height:18px;font-weight:bold;color:${P.ink};">${escapeHtml(block.title)}</p>`
          : "",
        block.lines
          .map(
            (line) =>
              `<p style="margin:0 0 2px;font-family:${FONT};font-size:13px;line-height:19px;color:${P.muted};">${escapeHtml(line)}</p>`,
          )
          .join(""),
        `</td></tr></table>`,
      ].join("");

    case "divider":
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;"><tr><td style="border-top:1px solid ${P.line};font-size:0;line-height:0;">&nbsp;</td></tr></table>`;

    case "footnote":
      return `<p style="margin:0 0 8px;font-family:${FONT};font-size:12px;line-height:18px;color:${P.muted};">${escapeHtml(block.text)}</p>`;

    case "raw":
      return block.html;
  }
};

const renderBlockText = (block: EmailBlock): string[] => {
  switch (block.kind) {
    case "heading":
      return [block.text, ""];
    case "text":
      return [block.text, ""];
    case "list":
      return [...block.items.map((item) => `- ${item}`), ""];
    case "cta": {
      const url = sanitizeEmailUrl(block.url);
      return url ? [block.label, url, ""] : [block.label, ""];
    }
    case "code":
      return [block.value, ""];
    case "info":
      return [...(block.title ? [block.title] : []), ...block.lines, ""];
    case "divider":
      return ["---", ""];
    case "footnote":
      return [block.text, ""];
    case "raw":
      return [block.text, ""];
  }
};

export type EmailDocument = {
  brand: EmailBrand;
  /**
   * La riga che i client mostrano accanto all'oggetto. Se manca, la maggior
   * parte di essi pesca la prima cosa che trova nel corpo — di solito il
   * nome del club nel logo, che non dice niente.
   */
  preheader?: string;
  blocks: EmailBlock[];
};

/**
 * **La sola funzione che compone una email.**
 *
 * Restituisce sempre le due forme: HTML e testo semplice. Non sono due
 * scritture, sono due proiezioni degli stessi blocchi, quindi non possono
 * divergere alla prossima modifica.
 */
export const renderEmailDocument = ({
  brand,
  preheader,
  blocks,
}: EmailDocument): { html: string; text: string } => {
  const P = EASYGAME_EMAIL_PALETTE;
  const accent = resolveBrandAccent(brand);
  const logo = resolveBrandLogo(brand);
  const nomeMittente =
    brand.mode === "club"
      ? String(brand.clubName || "").trim() || "Il tuo club"
      : "EasyGame";

  const intestazione =
    logo.kind === "image"
      ? `<img src="${escapeHtml(logo.url)}" alt="${escapeHtml(logo.alt)}" width="140" style="display:block;border:0;max-width:140px;height:auto;" />`
      : `<span style="font-family:${FONT};font-size:18px;line-height:24px;font-weight:bold;color:${accent};">${escapeHtml(logo.text)}</span>`;

  /*
    **Il piede pagina dice chi manda, e in modalita club dice anche da dove.**

    In V1 il club non puo togliere «Powered by EasyGame», e non e un parametro:
    non esiste un modo di chiamare questa funzione che lo ometta. E la riga che
    permette a una famiglia di capire a chi appartiene il sistema che le ha
    scritto — cioe a chi rivolgersi se il messaggio e sospetto.
  */
  const piede =
    brand.mode === "club"
      ? [
          `<p style="margin:0 0 4px;font-family:${FONT};font-size:12px;line-height:18px;color:${P.muted};">${escapeHtml(nomeMittente)}</p>`,
          `<p style="margin:0;font-family:${FONT};font-size:11px;line-height:17px;color:${P.faint};">Powered by <a href="${escapeHtml(baseUrlApplicazione())}" style="color:${P.faint};text-decoration:underline;">EasyGame</a></p>`,
        ].join("")
      : `<p style="margin:0;font-family:${FONT};font-size:12px;line-height:18px;color:${P.faint};">EasyGame</p>`;

  const piedeTesto =
    brand.mode === "club"
      ? [nomeMittente, "Powered by EasyGame"]
      : ["EasyGame"];

  const corpo = blocks
    .map((block) => renderBlockHtml(block, accent))
    .join("");

  /*
    Il preheader: testo vero, nascosto con tre proprieta perche nessuna di esse
    e onorata ovunque, e seguito da spazi non uniformi che spingono fuori dal
    riquadro d'anteprima cio che verrebbe dopo. E il trucco standard, ed e
    brutto perche nella posta non esiste un modo pulito di farlo.
  */
  const anteprima = String(preheader || "").trim();
  const rigaAnteprima = anteprima
    ? `<div style="display:none;font-size:0;line-height:0;max-height:0;mso-hide:all;overflow:hidden;">${escapeHtml(anteprima)}${"&#8199;&#65279;&#847; ".repeat(30)}</div>`
    : "";

  const html = [
    rigaAnteprima,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:${P.paper};margin:0;padding:0;">`,
    `<tr><td align="center" style="padding:32px 16px;">`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;">`,
    `<tr><td style="padding:0 0 24px;">${intestazione}</td></tr>`,
    `<tr><td style="background:${P.card};border:1px solid ${P.line};border-radius:12px;padding:24px;">${corpo}</td></tr>`,
    `<tr><td style="padding:20px 4px 0;">${piede}</td></tr>`,
    `</table>`,
    `</td></tr></table>`,
  ].join("");

  const text = [
    ...(anteprima ? [anteprima, ""] : []),
    ...blocks.flatMap(renderBlockText),
    "--",
    ...piedeTesto,
  ]
    .join("\n")
    /* Mai piu di una riga vuota di fila: i blocchi chiudono gia con la loro. */
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { html, text };
};
