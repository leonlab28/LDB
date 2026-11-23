import { HttpError, json, randomKey, readJson, safeEqual, sha256Hex, optString } from "./util";

export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  /**
   * Kopplungscode, abgeleitet aus dem gemeinsamen Geheimnis S (HKDF, siehe docs/encryption.md).
   * Gesetzt per `npm run secret:new -- --server … --put`. Aus ihm lässt sich der Inhaltsschlüssel nicht berechnen.
   */
  PAIRING_CODE?: string;
  /** "true", solange neue Geräte gekoppelt werden dürfen. Danach auf "false" stellen und neu deployen. */
  REGISTRATION_OPEN?: string;
}

export type PersonId = "a" | "b";

export interface Caller {
  deviceId: string;
  personId: PersonId;
  partnerId: PersonId;
}

const MAX_DEVICES_PER_PERSON = 3;

export async function authenticate(req: Request, env: Env): Promise<Caller> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header);
  if (!match) throw new HttpError(401, "Geräteschlüssel fehlt");

  const keyHash = await sha256Hex(match[1]);
  const row = await env.DB.prepare("SELECT id, person_id FROM devices WHERE key_hash = ?")
    .bind(keyHash)
    .first<{ id: string; person_id: PersonId }>();
  if (!row) throw new HttpError(401, "Unbekanntes Gerät");

  // last_seen_at nur grob pflegen, um Schreibzugriffe zu sparen.
  await env.DB.prepare("UPDATE devices SET last_seen_at = ? WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < ?)")
    .bind(Date.now(), row.id, Date.now() - 10 * 60 * 1000)
    .run();

  return { deviceId: row.id, personId: row.person_id, partnerId: row.person_id === "a" ? "b" : "a" };
}

/** POST /v1/devices/register  { pairing_code, person: "a"|"b", device_name } */
export async function registerDevice(req: Request, env: Env): Promise<Response> {
  if (env.REGISTRATION_OPEN !== "true") throw new HttpError(403, "Kopplung ist geschlossen");
  if (!env.PAIRING_CODE || env.PAIRING_CODE.length < 12) {
    throw new HttpError(500, "PAIRING_CODE ist nicht (ausreichend lang) gesetzt");
  }

  const body = await readJson<{ pairing_code?: unknown; person?: unknown; device_name?: unknown }>(req);
  if (typeof body.pairing_code !== "string" || !(await safeEqual(body.pairing_code, env.PAIRING_CODE))) {
    throw new HttpError(403, "Kopplungscode falsch");
  }
  if (body.person !== "a" && body.person !== "b") throw new HttpError(400, "person muss a oder b sein");
  const name = optString(body.device_name, 60, "device_name") ?? "iPhone";

  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM devices WHERE person_id = ?")
    .bind(body.person)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_DEVICES_PER_PERSON) throw new HttpError(409, "Zu viele Geräte für diese Person");

  const key = randomKey();
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO devices (id, person_id, name, key_hash, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, body.person, name, await sha256Hex(key), Date.now())
    .run();

  // Der Klartextschlüssel wird genau einmal ausgeliefert und nie gespeichert.
  return json({ device_id: id, person: body.person, device_key: key }, 201);
}
