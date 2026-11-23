# Cloudflare einrichten (Windows, PowerShell)

Diese Anleitung bringt das Backend aus `backend/` auf Cloudflare. Alle Befehle laufen in **PowerShell** im Ordner `LDB\backend`.

**Grundregel:** Geheimnisse (Kopplungslinks, Kopplungscode, API-Tokens) nie in Dateien im Repo, nie in normalen Chats. Sie gehören in einen Passwortmanager.

Alle Inhalte sind Ende-zu-Ende verschlüsselt: Cloudflare speichert nur Chiffrate. Details und Grenzen: [encryption.md](encryption.md).

Was am Ende läuft:

| Baustein | Name | Zweck |
|---|---|---|
| Worker | `ldb-api` | die API unter `https://ldb-api.<subdomain>.workers.dev` |
| D1 | `ldb` | Datenbank (Status, Notizen, Foto-Einträge, Geräteschlüssel-Hashes) |
| R2 | `ldb-media` | Dateien (Fotos, Sprachnachrichten) |
| Cron | `7 * * * *` | löscht stündlich Abgelaufenes aus D1 und R2 |
| Secret | `PAIRING_CODE` | aus dem gemeinsamen Geheimnis abgeleiteter Kopplungscode |

Kosten: alles im Gratis-Rahmen (Workers 100.000 Anfragen/Tag, D1 5 GB, R2 10 GB ohne Downloadkosten). R2 verlangt trotzdem einmalig eine hinterlegte Zahlungsmethode.

---

## Teil 1: Werkzeuge und Anmeldung

1. Node.js prüfen: `node -v`. Es muss **v20 oder neuer** sein. Sonst die LTS-Version von nodejs.org installieren und PowerShell neu öffnen.
2. Git prüfen: `git --version`.
3. Repo holen und Abhängigkeiten installieren:
   ```powershell
   git clone https://github.com/leonlab28/LDB.git
   cd LDB\backend
   npm install
   ```
4. Bei Cloudflare anmelden: `npx wrangler login`. Der Browser öffnet sich, mit dem Cloudflare-Konto einloggen und **Allow** klicken.
5. Prüfen: `npx wrangler whoami`. Es muss deine E-Mail und deine Account-ID zeigen.

## Teil 2: R2 freischalten, Datenbank und Speicher anlegen

1. Im Dashboard (dash.cloudflare.com) links **R2 Object Storage** öffnen. Falls noch nicht geschehen: R2 aktivieren und Zahlungsmethode hinterlegen (Gratis-Tarif bleibt kostenlos).
2. Datenbank anlegen (Standort Westeuropa):
   ```powershell
   npx wrangler d1 create ldb --location weur
   ```
   Die Ausgabe enthält `database_id`. Diese ID ist kein Geheimnis.
3. `wrangler.jsonc` öffnen und die Null-ID `00000000-0000-0000-0000-000000000000` durch deine `database_id` ersetzen.
4. Speicher anlegen:
   ```powershell
   npx wrangler r2 bucket create ldb-media --location weur
   ```
5. Prüfen: `npx wrangler d1 list` und `npx wrangler r2 bucket list` zeigen `ldb` und `ldb-media`.

## Teil 3: Tabellen, Kopplungscode, Deploy

1. Tabellen in der echten Datenbank anlegen:
   ```powershell
   npm run db:migrate:remote
   ```
   Bei der Rückfrage mit `y` bestätigen. Am Ende stehen `0001_init.sql ✅` und `0002_e2ee.sql ✅`.
   (Hattest du 0001 schon früher eingespielt, läuft jetzt nur 0002. Es verwirft alle alten Klartext-Inhalte und Testgeräte.)
2. Einmal deployen, damit die Adresse feststeht:
   ```powershell
   npm run deploy
   ```
   Falls du noch keine `workers.dev`-Subdomain hast, fragt Wrangler einmal danach. Am Ende steht die Adresse `https://ldb-api.<subdomain>.workers.dev`.
3. Gemeinsames Geheimnis erzeugen und den abgeleiteten Kopplungscode direkt als Secret hinterlegen:
   ```powershell
   npm run secret:new -- --server https://ldb-api.<subdomain>.workers.dev --put
   ```
   Ausgegeben werden zwei **Kopplungslinks** (Person a und b). Beide **sofort in den Passwortmanager**. Sie enthalten den Schlüssel, mit dem alle Inhalte verschlüsselt werden. Deinem Freund den Link für Person b nur über Signal oder einen geteilten Passwortmanager-Eintrag geben, nicht per WhatsApp, Mail oder SMS.
   Cloudflare bekommt nur den daraus abgeleiteten Kopplungscode, nie den Link.

## Teil 4: Prüfen

1. Im Browser `https://ldb-api.<subdomain>.workers.dev/v1/health` öffnen. Erwartet:
   `{"ok":true,"persons":2,"registration_open":true}`
2. Optional der volle Rauchtest (legt zwei Testgeräte an, verschlüsselt echt):
   ```powershell
   $env:BASE_URL = "https://ldb-api.<subdomain>.workers.dev"
   $env:LDB_SECRET = Read-Host "Wert hinter secret= aus dem Kopplungslink"
   npm run smoke
   Remove-Item Env:LDB_SECRET
   ```
   Danach Testgeräte entfernen:
   ```powershell
   npx wrangler d1 execute ldb --remote --command "DELETE FROM devices WHERE name LIKE 'smoke-%'"
   ```
3. Cron prüfen: Dashboard → **Workers & Pages** → `ldb-api` → **Settings → Triggers**. Dort steht `7 * * * *`.

## Teil 5: Später, wenn beide iPhones gekoppelt sind

1. In `wrangler.jsonc` `"REGISTRATION_OPEN": "true"` auf `"false"` setzen.
2. `npm run deploy`. Ab jetzt kann sich kein weiteres Gerät mehr koppeln, auch nicht mit dem Code.
3. Geht ein iPhone verloren: Gerät löschen **und** Schlüssel wechseln, denn auf dem iPhone liegt das gemeinsame Geheimnis. Ablauf: [encryption.md → Schlüsselwechsel](encryption.md#schlüsselwechsel-zb-iphone-verloren).

## Lokal entwickeln

```powershell
Copy-Item .dev.vars.example .dev.vars   # lokaler Test-Code, wird nicht eingecheckt
npm run db:migrate:local
npm run dev                              # http://localhost:8787
# zweites Fenster (Test-Geheimnis aus docs/crypto-test-vectors.json, nur lokal):
$env:LDB_SECRET = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"; npm run smoke
npm run test:vectors                     # Verschlüsselungsformat gegen die Testvektoren prüfen
npx wrangler d1 execute ldb --local --command "DELETE FROM devices"   # Testgeräte entfernen (max. 3 pro Person)
npm run typecheck
```
