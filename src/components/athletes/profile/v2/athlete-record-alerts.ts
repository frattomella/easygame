import { daysUntil, formatDateShort } from "@/lib/web/format";
import {
  ATHLETE_RECORD_SECTIONS,
  type AthleteRecordAreaValue,
  type AthleteRecordTarget,
} from "@/lib/athlete-profile-tabs";

/**
 * La striscia degli avvisi della scheda atleta (guideline 09 §9.8).
 *
 * Una riga per **problema bloccante**, ciascuna con il verbo che lo risolve e
 * il blocco della scheda in cui si risolve. Niente su una scheda pulita: non
 * esiste un «tutto a posto» verde.
 *
 * Modulo puro: legge solo cio che la pagina ha gia caricato. Lo stato di una
 * rata **non** si ricalcola qui — arriva gia derivato dagli incassi
 * (`statusKey`, ADR-0036); lo stato di un certificato arriva da
 * `getMedicalCertificateStatus`. Questo file decide solo cosa merita una riga.
 */
export type AthleteRecordAlert = {
  id: string;
  severity: "danger" | "warning";
  text: string;
  /** Il verbo che risolve: l'etichetta del pulsante. */
  action: string;
  target: AthleteRecordTarget;
};

export type AthleteRecordAlertInput = {
  /** I certificati medici gia normalizzati dalla scheda (`status`, `expiryDate`). */
  certificates: ReadonlyArray<{
    status?: string | null;
    expiryDate?: string | null;
  }>;
  /** I record delle rate, con lo stato gia derivato dal server. */
  payments: ReadonlyArray<{
    statusKey?: string | null;
    dueDate?: string | Date | null;
    data?: { excludedFromTotals?: boolean } | null;
  }>;
  enrollmentStatus: boolean;
  guardians: ReadonlyArray<unknown>;
  /** Vero se l'atleta e minorenne: senza data di nascita si considera tale. */
  isMinor: boolean;
  today?: Date;
};

const pick = (
  certificates: AthleteRecordAlertInput["certificates"],
): { status: "missing" | "expired" | "expiring" | "valid"; expiryDate: string | null } => {
  /*
    Il certificato che conta e quello che scade **piu tardi**: uno scaduto
    accanto a uno valido non e un problema, e uno valido accanto a uno in
    scadenza non e ancora un problema.
  */
  const real = certificates.filter(
    (certificate) =>
      certificate.status !== "missing" && String(certificate.expiryDate || ""),
  );
  if (!real.length) return { status: "missing", expiryDate: null };
  const best = [...real].sort((left, right) =>
    String(right.expiryDate || "").localeCompare(String(left.expiryDate || "")),
  )[0];
  const status = String(best.status || "");
  return {
    status:
      status === "valid" || status === "expiring" || status === "expired"
        ? status
        : "valid",
    expiryDate: best.expiryDate || null,
  };
};

export const deriveAthleteRecordAlerts = (
  input: AthleteRecordAlertInput,
): AthleteRecordAlert[] => {
  const today = input.today ?? new Date();
  const alerts: AthleteRecordAlert[] = [];
  const documenti: AthleteRecordAreaValue = "documenti";

  const certificate = pick(input.certificates);
  if (certificate.status === "missing") {
    alerts.push({
      id: "certificato-mancante",
      severity: "danger",
      text: "Certificato medico mancante: non può allenarsi né essere convocato.",
      action: "Aggiungi certificato",
      target: { area: documenti, section: ATHLETE_RECORD_SECTIONS.certificati },
    });
  } else if (certificate.status === "expired") {
    alerts.push({
      id: "certificato-scaduto",
      severity: "danger",
      text: `Certificato medico scaduto il ${formatDateShort(certificate.expiryDate)}: non può allenarsi né essere convocato.`,
      action: "Rinnova certificato",
      target: { area: documenti, section: ATHLETE_RECORD_SECTIONS.certificati },
    });
  } else if (certificate.status === "expiring") {
    const days = daysUntil(certificate.expiryDate, today);
    alerts.push({
      id: "certificato-in-scadenza",
      severity: "warning",
      text:
        days != null && days >= 0
          ? `Certificato medico in scadenza fra ${days} ${days === 1 ? "giorno" : "giorni"} (${formatDateShort(certificate.expiryDate)}).`
          : `Certificato medico in scadenza il ${formatDateShort(certificate.expiryDate)}.`,
      action: "Rinnova certificato",
      target: { area: documenti, section: ATHLETE_RECORD_SECTIONS.certificati },
    });
  }

  const overdue = input.payments.filter((payment) => {
    if (payment.statusKey !== "pending") return false;
    if (payment.data?.excludedFromTotals === true) return false;
    const days = daysUntil(payment.dueDate ?? null, today);
    return days != null && days < 0;
  });
  if (overdue.length) {
    alerts.push({
      id: "rate-scadute",
      severity: "danger",
      text:
        overdue.length === 1
          ? "Una rata è scaduta e non risulta incassata."
          : `${overdue.length} rate sono scadute e non risultano incassate.`,
      action: "Registra pagamento",
      target: {
        area: "amministrazione",
        section: ATHLETE_RECORD_SECTIONS.iscrizione,
      },
    });
  }

  if (!input.enrollmentStatus) {
    alerts.push({
      id: "iscrizione-non-attiva",
      severity: "warning",
      text: "Iscrizione non attiva per la stagione in corso.",
      action: "Apri iscrizione",
      target: {
        area: "amministrazione",
        section: ATHLETE_RECORD_SECTIONS.iscrizione,
      },
    });
  }

  if (input.isMinor && input.guardians.length === 0) {
    alerts.push({
      id: "nessun-genitore",
      severity: "warning",
      text: "Nessun genitore o tutore registrato: la famiglia non riceve nulla.",
      action: "Aggiungi genitore",
      target: { area: "profilo", section: ATHLETE_RECORD_SECTIONS.famiglia },
    });
  }

  return alerts;
};

/** Quanti avvisi cadono in ciascuna area: il contatore rosso dello switcher. */
export const countAlertsByArea = (
  alerts: ReadonlyArray<AthleteRecordAlert>,
): Partial<Record<AthleteRecordAreaValue, number>> => {
  const counts: Partial<Record<AthleteRecordAreaValue, number>> = {};
  for (const alert of alerts) {
    if (alert.severity !== "danger") continue;
    counts[alert.target.area] = (counts[alert.target.area] || 0) + 1;
  }
  return counts;
};
