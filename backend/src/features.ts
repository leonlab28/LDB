import type { Caller, Env, PersonId } from "./auth";
import {
  DAY_MS,
  HttpError,
  getFile,
  isValidTimezone,
  json,
  noContent,
  optString,
  readJson,
  roundCoord,
} from "./util";

const MAX_PHOTOS_PER_DAY = 30;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_THUMB_BYTES = 512 * 1024;
const MAX_VOICE_BYTES = 6 * 1024 * 1024;
const MAX_NOTES = 20;
const TRAFFIC_STATES = ["free", "busy", "sleeping"] as const;

// ---------------------------------------------------------------------------
// Gesamtansicht: alles, was die eine Person über sich (Bearbeiten) oder den Partner (Anzeige) sieht.
// ---------------------------------------------------------------------------

async function snapshot(env: Env, personId: PersonId, viewer: "self" | "partner") {
  const now = Date.now();
  const [person, light, voice, photos, notes, location] = await Promise.all([
    env.DB.prepare("SELECT id, display_name, timezone FROM persons WHERE id = ?").bind(personId).first(),
    env.DB.prepare("SELECT * FROM traffic_light WHERE person_id = ?").bind(personId).first<Record<string, unknown>>(),
    env.DB.prepare(
      "SELECT duration_ms, waveform_json, sender_timezone, recorded_at, listened_at FROM voice_slot WHERE person_id = ?",
    )
      .bind(personId)
      .first<Record<string, unknown>>(),
    env.DB.prepare(
      "SELECT id, caption, created_at, expires_at, seen_at, kept_at, thumb_r2_key IS NOT NULL AS has_thumb FROM photos WHERE person_id = ? AND expires_at > ? ORDER BY created_at DESC",
    )
      .bind(personId, now)
      .all(),
    env.DB.prepare(
      "SELECT id, kind, body, color, done, created_at, updated_at, expires_at, seen_at FROM notes WHERE person_id = ? AND expires_at > ? ORDER BY created_at DESC",
    )
      .bind(personId, now)
      .all(),
    env.DB.prepare("SELECT lat, lon, paused, updated_at FROM location WHERE person_id = ?").bind(personId).first<{
      lat: number | null;
      lon: number | null;
      paused: number;
      updated_at: number;
    }>(),
  ]);

  const manualActive = light?.manual_state && (light.manual_until == null || (light.manual_until as number) > now);

  return {
    server_time: now,
    viewer,
    person,
    traffic_light: light
      ? {
          plan: light.plan_json ? JSON.parse(light.plan_json as string) : null,
          manual: manualActive
            ? { state: light.manual_state, set_at: light.manual_set_at, until: light.manual_until }
            : null,
          emoji: light.emoji,
          note: light.note,
        }
      : null,
    voice: voice
      ? {
          duration_ms: voice.duration_ms,
          waveform: voice.waveform_json ? JSON.parse(voice.waveform_json as string) : null,
          sender_timezone: voice.sender_timezone,
          recorded_at: voice.recorded_at,
          listened_at: voice.listened_at,
        }
      : null,
    photos: photos.results,
    notes: notes.results,
    // Pausierter Standort wird dem Partner nicht ausgeliefert.
    location:
      location && (viewer === "self" || !location.paused)
        ? location
        : location
          ? { paused: 1, updated_at: location.updated_at }
          : null,
  };
}

export const getMe = async (env: Env, c: Caller) => json(await snapshot(env, c.personId, "self"));
export const getPartner = async (env: Env, c: Caller) => json(await snapshot(env, c.partnerId, "partner"));

// ---------------------------------------------------------------------------
// Feature 1: Zeitzone + Name
// ---------------------------------------------------------------------------

/** PUT /v1/me/profile  { display_name?, timezone? } */
export async function putProfile(req: Request, env: Env, c: Caller) {
  const body = await readJson<{ display_name?: unknown; timezone?: unknown }>(req);
  const name = optString(body.display_name, 40, "display_name");
  if (body.timezone !== undefined && !isValidTimezone(body.timezone)) throw new HttpError(400, "Unbekannte Zeitzone");
  await env.DB.prepare(
    "UPDATE persons SET display_name = COALESCE(?, display_name), timezone = COALESCE(?, timezone), updated_at = ? WHERE id = ?",
  )
    .bind(name, (body.timezone as string | undefined) ?? null, Date.now(), c.personId)
    .run();
  return noContent();
}

// ---------------------------------------------------------------------------
// Feature 3: Ampel
// ---------------------------------------------------------------------------

/**
 * PUT /v1/me/traffic-light
 * { plan?, manual?: { state, until } | null, emoji?, note? }
 * Der Plan wird auf dem Gerät ausgewertet; der Server speichert nur Plan und aktuelle Überschreibung.
 */
export async function putTrafficLight(req: Request, env: Env, c: Caller) {
  const body = await readJson<{
    plan?: unknown;
    manual?: { state?: unknown; until?: unknown } | null;
    emoji?: unknown;
    note?: unknown;
  }>(req);
  const now = Date.now();

  let planJson: string | null = null;
  if (body.plan !== undefined) {
    planJson = JSON.stringify(body.plan);
    if (planJson.length > 8000) throw new HttpError(400, "Plan zu groß");
  }

  let manualState: string | null = null;
  let manualUntil: number | null = null;
  const clearManual = body.manual === null;
  if (body.manual) {
    if (!TRAFFIC_STATES.includes(body.manual.state as (typeof TRAFFIC_STATES)[number])) {
      throw new HttpError(400, "state muss free, busy oder sleeping sein");
    }
    manualState = body.manual.state as string;
    if (body.manual.until != null) {
      if (typeof body.manual.until !== "number" || body.manual.until <= now) throw new HttpError(400, "until ungültig");
      manualUntil = body.manual.until;
    }
  }

  await env.DB.prepare(
    `INSERT INTO traffic_light (person_id, manual_state, manual_set_at, manual_until, emoji, note, plan_json, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
     ON CONFLICT(person_id) DO UPDATE SET
       manual_state  = CASE WHEN ?9 THEN NULL WHEN ?2 IS NOT NULL THEN ?2 ELSE manual_state END,
       manual_set_at = CASE WHEN ?9 THEN NULL WHEN ?2 IS NOT NULL THEN ?3 ELSE manual_set_at END,
       manual_until  = CASE WHEN ?9 THEN NULL WHEN ?2 IS NOT NULL THEN ?4 ELSE manual_until END,
       emoji         = CASE WHEN ?10 THEN ?5 ELSE emoji END,
       note          = CASE WHEN ?11 THEN ?6 ELSE note END,
       plan_json     = COALESCE(?7, plan_json),
       updated_at    = ?8`,
  )
    .bind(
      c.personId,
      manualState,
      manualState ? now : null,
      manualUntil,
      optString(body.emoji, 16, "emoji"),
      optString(body.note, 80, "note"),
      planJson,
      now,
      clearManual ? 1 : 0,
      body.emoji !== undefined ? 1 : 0,
      body.note !== undefined ? 1 : 0,
    )
    .run();
  return noContent();
}

// ---------------------------------------------------------------------------
// Feature 2: Sprach-Slot (genau einer pro Person)
// ---------------------------------------------------------------------------

/** PUT /v1/me/voice  multipart: audio (m4a), duration_ms, waveform (JSON-Array), timezone */
export async function putVoice(req: Request, env: Env, c: Caller) {
  const form = await req.formData();
  const audio = getFile(form, "audio");
  if (!audio) throw new HttpError(400, "audio fehlt");
  if (audio.size > MAX_VOICE_BYTES) throw new HttpError(413, "Aufnahme zu groß");
  const durationMs = Number(form.get("duration_ms"));
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 5 * 60 * 1000) {
    throw new HttpError(400, "duration_ms ungültig");
  }
  const waveform = optString(form.get("waveform"), 4000, "waveform");
  const tz = form.get("timezone");
  if (tz !== null && !isValidTimezone(tz)) throw new HttpError(400, "Unbekannte Zeitzone");

  // Reihenfolge laut konzept/02: erst neue Datei hochladen, dann Datensatz umstellen, dann alte Datei löschen.
  const newKey = `voice/${c.personId}/${crypto.randomUUID()}.m4a`;
  await env.MEDIA.put(newKey, audio.stream(), { httpMetadata: { contentType: "audio/mp4" } });

  const old = await env.DB.prepare("SELECT r2_key FROM voice_slot WHERE person_id = ?")
    .bind(c.personId)
    .first<{ r2_key: string }>();
  await env.DB.prepare(
    `INSERT INTO voice_slot (person_id, r2_key, duration_ms, waveform_json, sender_timezone, recorded_at, listened_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(person_id) DO UPDATE SET r2_key = excluded.r2_key, duration_ms = excluded.duration_ms,
       waveform_json = excluded.waveform_json, sender_timezone = excluded.sender_timezone,
       recorded_at = excluded.recorded_at, listened_at = NULL`,
  )
    .bind(c.personId, newKey, Math.round(durationMs), waveform, tz, Date.now())
    .run();
  if (old) await env.MEDIA.delete(old.r2_key);
  return json({ ok: true }, 201);
}

/** DELETE /v1/me/voice  Zurückholen durch den Absender. */
export async function deleteVoice(env: Env, c: Caller) {
  const old = await env.DB.prepare("DELETE FROM voice_slot WHERE person_id = ? RETURNING r2_key")
    .bind(c.personId)
    .first<{ r2_key: string }>();
  if (old) await env.MEDIA.delete(old.r2_key);
  return noContent();
}

/** GET /v1/partner/voice  Audiodatei des Partners. */
export async function getPartnerVoice(env: Env, c: Caller) {
  const row = await env.DB.prepare("SELECT r2_key FROM voice_slot WHERE person_id = ?")
    .bind(c.partnerId)
    .first<{ r2_key: string }>();
  if (!row) throw new HttpError(404, "Kein Sprach-Slot");
  return streamObject(env, row.r2_key);
}

/** POST /v1/partner/voice/listened */
export async function markVoiceListened(env: Env, c: Caller) {
  await env.DB.prepare("UPDATE voice_slot SET listened_at = ? WHERE person_id = ? AND listened_at IS NULL")
    .bind(Date.now(), c.partnerId)
    .run();
  return noContent();
}

// ---------------------------------------------------------------------------
// Feature 4: Foto-Dump
// ---------------------------------------------------------------------------

/** POST /v1/me/photos  multipart: image (JPEG/HEIC, schon auf dem Gerät verkleinert), thumb?, caption? */
export async function postPhoto(req: Request, env: Env, c: Caller) {
  const now = Date.now();
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM photos WHERE person_id = ? AND created_at > ?")
    .bind(c.personId, now - DAY_MS)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_PHOTOS_PER_DAY) throw new HttpError(429, "Tageslimit von 30 Fotos erreicht");

  const form = await req.formData();
  const image = getFile(form, "image");
  if (!image) throw new HttpError(400, "image fehlt");
  if (image.size > MAX_PHOTO_BYTES) throw new HttpError(413, "Foto zu groß");
  const thumb = getFile(form, "thumb");
  if (thumb && thumb.size > MAX_THUMB_BYTES) throw new HttpError(413, "Vorschaubild zu groß");
  const caption = optString(form.get("caption"), 80, "caption");

  const id = crypto.randomUUID();
  const key = `photos/${c.personId}/${id}`;
  const contentType = image.type || "image/jpeg";
  await env.MEDIA.put(key, image.stream(), { httpMetadata: { contentType } });
  if (thumb) await env.MEDIA.put(`${key}_thumb`, thumb.stream(), { httpMetadata: { contentType: thumb.type || contentType } });

  await env.DB.prepare(
    "INSERT INTO photos (id, person_id, r2_key, thumb_r2_key, caption, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, c.personId, key, thumb ? `${key}_thumb` : null, caption, now, now + DAY_MS)
    .run();
  return json({ id, expires_at: now + DAY_MS }, 201);
}

/** DELETE /v1/me/photos/:id */
export async function deletePhoto(env: Env, c: Caller, id: string) {
  const row = await env.DB.prepare("DELETE FROM photos WHERE id = ? AND person_id = ? RETURNING r2_key, thumb_r2_key")
    .bind(id, c.personId)
    .first<{ r2_key: string; thumb_r2_key: string | null }>();
  if (!row) throw new HttpError(404, "Foto nicht gefunden");
  await env.MEDIA.delete([row.r2_key, ...(row.thumb_r2_key ? [row.thumb_r2_key] : [])]);
  return noContent();
}

/** GET /v1/partner/photos/:id?size=thumb */
export async function getPartnerPhoto(env: Env, c: Caller, id: string, url: URL) {
  const row = await env.DB.prepare(
    "SELECT r2_key, thumb_r2_key FROM photos WHERE id = ? AND person_id = ? AND expires_at > ?",
  )
    .bind(id, c.partnerId, Date.now())
    .first<{ r2_key: string; thumb_r2_key: string | null }>();
  if (!row) throw new HttpError(404, "Foto nicht gefunden oder abgelaufen");
  const key = url.searchParams.get("size") === "thumb" && row.thumb_r2_key ? row.thumb_r2_key : row.r2_key;
  return streamObject(env, key);
}

/** POST /v1/partner/photos/:id/seen  bzw.  /keep */
export async function markPhoto(env: Env, c: Caller, id: string, field: "seen_at" | "kept_at") {
  await env.DB.prepare(`UPDATE photos SET ${field} = COALESCE(${field}, ?) WHERE id = ? AND person_id = ? AND expires_at > ?`)
    .bind(Date.now(), id, c.partnerId, Date.now())
    .run();
  return noContent();
}

// ---------------------------------------------------------------------------
// Feature 5: Post-its
// ---------------------------------------------------------------------------

interface NoteInput {
  kind?: unknown;
  body?: unknown;
  color?: unknown;
  done?: unknown;
}

/** POST /v1/me/notes  { kind?, body, color? } */
export async function postNote(req: Request, env: Env, c: Caller) {
  const input = await readJson<NoteInput>(req);
  const body = optString(input.body, 500, "body");
  if (!body) throw new HttpError(400, "body fehlt");
  const now = Date.now();
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM notes WHERE person_id = ? AND expires_at > ?")
    .bind(c.personId, now)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_NOTES) throw new HttpError(429, "Zu viele Notizen");

  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO notes (id, person_id, kind, body, color, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, c.personId, optString(input.kind, 20, "kind") ?? "text", body, optString(input.color, 20, "color"), now, now, now + DAY_MS)
    .run();
  return json({ id, expires_at: now + DAY_MS }, 201);
}

/**
 * PUT /v1/me/notes/:id  Ersetzen = neuer Inhalt, 24 h starten neu, 👀 wird zurückgesetzt.
 * Nur "done" umschalten lässt Laufzeit und 👀 unverändert.
 */
export async function putNote(req: Request, env: Env, c: Caller, id: string) {
  const input = await readJson<NoteInput>(req);
  const now = Date.now();
  const body = optString(input.body, 500, "body");
  const res = body
    ? await env.DB.prepare(
        "UPDATE notes SET body = ?, color = COALESCE(?, color), done = 0, updated_at = ?, expires_at = ?, seen_at = NULL WHERE id = ? AND person_id = ? AND expires_at > ?",
      )
        .bind(body, optString(input.color, 20, "color"), now, now + DAY_MS, id, c.personId, now)
        .run()
    : await env.DB.prepare("UPDATE notes SET done = ?, updated_at = ? WHERE id = ? AND person_id = ? AND expires_at > ?")
        .bind(input.done ? 1 : 0, now, id, c.personId, now)
        .run();
  if (!res.meta.changes) throw new HttpError(404, "Notiz nicht gefunden");
  return noContent();
}

/** DELETE /v1/me/notes/:id */
export async function deleteNote(env: Env, c: Caller, id: string) {
  await env.DB.prepare("DELETE FROM notes WHERE id = ? AND person_id = ?").bind(id, c.personId).run();
  return noContent();
}

/** POST /v1/partner/notes/:id/seen */
export async function markNoteSeen(env: Env, c: Caller, id: string) {
  await env.DB.prepare("UPDATE notes SET seen_at = COALESCE(seen_at, ?) WHERE id = ? AND person_id = ?")
    .bind(Date.now(), id, c.partnerId)
    .run();
  return noContent();
}

// ---------------------------------------------------------------------------
// Feature 1 + 7: Standort (gerundet, keine Historie)
// ---------------------------------------------------------------------------

/** PUT /v1/me/location  { lat, lon }  oder  { paused: true } */
export async function putLocation(req: Request, env: Env, c: Caller) {
  const body = await readJson<{ lat?: unknown; lon?: unknown; paused?: unknown }>(req);
  const now = Date.now();
  if (body.paused === true) {
    // Pausieren löscht den letzten Punkt, damit auch der Server nichts mehr weiß.
    await env.DB.prepare(
      `INSERT INTO location (person_id, lat, lon, paused, updated_at) VALUES (?, NULL, NULL, 1, ?)
       ON CONFLICT(person_id) DO UPDATE SET lat = NULL, lon = NULL, paused = 1, updated_at = excluded.updated_at`,
    )
      .bind(c.personId, now)
      .run();
    return noContent();
  }
  const lat = roundCoord(body.lat, 90);
  const lon = roundCoord(body.lon, 180);
  await env.DB.prepare(
    `INSERT INTO location (person_id, lat, lon, paused, updated_at) VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(person_id) DO UPDATE SET lat = excluded.lat, lon = excluded.lon, paused = 0, updated_at = excluded.updated_at`,
  )
    .bind(c.personId, lat, lon, now)
    .run();
  return noContent();
}

// ---------------------------------------------------------------------------

async function streamObject(env: Env, key: string): Promise<Response> {
  const obj = await env.MEDIA.get(key);
  if (!obj) throw new HttpError(404, "Datei fehlt");
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("cache-control", "private, no-store");
  headers.set("content-length", String(obj.size));
  return new Response(obj.body, { headers });
}
