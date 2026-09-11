const { getDefaultConfig } = require("expo/metro-config");
const http = require("http");
const https = require("https");

const config = getDefaultConfig(__dirname);

/*
 * Proxy di sviluppo, solo per Expo Web (`npx expo start --web`).
 *
 * Il backend (`src/`, stesso account/sessione della Web App — vedi
 * `client/services/api.ts`) e pensato per essere chiamato same-origin dalla
 * Web App o da app native, mai soggette a CORS. Expo Web invece gira su
 * `localhost:8081` e chiama un'origine diversa (staging): il browser manda
 * un preflight, la risposta non porta `Access-Control-Allow-Origin`, e la
 * richiesta vera (es. login) non parte mai — non e un problema di
 * credenziali, ne di URL configurato male.
 *
 * Qui il dev server di Metro fa da proxy same-origin per `/api/v1/*`: il
 * browser resta su `localhost`, la chiamata cross-origine la fa questo
 * processo Node (mai soggetto a CORS). Non cambia la policy CORS del
 * backend (nessuna modifica di sicurezza in produzione, nessun file toccato
 * fuori da `easygamemobile/`) e non esiste fuori dal dev server: `expo
 * export` non esegue `enhanceMiddleware`, quindi non finisce mai ne nel
 * bundle Web ne tantomeno in quello nativo iOS/Android.
 *
 * Un solo prefisso (`/api/v1/`) non bastava: tutta l'area Parent
 * (`client/services/api.ts` — cruscotto, bacheca, notifiche, checkout,
 * documenti, consensi, appuntamenti, strutture) chiama deliberatamente
 * `/api/parent-dashboard/**`, **fuori** da `/api/v1` (stesso path che usa
 * la Web App da `/parent-view/[id]`, per non duplicare la rotta). Senza
 * anche questo prefisso, ogni chiamata Parent su Expo Web cadeva sul
 * fallback SPA di Metro (200 con l'HTML della shell, non JSON) invece che
 * sul backend — confermato in staging durante l'acceptance pass
 * autenticata di WP13: la Home Parent restava bianca, senza errore
 * visibile, perche uno stato "200 ma non JSON" non e uno stato di errore
 * per `request()`.
 */
const API_PROXY_PREFIXES = ["/api/v1/", "/api/parent-dashboard/"];
const PROXY_TARGET =
  process.env.EXPO_PUBLIC_EASYGAME_API_URL ||
  "https://easygame-staging-pi.vercel.app";

const defaultMiddleware = config.server?.enhanceMiddleware;

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware, metroServer) => {
    const withDefault = defaultMiddleware
      ? defaultMiddleware(middleware, metroServer)
      : middleware;

    return (req, res, next) => {
      if (
        !req.url ||
        !API_PROXY_PREFIXES.some((prefix) => req.url.startsWith(prefix))
      ) {
        return withDefault(req, res, next);
      }

      let target;
      try {
        target = new URL(req.url, PROXY_TARGET);
      } catch {
        res.writeHead(502, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            data: null,
            error: { message: "Proxy dev EasyGame: URL backend non valido." },
          }),
        );
        return;
      }

      const client = target.protocol === "https:" ? https : http;
      const proxyRequest = client.request(
        target,
        {
          method: req.method,
          headers: { ...req.headers, host: target.host },
        },
        (proxyResponse) => {
          res.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
          proxyResponse.pipe(res);
        },
      );

      proxyRequest.on("error", (error) => {
        res.writeHead(502, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            data: null,
            error: {
              message: `Proxy dev EasyGame non disponibile: ${error.message}`,
            },
          }),
        );
      });

      req.pipe(proxyRequest);
    };
  },
};

module.exports = config;
