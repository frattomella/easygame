/**
 * Le poche cose che **devono** succedere a orario, e non quando qualcuno apre
 * una pagina.
 *
 * **L'audit che ha prodotto questo file** (Blocco Finale C, punto 13). Sono
 * state guardate tutte le operazioni che oggi dipendono dall'apertura di una
 * schermata, per decidere una per una se sono *request-driven* o *scheduled*.
 * La risposta e stata «request-driven» quasi ovunque, e va detto perche:
 *
 * | Operazione | Esito | Ragione |
 * |---|---|---|
 * | Scadenze certificati e alert | **request-driven** | Si calcolano dalle date quando la schermata li mostra. Precalcolarli produrrebbe una copia che diverge dal certificato il giorno in cui qualcuno lo aggiorna |
 * | Maturazione dei contributi | **request-driven** | E un calcolo sulle presenze, ed e gia esplicito (`recompute`). Farlo a orario vorrebbe dire ricalcolare periodi gia liquidati senza che nessuno l'abbia chiesto |
 * | Riconciliazione di un bando | **request-driven** | La produce chi rendiconta, quando rendiconta |
 * | Stato di una rata | **mai** | Non si imposta, si ricava dal registro incassi (ADR-0036). Un lavoro periodico che lo «aggiorna» reintrodurrebbe la copia |
 * | Promemoria certificati per email | **decisione di prodotto** | Il canale c'e (`/api/medical-certificate-reminders`) ma lo aziona una persona. Mandarli a orario richiede di decidere **a chi**, **quanto spesso** e **come ci si toglie**: sono tre domande di prodotto, e inventarle qui vorrebbe dire spedire email a nome di una societa senza che l'abbia chiesto. Resta R-08 |
 * | **Righe scadute** (sessioni, sfide OTP, contatori di rate limit, audit oltre la retention) | **scheduled** | Nessuna schermata le legge, quindi nessuna schermata le puliera mai. Crescono e basta |
 *
 * L'unica cosa che serviva davvero e quindi l'ultima riga, ed e cio che
 * questo modulo fa.
 *
 * **Perche non un servizio di scheduling dell'hosting.** ADR-0007 vieta di
 * legarsi a servizi proprietari: qui c'e una funzione e una rotta che la
 * chiama. Il *trigger* puo essere Vercel Cron, un'azione GitHub, il cron di
 * una macchina o una persona con `curl` — e il giorno in cui il dominio si
 * sposta fuori da Next.js, si sposta la funzione e non il meccanismo.
 *
 * **Perche non fa fallire niente.** Ogni passo e indipendente e il suo errore
 * viene raccolto invece che propagato: una pulizia che si interrompe a meta
 * lascia il lavoro a domani, e non deve far risultare rotto un sistema sano.
 */

import { prisma } from "./prisma";
import { purgeExpiredAuditEvents } from "./audit";
import { backfillProviderFees } from "./payment-gateway";

export type MaintenanceStep = {
  name: string;
  removed: number;
  /**
   * Le righe **aggiornate**, per i passi che completano invece di cancellare.
   *
   * Non si riusa `removed`: un rapporto che dicesse «rimosse 12» dopo aver
   * riempito dodici commissioni farebbe cercare dodici righe sparite.
   */
  updated?: number;
  error?: string;
};

export type MaintenanceReport = {
  startedAt: string;
  finishedAt: string;
  steps: MaintenanceStep[];
  removedTotal: number;
  failed: number;
};

const runStep = async (
  name: string,
  run: () => Promise<number>,
): Promise<MaintenanceStep> => {
  try {
    return { name, removed: await run() };
  } catch (error: any) {
    console.error(`[maintenance] ${name}`, error?.message || error);
    return { name, removed: 0, error: String(error?.message || error) };
  }
};

/** Come `runStep`, per i passi che completano righe invece di toglierle. */
const runUpdateStep = async (
  name: string,
  run: () => Promise<number>,
): Promise<MaintenanceStep> => {
  try {
    return { name, removed: 0, updated: await run() };
  } catch (error: any) {
    console.error(`[maintenance] ${name}`, error?.message || error);
    return { name, removed: 0, updated: 0, error: String(error?.message || error) };
  }
};

/**
 * Pulisce cio che e scaduto.
 *
 * `now` e un parametro e non `new Date()` dentro il corpo: cosi la funzione si
 * prova senza aspettare che passi il tempo.
 */
export const runScheduledMaintenance = async (
  now = new Date(),
): Promise<MaintenanceReport> => {
  const startedAt = now.toISOString();

  const steps = [
    /*
      Le sessioni scadute non vengono cancellate al logout — un browser chiuso
      non fa logout — e nessuna schermata le legge. Restano finche qualcuno
      non le toglie.
    */
    await runStep("sessions", async () => {
      const result = await (prisma as any).session.deleteMany({
        where: { expires_at: { lt: now } },
      });
      return Number(result?.count || 0);
    }),

    /*
      Una sfida OTP consumata o scaduta e un `code_hash` che non serve piu.
      Tenerla non aiuta nessuno e allunga la tabella su cui si cerca a ogni
      verifica.
    */
    await runStep("auth_verification_challenges", async () => {
      const result = await (
        prisma as any
      ).authVerificationChallenge.deleteMany({
        where: { expires_at: { lt: now } },
      });
      return Number(result?.count || 0);
    }),

    /*
      I contatori di rate limit sono una riga per IP e per identita, per
      finestra. Su una superficie pubblica come i moduli online crescono in
      fretta, e scaduti non contano piu niente.
    */
    await runStep("auth_rate_limit_buckets", async () => {
      const result = await (prisma as any).authRateLimitBucket.deleteMany({
        where: { expires_at: { lt: now } },
      });
      return Number(result?.count || 0);
    }),

    /*
      L'audit oltre la retention. Se `AUDIT_LOG_RETENTION_DAYS` non e
      impostata, `purgeExpiredAuditEvents` **non cancella niente**: il periodo
      e una decisione di prodotto e compliance, non un valore predefinito che
      qualcuno scopre dopo aver perso dei dati.
    */
    await runStep("audit_logs", async () => Number(await purgeExpiredAuditEvents(now))),

    /*
      La commissione del PSP non vive nell'evento: vive sul
      `balance_transaction`, che matura **dopo** che il webhook e arrivato.
      Nessuna schermata torna a chiederla, quindi senza questo passo resta
      `null` per sempre e il netto del club risulta piu alto del vero.
      Vedi `backfillProviderFees`.
    */
    await runUpdateStep("payment_provider_fees", async () => {
      const esito = await backfillProviderFees({ limit: 100 });
      return esito.aggiornati;
    }),
  ];

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    steps,
    removedTotal: steps.reduce((total, step) => total + step.removed, 0),
    failed: steps.filter((step) => step.error).length,
  };
};
