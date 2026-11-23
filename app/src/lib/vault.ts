// Bindet crypto.ts an den Zufallsgenerator des iPhones (expo-crypto → SecRandomCopyBytes).
import * as ExpoCrypto from 'expo-crypto';
import { NONCE_LEN, aad, open, openJson, seal, sealJson, type Kind, type Person } from './crypto';
import type { Opened } from './types';

const nonce = () => ExpoCrypto.getRandomBytes(NONCE_LEN);

export const newId = (): string => ExpoCrypto.randomUUID().toLowerCase();

export function sealValue(key: Uint8Array, kind: Kind, person: Person, value: unknown, id?: string): string {
  return sealJson(key, value, aad(kind, person, id), nonce());
}

export function sealBytes(key: Uint8Array, kind: Kind, person: Person, bytes: Uint8Array, id?: string): Uint8Array {
  return seal(key, bytes, aad(kind, person, id), nonce());
}

export function openBytes(key: Uint8Array, kind: Kind, person: Person, envelope: Uint8Array, id?: string): Uint8Array {
  return open(key, envelope, aad(kind, person, id));
}

/** Öffnet einen Text-Umschlag; schlägt das fehl, wird 'locked' angezeigt statt abzustürzen. */
export function openValue<T>(key: Uint8Array, kind: Kind, person: Person, text: string | null | undefined, id?: string): Opened<T> {
  if (!text) return null;
  try {
    return openJson<T>(key, text, aad(kind, person, id));
  } catch {
    return 'locked';
  }
}
