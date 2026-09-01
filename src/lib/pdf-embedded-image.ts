/**
 * **Il caso solo del PDF che è una fotografia.**
 *
 * ## Il difetto che chiude
 *
 * L'estrazione dai documenti rifiuta i PDF, e lo dichiara con una frase
 * onesta: «il motore attuale legge immagini, fotografa il documento». Ma la
 * persona che riceve quel messaggio ha, quasi sempre, appena **fotografato il
 * documento**: i telefoni recenti — e ogni app di scansione — salvano lo
 * scatto in PDF per impostazione predefinita. Le si sta chiedendo di rifare
 * una cosa che ha già fatto.
 *
 * ## Cosa fa, e soprattutto cosa NON fa
 *
 * **Non legge i PDF.** Non è un motore di rendering, non interpreta pagine,
 * non compone testo, non conosce font, trasformazioni o livelli. Fa una cosa
 * sola: quando un PDF **contiene una sola immagine JPEG e nient'altro di
 * disegnabile**, ne restituisce i byte. È la forma esatta prodotta da uno
 * scatto salvato in PDF.
 *
 * Il PDF resta un contenitore, e questo modulo lo apre; l'OCR continua a
 * girare sull'immagine, nel browser, come prima. Il vincolo del mandato —
 * «non sviluppare OCR artigianale» — non è toccato: qui non si riconosce
 * niente.
 *
 * ## Perché non `pdf.js`
 *
 * Sarebbe una dipendenza di alcuni megabyte per un solo caso d'uso, su un
 * percorso che il vincolo ADR-0007 chiede di tenere leggero, e porterebbe con
 * sé un motore completo di rendering là dove serve un `substring`. La
 * decisione di non aggiungerla è la stessa che `document-extraction.ts`
 * dichiara già.
 *
 * ## Perché è severo, e perché è la cosa giusta
 *
 * Se il PDF non ha **esattamente** una immagine JPEG, o se contiene altro che
 * potrebbe essere disegnato sopra — testo, un secondo scatto, un'immagine in
 * un formato diverso — questo modulo **non prova a indovinare**: restituisce
 * `null`, e il rifiuto di prima resta con la sua spiegazione.
 *
 * La ragione non è prudenza generica. Su un documento d'identità un ritaglio
 * sbagliato produce un dato **plausibile e falso**, e un dato plausibile e
 * falso su un tesseramento diventa un errore federale. Meglio dire «non ci
 * riesco» che leggere la pagina sbagliata.
 */

/** Il numero massimo di byte che accettiamo di scorrere: 8 MB, come l'OCR. */
const MAX_PDF_BYTES = 8 * 1024 * 1024;

const ASCII = {
  /** `stream` */
  stream: [0x73, 0x74, 0x72, 0x65, 0x61, 0x6d],
  /** `endstream` */
  endstream: [0x65, 0x6e, 0x64, 0x73, 0x74, 0x72, 0x65, 0x61, 0x6d],
} as const;

const indexOfBytes = (
  origine: Uint8Array,
  ago: readonly number[],
  da: number,
): number => {
  const ultimo = origine.length - ago.length;
  for (let i = Math.max(0, da); i <= ultimo; i += 1) {
    let uguale = true;
    for (let j = 0; j < ago.length; j += 1) {
      if (origine[i + j] !== ago[j]) {
        uguale = false;
        break;
      }
    }
    if (uguale) return i;
  }
  return -1;
};

/**
 * L'intestazione di un JPEG, cercata nei byte grezzi.
 *
 * Serve come **secondo controllo**: il dizionario del PDF dichiara
 * `/DCTDecode`, ma è il contenuto a doverlo confermare. Un contenitore che
 * mente su cosa contiene non è un caso teorico — è come si nascondono i file.
 */
const iniziaComeJpeg = (byte: Uint8Array) =>
  byte.length > 3 && byte[0] === 0xff && byte[1] === 0xd8 && byte[2] === 0xff;

const finisceComeJpeg = (byte: Uint8Array) =>
  byte.length > 1 &&
  byte[byte.length - 2] === 0xff &&
  byte[byte.length - 1] === 0xd9;

/** Il testo latino-1 dei byte: i dizionari di un PDF sono ASCII. */
const testoDi = (byte: Uint8Array, da: number, a: number) => {
  let fuori = "";
  const fine = Math.min(a, byte.length);
  for (let i = Math.max(0, da); i < fine; i += 1) {
    fuori += String.fromCharCode(byte[i]);
  }
  return fuori;
};

export type PdfImmagineIncorporata = {
  /** I byte del JPEG, pronti per l'OCR. */
  bytes: Uint8Array;
  mimeType: "image/jpeg";
};

/** `true` se questi byte cominciano come un PDF. */
export const sembraUnPdf = (byte: Uint8Array) =>
  byte.length > 4 &&
  byte[0] === 0x25 && // %
  byte[1] === 0x50 && // P
  byte[2] === 0x44 && // D
  byte[3] === 0x46; // F

/**
 * Estrae l'unica immagine JPEG di un PDF, o `null`.
 *
 * `null` non è un errore: è la risposta onesta per ogni PDF che non sia uno
 * scatto salvato in PDF. Chi la riceve mantiene il messaggio di rifiuto che
 * aveva prima.
 */
export const estraiImmagineDaPdf = (
  byte: Uint8Array,
): PdfImmagineIncorporata | null => {
  if (!sembraUnPdf(byte)) return null;
  if (byte.length > MAX_PDF_BYTES) return null;

  const trovate: Uint8Array[] = [];
  /*
    Quante immagini il PDF **dichiara**, indipendentemente da quante riusciamo
    a estrarne. Se il documento ne dichiara due e noi ne leggiamo una, non
    sappiamo quale delle due sta guardando la persona: e allora non lo sa
    nessuno, e ci si ferma.
  */
  let dichiarateNonJpeg = 0;

  let cursore = 0;
  while (cursore < byte.length && trovate.length <= 2) {
    const inizioStream = indexOfBytes(byte, ASCII.stream, cursore);
    if (inizioStream < 0) break;

    const fineStream = indexOfBytes(
      byte,
      ASCII.endstream,
      inizioStream + ASCII.stream.length,
    );
    if (fineStream < 0) break;

    /*
      Il dizionario che descrive questo flusso sta **prima** della parola
      `stream`. Si guarda una finestra generosa ma finita: un dizionario di
      immagine sta in poche centinaia di byte, e leggere all'indietro senza
      limite significherebbe raccogliere il dizionario di un altro oggetto.
    */
    const dizionario = testoDi(
      byte,
      Math.max(0, inizioStream - 1200),
      inizioStream,
    );

    const eUnaImmagine = /\/Subtype\s*\/Image/.test(dizionario);

    if (eUnaImmagine) {
      if (/\/Filter\s*(\[[^\]]*)?\/DCTDecode/.test(dizionario)) {
        /*
          Dopo `stream` c'è un a capo — `\r\n` oppure `\n` — che non fa parte
          dei dati. Non toglierlo produrrebbe un JPEG che comincia un byte
          troppo presto, cioè un file che nessun decodificatore apre.
        */
        let inizioDati = inizioStream + ASCII.stream.length;
        if (byte[inizioDati] === 0x0d) inizioDati += 1;
        if (byte[inizioDati] === 0x0a) inizioDati += 1;

        /*
          E prima di `endstream` c'è, quasi sempre, un altro a capo. Si taglia
          sull'indicatore di fine del JPEG quando c'è: è più affidabile che
          contare gli spazi bianchi, perché li scrive chi ha prodotto il file.
        */
        let fineDati = fineStream;
        while (
          fineDati > inizioDati &&
          (byte[fineDati - 1] === 0x0a || byte[fineDati - 1] === 0x0d)
        ) {
          fineDati -= 1;
        }

        const dati = byte.subarray(inizioDati, fineDati);
        if (iniziaComeJpeg(dati) && finisceComeJpeg(dati)) {
          trovate.push(dati);
        } else {
          dichiarateNonJpeg += 1;
        }
      } else {
        dichiarateNonJpeg += 1;
      }
    }

    cursore = fineStream + ASCII.endstream.length;
  }

  /*
    Una sola immagine, e nessuna che non siamo riusciti a leggere. Le due
    condizioni sono separate apposta: «ne ho trovata una» non basta se il
    documento ne dichiarava un'altra che non ho saputo aprire.
  */
  if (trovate.length !== 1 || dichiarateNonJpeg > 0) return null;

  return { bytes: trovate[0], mimeType: "image/jpeg" };
};

/**
 * Da `dataUrl` di un PDF a `dataUrl` di un'immagine, o `null`.
 *
 * È la forma che serve al motore di estrazione, che parla in `dataUrl` perché
 * `tesseract.js` accetta quello e perché il file non lascia il browser.
 */
export const dataUrlImmagineDaPdf = (dataUrl: string): string | null => {
  const separatore = String(dataUrl || "").indexOf(",");
  if (separatore < 0) return null;

  const testa = dataUrl.slice(0, separatore);
  if (!testa.includes("base64")) return null;

  let grezzo: string;
  try {
    grezzo = atob(dataUrl.slice(separatore + 1));
  } catch {
    return null;
  }

  const byte = new Uint8Array(grezzo.length);
  for (let i = 0; i < grezzo.length; i += 1) byte[i] = grezzo.charCodeAt(i);

  const immagine = estraiImmagineDaPdf(byte);
  if (!immagine) return null;

  let base64 = "";
  const blocco = 0x8000;
  for (let i = 0; i < immagine.bytes.length; i += blocco) {
    base64 += String.fromCharCode(
      ...immagine.bytes.subarray(i, i + blocco),
    );
  }

  return `data:${immagine.mimeType};base64,${btoa(base64)}`;
};
