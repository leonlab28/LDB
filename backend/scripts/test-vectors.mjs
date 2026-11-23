// Erzeugt (--write) oder prüft docs/crypto-test-vectors.json mit der Node-Referenz.
// Die App prüft dieselbe Datei mit ihrer eigenen Implementierung (app/src/crypto.test.ts).

import { readFileSync, writeFileSync } from "node:fs";
import { aad, b64u, deriveKeys, open, openJson, sealJson } from "./ldb-crypto.mjs";

const file = new URL("../../docs/crypto-test-vectors.json", import.meta.url);

function build() {
  const secret = Buffer.alloc(32, 0).map((_, i) => i); // 00 01 02 … 1f, nur für Tests
  const { pairingCode, contentKey } = deriveKeys(secret);
  const nonce = Buffer.from("000102030405060708090a0b", "hex");
  const cases = [
    { kind: "profile", person: "a", id: null, value: { name: "Leon", tz: "Europe/Berlin" } },
    { kind: "note", person: "b", id: "6f9619ff-8b86-4011-b42d-00c04fc964ff", value: { text: "Guten Morgen 🌅", color: "yellow", done: false } },
  ].map((c) => ({ ...c, envelope: sealJson(contentKey, c.value, aad(c.kind, c.person, c.id), nonce) }));
  return {
    comment: "Feste Nonce nur für Tests. Im Betrieb ist die Nonce immer zufällig.",
    secret: b64u.encode(secret),
    pairing_code: pairingCode,
    content_key_hex: Buffer.from(contentKey).toString("hex"),
    nonce_hex: nonce.toString("hex"),
    cases,
  };
}

if (process.argv.includes("--write")) {
  writeFileSync(file, JSON.stringify(build(), null, 2) + "\n");
  console.log("geschrieben:", file.pathname);
} else {
  const want = JSON.parse(readFileSync(file, "utf8"));
  const got = build();
  let ok = JSON.stringify(want) === JSON.stringify(got);
  const key = Buffer.from(want.content_key_hex, "hex");
  for (const c of want.cases) {
    ok &&= JSON.stringify(openJson(key, c.envelope, aad(c.kind, c.person, c.id))) === JSON.stringify(c.value);
    // Falsche Zusatzdaten (andere Person) müssen scheitern.
    try { open(key, b64u.decode(c.envelope), aad(c.kind, c.person === "a" ? "b" : "a", c.id)); ok = false; } catch {}
  }
  console.log(ok ? "Testvektoren OK" : "Testvektoren FALSCH");
  process.exit(ok ? 0 : 1);
}
