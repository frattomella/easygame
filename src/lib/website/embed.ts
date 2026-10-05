import { sanitizeExternalUrl } from "./links";

/**
 * **Contenuti incorporati da un'allowlist** (ADR-0200 §7; sicurezza in KB 14).
 *
 * Nessun campo «incolla qui il codice»: un `<script>` scritto da un operatore
 * eseguirebbe nel dominio del club, con accesso a tutto cio che la pagina
 * mostra. Si accetta solo l'**indirizzo** di un contenuto di un servizio
 * conosciuto, e l'`src` dell'iframe lo costruisce questo modulo da
 * identificativi estratti e ripuliti — mai concatenando l'URL ricevuto.
 *
 * L'iframe si carica solo dopo il clic del visitatore (`ConsentFrame` nel
 * renderer): prima di quel clic nessuna richiesta parte verso il servizio, e
 * quindi nessun cookie di terze parti.
 *
 * Modulo puro.
 */

export const VIDEO_PROVIDERS = ["youtube", "vimeo"] as const;
export const EMBED_PROVIDERS = ["youtube", "vimeo", "google-maps", "spotify", "soundcloud"] as const;

export type EmbedProvider = (typeof EMBED_PROVIDERS)[number];

export const EMBED_PROVIDER_LABELS: Record<EmbedProvider, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  "google-maps": "Google Maps",
  spotify: "Spotify",
  soundcloud: "SoundCloud",
};

export type ParsedEmbed = {
  provider: EmbedProvider;
  src: string;
  /** L'anteprima statica, quando il servizio la offre senza chiavi. */
  thumbnail: string | null;
  allow: string;
};

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

const parseYouTube = (url: URL): ParsedEmbed | null => {
  const host = url.hostname.replace(/^www\.|^m\./, "");
  let id = "";
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
    else {
      const match = url.pathname.match(/^\/(embed|shorts|live)\/([^/?#]+)/);
      id = match ? match[2] : "";
    }
  }
  if (!YT_ID.test(id)) return null;
  const start = Number.parseInt(url.searchParams.get("t") || url.searchParams.get("start") || "", 10);
  const params = new URLSearchParams({ rel: "0", modestbranding: "1" });
  if (Number.isFinite(start) && start > 0) params.set("start", String(start));
  return {
    provider: "youtube",
    src: `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`,
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    allow: "accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen",
  };
};

const parseVimeo = (url: URL): ParsedEmbed | null => {
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "vimeo.com" && host !== "player.vimeo.com") return null;
  const match = url.pathname.match(/(?:^|\/)(\d{5,12})(?:\/|$)/);
  if (!match) return null;
  return {
    provider: "vimeo",
    src: `https://player.vimeo.com/video/${match[1]}?dnt=1`,
    thumbnail: null,
    allow: "fullscreen; picture-in-picture",
  };
};

const parseSpotify = (url: URL): ParsedEmbed | null => {
  if (url.hostname !== "open.spotify.com") return null;
  const match = url.pathname.match(/^\/(?:embed\/)?(track|album|playlist|episode|show)\/([A-Za-z0-9]{10,40})/);
  if (!match) return null;
  return {
    provider: "spotify",
    src: `https://open.spotify.com/embed/${match[1]}/${match[2]}`,
    thumbnail: null,
    allow: "encrypted-media",
  };
};

const parseSoundCloud = (url: URL): ParsedEmbed | null => {
  const host = url.hostname.replace(/^www\.|^m\./, "");
  if (host !== "soundcloud.com") return null;
  const clean = `https://soundcloud.com${url.pathname.replace(/[^A-Za-z0-9/_-]/g, "")}`;
  if (clean.split("/").filter(Boolean).length < 3) return null;
  return {
    provider: "soundcloud",
    src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(clean)}&visual=false`,
    thumbnail: null,
    allow: "",
  };
};

const parseGoogleMaps = (url: URL): ParsedEmbed | null => {
  const host = url.hostname.replace(/^www\./, "");
  if (!(host === "google.com" || host === "google.it" || host === "maps.google.com" || host === "maps.google.it")) return null;
  if (!url.pathname.startsWith("/maps")) return null;
  const query = url.searchParams.get("q") || url.searchParams.get("query") || "";
  const place = url.pathname.match(/\/maps\/place\/([^/]+)/);
  const text = query || (place ? decodeURIComponent(place[1]).replace(/\+/g, " ") : "");
  if (!text) return null;
  return { provider: "google-maps", src: buildMapEmbedSrc(text, 15), thumbnail: null, allow: "fullscreen" };
};

/** La mappa di un indirizzo, senza chiavi API. */
export const buildMapEmbedSrc = (address: string, zoom: number) => {
  const q = String(address || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 240);
  const z = Math.min(19, Math.max(3, Math.round(zoom || 15)));
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=${z}&output=embed`;
};

/** Il contenuto incorporabile, o `null` se il servizio non e ammesso. */
export const parseEmbedUrl = (
  value: unknown,
  allowed: readonly EmbedProvider[] = EMBED_PROVIDERS,
): ParsedEmbed | null => {
  const safe = sanitizeExternalUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  for (const parse of [parseYouTube, parseVimeo, parseSpotify, parseSoundCloud, parseGoogleMaps]) {
    const parsed = parse(url);
    if (parsed && allowed.includes(parsed.provider)) return parsed;
  }
  return null;
};
