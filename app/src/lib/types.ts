import type { Person } from './crypto';

// --- Entschlüsselte Inhalte (so wie sie in den Umschlägen stecken, siehe docs/encryption.md) ---

export interface Profile {
  name: string;
  tz: string; // IANA-ID, z. B. "Asia/Hong_Kong"
}

export type LightState = 'free' | 'busy' | 'sleeping';

export interface Light {
  manual: { state: LightState; until: number | null } | null;
  emoji: string | null;
  note: string | null;
  plan?: unknown; // Wochenplan, Auswertung folgt
}

export type Location = { lat: number; lon: number; paused?: false } | { paused: true };

export type NoteColor = 'yellow' | 'pink' | 'blue' | 'green';

export interface NoteBody {
  text: string;
  color: NoteColor;
  done: boolean;
}

export interface PhotoMeta {
  caption: string | null;
  width?: number;
  height?: number;
}

export interface VoiceMeta {
  duration_ms: number;
  waveform: number[] | null;
  tz: string | null;
}

// --- Was der Server liefert (alles Inhaltliche sind Umschläge) ---

export interface RawSnapshot {
  server_time: number;
  viewer: 'self' | 'partner';
  person: Person;
  state: Record<'profile' | 'light' | 'location', { data: string; updated_at: number } | null>;
  voice: { id: string; meta: string; recorded_at: number; listened_at: number | null } | null;
  photos: {
    id: string;
    meta: string;
    created_at: number;
    expires_at: number;
    seen_at: number | null;
    kept_at: number | null;
    has_thumb: number;
  }[];
  notes: {
    id: string;
    data: string;
    created_at: number;
    updated_at: number;
    expires_at: number;
    seen_at: number | null;
  }[];
}

// --- Entschlüsselte Gesamtansicht für die Oberfläche ---

/** null = nicht vorhanden; 'locked' = vorhanden, aber nicht zu öffnen (anderer Schlüssel oder manipuliert). */
export type Opened<T> = T | 'locked' | null;

export interface View {
  serverTime: number;
  person: Person;
  profile: Opened<Profile>;
  light: Opened<Light>;
  location: Opened<Location>;
  locationUpdatedAt: number | null;
  voice: { id: string; meta: Opened<VoiceMeta>; recordedAt: number; listenedAt: number | null } | null;
  photos: {
    id: string;
    meta: Opened<PhotoMeta>;
    createdAt: number;
    expiresAt: number;
    seenAt: number | null;
    keptAt: number | null;
    hasThumb: boolean;
  }[];
  notes: {
    id: string;
    body: Opened<NoteBody>;
    createdAt: number;
    expiresAt: number;
    seenAt: number | null;
  }[];
}
