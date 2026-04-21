export type PreviewMediaKind = "video" | "gif" | "image";

export function looksLikeVideoUrl(href: string): boolean {
  if (/^data:video\//i.test(href)) return true;
  const lower = href.toLowerCase();
  if (
    lower.includes("format=mp4") ||
    lower.includes("type=video") ||
    lower.includes("mime=video")
  ) {
    return true;
  }
  try {
    const path = new URL(href).pathname.toLowerCase();
    return /\.(mp4|webm|ogv|mov|m4v|mkv|mpeg|mpg|3gp|3g2|ts|m2ts|m3u8)(?:$|[?#])/i.test(
      path
    );
  } catch {
    const base = href.split(/[?#]/)[0].toLowerCase();
    return /\.(mp4|webm|ogv|mov|m4v|mkv|mpeg|mpg|3gp|3g2|ts|m2ts|m3u8)$/.test(
      base
    );
  }
}

export function looksLikeGifUrl(href: string): boolean {
  if (/^data:image\/gif/i.test(href)) return true;
  const lower = href.toLowerCase();
  if (lower.includes("format=gif") || lower.includes("type=gif")) return true;
  try {
    const path = new URL(href).pathname.toLowerCase();
    return /\.gif(?:$|[?#])/i.test(path);
  } catch {
    const base = href.split(/[?#]/)[0].toLowerCase();
    return /\.gif$/.test(base);
  }
}

export function getPreviewMediaKind(url: string): PreviewMediaKind {
  if (looksLikeVideoUrl(url)) return "video";
  if (looksLikeGifUrl(url)) return "gif";
  return "image";
}

