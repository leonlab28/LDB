// Prüft app/src/lib/crypto.ts gegen docs/crypto-test-vectors.json (gleiche Datei wie das Backend).
// Läuft mit Node ≥ 22.18 (TypeScript wird beim Laden entfernt):  npm test

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

// Erlaubt Imports ohne Dateiendung wie in Metro ('./bytes' → './bytes.ts').
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    try { return await next(spec, ctx); }
    catch (e) { if (spec.startsWith('.') && !/\\.[cm]?[jt]s$/.test(spec)) return next(spec + '.ts', ctx); throw e; }
  }`));

const c = await import('../src/lib/crypto.ts');
const { b64u } = await import('../src/lib/bytes.ts');
const v = JSON.parse(readFileSync(new URL('../../docs/crypto-test-vectors.json', import.meta.url), 'utf8'));

const hex = (s) => Uint8Array.from(s.match(/../g).map((h) => parseInt(h, 16)));
const toHex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

const { pairingCode, contentKey } = c.deriveKeys(b64u.decode(v.secret));
assert.equal(pairingCode, v.pairing_code, 'Kopplungscode');
assert.equal(toHex(contentKey), v.content_key_hex, 'Inhaltsschlüssel');

for (const t of v.cases) {
  const a = c.aad(t.kind, t.person, t.id);
  assert.equal(c.sealJson(contentKey, t.value, a, hex(v.nonce_hex)), t.envelope, `Umschlag ${t.kind}`);
  assert.deepEqual(c.openJson(contentKey, t.envelope, a), t.value, `Öffnen ${t.kind}`);
  assert.throws(() => c.openJson(contentKey, t.envelope, c.aad(t.kind, t.person === 'a' ? 'b' : 'a', t.id)), 'falsche Person');
  const tampered = b64u.decode(t.envelope); tampered[20] ^= 1;
  assert.throws(() => c.open(contentKey, tampered, a), 'manipuliert');
}

const link = `ldb://pair?server=${encodeURIComponent('https://ldb-api.example.workers.dev')}&person=b&secret=${v.secret}`;
const parsed = c.parsePairingLink(link);
assert.equal(parsed.person, 'b');
assert.equal(parsed.server, 'https://ldb-api.example.workers.dev');
assert.throws(() => c.parsePairingLink('ldb://pair?server=http%3A%2F%2Fevil.com&person=a&secret=' + v.secret));
assert.throws(() => c.parsePairingLink('https://example.com'));

console.log('crypto.ts: Testvektoren OK');
