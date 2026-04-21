import { looksLikeGifUrl, looksLikeVideoUrl } from "./mediaKind";

export function isDataPng(s: string): boolean {
  return /^data:image\/png/i.test(s);
}

export function isDataExtractableMedia(s: string): boolean {
  return (
    /^data:image\/(?:png|gif|webp|jpe?g|bmp|avif)/i.test(s) ||
    /^data:video\//i.test(s)
  );
}

export function looksLikePngUrl(href: string): boolean {
  if (isDataPng(href)) return true;
  const lower = href.toLowerCase();
  if (lower.includes("format=png") || lower.includes("type=png")) return true;
  try {
    const u = new URL(href);
    const path = u.pathname.toLowerCase();
    if (path.endsWith(".png")) return true;
    if (path.includes(".png?")) return true;
  } catch {
    const path = href.split(/[?#]/)[0].toLowerCase();
    if (path.endsWith(".png")) return true;
  }
  return false;
}

export function looksLikeRasterImageUrl(href: string): boolean {
  if (looksLikePngUrl(href)) return true;
  try {
    const path = new URL(href).pathname.toLowerCase();
    return /\.(webp|jpe?g|gif|avif|bmp)(?:$|[?#])/i.test(path);
  } catch {
    const base = href.split(/[?#]/)[0].toLowerCase();
    return /\.(webp|jpe?g|gif|avif|bmp)$/.test(base);
  }
}

export function looksLikeExtractableUrl(href: string): boolean {
  if (isDataExtractableMedia(href)) return true;
  if (looksLikeRasterImageUrl(href)) return true;
  if (looksLikeVideoUrl(href)) return true;
  return false;
}

function addCandidate(raw: string | null, out: Set<string>, base: string | null) {
  if (!raw) return;
  let s = raw.trim().replace(/^['"]|['"]$/g, "");
  if (!s) return;

  if (isDataExtractableMedia(s)) {
    out.add(s);
    return;
  }

  if (s.startsWith("//")) s = "https:" + s;
  if (s.startsWith("blob:")) return;

  try {
    const resolved = base ? new URL(s, base).href : new URL(s).href;
    if (looksLikeExtractableUrl(resolved)) out.add(resolved);
  } catch {
    // ignore invalid
  }
}

function addRasterCandidate(raw: string | null, out: Set<string>, base: string | null) {
  if (!raw) return;
  let s = raw.trim().replace(/^['"]|['"]$/g, "");
  if (!s || s.startsWith("blob:")) return;
  if (s.startsWith("//")) s = "https:" + s;
  try {
    const resolved = base ? new URL(s, base).href : new URL(s).href;
    if (looksLikeRasterImageUrl(resolved) || looksLikeVideoUrl(resolved)) out.add(resolved);
  } catch {
    // ignore invalid
  }
}

function consumeSrcset(srcset: string | null, out: Set<string>, base: string | null) {
  if (!srcset) return;
  for (const part of srcset.split(",")) {
    const url = part.trim().split(/\s+/)[0];
    if (url) addCandidate(url, out, base);
  }
}

function urlsFromCss(cssText: string, out: Set<string>, base: string | null) {
  if (!cssText) return;
  const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cssText)) !== null) addCandidate(m[2], out, base);
}

export function extractFromHtml(html: string, out: Set<string>, base: string | null) {
  const doc = new DOMParser().parseFromString(html, "text/html");

  doc.querySelectorAll("img[src]").forEach((el) => {
    const src = el.getAttribute("src");
    if (src && src.trim().startsWith("blob:")) {
      out.add(src.trim());
      return;
    }
    addCandidate(src, out, base);
  });
  doc.querySelectorAll("img[srcset], source[srcset]").forEach((el) => {
    consumeSrcset(el.getAttribute("srcset"), out, base);
  });
  doc.querySelectorAll("source[src]").forEach((el) => addCandidate(el.getAttribute("src"), out, base));
  doc.querySelectorAll("video[src]").forEach((el) => addCandidate(el.getAttribute("src"), out, base));
  doc.querySelectorAll("video source[src]").forEach((el) => addCandidate(el.getAttribute("src"), out, base));
  doc.querySelectorAll("a[href]").forEach((el) => addCandidate(el.getAttribute("href"), out, base));
  doc.querySelectorAll("link[href]").forEach((el) => addCandidate(el.getAttribute("href"), out, base));
  doc.querySelectorAll("[style]").forEach((el) => urlsFromCss(el.getAttribute("style") || "", out, base));
  doc.querySelectorAll("style").forEach((el) => urlsFromCss(el.textContent || "", out, base));
}

export function extractFromRawText(text: string, out: Set<string>, base: string | null) {
  const dataRe =
    /data:(?:image\/(?:png|gif|webp|jpe?g|bmp|avif)|video\/(?:mp4|webm|ogg|quicktime|mpeg|x-matroska))[^"'`\s<>]*/gi;
  let m: RegExpExecArray | null;
  while ((m = dataRe.exec(text)) !== null) addCandidate(m[0], out, base);

  const httpRe = /https?:\/\/[^\s"'<>()]+/gi;
  while ((m = httpRe.exec(text)) !== null) addCandidate(m[0], out, base);

  const pathRe =
    /(?:^|[\s"'(=[{,:])\/[^\s"'<>()]*\.(?:png|webp|jpe?g|gif|avif|bmp|mp4|webm|ogv|mov|m4v|mkv|mpeg|mpg|3gp|m3u8)(?:[^\s"'<>()]*)?/gi;
  while ((m = pathRe.exec(text)) !== null) {
    const raw = m[0].replace(/^[\s"'(=[{,:]+/, "").trim();
    if (raw) addCandidate(raw, out, base);
  }
}

export function extractScreenUrls(text: string, out: Set<string>, base: string | null) {
  const key = "screenUrl";
  const imgRe =
    /https?:\/\/[^\s"'\\<>]+?\.(?:png|webp|jpe?g|gif|avif|bmp|mp4|webm|ogv|mov|m4v|mkv|mpeg|mpg|m3u8)(?:\?[^\s"'\\<>]*)?/gi;
  let pos = 0;
  while ((pos = text.indexOf(key, pos)) !== -1) {
    const slice = text.slice(pos, pos + 4096);
    for (const m of slice.matchAll(imgRe)) addRasterCandidate(m[0], out, base);
    pos += key.length;
  }
}

export function extractAll(text: string, base: string | null): string[] {
  const out = new Set<string>();
  if (!text.trim()) return [];

  extractFromHtml(text, out, base);
  extractFromRawText(text, out, base);
  extractScreenUrls(text, out, base);

  return Array.from(out).sort((a, b) => a.localeCompare(b));
}

export function isOpenableInTab(url: string): boolean {
  return (
    url.startsWith("http:") ||
    url.startsWith("https:") ||
    url.startsWith("data:image/") ||
    url.startsWith("data:video/")
  );
}

export function shouldPreviewAsVideo(url: string): boolean {
  return looksLikeVideoUrl(url);
}

export function displayUrl(url: string): string {
  if (url.length <= 96) return url;
  return url.slice(0, 44) + "…" + url.slice(-40);
}

export function displayUrlForTile(url: string): string {
  const max = 36;
  if (url.startsWith("data:")) {
    const semi = url.indexOf(";");
    const head = url.slice(0, semi > 0 ? semi : Math.min(28, url.length));
    return head.length <= max ? head : `${head.slice(0, 26)}…`;
  }
  if (url.startsWith("blob:")) return "Blob";

  try {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      const u = new URL(url);
      const host = u.host.replace(/^www\./i, "");
      const parts = u.pathname.split("/").filter(Boolean);
      const fileRaw = parts.length ? parts[parts.length - 1] : "";
      let file = fileRaw;
      try {
        file = decodeURIComponent(fileRaw);
      } catch {
        /* keep raw */
      }

      let label = file ? `${host}/…/${file}` : `${host}${u.pathname || "/"}`;
      if (label.length <= max) return label;

      const shortFile = file.length > 22 ? `${file.slice(0, 8)}…${file.slice(-10)}` : file;
      const shortHost = host.length > 14 ? `${host.slice(0, 10)}…` : host;
      label = `${shortHost}/…/${shortFile}`;
      return label.length > max + 2 ? `${label.slice(0, max - 1)}…` : label;
    }
  } catch {
    /* fall through */
  }

  if (url.length <= max) return url;
  return `${url.slice(0, 13)}…${url.slice(-10)}`;
}

