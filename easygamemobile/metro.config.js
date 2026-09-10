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
 */
const API_PROXY_PREFIX = "/api/v1/";
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
      if (!req.url || !req.url.startsWith(API_PROXY_PREFIX)) {
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
