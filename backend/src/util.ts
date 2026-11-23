export const DAY_MS = 24 * 60 * 60 * 1000;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Ungültiges JSON");
  }
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 32 zufällige Bytes als base64url, ergibt einen 43 Zeichen langen Geräteschlüssel. */
export function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Vergleich in konstanter Zeit, damit der Kopplungscode nicht über Antwortzeiten erraten werden kann. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

/** Gerätseitig erzeugte IDs (Notizen, Fotos, Sprachnachrichten) sind UUIDs in Kleinschreibung. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// ---------------------------------------------------------------------------
// Umschläge (siehe docs/encryption.md): Version 0x01 | Nonce (12) | Chiffrat | Tag (16).
// Der Server kann sie nicht öffnen. Er prüft nur die Form, damit nie versehentlich Klartext
// gespeichert wird (ein JPEG beginnt z. B. mit 0xFF, JSON mit "{").
// ---------------------------------------------------------------------------

export const ENVELOPE_VERSION = 1;
export const ENVELOPE_OVERHEAD = 1 + 12 + 16;
const MIN_ENVELOPE_CHARS = Math.ceil((ENVELOPE_OVERHEAD * 4) / 3);

export function isEnvelopeText(v: unknown, maxChars: number): v is string {
  if (typeof v !== "string" || v.length < MIN_ENVELOPE_CHARS || v.length > maxChars) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(v)) return false;
  return atob(v.slice(0, 4).replace(/-/g, "+").replace(/_/g, "/")).charCodeAt(0) === ENVELOPE_VERSION;
}

export function requireEnvelopeText(v: unknown, maxChars: number, field: string): string {
  if (!isEnvelopeText(v, maxChars)) throw new HttpError(400, `Feld ${field} ist kein gültiger Umschlag`);
  return v;
}

/** Liest einen binären Umschlag als Rohdaten (application/octet-stream), mit Größenprüfung vor dem Lesen. */
export async function readEnvelopeBody(req: Request, maxBytes: number): Promise<ArrayBuffer> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(413, "Datei zu groß");
  const buf = await req.arrayBuffer();
  if (buf.byteLength > maxBytes) throw new HttpError(413, "Datei zu groß");
  const bytes = new Uint8Array(buf);
  if (bytes.byteLength < ENVELOPE_OVERHEAD || bytes[0] !== ENVELOPE_VERSION) {
    throw new HttpError(400, "Inhalt ist kein gültiger Umschlag");
  }
  return buf;
}

export function optString(v: unknown, maxLen: number, field: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || v.length > maxLen) throw new HttpError(400, `Feld ${field} ungültig`);
  return v;
}
