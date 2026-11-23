# Verschlüsselung

Ziel: Wer Zugriff auf das Cloudflare-Konto bekommt (oder auf Cloudflare selbst), kann nichts lesen. Im schlimmsten Fall sind Daten weg. Wer den Datenverkehr mitschneidet, sieht nur TLS.

## Was wo geschützt ist

| Schicht | Schutz | Schützt gegen |
|---|---|---|
| Transport | HTTPS (TLS 1.3, von iOS erzwungen) | WLAN, Provider, alles zwischen iPhone und Cloudflare |
| Inhalte | Ende-zu-Ende: ChaCha20-Poly1305 auf dem iPhone, Schlüssel nur in den iPhone-Schlüsselbunden | Cloudflare, jeden mit Zugang zum Cloudflare-Konto, einen manipulierten Worker |
| Anmeldung | Geräteschlüssel (32 Byte), Server speichert nur SHA-256 | gestohlene Datenbank: damit kann man sich nicht anmelden |

## Was der Server trotzdem sieht

Ehrlich aufgelistet:

- **Metadaten:** welche Person (a/b), wann etwas hochgeladen, gesehen, angehört wurde, wie viele Fotos und Notizen es gibt.
- **Größen:** Fotos und Sprachnachrichten verraten ihre ungefähre Größe. JSON-Inhalte werden auf 64-Byte-Blöcke aufgefüllt, Text verrät also nur grob seine Länge.
- **IP-Adressen:** Cloudflare kann daraus die Stadt schätzen. Die Rundung des Standorts schützt also vor allem gegenüber Dritten, nicht gegenüber Cloudflare.
- **Gerätenamen** bei der Kopplung: die App sendet nur „iPhone“.

## Was ein Angreifer im Cloudflare-Konto kann

- Daten löschen, den Dienst abschalten.
- Alte Umschläge erneut ausliefern (z. B. einen veralteten Ampelstatus). Fälschen oder zwischen Personen bzw. Einträgen vertauschen kann er sie nicht, das verhindern Schlüssel und Zusatzdaten (AAD).
- **Nicht:** Inhalte lesen, auch nicht mit eigenem Worker-Code. Der Schlüssel war nie auf dem Server.

## Die eigentliche Schwachstelle: das App-Update

Wer die App ausliefern kann, kann eine Version bauen, die den Schlüssel abgreift. Diese Konten sind deshalb wichtiger als Cloudflare und brauchen Passkey oder Hardware-Schlüssel als zweiten Faktor:

1. Apple-ID (App Store Connect / TestFlight)
2. Expo-Konto (baut und signiert die App)
3. GitHub (Quellcode)
4. Cloudflare (wegen Löschen und Dienstausfall)

---

## Technisches Format

Die Referenz-Implementierung liegt in `backend/scripts/ldb-crypto.mjs` (Node/OpenSSL), die App-Implementierung in `app/src/lib/crypto.ts` (@noble/ciphers). Beide werden gegen [`crypto-test-vectors.json`](crypto-test-vectors.json) geprüft (`npm run test:vectors` im Backend, `npm test` in der App).

### Geheimnis und Schlüssel

- **S**: 32 Zufallsbytes, einmal erzeugt mit `npm run secret:new`. Als base64url (43 Zeichen) im Kopplungslink:
  `ldb://pair?server=<URL>&person=a|b&secret=<S>`
- Daraus per **HKDF-SHA256** (Salt `ldb/v1`, Länge 32):
  - `info = "register"` → **Kopplungscode** (base64url). Geht an den Server, liegt dort als Worker-Secret `PAIRING_CODE`.
  - `info = "content"` → **Inhaltsschlüssel K**. Verlässt das iPhone nie.
- HKDF ist eine Einwegfunktion: aus dem Kopplungscode lassen sich weder S noch K berechnen.

### Umschlag

```
0x01 | Nonce (12 Byte, zufällig) | Chiffrat | Tag (16 Byte)
```

- AEAD: ChaCha20-Poly1305 nach RFC 8439, Schlüssel K.
- Zufällige 96-Bit-Nonces sind sicher bis weit über 2³² Umschläge pro Schlüssel; zwei Personen erreichen das nie.
- Text-Inhalte (Zustände, Notizen, Metadaten): UTF-8-JSON, mit Leerzeichen auf ein Vielfaches von 64 Byte aufgefüllt, Umschlag als base64url ohne `=`.
- Dateien (Fotos, Vorschauen, Audio): Umschlag roh als `application/octet-stream`.
- Der Server lehnt alles ab, was nicht mit `0x01` beginnt oder kürzer als 29 Byte ist. So landet nie versehentlich Klartext in D1 oder R2.

### Zusatzdaten (AAD)

`ldb/v1/<art>/<person>[/<id>]`, z. B. `ldb/v1/note/b/6f9619ff-…`

| Art | id | Inhalt (JSON bzw. Datei) |
|---|---|---|
| `profile` | – | `{name, tz}` |
| `light` | – | `{manual: {state, until} \| null, plan, emoji, note}` |
| `location` | – | `{lat, lon}` (auf dem Gerät auf 0,01° gerundet) oder `{paused: true}` |
| `note` | Notiz-UUID | `{text, color, done}` |
| `photo-meta` | Foto-UUID | `{caption}` |
| `photo`, `photo-thumb` | Foto-UUID | JPEG |
| `voice-meta` | Nachrichten-UUID | `{duration_ms, waveform, tz}` |
| `voice` | Nachrichten-UUID | M4A |

Die UUIDs erzeugt das iPhone vor dem Verschlüsseln, damit sie in den Zusatzdaten stehen können.

## Schlüsselwechsel (z. B. iPhone verloren)

1. In `wrangler.jsonc` `REGISTRATION_OPEN` auf `"true"`, alle Geräte löschen:
   `npx wrangler d1 execute ldb --remote --command "DELETE FROM devices"`
2. `npm run secret:new -- --server <URL> --put`, dann `npm run deploy`.
3. Beide iPhones: in der App „Abmelden“, mit dem neuen Link koppeln.
4. `REGISTRATION_OPEN` wieder auf `"false"`, deployen.

Alte Umschläge kann niemand mehr öffnen. Fotos und Notizen sind nach 24 h ohnehin weg; Profil, Ampel und Standort schreibt die App beim nächsten Speichern neu.
