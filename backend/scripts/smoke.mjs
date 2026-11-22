// Rauchtest gegen einen laufenden Worker (lokal oder deployt).
// Aufruf:  BASE_URL=http://localhost:8787 PAIRING_CODE=... node scripts/smoke.mjs
// Achtung: koppelt zwei Testgeräte. Gegen den echten Server nur vor der echten Kopplung laufen lassen
// und die Testgeräte danach entfernen (siehe docs/cloudflare-setup.md).

const BASE = process.env.BASE_URL ?? "http://localhost:8787";
const CODE = process.env.PAIRING_CODE;
if (!CODE) throw new Error("PAIRING_CODE fehlt (als Umgebungsvariable setzen, nicht in Dateien schreiben)");

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "OK  " : "FAIL"} ${name}${extra ? "  " + extra : ""}`);
  if (!cond) failures++;
}

async function call(method, path, { key, body, form } = {}) {
  const headers = {};
  if (key) headers.authorization = `Bearer ${key}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data };
}

const health = await call("GET", "/v1/health");
check("health", health.status === 200 && health.data.persons === 2, JSON.stringify(health.data));

check("falscher Code abgelehnt", (await call("POST", "/v1/devices/register", { body: { pairing_code: "falsch", person: "a" } })).status === 403);
check("ohne Schlüssel abgelehnt", (await call("GET", "/v1/me")).status === 401);

const a = await call("POST", "/v1/devices/register", { body: { pairing_code: CODE, person: "a", device_name: "smoke-a" } });
const b = await call("POST", "/v1/devices/register", { body: { pairing_code: CODE, person: "b", device_name: "smoke-b" } });
check("Gerät A gekoppelt", a.status === 201, JSON.stringify(a.data));
check("Gerät B gekoppelt", b.status === 201);
const A = a.data.device_key, B = b.data.device_key;

check("Profil setzen", (await call("PUT", "/v1/me/profile", { key: B, body: { timezone: "Asia/Hong_Kong" } })).status === 204);
check("falsche Zeitzone abgelehnt", (await call("PUT", "/v1/me/profile", { key: B, body: { timezone: "Mars/Olympus" } })).status === 400);

const until = Date.now() + 3600_000;
check("Ampel manuell", (await call("PUT", "/v1/me/traffic-light", { key: B, body: { manual: { state: "busy", until }, emoji: "💻", plan: { weekday: [] } } })).status === 204);
check("Standort", (await call("PUT", "/v1/me/location", { key: B, body: { lat: 22.31962, lon: 114.16936 } })).status === 204);

const note = await call("POST", "/v1/me/notes", { key: B, body: { body: "Guten Morgen aus HK" } });
check("Notiz anlegen", note.status === 201);

const photoForm = new FormData();
photoForm.append("image", new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }), "p.jpg");
photoForm.append("caption", "Victoria Peak");
const photo = await call("POST", "/v1/me/photos", { key: B, form: photoForm });
check("Foto hochladen", photo.status === 201, JSON.stringify(photo.data));

const voiceForm = new FormData();
voiceForm.append("audio", new Blob([new Uint8Array(64)], { type: "audio/mp4" }), "v.m4a");
voiceForm.append("duration_ms", "4200");
voiceForm.append("waveform", "[0.1,0.5,0.3]");
voiceForm.append("timezone", "Asia/Hong_Kong");
check("Sprach-Slot", (await call("PUT", "/v1/me/voice", { key: B, form: voiceForm })).status === 201);

const p = await call("GET", "/v1/partner", { key: A });
check("Partner-Ansicht", p.status === 200);
check("…Zeitzone", p.data.person?.timezone === "Asia/Hong_Kong");
check("…Ampel busy", p.data.traffic_light?.manual?.state === "busy");
check("…Standort gerundet", p.data.location?.lat === 22.32 && p.data.location?.lon === 114.17, JSON.stringify(p.data.location));
check("…1 Notiz", p.data.notes?.length === 1);
check("…1 Foto", p.data.photos?.length === 1);
check("…Sprachnachricht ungehört", p.data.voice && p.data.voice.listened_at === null);

check("Foto abrufen", (await call("GET", `/v1/partner/photos/${photo.data.id}`, { key: A })).status === 200);
check("Foto gesehen", (await call("POST", `/v1/partner/photos/${photo.data.id}/seen`, { key: A })).status === 204);
check("Fremdes Foto nicht löschbar", (await call("DELETE", `/v1/me/photos/${photo.data.id}`, { key: A })).status === 404);
check("Notiz 👀", (await call("POST", `/v1/partner/notes/${note.data.id}/seen`, { key: A })).status === 204);
check("Fremde Notiz nicht änderbar", (await call("PUT", `/v1/me/notes/${note.data.id}`, { key: A, body: { body: "hack" } })).status === 404);
check("Sprachnachricht abrufen", (await call("GET", "/v1/partner/voice", { key: A })).status === 200);
check("als angehört markieren", (await call("POST", "/v1/partner/voice/listened", { key: A })).status === 204);

check("Standort pausieren", (await call("PUT", "/v1/me/location", { key: B, body: { paused: true } })).status === 204);
const p2 = await call("GET", "/v1/partner", { key: A });
check("…Partner sieht keine Koordinaten", p2.data.location?.paused === 1 && p2.data.location.lat === undefined);
check("…Foto als gesehen", p2.data.photos?.[0]?.seen_at > 0);
check("…Notiz 👀", p2.data.notes?.[0]?.seen_at > 0);
check("…angehört", p2.data.voice?.listened_at > 0);

check("Sprachnachricht zurückholen", (await call("DELETE", "/v1/me/voice", { key: B })).status === 204);
check("Foto löschen", (await call("DELETE", `/v1/me/photos/${photo.data.id}`, { key: B })).status === 204);
check("Notiz löschen", (await call("DELETE", `/v1/me/notes/${note.data.id}`, { key: B })).status === 204);

console.log(failures ? `\n${failures} Prüfung(en) fehlgeschlagen` : "\nAlles grün");
process.exit(failures ? 1 : 0);
