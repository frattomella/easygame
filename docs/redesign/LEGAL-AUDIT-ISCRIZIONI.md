# Iscrizioni online, consensi e sottoscrizioni — verifica normativa (Italia / UE)

**Data:** 2026-09-16 · **Ambito:** modulo pubblico di iscrizione, pratiche,
dichiarazioni, documenti, firma · **Decisioni collegate:** ADR-0189, ADR-0191,
ADR-0192.

> Questa matrice dice **cosa la norma chiede, cosa EasyGame fa e cosa non fa**.
> Non afferma che EasyGame «e conforme»: la conformita e del titolare (il club)
> con i suoi testi, le sue basi giuridiche e i suoi tempi di conservazione, e
> molte righe qui sotto richiedono un parere professionale. Le fonti sono
> quelle ufficiali; dove il testo non e stato letto nella fonte primaria e
> detto.

## Fonti ufficiali consultate

| Sigla | Fonte | Come e stata letta |
|---|---|---|
| GDPR | Regolamento (UE) 2016/679 — EUR-Lex `CELEX:32016R0679` | il testo di EUR-Lex non era leggibile dallo strumento (pagina vuota); gli articoli citati sono verificati sulla copia integrale di legislation.gov.uk (identica al testo del 2016 per gli articoli citati) |
| EDPB 05/2020 | Linee guida 05/2020 sul consenso, v1.1 — `edpb.europa.eu/system/files/documents/files/file1/edpb_guidelines_202005_consent_en.pdf` | letta (§§ 78–98, 104–108, 119, 131–133) |
| Codice | d.lgs. 196/2003 come modificato dal d.lgs. 101/2018, art. 2-quinquies — Normattiva | letto |
| CAD | d.lgs. 82/2005, art. 20 c. 1-bis — Normattiva | letto |
| eIDAS | Regolamento (UE) 910/2014, artt. 3, 25, 26 — copia integrale su legislation.gov.uk | letti artt. 25–26 (EUR-Lex non leggibile dallo strumento) |
| DPCM FEA | DPCM 22 febbraio 2013, artt. 55–57, 60–61 — Gazzetta Ufficiale | letto art. 57 |
| AgID | Linee guida sulla formazione, gestione e conservazione dei documenti informatici (in vigore dal 1/1/2022) — `agid.gov.it` | consultate per immodificabilita, impronta, metadati (fonte ufficiale; testo integrale non riletto integralmente) |
| Garante | Provvedimenti specifici per ASD/SSD | **non trovata** una fonte primaria del Garante dedicata alle associazioni sportive: le guide reperite sono commerciali e **non** sono usate come autorita |

## Matrice

Legenda colonne: **Cosa fa EasyGame** (dopo questo lotto) · **Gap** ·
**Azione tecnica** · **Azione organizzativa/legale** · **Serve un legale**.

### A. Protezione dei dati (GDPR / Codice)

| # | Requisito | Fonte | Cosa fa EasyGame | Gap | Azione tecnica | Azione org./legale | Legale |
|---|---|---|---|---|---|---|---|
| A1 | Informativa al momento della raccolta (identita del titolare, finalita, base giuridica, destinatari, conservazione, diritti) | GDPR artt. 12–13 | Il builder ha un blocco `content` per il testo dell'informativa e una casella `acknowledgement` («presa visione») la cui prova (testo, hash, versione, ora) e nella pratica | Il **testo** e del club; EasyGame non lo fornisce ne lo verifica | Blocco «Informativa» nel catalogo dei modelli come esempio, marcato «da compilare» | Il club redige l'informativa con il proprio DPO/consulente | **Si** |
| A2 | Base giuridica per l'iscrizione (di regola: contratto/rapporto associativo, obblighi di legge per il tesseramento) — **non** il consenso | GDPR art. 6(1)(b),(c); EDPB 05/2020 §§ 99–103 (consenso come condizione del contratto non e libero, art. 7(4)) | Le caselle `required_acceptance` **non** sono trattate come consensi e non generano `consent_records`; l'accettazione obbligatoria non e presentata come «consenso» | La scelta della base e del club | Etichette dell'interfaccia: «Accettazione richiesta», mai «Consenso» per le condizioni | Dichiarare la base nell'informativa | **Si** |
| A3 | Consenso: libero, specifico, informato, inequivocabile; **separato per finalita**; niente caselle preselezionate; prova a carico del titolare; revoca facile quanto la concessione | GDPR artt. 4(11), 7(1)–(3); EDPB 05/2020 §§ 42–46 (granularita), 78–87 (niente pre-spunta, silenzio ≠ consenso), 104–108 (prova), 112–119 (revoca) | `optional_consent` mai obbligatorio, una casella per finalita, nessuna pre-spunta (il renderer parte da «non spuntato»), prova in `declarations` (chi, quando, testo mostrato, versione), `consent_records` revocabili da `/consensi` e dall'area famiglia | La revoca «con la stessa interfaccia» (EDPB §114) vale per chi ha un account famiglia; chi ha compilato senza account revoca scrivendo al club | Mostrare nell'area famiglia lo stato dei consensi (esiste) | Procedura per la revoca senza account | No |
| A4 | Dati sanitari (certificato medico, allergie): categoria particolare, consenso **esplicito** o altra condizione dell'art. 9(2) | GDPR art. 9(2)(a),(h); EDPB 05/2020 §§ 93–98 (esplicito: dichiarazione scritta, spunta con dicitura esplicita, doppia verifica) | Il catalogo dei dati pubblici espone **un** campo clinico, `athlete.allergies` (preesistente a questo lotto); gli altri restano CLUB_ONLY. Un certificato si carica come allegato e non si rende accessibile senza `clinical.read`; l'approvazione richiede `clinical.manage` per scriverlo | Se il club raccoglie allergie/patologie nel modulo lo fa con un campo personalizzato: serve una casella `optional_consent` dedicata con dicitura esplicita | Il builder avvisa quando un campo si chiama «allergie/patologie/farmaci» e non c'e una casella esplicita accanto (**rinviato**: avviso non implementato in questo lotto) | Valutare la condizione dell'art. 9 con il consulente | **Si** |
| A5 | Minori: consenso ai servizi della societa dell'informazione dai 14 anni (Italia); sotto, dal genitore; linguaggio chiaro; «ragionevoli sforzi» per verificare chi esercita la responsabilita genitoriale | GDPR art. 8; Codice art. 2-quinquies; EDPB §§ 131–133, 144 | Il modulo raccoglie il dichiarante (genitore/tutore) come dato della pratica; le `authorization` sono dichiarazioni del genitore; **nessuna** autorita di tutore nasce dalla pratica (ADR-0135/0189) | La **verifica** dell'identita del dichiarante e proporzionata al rischio ma oggi e dichiarativa (nome e recapito); l'iscrizione sportiva non e un «servizio della societa dell'informazione» offerto al minore, quindi l'art. 8 non e la norma centrale | Facoltativa: OTP sul recapito (ADR-0191 DEFERRED) | Il club stabilisce chi puo firmare e cosa chiede (documento del genitore) | **Si** |
| A6 | Minimizzazione e limitazione della conservazione | GDPR art. 5(1)(c),(e); EDPB §107 (la prova del consenso non si conserva oltre il necessario) | Il club decide **quali** campi chiedere (visibile/obbligatorio/facoltativo/non richiesto); bozze scadono in 30 giorni; pratiche rifiutate/archiviate restano finche il club non le cancella | Nessun tempo di conservazione automatico per pratiche e revisioni | Policy di conservazione per pratiche chiuse (**rinviato**: serve una scelta del club) | Definire i tempi nel registro dei trattamenti | **Si** |
| A7 | Diritti dell'interessato: accesso, rettifica, cancellazione, portabilita | GDPR artt. 15–17, 20 | `data-subject.ts`: esportazione e cancellazione includono pratiche (proprie: cancellate; condivise: anonimizzate), persone in prova, revisioni per cascata, consensi | Le **bozze** non sono collegate a un interessato prima dell'invio: si trovano solo per recapito | Cancellazione bozze per recapito (**rinviato**) | Procedura di risposta alle istanze | No |
| A8 | Registro dei trattamenti e sicurezza | GDPR artt. 30, 32 | Audit di ogni transizione; hash a riposo dei segreti; TLS; accessi per ruolo | Il registro e un documento del club | — | Il club tiene il registro | **Si** |

### B. Documento informatico, integrita, firma (CAD / eIDAS / AgID)

| # | Requisito | Fonte | Cosa fa EasyGame | Gap | Azione tecnica | Azione org./legale | Legale |
|---|---|---|---|---|---|---|---|
| B1 | Un documento informatico soddisfa la forma scritta con firma digitale/qualificata/avanzata, o se formato dopo identificazione dell'autore con processo conforme alle linee guida AgID; altrimenti valore probatorio **liberamente valutabile** (sicurezza, integrita, immodificabilita) | CAD art. 20 c. 1-bis | La pratica e un documento informatico con `snapshot_hash` (SHA-256 di versione+risposte+dichiarazioni+impronte allegati), audit con ora e attore, versione congelata | Non c'e identificazione certa dell'autore ne firma avanzata: il documento e **liberamente valutabile**, non equivalente a scrittura privata | Marca temporale qualificata (**rinviato**: fornitore) | Decidere quali atti richiedono forma scritta *ad substantiam* (es. patti con rilevanza patrimoniale) | **Si** |
| B2 | Firma elettronica semplice: non le si nega effetto giuridico solo perche elettronica; **la qualificata** equivale alla firma autografa | eIDAS art. 25(1)–(2); art. 3(10)–(12) | Il campo «Firma disegnata» e una firma elettronica **semplice**; l'interfaccia lo dice e non usa «firma digitale» | — | Etichetta fissa «Firma disegnata (evidenza grafica)» | — | No |
| B3 | Firma elettronica avanzata: connessione univoca al firmatario, identificazione, controllo esclusivo, rilevabilita delle modifiche | eIDAS art. 26; DPCM 22/2/2013 artt. 56–57 (identificazione con documento, conservazione 20 anni, assicurazione ≥ 500 000 €, art. 61 limiti alla FEA grafometrica: vale fra sottoscrittore ed erogatore) | **Non** la implementa e non la finge | Se un documento richiede FEA/FEQ serve un fornitore | `SignatureProvider` (astrazione disegnata in ADR-0192, non implementata) | Confronto fornitori QTSP in un batch separato | **Si** |
| B4 | Marca temporale: presunzione di data certa con marca qualificata | eIDAS artt. 3(33)–(34), 41 | `submitted_at`/`decided_at` sono del server, non una marca qualificata | Data non opponibile a terzi | Fornitore di marca temporale (**rinviato**) | Valutare se serve | **Si** |
| B5 | Immodificabilita, impronta, metadati, conservazione (autenticita, integrita, affidabilita, leggibilita, reperibilita) | AgID Linee guida documento informatico (1/1/2022) | Versione immutabile, `snapshot_hash`, revisioni conservate, allegati con checksum SHA-256 | Nessun sistema di **conservazione** a norma; i byte sono nel database | Esportazione della pratica come pacchetto (HTML + allegati + hash) (**rinviato**) | Conservatore accreditato se il club lo richiede | **Si** |
| B6 | Autorizzazioni del genitore (uscita autonoma, trasporto, immagini) | prassi federale e del club; GDPR per le immagini | `authorization` come dichiarazione con prova; immagini come `optional_consent` separato | Il testo e federale/del club | — | Verificare con la federazione se una firma autografa e richiesta | **Si** |

### C. Cosa questo lotto **non** afferma

- Che una casella spuntata online valga come firma autografa: **non** lo vale
  (B1–B3).
- Che i testi di esempio nel catalogo siano informative valide: sono
  segnaposto.
- Che la conservazione nel database sia una conservazione a norma AgID.
- Che il riconoscimento del dichiarante come genitore sia verificato: e
  dichiarato.

### D. Gap tecnici confermati (da questo lotto) e cosa e stato fatto

| Gap | Stato |
|---|---|
| Prova del consenso senza il testo mostrato accanto alla risposta | **chiuso**: `declarations` con testo, hash, versione, ora, metodo |
| Consenso facoltativo reso obbligatorio dal builder | **chiuso**: il modello rifiuta `required` su `optional_consent` |
| Casella grafica indistinguibile da un consenso | **chiuso**: `legalKind` |
| Integrita della pratica | **chiuso**: `snapshot_hash` |
| Firma disegnata chiamata «firma digitale» | **chiuso**: etichetta e testo di aiuto |
| Marca temporale, FEA/FEQ, conservazione a norma, avviso sui campi clinici personalizzati, retention automatica, cancellazione bozze per recapito | **aperti e dichiarati** (rinviati con fornitore/decisione del club) |
