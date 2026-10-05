/**
 * Una pagina che non esiste sul sito di un club. Volutamente neutra: un host
 * sconosciuto e una pagina mancante rispondono allo stesso modo, e nessuno
 * dei due mostra dati di un altro club.
 */
export default function SiteNotFound() {
  return (
    <main className="ws-body flex min-h-screen items-center justify-center px-6 text-center">
      <div className="max-w-md">
        <p className="font-heading text-6xl font-bold">404</p>
        <h1 className="mt-4 text-2xl font-semibold">Pagina non trovata</h1>
        <p className="mt-2 opacity-80">L&apos;indirizzo potrebbe essere cambiato o la pagina non esiste piu.</p>
        <a href="/" className="ws-btn ws-btn-primary mt-6">Torna alla home</a>
      </div>
    </main>
  );
}
