# LDB · Long Distance Boyfriends

Private iPhone-App für zwei: Uhrzeit und Wetter beim anderen, Ampel-Status, Sprach-Slot, 24-h-Foto-Dump, Post-its, Kalender, Minikarte. Nicht im App Store.

```
backend/   Cloudflare Worker (TypeScript) + D1 + R2 + Cron
app/       iPhone-App (Expo / React Native, TypeScript)
docs/      Anleitungen
```

## Sicherheit

Alle Inhalte sind **Ende-zu-Ende verschlüsselt**. Die iPhones teilen ein Geheimnis, das nie beim Server landet; Cloudflare speichert nur Chiffrate und sieht keine Namen, Texte, Fotos, Sprachnachrichten oder Standorte. Was der Server trotzdem sieht und wo die echten Schwachstellen liegen: [docs/encryption.md](docs/encryption.md).

## Backend

- Einrichtung Schritt für Schritt: [docs/cloudflare-setup.md](docs/cloudflare-setup.md)
- Anmeldung ohne Konten: jedes Gerät koppelt sich einmal per Kopplungslink und bekommt einen eigenen Geräteschlüssel. Der Server speichert nur dessen SHA-256-Hash.
- 24-h-Regel: Jede Abfrage blendet Abgelaufenes sofort aus; der stündliche Cron löscht es aus D1 und R2.
- Der Server nimmt nur Umschläge an (verschlüsselte Daten im LDB-Format) und lehnt Klartext ab.

### API (alles außer `health` und `register` braucht `Authorization: Bearer <Geräteschlüssel>`)

`<Umschlag>` = verschlüsselte Daten nach [docs/encryption.md](docs/encryption.md). IDs sind UUIDs, die das Gerät erzeugt.

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/v1/health` | Lebenszeichen |
| POST | `/v1/devices/register` | Gerät koppeln `{pairing_code, person: "a"\|"b", device_name?}` |
| GET | `/v1/me` · `/v1/partner` | Gesamtstand (Zustände, Sprach-Slot, Fotos, Notizen) als Umschläge |
| PUT / DELETE | `/v1/me/state/:kind` | `profile` · `light` · `location`, Rumpf `{data: <Umschlag>}` |
| PUT / DELETE | `/v1/me/voice/:id` · `/v1/me/voice` | Sprach-Slot belegen (Rumpf roh, Header `X-LDB-Meta`) / zurückholen |
| GET / POST | `/v1/partner/voice/:id` · `/listened` | Abspielen / als angehört markieren |
| PUT / DELETE | `/v1/me/photos/:id` · `/thumb` | Foto bzw. Vorschau hochladen (roh, Foto mit `X-LDB-Meta`, max. 30/Tag) / löschen |
| GET / POST | `/v1/partner/photos/:id` · `/seen` · `/keep` | Foto laden (`?size=thumb`) / gesehen / Herz |
| POST · PUT / DELETE | `/v1/me/notes` · `/:id` | Post-it `{id, data}` anheften · `{data, renew}` ändern / löschen |
| POST | `/v1/partner/notes/:id/seen` | 👀 |

## App

Siehe [app/README.md](app/README.md). Expo (React Native, TypeScript): Entwicklung unter Windows, Test auf dem iPhone mit Expo Go, iOS-Builds und TestFlight über EAS in der Cloud. Kein Mac nötig.
