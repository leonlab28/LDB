// LDB-Verschlüsselungsformat, Spezifikation: docs/encryption.md
// Gleiches Verhalten wie backend/scripts/ldb-crypto.mjs; beide prüfen gegen docs/crypto-test-vectors.json.
// Diese Datei hat bewusst keine Abhängigkeit zu nativen Modulen, damit sie auch unter Node testbar ist.
// Zufall (Nonce, IDs) liefert der Aufrufer, siehe vault.ts.

import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { b64u, concat, utf8Decode, utf8Encode } from './bytes';

export const VERSION = 1;
export const NONCE_LEN = 12;
const TAG_LEN = 16;
const PAD_BLOCK = 64;
const SALT = utf8Encode('ldb/v1');

export type Person = 'a' | 'b';

export type Kind =
  | 'profile'
  | 'light'
  | 'location'
  | 'note'
  | 'photo-meta'
  | 'photo'
  | 'photo-thumb'
  | 'voice-meta'
  | 'voice';

/** Aus dem gemeinsamen Geheimnis S: Kopplungscode (geht an den Server) und Inhaltsschlüssel (bleibt hier). */
export function deriveKeys(secret: Uint8Array): { pairingCode: string; contentKey: Uint8Array } {
  if (secret.length !== 32) throw new Error('Geheimnis muss 32 Bytes haben');
  const derive = (info: string) => hkdf(sha256, secret, SALT, utf8Encode(info), 32);
  return { pairingCode: b64u.encode(derive('register')), contentKey: derive('content') };
}

export function aad(kind: Kind, person: Person, id?: string | null): Uint8Array {
  return utf8Encode(`ldb/v1/${kind}/${person}${id ? '/' + id : ''}`);
}

export function seal(key: Uint8Array, plaintext: Uint8Array, aadBytes: Uint8Array, nonce: Uint8Array): Uint8Array {
  if (nonce.length !== NONCE_LEN) throw new Error('Nonce muss 12 Bytes haben');
  const ct = chacha20poly1305(key, nonce, aadBytes).encrypt(plaintext);
  return concat(Uint8Array.of(VERSION), nonce, ct);
}

/** Wirft, wenn der Umschlag manipuliert, mit anderem Schlüssel oder für andere Zusatzdaten erstellt wurde. */
export function open(key: Uint8Array, envelope: Uint8Array, aadBytes: Uint8Array): Uint8Array {
  if (envelope.length < 1 + NONCE_LEN + TAG_LEN || envelope[0] !== VERSION) throw new Error('Kein gültiger Umschlag');
  const nonce = envelope.subarray(1, 1 + NONCE_LEN);
  return chacha20poly1305(key, nonce, aadBytes).decrypt(envelope.subarray(1 + NONCE_LEN));
}

/** JSON mit Leerzeichen auf ein Vielfaches von 64 Bytes auffüllen, damit die Länge weniger verrät. */
export function padJson(value: unknown): Uint8Array {
  const raw = utf8Encode(JSON.stringify(value));
  const out = new Uint8Array(Math.ceil((raw.length + 1) / PAD_BLOCK) * PAD_BLOCK).fill(0x20);
  out.set(raw);
  return out;
}

export function sealJson(key: Uint8Array, value: unknown, aadBytes: Uint8Array, nonce: Uint8Array): string {
  return b64u.encode(seal(key, padJson(value), aadBytes, nonce));
}

export function openJson<T>(key: Uint8Array, text: string, aadBytes: Uint8Array): T {
  return JSON.parse(utf8Decode(open(key, b64u.decode(text), aadBytes))) as T;
}

export interface PairingLink {
  server: string;
  person: Person;
  secret: Uint8Array;
}

/** ldb://pair?server=https%3A%2F%2F…&person=a|b&secret=<43 Zeichen base64url> */
export function parsePairingLink(text: string): PairingLink {
  const trimmed = text.trim();
  const m = /^ldb:\/\/pair\?(.+)$/.exec(trimmed);
  if (!m) throw new Error('Das ist kein LDB-Kopplungslink.');
  const params: Record<string, string> = {};
  for (const part of m[1].split('&')) {
    const [k, v = ''] = part.split('=');
    params[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  const server = (params.server ?? '').replace(/\/+$/, '');
  if (!/^https:\/\/[^/\s]+$/.test(server) && !/^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(server)) {
    throw new Error('Server-Adresse im Link ist ungültig (https nötig).');
  }
  if (params.person !== 'a' && params.person !== 'b') throw new Error('Person im Link fehlt.');
  let secret: Uint8Array;
  try {
    secret = b64u.decode(params.secret ?? '');
  } catch {
    throw new Error('Geheimnis im Link ist beschädigt.');
  }
  if (secret.length !== 32) throw new Error('Geheimnis im Link ist beschädigt.');
  return { server, person: params.person, secret };
}
