/**
 * Il modello «Attestazione di pagamento e frequenza».
 *
 * **Perche uno solo.** Ogni anno ogni famiglia chiede al club lo stesso
 * foglio: quanto ha versato e che il figlio ha frequentato — serve per i
 * bandi, per il datore di lavoro, per il 730. Oggi la segreteria lo scrive a
 * mano copiando gli importi da una schermata. Questo modello lo toglie di
 * mezzo.
 *
 * **Perche non ne arrivano altri settantasei.** La libreria dei modelli e
 * lavoro **editoriale**, non sviluppo: va mantenuta, regionalizzata e
 * aggiornata da una persona, ed e Wave 3. Aprirla adesso vorrebbe dire
 * accollarsi un presidio permanente insieme a una funzionalita.
 *
 * **Perche e testo e non codice.** E un `document_templates` come gli altri:
 * appena creato e una bozza modificabile e cancellabile nell'editor. Il
 * risolutore (`src/lib/server/document-placeholders.ts`) non lo conosce e non
 * lo tratta in modo speciale — conosce i segnaposto, che sono gli stessi di
 * qualunque altro modello.
 */

export const ATTESTATION_TEMPLATE_ID = "attestazione-pagamento-frequenza";

export const ATTESTATION_TEMPLATE_TITLE =
  "Attestazione di pagamento e frequenza";

export const ATTESTATION_TEMPLATE_DESCRIPTION =
  "Attesta quanto e stato versato nella stagione e la frequenza dell'atleta. Da generare compilata, un atleta per volta.";

/*
  Il corpo, con i segnaposto in chiaro.

  Sono scritti `{{cosi}}` e non incapsulati nei chip dell'editor visuale
  perche il modello nasce qui, non da una digitazione: l'editor li riconosce
  comunque quando lo si apre, e il risolutore li sostituisce in entrambe le
  forme. `{{payment.total_paid}}` e il **denaro incassato** (ADR-0068), non il
  dovuto di una rata marcata pagata: e la ragione per cui questo foglio si puo
  firmare.
*/
export const ATTESTATION_TEMPLATE_CONTENT = `<h1 style="text-align: center;">ATTESTAZIONE DI PAGAMENTO E FREQUENZA</h1>
<p>Il/La sottoscritto/a legale rappresentante di <strong>{{club.name}}</strong>, con sede in {{club.address}} — {{club.city}}, C.F. {{club.fiscal_code}} — P.IVA {{club.vat_number}},</p>
<p style="text-align: center;"><strong>ATTESTA</strong></p>
<p>che l'atleta <strong>{{athlete.first_name}} {{athlete.last_name}}</strong>, nato/a il {{athlete.birth_date}}, codice fiscale {{athlete.fiscal_code}}, categoria {{athlete.category_name}}, ha svolto attivita sportiva presso questa societa nella stagione <strong>{{season.year}}</strong>, dal {{season.start_date}} al {{season.end_date}}.</p>
<p>Nel medesimo periodo l'atleta ha partecipato a <strong>{{attendance.sessions}}</strong> sedute di allenamento, per complessive <strong>{{attendance.hours}}</strong> ore.</p>
<p style="text-align: center;"><strong>ATTESTA INOLTRE</strong></p>
<p>che per la partecipazione all'attivita sportiva sopra indicata risulta versata la somma di <strong>{{payment.total_paid}} euro</strong>, a fronte di un importo dovuto di {{payment.total_due}} euro, con un residuo di {{payment.remaining}} euro.</p>
<p>Il versamento risulta effettuato da <strong>{{fiscal_recipient.name}}</strong>, codice fiscale {{fiscal_recipient.fiscal_code}}, residente in {{fiscal_recipient.address}}.</p>
<p>La presente attestazione viene rilasciata su richiesta dell'interessato per gli usi consentiti dalla legge.</p>
<p>{{club.city}}, {{current_date}}</p>
<p>Il Presidente</p>
<p>{{signature.club_representative}}</p>
<p>{{stamp.club}}</p>`;

export type AttestationTemplateSeed = {
  id: string;
  title: string;
  description: string;
  content: string;
  createdAt: string;
};

/**
 * Il modello da inserire fra i `document_templates` del club.
 *
 * `createdAt` arriva da fuori perche il seme del database e quello della
 * pagina devono poter essere entrambi deterministici quando serve provarli.
 */
export const buildAttestationTemplate = (
  createdAt: string = new Date().toISOString(),
): AttestationTemplateSeed => ({
  id: ATTESTATION_TEMPLATE_ID,
  title: ATTESTATION_TEMPLATE_TITLE,
  description: ATTESTATION_TEMPLATE_DESCRIPTION,
  content: ATTESTATION_TEMPLATE_CONTENT,
  createdAt,
});
