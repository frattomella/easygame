import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **Quattro pulsanti dell'area famiglia che dicevano il falso.**
 *
 * ---
 *
 * Tre difetti su quattro hanno la stessa forma: **un comando che appare
 * disponibile e non fa cio che dice**. Non e codice mancante, e codice che
 * mente — la stessa classe del §13 di CLAUDE.md, un metro piu avanti.
 *
 * - **§4.4, riaperto** — «Paga ora» in cima ai Pagamenti era collegato con
 *   `onClick={apriPagamento}`. `Button` spande le props su un `<button>`
 *   nativo, quindi React passava il SyntheticEvent come primo argomento: la
 *   funzione lo scambiava per la rata scelta, `rata?.id` era `undefined` e
 *   usciva in silenzio. Pulsante abilitato, nessun effetto.
 * - **la didascalia** — «Pagamento online presto disponibile» compariva ogni
 *   volta che non c'era una rata aperta, cioe a una famiglia in regola. Il
 *   checkout esiste ed e cablato: era falso.
 * - **i due moduli di caricamento** — un solo stato del file per due `<input
 *   type="file">` non controllati. Chi sceglieva un file per una richiesta e
 *   poi apriva il riquadro libero trovava un pulsante gia abilitato su un
 *   campo vuoto, e un clic mandava quel documento come deposito spontaneo.
 * - **la disdetta** — restava su `window.confirm`, mentre `/appuntamenti`,
 *   stesso dominio e stessa Wave, motiva a lungo la scelta opposta.
 *
 * Piu i due minori sulla schermata di scelta del figlio: `fetch` diretto
 * invece di `apiRequest` (quindi nessun `notifyUnauthorized` a sessione
 * scaduta) e `min-h-screen` dove le convenzioni chiedono `min-h-[100dvh]`.
 */

const SRC = path.join(process.cwd(), "src");
const leggi = (relativo) =>
  readFileSync(path.join(SRC, ...relativo.split("/")), "utf8");

const PAGINE = "components/parent-dashboard/parent-dashboard-pages.tsx";
const RIEPILOGO = "components/payments/EnrollmentPaymentBreakdown.tsx";
const SCELTA_FIGLIO = "app/parent-view/page.tsx";

const senzaCommenti = (sorgente) =>
  sorgente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Il corpo di una funzione esportata, dal `export function` al successivo. */
const corpoDi = (sorgente, nome) => {
  const inizio = sorgente.indexOf(`export function ${nome}(`);
  assert.notEqual(inizio, -1, `non trovo ${nome}`);
  const dopo = sorgente.indexOf("\nexport function ", inizio + 1);
  return sorgente.slice(inizio, dopo === -1 ? sorgente.length : dopo);
};

/* ------------------------------------------------- §4.4, riaperto */

test("nessuna callback con argomenti e collegata direttamente a un onClick", () => {
  const sorgente = senzaCommenti(leggi(PAGINE));

  /*
    `onClick={qualcosa}` senza freccia: React consegna il SyntheticEvent come
    primo argomento. Se quella funzione un argomento lo accetta, l'evento
    prende il posto del dato vero — ed e esattamente il modo in cui «Paga ora»
    era morto restando abilitato.
  */
  const collegate = [
    ...sorgente.matchAll(/onClick=\{([A-Za-z_$][\w$]*)\}/g),
  ].map((trovato) => trovato[1]);

  const colpevoli = collegate.filter((nome) => {
    const dichiarazione = new RegExp(
      `const\\s+${nome}\\s*=\\s*(?:useCallback\\(\\s*)?(?:async\\s*)?\\(([^)]*)\\)`,
    ).exec(sorgente);

    // Una callback che non si riesce a leggere si considera sospetta.
    return !dichiarazione || dichiarazione[1].trim() !== "";
  });

  assert.deepEqual(
    colpevoli,
    [],
    `queste callback ricevono l'evento al posto del loro argomento: ${colpevoli.join(", ")}`,
  );
});

test("«Paga ora» in cima ai Pagamenti apre davvero il checkout", () => {
  /* Senza commenti: uno di essi cita il collegamento sbagliato per nome. */
  const pagamenti = senzaCommenti(corpoDi(leggi(PAGINE), "ParentPaymentsPage"));

  assert.equal(
    /onClick=\{apriPagamento\}/.test(pagamenti),
    false,
    "il pulsante e di nuovo collegato alla callback nuda: riceve l'evento e non fa niente",
  );
  assert.ok(
    pagamenti.includes("onClick={() => void apriPagamento()}"),
    "il pulsante in cima non chiama piu apriPagamento senza argomenti",
  );
  // La strada per riga resta quella, e passa la rata vera.
  assert.ok(pagamenti.includes("onPayInstalment={(rata) => void apriPagamento(rata)}"));
});

test("il tipo della rata impedisce di ricollegare la callback a un onClick", () => {
  const sorgente = leggi(PAGINE);

  /*
    `RataDaPagare` e un tipo di sole proprieta opzionali: TypeScript rifiuta di
    assegnargli un oggetto che non ne ha **nessuna** in comune, e un
    SyntheticEvent non ha `id`. Se questo tipo tornasse `any`, il difetto
    potrebbe rientrare senza che `npm run typecheck` dica niente.
  */
  assert.ok(
    /type RataDaPagare = \{ id\?: unknown \}/.test(sorgente),
    "manca il tipo debole che fa fallire la compilazione del collegamento sbagliato",
  );
  assert.ok(
    /apriPagamento = useCallback\(async \(rataScelta\?: RataDaPagare\)/.test(
      sorgente,
    ),
    "apriPagamento non e piu tipizzata con RataDaPagare",
  );
});

/* ------------------------------------------------------ la didascalia */

test("la didascalia sotto «Paga ora» non promette una funzione che esiste gia", () => {
  /*
    Senza commenti: uno racconta la storia del pulsante e cita la vecchia
    frase. Cio che conta e che non finisca piu sotto gli occhi di nessuno.
  */
  const sorgente = senzaCommenti(leggi(RIEPILOGO));

  assert.equal(
    sorgente.includes("presto disponibile"),
    false,
    "la famiglia legge ancora che il pagamento online non c'e: e cablato, e la stessa pagina lo apre riga per riga",
  );
});

test("la didascalia distingue i casi veri, e finisce a schermo", () => {
  const sorgente = leggi(RIEPILOGO);

  const inizio = sorgente.indexOf("const payNowHint =");
  assert.notEqual(inizio, -1, "manca il calcolo della didascalia");
  const blocco = sorgente.slice(inizio, sorgente.indexOf(";", inizio));

  // Pagamento in corso, rata aperta, nessuna rata emessa, tutto saldato.
  for (const condizione of ["payNowPending", "onPayNow", "rateAttive"]) {
    assert.ok(
      blocco.includes(condizione),
      `la didascalia non guarda ${condizione}: non puo distinguere i casi`,
    );
  }
  assert.ok(blocco.includes("tutto saldato"));
  assert.ok(blocco.includes("non ha ancora emesso rate"));

  assert.ok(
    sorgente.includes("{payNowHint}"),
    "il valore calcolato non arriva a schermo",
  );
});

/* -------------------------------------------- i due moduli di caricamento */

test("i due moduli di caricamento hanno due stati distinti", () => {
  const documenti = corpoDi(leggi(PAGINE), "ParentDocumentsPage");

  assert.equal(
    /\bfileScelto\b/.test(documenti),
    false,
    "lo stato del file e di nuovo uno solo per due moduli",
  );
  assert.ok(documenti.includes("const [fileRichiesta, setFileRichiesta]"));
  assert.ok(documenti.includes("const [fileSpontaneo, setFileSpontaneo]"));
});

test("ogni modulo legge, invia e abilita sul proprio file", () => {
  const documenti = senzaCommenti(corpoDi(leggi(PAGINE), "ParentDocumentsPage"));

  const taglio = documenti.indexOf("<details");
  assert.notEqual(taglio, -1, "manca il riquadro del deposito spontaneo");

  /*
    Solo il **modulo** della riga aperta, non tutto cio che lo precede: la
    funzione `carica` sta piu in alto e nomina legittimamente entrambi gli
    stati, perche e lei ad azzerare quello giusto dopo l'invio.
  */
  const apertura = documenti.indexOf("{voceAperta === document.id ? (");
  assert.notEqual(apertura, -1, "manca il modulo della richiesta aperta");

  const riga = documenti.slice(apertura, taglio);
  const libero = documenti.slice(taglio);

  // Il modulo della richiesta aperta.
  assert.ok(riga.includes("void carica(voceScelta || document, fileRichiesta)"));
  assert.ok(riga.includes("disabled={inCaricamento || !fileRichiesta}"));
  assert.ok(riga.includes("setFileRichiesta(event.target.files?.[0] || null)"));
  assert.equal(
    /\bfileSpontaneo\b/.test(riga),
    false,
    "il modulo della riga legge lo stato del deposito spontaneo",
  );

  // Il modulo libero: campo vuoto, pulsante spento.
  assert.ok(libero.includes("void carica(null, fileSpontaneo)"));
  assert.ok(libero.includes("disabled={inCaricamento || !fileSpontaneo}"));
  assert.ok(libero.includes("setFileSpontaneo(event.target.files?.[0] || null)"));
  assert.equal(
    /\bfileRichiesta\b/.test(libero),
    false,
    "il modulo libero e ancora abilitato dal file scelto per una richiesta",
  );
});

test("il campo si svuota insieme allo stato, e non resta un nome di file bugiardo", () => {
  const documenti = leggi(PAGINE);

  /*
    Un `<input type="file">` non si controlla con `value`: senza il rimonto,
    dopo un invio riuscito il campo continuerebbe a mostrare il file appena
    mandato mentre il pulsante e disabilitato.
  */
  assert.ok(documenti.includes('key={`richiesta-${azzeraRichiesta}`}'));
  assert.ok(documenti.includes('key={`spontaneo-${azzeraSpontaneo}`}'));
});

/* --------------------------------------------------------- la disdetta */

test("la disdetta di un appuntamento passa dal dialogo del prodotto", () => {
  const sorgente = leggi(PAGINE);

  assert.equal(
    /window\.confirm/.test(senzaCommenti(sorgente)),
    false,
    "e tornato il popup del browser: /appuntamenti, stesso dominio, usa AlertDialog",
  );

  const segreteria = corpoDi(sorgente, "ParentSecretariatPage");
  assert.ok(segreteria.includes("<AlertDialog"));
  assert.ok(segreteria.includes("open={Boolean(daDisdire)}"));
  assert.ok(
    segreteria.includes("onClick={() => setDaDisdire(appointment)}"),
    "il pulsante «Elimina» non apre piu il dialogo",
  );
});

/* ------------------------------------------------- la scelta del figlio */

test("la schermata di scelta del figlio usa il trasporto di prodotto", () => {
  const sorgente = leggi(SCELTA_FIGLIO);

  assert.equal(
    /fetch\(\s*["'`]\/api/.test(sorgente),
    false,
    "un fetch diretto a /api salta notifyUnauthorized: a sessione scaduta si vede un errore invece del login",
  );
  assert.ok(sorgente.includes('apiRequest<{ children?: Figlio[] }>('));
  assert.ok(sorgente.includes('from "@/lib/api/client"'));
});

test("la schermata di scelta del figlio resta alta quanto lo schermo vero", () => {
  const sorgente = leggi(SCELTA_FIGLIO);

  assert.equal(
    /min-h-screen/.test(sorgente),
    false,
    "min-h-screen usa 100vh: su mobile la barra del browser lo fa sbordare",
  );
  assert.ok(sorgente.includes("min-h-[100dvh]"));
});
