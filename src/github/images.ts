import type { ContentPart } from '../providers/types.js';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/**
 * Extract image URLs referenced in a markdown/HTML body: inline `![](url)`,
 * HTML `<img src="url">`, and bare GitHub attachment URLs
 * (user-images.githubusercontent.com, github.com/<org>/<repo>/assets/...).
 * Returns de-duplicated URLs in first-seen order.
 */
export function extractImageUrls(body: string): string[] {
  if (!body) return [];
  const urls: string[] = [];
  const push = (u: string | undefined) => {
    if (u && !urls.includes(u)) urls.push(u);
  };

  // Markdown image: ![alt](url "title")
  for (const m of body.matchAll(/!\[[^\]]*\]\(\s*(\S+?)(?:\s+["'][^)]*)?\s*\)/g)) {
    push(m[1]);
  }
  // HTML <img src="...">
  for (const m of body.matchAll(/<img[^>]*\bsrc=["']([^"']+)["']/gi)) {
    push(m[1]);
  }
  // Bare GitHub attachment URLs not already captured above.
  for (const m of body.matchAll(
    /https?:\/\/(?:user-images\.githubusercontent\.com|github\.com\/[^/\s)]+\/[^/\s)]+\/assets)\/\S+?(?=[)\s"']|$)/gi,
  )) {
    push(m[0]);
  }
  return urls;
}

function mimeFromContentType(ct: string | null): string | undefined {
  if (!ct) return undefined;
  const base = ct.split(';')[0]!.trim().toLowerCase();
  return ALLOWED_MIME.has(base) ? base : undefined;
}

export interface ImageFetcher {
  (url: string): Promise<{ contentType: string | null; bytes: Uint8Array }>;
}

/** Default fetcher using global fetch with an auth header for private attachments. */
export function makeFetcher(token?: string): ImageFetcher {
  return async (url: string) => {
    const headers: Record<string, string> = {};
    if (token && url.includes('github')) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    return { contentType: res.headers.get('content-type'), bytes: buf };
  };
}

/**
 * Download the given image URLs and return valid ones as image content parts.
 * Skips anything over the size cap, with a disallowed MIME type, or that fails to
 * download — logging a warning rather than throwing, so one bad image never
 * blocks the run.
 */
export async function downloadImages(
  urls: string[],
  fetcher: ImageFetcher,
  log: (msg: string) => void = () => {},
): Promise<ContentPart[]> {
  const parts: ContentPart[] = [];
  for (const url of urls) {
    try {
      const { contentType, bytes } = await fetcher(url);
      const mime = mimeFromContentType(contentType) ?? guessMimeFromUrl(url);
      if (!mime) {
        log(`skipping image (unknown/disallowed type): ${url}`);
        continue;
      }
      if (bytes.byteLength > MAX_IMAGE_BYTES) {
        log(`skipping image (too large, ${bytes.byteLength} bytes): ${url}`);
        continue;
      }
      parts.push({ type: 'image', mime, dataB64: Buffer.from(bytes).toString('base64') });
    } catch (err) {
      log(`skipping image (download failed: ${(err as Error).message}): ${url}`);
    }
  }
  return parts;
}

function guessMimeFromUrl(url: string): string | undefined {
  const ext = url.split('?')[0]!.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    default:
      return undefined;
  }
}
