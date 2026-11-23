import * as SecureStore from 'expo-secure-store';
import { b64u } from './bytes';
import { deriveKeys, type Person } from './crypto';

/**
 * Alles, was dieses iPhone zum Arbeiten braucht. Liegt nur im Schlüsselbund, nur auf diesem Gerät
 * (wird nicht in Backups oder auf neue iPhones übertragen) und ist nach dem ersten Entsperren lesbar,
 * damit spätere Widgets darauf zugreifen können.
 */
export interface Session {
  server: string;
  person: Person;
  partner: Person;
  deviceKey: string;
  contentKey: Uint8Array;
}

interface Stored {
  v: 1;
  server: string;
  person: Person;
  deviceKey: string;
  secret: string; // gemeinsames Geheimnis S, base64url
}

const KEY = 'ldb.session';
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

function toSession(s: Stored): Session {
  return {
    server: s.server,
    person: s.person,
    partner: s.person === 'a' ? 'b' : 'a',
    deviceKey: s.deviceKey,
    contentKey: deriveKeys(b64u.decode(s.secret)).contentKey,
  };
}

export async function loadSession(): Promise<Session | null> {
  const raw = await SecureStore.getItemAsync(KEY, OPTIONS);
  if (!raw) return null;
  try {
    return toSession(JSON.parse(raw) as Stored);
  } catch {
    return null;
  }
}

export async function saveSession(s: { server: string; person: Person; deviceKey: string; secret: Uint8Array }): Promise<Session> {
  const stored: Stored = { v: 1, server: s.server, person: s.person, deviceKey: s.deviceKey, secret: b64u.encode(s.secret) };
  await SecureStore.setItemAsync(KEY, JSON.stringify(stored), OPTIONS);
  return toSession(stored);
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY, OPTIONS);
}
