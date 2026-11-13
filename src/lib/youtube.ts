import type { PlaylistResult, PlaylistVideo } from "../types";
import { parseDurationText } from "./utils";

/* ------------------------------------------------------------------ */
/* Link parsing                                                        */
/* ------------------------------------------------------------------ */

export type LinkInfo =
  | { type: "youtube-video"; videoId: string; url: string }
  | { type: "youtube-playlist"; playlistId: string; url: string }
  | { type: "video"; url: string }
  | { type: "link"; url: string };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID =
  /^(?:PL|UU|OL|LL|FL|RD|WL|TL|PU|SO|EC|HC)[A-Za-z0-9_-]{8,}$/;

export function normalizeUrl(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

export function inspectLink(input: string): LinkInfo {
  const raw = input.trim();
  if (!raw) return { type: "link", url: "" };

  if (VIDEO_ID.test(raw))
    return {
      type: "youtube-video",
      videoId: raw,
      url: `https://www.youtube.com/watch?v=${raw}`,
    };
  if (PLAYLIST_ID.test(raw))
    return {
      type: "youtube-playlist",
      playlistId: raw,
      url: `https://www.youtube.com/playlist?list=${raw}`,
    };

  let url: URL;
  try {
    url = new URL(normalizeUrl(raw));
  } catch {
    return { type: "link", url: normalizeUrl(raw) };
  }

  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  const list = url.searchParams.get("list");

  if (host === "youtu.be") {
    const id = parts[0];
    if (id && VIDEO_ID.test(id)) {
      if (list && PLAYLIST_ID.test(list)) {
        return {
          type: "youtube-playlist",
          playlistId: list,
          url: url.toString(),
        };
      }
      return {
        type: "youtube-video",
        videoId: id,
        url: `https://www.youtube.com/watch?v=${id}`,
      };
    }
  }

  if (
    host === "youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    if (list && PLAYLIST_ID.test(list)) {
      return {
        type: "youtube-playlist",
        playlistId: list,
        url: url.toString(),
      };
    }
    const v = url.searchParams.get("v");
    if (v && VIDEO_ID.test(v))
      return {
        type: "youtube-video",
        videoId: v,
        url: `https://www.youtube.com/watch?v=${v}`,
      };
    if (
      ["shorts", "embed", "live", "v"].includes(parts[0]) &&
      parts[1] &&
      VIDEO_ID.test(parts[1])
    ) {
      return {
        type: "youtube-video",
        videoId: parts[1],
        url: `https://www.youtube.com/watch?v=${parts[1]}`,
      };
    }
    if (parts[0] === "playlist" && list && PLAYLIST_ID.test(list)) {
      return {
        type: "youtube-playlist",
        playlistId: list,
        url: url.toString(),
      };
    }
  }

  if (/\.(mp4|webm|ogg|ogv|m3u8|mov|m4v)(\?.*)?$/i.test(url.pathname)) {
    return { type: "video", url: url.toString() };
  }

  return { type: "link", url: url.toString() };
}

/**
 * True only for links we can actually import: a real YouTube video id,
 * a real YouTube playlist id, or a direct media file. Random pages and
 * malformed YouTube URLs return false.
 */
export function isImportableLink(input: string): boolean {
  const info = inspectLink(input);
  if (!info.url) return false;
  if (info.type === "link") return false;
  if (info.type === "youtube-video") return VIDEO_ID.test(info.videoId);
  if (info.type === "youtube-playlist") return PLAYLIST_ID.test(info.playlistId);
  return true;
}

/**
 * Ask YouTube (through public oEmbed proxies) whether a video really exists.
 * `true` = exists, `false` = definitively unavailable/removed,
 * `null` = couldn't verify (offline or proxy blocked).
 */
export async function checkYoutubeVideo(
  videoId: string,
): Promise<boolean | null> {
  if (!VIDEO_ID.test(videoId)) return false;
  try {
    const res = await fetchWithTimeout(
      `https://noembed.com/embed?url=${encodeURIComponent(
        youtubeWatchUrl(videoId),
      )}`,
      7000,
    );
    if (res.status === 401 || res.status === 403 || res.status === 404)
      return false;
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data?.title) return true;
      if (data?.error) return false;
    }
  } catch {
    /* offline or blocked — unknown, don't block the user */
  }
  return null;
}

export const youtubeThumb = (videoId: string, quality = "mqdefault") =>
  `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;

export const youtubeWatchUrl = (videoId: string) =>
  `https://www.youtube.com/watch?v=${videoId}`;

/* ------------------------------------------------------------------ */
/* Fetch helpers                                                       */
/* ------------------------------------------------------------------ */

async function fetchWithTimeout(
  url: string,
  ms = 9000,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://invidious.nerdvpn.de",
  "https://invidious.jing.rocks",
  "https://invidious.privacyredirect.com",
  "https://iv.ggtyler.dev",
  "https://invidious.materialio.us",
  "https://invidious.reallyaweso.me",
  "https://invidious.dhusch.de",
];

interface InvidiousVideo {
  videoId?: string;
  title?: string;
  author?: string;
  lengthSeconds?: number;
}

interface InvidiousPlaylist {
  title?: string;
  description?: string;
  videos?: InvidiousVideo[];
}

function fromInvidious(data: InvidiousPlaylist): PlaylistResult {
  const videos: PlaylistVideo[] = (data.videos ?? [])
    .filter((v) => v && v.videoId && VIDEO_ID.test(v.videoId))
    .map((v) => ({
      videoId: v.videoId as string,
      title: (v.title || "").trim() || "Untitled video",
      duration:
        typeof v.lengthSeconds === "number" ? v.lengthSeconds : undefined,
      thumbnail: youtubeThumb(v.videoId as string),
      author: v.author,
    }));
  return {
    title: (data.title || "").trim() || "YouTube Playlist",
    description: data.description,
    videos,
  };
}

/* ------------------------------------------------------------------ */
/* YouTube Data API (optional user key)                                */
/* ------------------------------------------------------------------ */

export function parseIsoDuration(iso?: string): number | undefined {
  if (!iso) return undefined;
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return undefined;
  const [, d, h, min, s] = m;
  return (
    Number(d || 0) * 86400 +
    Number(h || 0) * 3600 +
    Number(min || 0) * 60 +
    Number(s || 0)
  );
}

async function fetchViaDataApi(
  playlistId: string,
  apiKey: string,
  onProgress?: (n: number) => void,
): Promise<PlaylistResult> {
  const key = encodeURIComponent(apiKey);
  const metaRes = await fetchWithTimeout(
    `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${key}`,
    12000,
  );
  const meta = await metaRes.json().catch(() => null);
  if (!metaRes.ok) throw new Error(meta?.error?.message || "YouTube API error");
  const playlistTitle = meta?.items?.[0]?.snippet?.title || "YouTube Playlist";
  const playlistDesc = meta?.items?.[0]?.snippet?.description;

  const items: Array<{
    videoId: string;
    title: string;
    thumbnail?: string;
    author?: string;
  }> = [];
  let pageToken = "";
  for (let page = 0; page < 10; page++) {
    const url =
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}` +
      `&key=${key}${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await fetchWithTimeout(url, 12000);
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error?.message || "YouTube API error");
    for (const item of data?.items ?? []) {
      const sn = item?.snippet;
      const vid = sn?.resourceId?.videoId;
      if (!vid || !VIDEO_ID.test(vid)) continue;
      const thumbs = sn?.thumbnails || {};
      items.push({
        videoId: vid,
        title: (sn?.title || "").trim() || "Untitled video",
        thumbnail:
          thumbs?.medium?.url || thumbs?.high?.url || youtubeThumb(vid),
        author: sn?.videoOwnerChannelTitle || sn?.channelTitle,
      });
    }
    onProgress?.(items.length);
    pageToken = data?.nextPageToken || "";
    if (!pageToken) break;
  }

  const durationMap = new Map<string, number>();
  for (let i = 0; i < items.length; i += 50) {
    const ids = items
      .slice(i, i + 50)
      .map((v) => v.videoId)
      .join(",");
    try {
      const res = await fetchWithTimeout(
        `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${ids}&key=${key}`,
        12000,
      );
      const data = await res.json().catch(() => null);
      for (const v of data?.items ?? []) {
        const dur = parseIsoDuration(v?.contentDetails?.duration);
        if (dur) durationMap.set(v.id, dur);
      }
    } catch {
      /* durations are optional */
    }
  }

  return {
    title: playlistTitle,
    description: playlistDesc,
    videos: items.map((v) => ({ ...v, duration: durationMap.get(v.videoId) })),
  };
}

/* ------------------------------------------------------------------ */
/* Invidious (no key needed)                                           */
/* ------------------------------------------------------------------ */

async function fetchViaInvidious(
  playlistId: string,
  onProgress?: (n: number) => void,
): Promise<PlaylistResult> {
  let lastError: unknown = null;
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetchWithTimeout(
        `${base}/api/v1/playlists/${playlistId}`,
        10000,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as InvidiousPlaylist;
      const result = fromInvidious(data);
      if (result.videos.length === 0) throw new Error("empty playlist");
      onProgress?.(result.videos.length);
      return result;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("All playlist sources failed");
}

/* ------------------------------------------------------------------ */
/* HTML page parsing (proxy fallback)                                  */
/* ------------------------------------------------------------------ */

function extractBalancedJson(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function extractInitialData(html: string): any | null {
  let idx = html.indexOf("ytInitialData");
  while (idx !== -1) {
    const brace = html.indexOf("{", idx);
    if (brace !== -1) {
      const json = extractBalancedJson(html, brace);
      if (json) {
        try {
          return JSON.parse(json);
        } catch {
          /* keep looking */
        }
      }
    }
    idx = html.indexOf("ytInitialData", idx + 12);
  }
  return null;
}

function findAll(obj: any, key: string, out: any[] = []): any[] {
  if (!obj || typeof obj !== "object") return out;
  if (Array.isArray(obj)) {
    for (const item of obj) findAll(item, key, out);
    return out;
  }
  if (obj[key]) out.push(obj[key]);
  for (const value of Object.values(obj)) findAll(value, key, out);
  return out;
}

function parsePlaylistHtml(html: string): PlaylistResult {
  const data = extractInitialData(html);
  if (!data) throw new Error("No playlist data in page");

  let title = "";
  const metaRenderer = findAll(data, "playlistMetadataRenderer")[0];
  if (metaRenderer?.title) title = metaRenderer.title;
  if (!title) {
    const header = findAll(data, "pageHeaderRenderer")[0];
    title = header?.pageTitle || "";
  }

  const videos: PlaylistVideo[] = [];
  const seen = new Set<string>();

  // New YouTube layout
  for (const lockup of findAll(data, "lockupViewModel")) {
    const videoId = lockup?.contentId;
    if (!videoId || !VIDEO_ID.test(videoId) || seen.has(videoId)) continue;
    seen.add(videoId);
    let duration: number | undefined;
    const badges = lockup?.contentImage?.thumbnailViewModel?.overlays ?? [];
    outer: for (const overlay of badges) {
      for (const badge of overlay?.thumbnailBottomOverlayViewModel?.badges ??
        []) {
        const text = badge?.thumbnailBadgeViewModel?.text;
        if (typeof text === "string" && /^\d+:\d+/.test(text)) {
          duration = parseDurationText(text);
          break outer;
        }
      }
    }
    const meta = lockup?.metadata?.lockupMetadataViewModel;
    const titleText =
      meta?.title?.content ||
      meta?.title?.dynamicTextViewModel?.text?.content ||
      "";
    let author = "";
    for (const part of meta?.metadata?.contentMetadataViewModel
      ?.metadataRows?.[0]?.metadataParts ?? []) {
      if (part?.text?.content) {
        author = part.text.content;
        break;
      }
    }
    videos.push({
      videoId,
      title: titleText || "Untitled video",
      duration,
      thumbnail: youtubeThumb(videoId),
      author,
    });
  }

  // Legacy layout
  for (const renderer of findAll(data, "playlistVideoRenderer")) {
    const videoId = renderer?.videoId;
    if (!videoId || !VIDEO_ID.test(videoId) || seen.has(videoId)) continue;
    seen.add(videoId);
    const titleText =
      renderer?.title?.simpleText ||
      renderer?.title?.runs?.map((r: any) => r.text).join("") ||
      "Untitled video";
    videos.push({
      videoId,
      title: titleText,
      duration: parseDurationText(renderer?.lengthText?.simpleText),
      thumbnail: youtubeThumb(videoId),
      author: renderer?.shortBylineText?.runs?.[0]?.text,
    });
  }

  if (!videos.length) throw new Error("No videos found");
  return { title: title || "YouTube Playlist", videos };
}

async function fetchViaProxy(playlistId: string): Promise<PlaylistResult> {
  const target = `https://www.youtube.com/playlist?list=${playlistId}&hl=en`;
  const proxies = [
    (u: string) =>
      `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u: string) =>
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  ];
  let lastError: unknown = null;
  for (const proxy of proxies) {
    try {
      const res = await fetchWithTimeout(proxy(target), 10000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      if (!html || html.length < 2000) throw new Error("Empty response");
      return parsePlaylistHtml(html);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Proxy failed");
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function fetchPlaylist(
  playlistId: string,
  options: { apiKey?: string; onProgress?: (n: number) => void } = {},
): Promise<PlaylistResult> {
  const errors: string[] = [];

  if (options.apiKey) {
    try {
      const result = await fetchViaDataApi(
        playlistId,
        options.apiKey,
        options.onProgress,
      );
      if (result.videos.length) return result;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "API failed");
    }
  }

  try {
    return await fetchViaInvidious(playlistId, options.onProgress);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Invidious failed");
  }

  try {
    return await fetchViaProxy(playlistId);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Proxy failed");
  }

  throw new Error(errors.join(" | "));
}

export interface VideoMeta {
  title: string;
  author?: string;
  thumbnail?: string;
}

export async function fetchVideoMeta(videoId: string): Promise<VideoMeta> {
  const fallback: VideoMeta = {
    title: "YouTube video",
    thumbnail: youtubeThumb(videoId, "hqdefault"),
  };

  // noembed has permissive CORS
  try {
    const res = await fetchWithTimeout(
      `https://noembed.com/embed?url=${encodeURIComponent(youtubeWatchUrl(videoId))}`,
      8000,
    );
    if (res.ok) {
      const data = await res.json();
      if (data?.title) {
        return {
          title: data.title,
          author: data.author_name,
          thumbnail: data.thumbnail_url || youtubeThumb(videoId, "hqdefault"),
        };
      }
    }
  } catch {
    /* try next */
  }

  // oEmbed via proxy
  try {
    const res = await fetchWithTimeout(
      `https://api.allorigins.win/raw?url=${encodeURIComponent(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeWatchUrl(videoId))}&format=json`,
      )}`,
      8000,
    );
    if (res.ok) {
      const data = await res.json();
      if (data?.title)
        return {
          title: data.title,
          author: data.author_name,
          thumbnail: data.thumbnail_url,
        };
    }
  } catch {
    /* ignore */
  }

  return fallback;
}

/* ------------------------------------------------------------------ */
/* YouTube IFrame API                                                  */
/* ------------------------------------------------------------------ */

let ytApiPromise: Promise<any> | null = null;

export function loadYouTubeAPI(): Promise<any> {
  const w = window as any;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (ok) resolve(w.YT);
      else reject(new Error("YouTube API failed to load"));
    };

    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      try {
        prev?.();
      } catch {
        /* ignore */
      }
      finish(true);
    };

    if (
      !document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]',
      )
    ) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      tag.onerror = () => finish(false);
      document.head.appendChild(tag);
    }

    const started = Date.now();
    const timer = setInterval(() => {
      if (w.YT?.Player) {
        clearInterval(timer);
        finish(true);
      } else if (Date.now() - started > 15000) {
        clearInterval(timer);
        finish(false);
      }
    }, 200);
  });

  return ytApiPromise;
}
