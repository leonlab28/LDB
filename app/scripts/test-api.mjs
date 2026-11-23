// Ende-zu-Ende-Test der App-Schicht (src/lib/api.ts) gegen einen laufenden Worker, ohne iPhone.
// Native Module werden durch Node-Gegenstücke ersetzt: expo/fetch → fetch, expo-crypto → node:crypto.
// Aufruf (Backend lokal mit .dev.vars aus .dev.vars.example):  BASE_URL=http://localhost:8787 npm run test:api

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

const mocks = {
  'expo/fetch': 'export const fetch = (...a) => globalThis.fetch(...a);',
  'expo-crypto': `import { randomBytes, randomUUID as r } from 'node:crypto';
    export const getRandomBytes = (n) => new Uint8Array(randomBytes(n));
    export const randomUUID = () => r();`,
};
register('data:text/javascript,' + encodeURIComponent(`
  const mocks = ${JSON.stringify(mocks)};
  export async function resolve(spec, ctx, next) {
    if (mocks[spec]) return { url: 'data:text/javascript,' + encodeURIComponent(mocks[spec]), shortCircuit: true };
    try { return await next(spec, ctx); }
    catch (e) { if (spec.startsWith('.') && !/\\.[cm]?[jt]s$/.test(spec)) return next(spec + '.ts', ctx); throw e; }
  }`));

const { Api, registerDevice } = await import('../src/lib/api.ts');
const { deriveKeys, parsePairingLink } = await import('../src/lib/crypto.ts');

const BASE = process.env.BASE_URL ?? 'http://localhost:8787';
const vectors = JSON.parse(readFileSync(new URL('../../docs/crypto-test-vectors.json', import.meta.url), 'utf8'));
const secret = process.env.LDB_SECRET ?? vectors.secret; // lokal: Test-Geheimnis passend zu .dev.vars.example

async function device(person) {
  const link = parsePairingLink(`ldb://pair?server=${encodeURIComponent(BASE)}&person=${person}&secret=${secret}`);
  const deviceKey = await registerDevice(link);
  return new Api({ server: BASE, person, partner: person === 'a' ? 'b' : 'a', deviceKey, contentKey: deriveKeys(link.secret).contentKey });
}

const A = await device('a');
const B = await device('b');

await B.putProfile({ name: 'Test B', tz: 'Asia/Hong_Kong' });
await B.putLight({ manual: { state: 'sleeping', until: null }, emoji: '😴', note: 'Gute Nacht' });
await B.putLocation({ lat: 22.32, lon: 114.17 });
const noteId = await B.addNote({ text: 'Hallo 👋', color: 'pink', done: false });
const jpeg = new Uint8Array(5000).map((_, i) => i % 251);
const photoId = await B.uploadPhoto(jpeg, jpeg.slice(0, 100), { caption: 'Hafen' });
const voiceId = await B.uploadVoice(new Uint8Array(300).fill(3), { duration_ms: 3000, waveform: [0.2, 0.9], tz: 'Asia/Hong_Kong' });

const v = await A.view('partner');
assert.deepEqual(v.profile, { name: 'Test B', tz: 'Asia/Hong_Kong' });
assert.equal(v.light.manual.state, 'sleeping');
assert.equal(v.location.lat, 22.32);
assert.equal(v.notes.find((n) => n.id === noteId).body.text, 'Hallo 👋');
const ph = v.photos.find((p) => p.id === photoId);
assert.equal(ph.meta.caption, 'Hafen');
assert.ok(ph.hasThumb);
assert.deepEqual(await A.partnerPhoto(photoId, 'full'), jpeg);
assert.deepEqual(await A.partnerPhoto(photoId, 'thumb'), jpeg.slice(0, 100));
assert.equal(v.voice.id, voiceId);
assert.equal(v.voice.meta.duration_ms, 3000);
assert.equal((await A.partnerVoice(voiceId)).length, 300);

await A.markNoteSeen(noteId);
await A.markPhoto(photoId, 'keep');
await B.updateNote(noteId, { text: 'Hallo 👋', color: 'pink', done: true }, false);
const mine = await B.view('me');
assert.ok(mine.notes.find((n) => n.id === noteId).seenAt, '👀 bleibt bei renew=false');
assert.equal(mine.notes.find((n) => n.id === noteId).body.done, true);
assert.ok(mine.photos.find((p) => p.id === photoId).keptAt);

// Ein Gerät mit anderem Geheimnis sieht nur 'locked', stürzt aber nicht ab.
const wrong = new Api({ server: BASE, person: 'a', partner: 'b', deviceKey: A['s'].deviceKey, contentKey: new Uint8Array(32) });
const w = await wrong.view('partner');
assert.equal(w.profile, 'locked');
assert.equal(w.notes.find((n) => n.id === noteId).body, 'locked');

await B.deleteNote(noteId);
await B.deletePhoto(photoId);
await B.deleteVoice();
console.log('api.ts gegen Worker: OK');
