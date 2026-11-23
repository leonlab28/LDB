import type { Caller, Env, PersonId } from "./auth";
import {
  DAY_MS,
  ENVELOPE_OVERHEAD,
  HttpError,
  UUID_RE,
  json,
  noContent,
  readEnvelopeBody,
  readJson,
  requireEnvelopeText,
} from "./util";

// Alle Inhalte kommen als Umschlag (siehe docs/encryption.md). Der Server sieht nur Größen und Zeiten.
const MAX_PHOTOS_PER_DAY = 30;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024 + ENVELOPE_OVERHEAD;
const MAX_THUMB_BYTES = 512 * 1024 + ENVELOPE_OVERHEAD;
const MAX_VOICE_BYTES = 6 * 1024 * 1024 + ENVELOPE_OVERHEAD;
const MAX_NOTES = 20;
const MAX_NOTE_CHARS = 4096;
const MAX_PHOTO_META_CHARS = 2048;
const MAX_VOICE_META_CHARS = 8192;

/** Erlaubte Einzelzustände und ihre Höchstlänge als base64url-Umschlag. */
export const STATE_KINDS = { profile: 2048, light: 16384, location: 1024 } as const;
export type StateKind = keyof typeof STATE_KINDS;

/** Metadaten zu Binär-Uploads reisen im Header, damit der Rumpf roh nach R2 gehen kann. */
const META_HEADER = "x-ldb-meta";

function requireUuid(id: string): string {
  if (!UUID_RE.test(id)) throw new HttpError(400, "id muss eine UUID sein");
  return id;
}

// ---------------------------------------------------------------------------
// Gesamtansicht: alles, was eine Person über sich (Bearbeiten) oder den Partner (Anzeige) sieht.
// ---------------------------------------------------------------------------

async function snapshot(env: Env, personId: PersonId, viewer: "self" | "partner") {
  const now = Date.now();
  const [states, voice, photos, notes] = await Promise.all([
    env.DB.prepare("SELECT kind, data, updated_at FROM state WHERE person_id = ?")
      .bind(personId)
      .all<{ kind: StateKind; data: string; updated_at: number }>(),
    env.DB.prepare("SELECT id, meta, recorded_at, listened_at FROM voice_slot WHERE person_id = ?")
      .bind(personId)
      .first(),
    env.DB.prepare(
      "SELECT id, meta, created_at, expires_at, seen_at, kept_at, thumb_r2_key IS NOT NULL AS has_thumb FROM photos WHERE person_id = ? AND expires_at > ? ORDER BY created_at DESC",
    )
      .bind(personId, now)
      .all(),
    env.DB.prepare(
      "SELECT id, data, created_at, updated_at, expires_at, seen_at FROM notes WHERE person_id = ? AND expires_at > ? ORDER BY created_at DESC",
    )
      .bind(personId, now)
      .all(),
  ]);

  const state: Record<StateKind, { data: string; updated_at: number } | null> = {
    profile: null,
    light: null,
    location: null,
  };
  for (const s of states.results) state[s.kind] = { data: s.data, updated_at: s.updated_at };

  return {
    server_time: now,
    viewer,
    person: personId,
    state,
    voice: voice ?? null,
    photos: photos.results,
    notes: notes.results,
  };
}

export const getMe = async (env: Env, c: Caller) => json(await snapshot(env, c.personId, "self"));
export const getPartner = async (env: Env, c: Caller) => json(await snapshot(env, c.partnerId, "partner"));

// ---------------------------------------------------------------------------
// Einzelzustände: profile (Name, Zeitzone), light (Ampel, Plan, Emoji, Notiz), location.
// Standort pausieren = Gerät legt einen Umschlag mit {paused: true} ab; der alte Punkt ist damit weg.
// ---------------------------------------------------------------------------

/** PUT /v1/me/state/:kind  { data: <Umschlag> } */
export async function putState(req: Request, env: Env, c: Caller, kind: string) {
  if (!(kind in STATE_KINDS)) throw new HttpError(404, "Unbekannter Zustand");
  const body = await readJson<{ data?: unknown }>(req);
  const data = requireEnvelopeText(body.data, STATE_KINDS[kind as StateKind], "data");
  await env.DB.prepare(
    `INSERT INTO state (person_id, kind, data, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(person_id, kind) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  )
    .bind(c.personId, kind, data, Date.now())
    .run();
  return noContent();
}

/** DELETE /v1/me/state/:kind */
export async function deleteState(env: Env, c: Caller, kind: string) {
  if (!(kind in STATE_KINDS)) throw new HttpError(404, "Unbekannter Zustand");
  await env.DB.prepare("DELETE FROM state WHERE person_id = ? AND kind = ?").bind(c.personId, kind).run();
  return noContent();
}

// ---------------------------------------------------------------------------
// Feature 2: Sprach-Slot (genau einer pro Person)
// ---------------------------------------------------------------------------

/** PUT /v1/me/voice/:id  Rumpf: Audio-Umschlag (roh), Header X-LDB-Meta: Metadaten-Umschlag */
export async function putVoice(req: Request, env: Env, c: Caller, id: string) {
  requireUuid(id);
  const meta = requireEnvelopeText(req.headers.get(META_HEADER), MAX_VOICE_META_CHARS, META_HEADER);
  const audio = await readEnvelopeBody(req, MAX_VOICE_BYTES);

  // Reihenfolge: erst neue Datei hochladen, dann Datensatz umstellen, dann alte Datei löschen.
  const newKey = `voice/${c.personId}/${id}`;
  await env.MEDIA.put(newKey, audio, { httpMetadata: { contentType: "application/octet-stream" } });

  const old = await env.DB.prepare("SELECT r2_key FROM voice_slot WHERE person_id = ?")
    .bind(c.personId)
    .first<{ r2_key: string }>();
  await env.DB.prepare(
    `INSERT INTO voice_slot (person_id, id, r2_key, meta, recorded_at, listened_at)
     VALUES (?, ?, ?, ?, ?, NULL)
     ON CONFLICT(person_id) DO UPDATE SET id = excluded.id, r2_key = excluded.r2_key, meta = excluded.meta,
       recorded_at = excluded.recorded_at, listened_at = NULL`,
  )
    .bind(c.personId, id, newKey, meta, Date.now())
    .run();
  if (old && old.r2_key !== newKey) await env.MEDIA.delete(old.r2_key);
  return json({ id }, 201);
}

/** DELETE /v1/me/voice  Zurückholen durch den Absender. */
export async function deleteVoice(env: Env, c: Caller) {
  const old = await env.DB.prepare("DELETE FROM voice_slot WHERE person_id = ? RETURNING r2_key")
    .bind(c.personId)
    .first<{ r2_key: string }>();
  if (old) await env.MEDIA.delete(old.r2_key);
  return noContent();
}

/** GET /v1/partner/voice/:id  Audio-Umschlag des Partners, nur wenn :id noch die aktuelle Nachricht ist. */
export async function getPartnerVoice(env: Env, c: Caller, id: string) {
  const row = await env.DB.prepare("SELECT r2_key FROM voice_slot WHERE person_id = ? AND id = ?")
    .bind(c.partnerId, id)
    .first<{ r2_key: string }>();
  if (!row) throw new HttpError(404, "Sprachnachricht nicht (mehr) vorhanden");
  return streamObject(env, row.r2_key);
}

/** POST /v1/partner/voice/:id/listened  Gilt nur für genau diese Nachricht, nicht für eine neuere. */
export async function markVoiceListened(env: Env, c: Caller, id: string) {
  await env.DB.prepare("UPDATE voice_slot SET listened_at = ? WHERE person_id = ? AND id = ? AND listened_at IS NULL")
    .bind(Date.now(), c.partnerId, id)
    .run();
  return noContent();
}

// ---------------------------------------------------------------------------
// Feature 4: Foto-Dump
// ---------------------------------------------------------------------------

/** PUT /v1/me/photos/:id  Rumpf: Bild-Umschlag (roh), Header X-LDB-Meta: Metadaten-Umschlag */
export async function putPhoto(req: Request, env: Env, c: Caller, id: string) {
  requireUuid(id);
  const now = Date.now();
  const meta = requireEnvelopeText(req.headers.get(META_HEADER), MAX_PHOTO_META_CHARS, META_HEADER);

  const [count, existing] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM photos WHERE person_id = ? AND created_at > ?")
      .bind(c.personId, now - DAY_MS)
      .first<{ n: number }>(),
    env.DB.prepare("SELECT 1 AS x FROM photos WHERE id = ?").bind(id).first(),
  ]);
  if (existing) throw new HttpError(409, "Foto-ID schon vergeben");
  if ((count?.n ?? 0) >= MAX_PHOTOS_PER_DAY) throw new HttpError(429, "Tageslimit von 30 Fotos erreicht");

  const image = await readEnvelopeBody(req, MAX_PHOTO_BYTES);
  const key = `photos/${c.personId}/${id}`;
  await env.MEDIA.put(key, image, { httpMetadata: { contentType: "application/octet-stream" } });
  await env.DB.prepare(
    "INSERT INTO photos (id, person_id, r2_key, meta, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, c.personId, key, meta, now, now + DAY_MS)
    .run();
  return json({ id, expires_at: now + DAY_MS }, 201);
}

/** PUT /v1/me/photos/:id/thumb  Rumpf: Vorschau-Umschlag (roh). Wird nach dem Bild hochgeladen. */
export async function putPhotoThumb(req: Request, env: Env, c: Caller, id: string) {
  const row = await env.DB.prepare("SELECT r2_key FROM photos WHERE id = ? AND person_id = ? AND expires_at > ?")
    .bind(id, c.personId, Date.now())
    .first<{ r2_key: string }>();
  if (!row) throw new HttpError(404, "Foto nicht gefunden");
  const thumb = await readEnvelopeBody(req, MAX_THUMB_BYTES);
  const key = `${row.r2_key}_thumb`;
  await env.MEDIA.put(key, thumb, { httpMetadata: { contentType: "application/octet-stream" } });
  await env.DB.prepare("UPDATE photos SET thumb_r2_key = ? WHERE id = ?").bind(key, id).run();
  return noContent();
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
  return getPhoto(env, c.partnerId, id, url);
}

/** GET /v1/me/photos/:id?size=thumb  Eigenes Foto (Umschlag), z. B. für ein weiteres eigenes Gerät. */
export async function getOwnPhoto(env: Env, c: Caller, id: string, url: URL) {
  return getPhoto(env, c.personId, id, url);
}

async function getPhoto(env: Env, personId: string, id: string, url: URL) {
  const row = await env.DB.prepare(
    "SELECT r2_key, thumb_r2_key FROM photos WHERE id = ? AND person_id = ? AND expires_at > ?",
  )
    .bind(id, personId, Date.now())
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
// Feature 5: Post-its. Text, Farbe und "erledigt" stecken im Umschlag.
// ---------------------------------------------------------------------------

/** POST /v1/me/notes  { id: <UUID vom Gerät>, data: <Umschlag> } */
export async function postNote(req: Request, env: Env, c: Caller) {
  const input = await readJson<{ id?: unknown; data?: unknown }>(req);
  const id = requireUuid(typeof input.id === "string" ? input.id : "");
  const data = requireEnvelopeText(input.data, MAX_NOTE_CHARS, "data");
  const now = Date.now();
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM notes WHERE person_id = ? AND expires_at > ?")
    .bind(c.personId, now)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_NOTES) throw new HttpError(429, "Zu viele Notizen");

  const res = await env.DB.prepare(
    "INSERT INTO notes (id, person_id, data, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
  )
    .bind(id, c.personId, data, now, now, now + DAY_MS)
    .run();
  if (!res.meta.changes) throw new HttpError(409, "Notiz-ID schon vergeben");
  return json({ id, expires_at: now + DAY_MS }, 201);
}

/**
 * PUT /v1/me/notes/:id  { data: <Umschlag>, renew?: boolean }
 * renew = true: neuer Inhalt, 24 h starten neu, 👀 wird zurückgesetzt.
 * renew = false (z. B. nur "erledigt" umgeschaltet): Laufzeit und 👀 bleiben.
 */
export async function putNote(req: Request, env: Env, c: Caller, id: string) {
  const input = await readJson<{ data?: unknown; renew?: unknown }>(req);
  const data = requireEnvelopeText(input.data, MAX_NOTE_CHARS, "data");
  const now = Date.now();
  const res =
    input.renew === true
      ? await env.DB.prepare(
          "UPDATE notes SET data = ?, updated_at = ?, expires_at = ?, seen_at = NULL WHERE id = ? AND person_id = ? AND expires_at > ?",
        )
          .bind(data, now, now + DAY_MS, id, c.personId, now)
          .run()
      : await env.DB.prepare("UPDATE notes SET data = ?, updated_at = ? WHERE id = ? AND person_id = ? AND expires_at > ?")
          .bind(data, now, id, c.personId, now)
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
  await env.DB.prepare("UPDATE notes SET seen_at = COALESCE(seen_at, ?) WHERE id = ? AND person_id = ? AND expires_at > ?")
    .bind(Date.now(), id, c.partnerId, Date.now())
    .run();
  return noContent();
}

// ---------------------------------------------------------------------------

async function streamObject(env: Env, key: string): Promise<Response> {
  const obj = await env.MEDIA.get(key);
  if (!obj) throw new HttpError(404, "Datei fehlt");
  return new Response(obj.body, {
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(obj.size),
      "cache-control": "private, no-store",
    },
  });
}
