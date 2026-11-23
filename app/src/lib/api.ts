import { fetch } from 'expo/fetch';
import { deriveKeys, type PairingLink } from './crypto';
import type { Session } from './session';
import type { Light, Location, NoteBody, PhotoMeta, Profile, RawSnapshot, View, VoiceMeta } from './types';
import { newId, openBytes, openValue, sealBytes, sealValue } from './vault';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const TIMEOUT_MS = 30_000;

async function request(
  base: string,
  method: string,
  path: string,
  opts: { deviceKey?: string; json?: unknown; raw?: Uint8Array; meta?: string } = {},
) {
  const headers: Record<string, string> = {};
  if (opts.deviceKey) headers.authorization = `Bearer ${opts.deviceKey}`;
  let body: string | Uint8Array<ArrayBuffer> | undefined;
  if (opts.raw) {
    headers['content-type'] = 'application/octet-stream';
    body = new Uint8Array(opts.raw); // eigene ArrayBuffer-Kopie, wie fetch sie erwartet
  } else if (opts.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.json);
  }
  if (opts.meta) headers['x-ldb-meta'] = opts.meta;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(base + path, { method, headers, body, signal: ctrl.signal });
    if (!res.ok) {
      let msg = `Fehler ${res.status}`;
      try {
        msg = ((await res.json()) as { error?: string }).error ?? msg;
      } catch {}
      throw new ApiError(res.status, msg);
    }
    return res;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, 'Server nicht erreichbar. Internetverbindung prüfen.');
  } finally {
    clearTimeout(timer);
  }
}

/** Koppelt dieses Gerät. Der Server bekommt nur den abgeleiteten Kopplungscode, nie das Geheimnis. */
export async function registerDevice(link: PairingLink): Promise<string> {
  const { pairingCode } = deriveKeys(link.secret);
  const res = await request(link.server, 'POST', '/v1/devices/register', {
    json: { pairing_code: pairingCode, person: link.person, device_name: 'iPhone' },
  });
  return ((await res.json()) as { device_key: string }).device_key;
}

export class Api {
  private s: Session;
  constructor(session: Session) {
    this.s = session;
  }

  private call(method: string, path: string, opts: { json?: unknown; raw?: Uint8Array; meta?: string } = {}) {
    return request(this.s.server, method, path, { ...opts, deviceKey: this.s.deviceKey });
  }

  private get key() {
    return this.s.contentKey;
  }

  // --- Gesamtansicht ---------------------------------------------------------

  async view(who: 'me' | 'partner'): Promise<View> {
    const raw = (await (await this.call('GET', who === 'me' ? '/v1/me' : '/v1/partner')).json()) as RawSnapshot;
    const p = raw.person;
    const k = this.key;
    return {
      serverTime: raw.server_time,
      person: p,
      profile: openValue<Profile>(k, 'profile', p, raw.state.profile?.data),
      light: openValue<Light>(k, 'light', p, raw.state.light?.data),
      location: openValue<Location>(k, 'location', p, raw.state.location?.data),
      locationUpdatedAt: raw.state.location?.updated_at ?? null,
      voice: raw.voice
        ? {
            id: raw.voice.id,
            meta: openValue<VoiceMeta>(k, 'voice-meta', p, raw.voice.meta, raw.voice.id),
            recordedAt: raw.voice.recorded_at,
            listenedAt: raw.voice.listened_at,
          }
        : null,
      photos: raw.photos.map((ph) => ({
        id: ph.id,
        meta: openValue<PhotoMeta>(k, 'photo-meta', p, ph.meta, ph.id),
        createdAt: ph.created_at,
        expiresAt: ph.expires_at,
        seenAt: ph.seen_at,
        keptAt: ph.kept_at,
        hasThumb: !!ph.has_thumb,
      })),
      notes: raw.notes.map((n) => ({
        id: n.id,
        body: openValue<NoteBody>(k, 'note', p, n.data, n.id),
        createdAt: n.created_at,
        expiresAt: n.expires_at,
        seenAt: n.seen_at,
      })),
    };
  }

  // --- Einzelzustände -------------------------------------------------------

  async putProfile(v: Profile) {
    await this.call('PUT', '/v1/me/state/profile', { json: { data: sealValue(this.key, 'profile', this.s.person, v) } });
  }

  async putLight(v: Light) {
    await this.call('PUT', '/v1/me/state/light', { json: { data: sealValue(this.key, 'light', this.s.person, v) } });
  }

  async putLocation(v: Location) {
    await this.call('PUT', '/v1/me/state/location', { json: { data: sealValue(this.key, 'location', this.s.person, v) } });
  }

  // --- Post-its --------------------------------------------------------------

  async addNote(body: NoteBody) {
    const id = newId();
    await this.call('POST', '/v1/me/notes', { json: { id, data: sealValue(this.key, 'note', this.s.person, body, id) } });
    return id;
  }

  /** renew = true: neuer Inhalt, 24 h und 👀 beginnen neu. false: nur z. B. "erledigt" umgeschaltet. */
  async updateNote(id: string, body: NoteBody, renew: boolean) {
    await this.call('PUT', `/v1/me/notes/${id}`, { json: { data: sealValue(this.key, 'note', this.s.person, body, id), renew } });
  }

  async deleteNote(id: string) {
    await this.call('DELETE', `/v1/me/notes/${id}`);
  }

  async markNoteSeen(id: string) {
    await this.call('POST', `/v1/partner/notes/${id}/seen`);
  }

  // --- Fotos -----------------------------------------------------------------

  async uploadPhoto(jpeg: Uint8Array, thumb: Uint8Array | null, meta: PhotoMeta) {
    const id = newId();
    const me = this.s.person;
    await this.call('PUT', `/v1/me/photos/${id}`, {
      raw: sealBytes(this.key, 'photo', me, jpeg, id),
      meta: sealValue(this.key, 'photo-meta', me, meta, id),
    });
    if (thumb) await this.call('PUT', `/v1/me/photos/${id}/thumb`, { raw: sealBytes(this.key, 'photo-thumb', me, thumb, id) });
    return id;
  }

  async deletePhoto(id: string) {
    await this.call('DELETE', `/v1/me/photos/${id}`);
  }

  /** Lädt und entschlüsselt ein Foto des Partners. Wirft, wenn der Umschlag nicht passt. */
  async partnerPhoto(id: string, size: 'full' | 'thumb'): Promise<Uint8Array> {
    const res = await this.call('GET', `/v1/partner/photos/${id}${size === 'thumb' ? '?size=thumb' : ''}`);
    const env = await res.bytes();
    try {
      return openBytes(this.key, size === 'thumb' ? 'photo-thumb' : 'photo', this.s.partner, env, id);
    } catch {
      // Ohne Vorschau liefert der Server das volle Bild aus.
      return openBytes(this.key, 'photo', this.s.partner, env, id);
    }
  }

  async markPhoto(id: string, what: 'seen' | 'keep') {
    await this.call('POST', `/v1/partner/photos/${id}/${what}`);
  }

  // --- Sprach-Slot (Oberfläche folgt) -------------------------------------------

  async uploadVoice(audio: Uint8Array, meta: VoiceMeta) {
    const id = newId();
    const me = this.s.person;
    await this.call('PUT', `/v1/me/voice/${id}`, {
      raw: sealBytes(this.key, 'voice', me, audio, id),
      meta: sealValue(this.key, 'voice-meta', me, meta, id),
    });
    return id;
  }

  async deleteVoice() {
    await this.call('DELETE', '/v1/me/voice');
  }

  async partnerVoice(id: string): Promise<Uint8Array> {
    const env = await (await this.call('GET', `/v1/partner/voice/${id}`)).bytes();
    return openBytes(this.key, 'voice', this.s.partner, env, id);
  }

  async markVoiceListened(id: string) {
    await this.call('POST', `/v1/partner/voice/${id}/listened`);
  }
}
