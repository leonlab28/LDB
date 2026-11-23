// Erzeugt das gemeinsame Geheimnis S für beide iPhones und leitet den Kopplungscode für den Server ab.
// Aufruf:  npm run secret:new -- --server https://ldb-api.<subdomain>.workers.dev [--put]
//   --put  übergibt den Kopplungscode direkt an `wrangler secret put PAIRING_CODE` (nicht angezeigt).
// S wird nirgends gespeichert. Die beiden Kopplungslinks gehören sofort in den Passwortmanager.

import { spawnSync } from "node:child_process";
import { deriveKeys, newSecret, pairingLink } from "./ldb-crypto.mjs";

const args = process.argv.slice(2);
const serverIdx = args.indexOf("--server");
const server = serverIdx >= 0 ? args[serverIdx + 1] : undefined;
if (!server || !/^https:\/\/[^/\s]+$/.test(server)) {
  console.error("Bitte --server https://ldb-api.<subdomain>.workers.dev angeben (https, ohne Pfad).");
  process.exit(1);
}

const secret = newSecret();
const { pairingCode } = deriveKeys(secret);

console.log("\nKopplungslinks (enthalten das Geheimnis S, NUR über Passwortmanager oder Signal weitergeben):\n");
console.log("  Person a:", pairingLink(server, "a", secret));
console.log("  Person b:", pairingLink(server, "b", secret));

if (args.includes("--put")) {
  console.log("\nHinterlege abgeleiteten Kopplungscode als Worker-Secret PAIRING_CODE …");
  const res = spawnSync("npx", ["wrangler", "secret", "put", "PAIRING_CODE"], {
    input: pairingCode + "\n",
    stdio: ["pipe", "inherit", "inherit"],
    shell: process.platform === "win32",
  });
  if (res.status !== 0) {
    console.error("wrangler secret put ist fehlgeschlagen. Ohne --put erneut aufrufen und den Code von Hand setzen.");
    process.exit(1);
  }
} else {
  console.log("\nKopplungscode für den Server (npx wrangler secret put PAIRING_CODE):\n");
  console.log("  " + pairingCode);
}
console.log("\nDer Server bekommt nur den Kopplungscode. Daraus lässt sich der Inhaltsschlüssel nicht berechnen.\n");
