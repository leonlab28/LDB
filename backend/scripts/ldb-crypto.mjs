// Referenz-Implementierung des LDB-Verschlüsselungsformats mit Node-Bordmitteln (OpenSSL).
// Die App implementiert dasselbe mit @noble/ciphers; beide prüfen sich gegen docs/crypto-test-vectors.json.
// Spezifikation: docs/encryption.md

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

const VERSION = 1;
const NONCE_LEN = 12;
const TAG_LEN = 16;
const PAD_BLOCK = 64;
const SALT = Buffer.from("ldb/v1");

export const b64u = {
  encode: (buf) => Buffer.from(buf).toString("base64url"),
  decode: (s) => new Uint8Array(Buffer.from(s, "base64url")),
};

export function newSecret() {
  return randomBytes(32);
}

/** Leitet aus dem gemeinsamen Geheimnis S die beiden Werte ab. Nur pairingCode verlässt das Gerät. */
export function deriveKeys(secret) {
  if (secret.length !== 32) throw new Error("Geheimnis muss 32 Bytes haben");
  const derive = (info) => new Uint8Array(hkdfSync("sha256", secret, SALT, Buffer.from(info), 32));
  return { pairingCode: b64u.encode(derive("register")), contentKey: derive("content") };
}

export function aad(kind, person, id) {
  return Buffer.from(`ldb/v1/${kind}/${person}${id ? "/" + id : ""}`);
}

export function seal(key, plaintext, aadBytes, nonce = randomBytes(NONCE_LEN)) {
  const cipher = createCipheriv("chacha20-poly1305", key, nonce, { authTagLength: TAG_LEN });
  cipher.setAAD(aadBytes, { plaintextLength: plaintext.length });
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return new Uint8Array(Buffer.concat([Buffer.from([VERSION]), nonce, ct, cipher.getAuthTag()]));
}

export function open(key, envelope, aadBytes) {
  const env = Buffer.from(envelope);
  if (env.length < 1 + NONCE_LEN + TAG_LEN || env[0] !== VERSION) throw new Error("Kein gültiger Umschlag");
  const nonce = env.subarray(1, 1 + NONCE_LEN);
  const tag = env.subarray(env.length - TAG_LEN);
  const ct = env.subarray(1 + NONCE_LEN, env.length - TAG_LEN);
  const decipher = createDecipheriv("chacha20-poly1305", key, nonce, { authTagLength: TAG_LEN });
  decipher.setAAD(aadBytes, { plaintextLength: ct.length });
  decipher.setAuthTag(tag);
  return new Uint8Array(Buffer.concat([decipher.update(ct), decipher.final()]));
}

/** JSON auffüllen (Leerzeichen bis zum nächsten Vielfachen von 64 Bytes), damit die Länge weniger verrät. */
export function padJson(value) {
  const raw = Buffer.from(JSON.stringify(value));
  const len = Math.ceil((raw.length + 1) / PAD_BLOCK) * PAD_BLOCK;
  return Buffer.concat([raw, Buffer.alloc(len - raw.length, 0x20)]);
}

export function sealJson(key, value, aadBytes, nonce) {
  return b64u.encode(seal(key, padJson(value), aadBytes, nonce));
}

export function openJson(key, text, aadBytes) {
  return JSON.parse(Buffer.from(open(key, b64u.decode(text), aadBytes)).toString("utf8"));
}

export function pairingLink(server, person, secret) {
  const q = new URLSearchParams({ server, person, secret: b64u.encode(secret) });
  return `ldb://pair?${q}`;
}
