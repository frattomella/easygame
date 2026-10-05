import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getSessionFromRequest,
  isPlatformAdminSession,
} from "@/lib/server/auth";
import { buildEmailPreviewCatalog } from "@/lib/server/email/preview-catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Anteprima email EasyGame",
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * **Anteprima dei template email — superficie amministrativa** (PP-05B).
 *
 * ## Cosa e cambiato, e perche
 *
 * Nata nel Branding Pass come pagina di sviluppo (`NODE_ENV === "production"`
 * → 404), era inutile proprio dove serve: chi configura SMTP per un club vuole
 * vedere che aspetto avranno i messaggi **sull'installazione che sta
 * configurando**, non su un portatile. Il 404 in produzione non era una
 * difesa — la difesa e `isPlatformAdminSession`, che c'era gia — era una
 * limitazione che si aggirava non usando la pagina.
 *
 * ## Le tre proprieta che questa pagina deve avere
 *
 * 1. **Non spedisce niente.** Il catalogo (`preview-catalog.ts`) chiama solo
 *    costruttori di contenuto. Non e una promessa scritta in un commento: e la
 *    prova di `tests/email/anteprima-non-spedisce.test.mjs`, che monta un
 *    trasporto SMTP finto e conta gli invii.
 * 2. **Nessun dato reale.** Il catalogo non legge l'archivio: gli esempi sono
 *    valori inventati su `esempio.test`.
 * 3. **`sandbox` sugli iframe.** Un `srcDoc` **eredita l'origine della pagina
 *    che lo contiene**: senza `sandbox`, il markup di un template — che in un
 *    riquadro contiene di proposito un nome di club ostile — girerebbe con i
 *    cookie di sessione di un amministratore di piattaforma. E la superficie
 *    piu facile da dimenticare in una pagina che «mostra e basta».
 *
 * ## Le due larghezze
 *
 * `?w=mobile` restringe il riquadro a 375 px, che e la larghezza in cui la
 * maggior parte di questi messaggi viene letta davvero. La scelta e un
 * collegamento e non un interruttore perche questa pagina resta un componente
 * di server: aggiungere uno stato del client per due larghezze significherebbe
 * spedire JavaScript per una cosa che un `href` fa gia.
 */
export default async function EmailPreviewPage({
  searchParams,
}: {
  searchParams?: { w?: string; brand?: string };
}) {
  const session = await getSessionFromRequest(
    new Request("http://easygame.local/private/email-preview", {
      headers: {
        cookie: cookies().toString(),
      },
    }),
  );

  if (!session) {
    redirect("/login");
  }

  if (!isPlatformAdminSession(session)) {
    redirect("/account");
  }

  const mobile = searchParams?.w === "mobile";
  const brandFiltro =
    searchParams?.brand === "club"
      ? "club"
      : searchParams?.brand === "easygame"
        ? "easygame"
        : null;

  const catalogo = buildEmailPreviewCatalog();
  const voci = brandFiltro
    ? catalogo.filter((voce) => voce.brandMode === brandFiltro)
    : catalogo;

  const link = (params: { w?: string; brand?: string }) => {
    const query = new URLSearchParams();
    if (params.w) query.set("w", params.w);
    if (params.brand) query.set("brand", params.brand);
    const stringa = query.toString();
    return stringa ? `/private/email-preview?${stringa}` : "/private/email-preview";
  };

  const brandCorrente = brandFiltro || undefined;
  const larghezzaCorrente = mobile ? "mobile" : undefined;

  const pill = (attivo: boolean) =>
    `rounded-full border px-3 py-1 text-xs ${
      attivo
        ? "border-slate-900 bg-slate-900 text-white"
        : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
    }`;

  return (
    <div className="min-h-[100dvh] space-y-6 bg-[var(--eg-paper)] p-4 sm:p-6">
      <header className="space-y-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900">
            Anteprima email EasyGame
          </h1>
          <p className="text-sm text-slate-500">
            Dati di esempio, nessun invio reale. Ogni riquadro chiama la stessa
            funzione usata dall&apos;invio vero.
          </p>
        </div>

        {/*
          I due assi di lettura: da chi arriva il messaggio, e su quale
          larghezza si legge. A 375 px i filtri vanno a capo invece di
          comprimersi, perche questa pagina si guarda anche dal telefono che si
          sta cercando di simulare.
        */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Marchio</span>
            <a href={link({ w: larghezzaCorrente })} className={pill(!brandFiltro)}>
              Tutti
            </a>
            <a
              href={link({ w: larghezzaCorrente, brand: "easygame" })}
              className={pill(brandFiltro === "easygame")}
            >
              EasyGame
            </a>
            <a
              href={link({ w: larghezzaCorrente, brand: "club" })}
              className={pill(brandFiltro === "club")}
            >
              Club
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Larghezza</span>
            <a href={link({ brand: brandCorrente })} className={pill(!mobile)}>
              Desktop
            </a>
            <a
              href={link({ brand: brandCorrente, w: "mobile" })}
              className={pill(mobile)}
            >
              Mobile 375 px
            </a>
          </div>
        </div>
      </header>

      {voci.map((voce) => (
        <section
          key={voce.id}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white"
        >
          <header className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <p className="font-display text-sm font-semibold text-slate-900">
                {voce.title}
              </p>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] ${
                  voce.brandMode === "club"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-blue-100 text-blue-800"
                }`}
              >
                {voce.brandMode === "club" ? "Brand Club" : "Brand EasyGame"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              <span className="font-medium">Oggetto:</span> {voce.subject}
            </p>
            <p className="text-xs text-slate-500">
              <span className="font-medium">Sorgente:</span> {voce.source} ·{" "}
              <span className="font-medium">Destinatario:</span> {voce.recipient}
            </p>
            <p className="mt-1 text-xs text-slate-400">{voce.note}</p>
          </header>

          <div className="overflow-x-auto bg-slate-100 p-3">
            {/*
              `sandbox` vuoto: nessun permesso. Un `srcDoc` senza sandbox gira
              nell'origine di questa pagina, cioe con i cookie di chi la sta
              guardando — e uno dei riquadri contiene di proposito un nome di
              club ostile.
            */}
            <iframe
              title={voce.title}
              srcDoc={voce.html}
              sandbox=""
              style={mobile ? { width: 375 } : undefined}
              className={`h-[460px] border border-slate-200 bg-white ${
                mobile ? "" : "w-full"
              }`}
            />
          </div>

          {voce.text ? (
            <details className="border-t border-slate-200 px-4 py-3">
              <summary className="cursor-pointer text-xs font-medium text-slate-600">
                Testo semplice
              </summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs text-slate-600">
                {voce.text}
              </pre>
            </details>
          ) : (
            <p className="border-t border-slate-200 px-4 py-3 text-xs text-slate-400">
              Questo costruttore produce solo HTML: il testo semplice lo compone
              ancora chi invia.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
