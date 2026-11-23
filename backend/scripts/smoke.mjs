// Rauchtest gegen einen laufenden Worker (lokal oder deployt), mit echter Ende-zu-Ende-Verschlüsselung.
// Aufruf:  BASE_URL=http://localhost:8787 LDB_SECRET=<S als base64url> node scripts/smoke.mjs
// Lokal passt der Test-Schlüssel aus docs/crypto-test-vectors.json zu .dev.vars.example.
// Achtung: koppelt zwei Testgeräte und überschreibt Profil, Ampel und Standort. Gegen den echten Server
// nur vor der echten Kopplung laufen lassen und die Testgeräte danach entfernen (docs/cloudflare-setup.md).

import { randomUUID } from "node:crypto";
import { aad, b64u, deriveKeys, open, openJson, seal, sealJson } from "./ldb-crypto.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:8787";
const SECRET = process.env.LDB_SECRET;
if (!SECRET) throw new Error("LDB_SECRET fehlt (als Umgebungsvariable setzen, nicht in Dateien schreiben)");
const { pairingCode, contentKey: K } = deriveKeys(b64u.decode(SECRET));

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${name}${extra ? "  " + extra : ""}`);
  if (!cond) failures++;
}

async function call(method, path, { key, body, raw, headers: extra = {} } = {}) {
  const headers = { ...extra };
  if (key) headers.authorization = `Bearer ${key}`;
  let payload;
  if (raw) {
    headers["content-type"] = "application/octet-stream";
    payload = raw;
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  const buf = new Uint8Array(await res.arrayBuffer());
  let data = buf;
  if ((res.headers.get("content-type") ?? "").includes("json")) data = JSON.parse(Buffer.from(buf).toString("utf8"));
  return { status: res.status, data };
}

const health = await call("GET", "/v1/health");
check("health", health.status === 200 && health.data.persons === 2, JSON.stringify(health.data));

check("falscher Code abgelehnt", (await call("POST", "/v1/devices/register", { body: { pairing_code: "falsch", person: "a" } })).status === 403);
check("ohne Schlüssel abgelehnt", (await call("GET", "/v1/me")).status === 401);

const a = await call("POST", "/v1/devices/register", { body: { pairing_code: pairingCode, person: "a", device_name: "smoke-a" } });
const b = await call("POST", "/v1/devices/register", { body: { pairing_code: pairingCode, person: "b", device_name: "smoke-b" } });
check("Gerät A gekoppelt", a.status === 201, JSON.stringify(a.data?.error ?? ""));
check("Gerät B gekoppelt", b.status === 201);
const A = a.data.device_key, B = b.data.device_key;

// --- Einzelzustände ---------------------------------------------------------
const profile = { name: "Smoke B", tz: "Asia/Hong_Kong" };
check("Profil (verschlüsselt)", (await call("PUT", "/v1/me/state/profile", { key: B, body: { data: sealJson(K, profile, aad("profile", "b")) } })).status === 204);
check("Klartext abgelehnt", (await call("PUT", "/v1/me/state/profile", { key: B, body: { data: JSON.stringify(profile) } })).status === 400);
check("unbekannter Zustand abgelehnt", (await call("PUT", "/v1/me/state/secret", { key: B, body: { data: sealJson(K, {}, aad("x", "b")) } })).status === 404);

const light = { manual: { state: "busy", until: Date.now() + 3600_000 }, emoji: "💻", plan: { weekday: [] } };
check("Ampel", (await call("PUT", "/v1/me/state/light", { key: B, body: { data: sealJson(K, light, aad("light", "b")) } })).status === 204);
check("Standort", (await call("PUT", "/v1/me/state/location", { key: B, body: { data: sealJson(K, { lat: 22.32, lon: 114.17 }, aad("location", "b")) } })).status === 204);

// --- Post-it ----------------------------------------------------------------
const noteId = randomUUID();
const note = { text: "Guten Morgen aus HK", color: "yellow", done: false };
check("Notiz anlegen", (await call("POST", "/v1/me/notes", { key: B, body: { id: noteId, data: sealJson(K, note, aad("note", "b", noteId)) } })).status === 201);
check("Notiz-ID doppelt abgelehnt", (await call("POST", "/v1/me/notes", { key: B, body: { id: noteId, data: sealJson(K, note, aad("note", "b", noteId)) } })).status === 409);

// --- Foto -------------------------------------------------------------------
const photoId = randomUUID();
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const photoMeta = sealJson(K, { caption: "Victoria Peak" }, aad("photo-meta", "b", photoId));
check("Klartext-Foto abgelehnt", (await call("PUT", `/v1/me/photos/${photoId}`, { key: B, raw: jpeg, headers: { "x-ldb-meta": photoMeta } })).status === 400);
const photo = await call("PUT", `/v1/me/photos/${photoId}`, { key: B, raw: seal(K, jpeg, aad("photo", "b", photoId)), headers: { "x-ldb-meta": photoMeta } });
check("Foto hochladen", photo.status === 201, JSON.stringify(photo.data?.error ?? ""));
check("Vorschau hochladen", (await call("PUT", `/v1/me/photos/${photoId}/thumb`, { key: B, raw: seal(K, jpeg, aad("photo-thumb", "b", photoId)) })).status === 204);

// --- Sprach-Slot ------------------------------------------------------------
const voiceId = randomUUID();
const audio = new Uint8Array(64).fill(7);
const voiceMeta = sealJson(K, { duration_ms: 4200, waveform: [0.1, 0.5, 0.3], tz: "Asia/Hong_Kong" }, aad("voice-meta", "b", voiceId));
check("Sprach-Slot", (await call("PUT", `/v1/me/voice/${voiceId}`, { key: B, raw: seal(K, audio, aad("voice", "b", voiceId)), headers: { "x-ldb-meta": voiceMeta } })).status === 201);

// --- Partner-Ansicht und Entschlüsselung auf Gerät A ------------------------
const p = await call("GET", "/v1/partner", { key: A });
check("Partner-Ansicht", p.status === 200);
check("…Server sieht keinen Namen", !JSON.stringify(p.data).includes("Smoke B") && !JSON.stringify(p.data).includes("Hong_Kong"));
check("…Profil entschlüsselt", openJson(K, p.data.state.profile.data, aad("profile", "b")).tz === "Asia/Hong_Kong");
check("…Ampel busy", openJson(K, p.data.state.light.data, aad("light", "b")).manual.state === "busy");
check("…Standort", openJson(K, p.data.state.location.data, aad("location", "b")).lat === 22.32);
check("…Notiz", p.data.notes.length === 1 && openJson(K, p.data.notes[0].data, aad("note", "b", noteId)).text === note.text);
check("…Foto mit Vorschau", p.data.photos.length === 1 && p.data.photos[0].has_thumb === 1);
check("…Bildunterschrift", openJson(K, p.data.photos[0].meta, aad("photo-meta", "b", photoId)).caption === "Victoria Peak");
check("…Sprachnachricht ungehört", p.data.voice?.id === voiceId && p.data.voice.listened_at === null);
let swapped = false;
try { openJson(K, p.data.state.profile.data, aad("profile", "a")); swapped = true; } catch {}
check("…vertauschte Person fällt auf", !swapped);

const img = await call("GET", `/v1/partner/photos/${photoId}`, { key: A });
check("Foto abrufen und entschlüsseln", img.status === 200 && Buffer.from(open(K, img.data, aad("photo", "b", photoId))).equals(Buffer.from(jpeg)));
const th = await call("GET", `/v1/partner/photos/${photoId}?size=thumb`, { key: A });
check("Vorschau entschlüsseln", th.status === 200 && open(K, th.data, aad("photo-thumb", "b", photoId)).length === 4);
check("Foto gesehen", (await call("POST", `/v1/partner/photos/${photoId}/seen`, { key: A })).status === 204);
check("Fremdes Foto nicht löschbar", (await call("DELETE", `/v1/me/photos/${photoId}`, { key: A })).status === 404);
check("Notiz 👀", (await call("POST", `/v1/partner/notes/${noteId}/seen`, { key: A })).status === 204);
check("Fremde Notiz nicht änderbar", (await call("PUT", `/v1/me/notes/${noteId}`, { key: A, body: { data: sealJson(K, {}, aad("note", "a", noteId)) } })).status === 404);
const v = await call("GET", `/v1/partner/voice/${voiceId}`, { key: A });
check("Sprachnachricht entschlüsseln", v.status === 200 && open(K, v.data, aad("voice", "b", voiceId)).length === 64);
check("…veraltete ID → 404", (await call("GET", `/v1/partner/voice/${randomUUID()}`, { key: A })).status === 404);
check("als angehört markieren", (await call("POST", `/v1/partner/voice/${voiceId}/listened`, { key: A })).status === 204);

// "erledigt" ohne Erneuerung: 👀 bleibt
check("Notiz erledigt", (await call("PUT", `/v1/me/notes/${noteId}`, { key: B, body: { data: sealJson(K, { ...note, done: true }, aad("note", "b", noteId)), renew: false } })).status === 204);
check("Standort pausieren", (await call("PUT", "/v1/me/state/location", { key: B, body: { data: sealJson(K, { paused: true }, aad("location", "b")) } })).status === 204);

const p2 = await call("GET", "/v1/partner", { key: A });
check("…pausiert", openJson(K, p2.data.state.location.data, aad("location", "b")).paused === true);
check("…Foto als gesehen", p2.data.photos?.[0]?.seen_at > 0);
check("…Notiz 👀 bleibt", p2.data.notes?.[0]?.seen_at > 0);
check("…Notiz erledigt", openJson(K, p2.data.notes[0].data, aad("note", "b", noteId)).done === true);
check("…angehört", p2.data.voice?.listened_at > 0);

check("Sprachnachricht zurückholen", (await call("DELETE", "/v1/me/voice", { key: B })).status === 204);
check("Foto löschen", (await call("DELETE", `/v1/me/photos/${photoId}`, { key: B })).status === 204);
check("Notiz löschen", (await call("DELETE", `/v1/me/notes/${noteId}`, { key: B })).status === 204);
for (const kind of ["profile", "light", "location"]) await call("DELETE", `/v1/me/state/${kind}`, { key: B });

console.log(failures ? `\n${failures} Prüfung(en) fehlgeschlagen` : "\nAlles grün");
process.exit(failures ? 1 : 0);
