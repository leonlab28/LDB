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

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Standort grob runden (~1 km), damit nie ein metergenauer Punkt gespeichert wird. */
export function roundCoord(v: unknown, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > max) {
    throw new HttpError(400, "Ungültige Koordinate");
  }
  return Math.round(v * 100) / 100;
}

export function optString(v: unknown, maxLen: number, field: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || v.length > maxLen) throw new HttpError(400, `Feld ${field} ungültig`);
  return v;
}

export function getFile(form: FormData, name: string): File | null {
  const v = form.get(name) as unknown;
  return v && typeof v === "object" && "arrayBuffer" in v ? (v as File) : null;
}
