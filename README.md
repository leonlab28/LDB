# LDB · Long Distance Boyfriends

Private iPhone-App für zwei: Uhrzeit und Wetter beim anderen, Ampel-Status, Sprach-Slot, 24-h-Foto-Dump, Post-its, Kalender, Minikarte. Nicht im App Store.

```
backend/   Cloudflare Worker (TypeScript) + D1 + R2 + Cron
ios/       SwiftUI-App (Projekt wird mit XcodeGen erzeugt)
docs/      Anleitungen
```

## Backend

- Einrichtung Schritt für Schritt: [docs/cloudflare-setup.md](docs/cloudflare-setup.md)
- Anmeldung ohne Konten: jedes Gerät koppelt sich einmal mit einem Kopplungscode und bekommt einen eigenen Schlüssel. Der Server speichert nur dessen SHA-256-Hash.
- 24-h-Regel: Jede Abfrage blendet Abgelaufenes sofort aus; der stündliche Cron löscht es aus D1 und R2.
- Standort wird auf ~1 km gerundet gespeichert, ohne Historie. Pausieren löscht den letzten Punkt.

### API (alles außer `health` und `register` braucht `Authorization: Bearer <Geräteschlüssel>`)

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/v1/health` | Lebenszeichen |
| POST | `/v1/devices/register` | Gerät koppeln `{pairing_code, person: "a"\|"b", device_name}` |
| GET | `/v1/me` · `/v1/partner` | Gesamtstand für Bearbeiten- bzw. Anzeige-Ansicht |
| PUT | `/v1/me/profile` | Name, Zeitzone (IANA-ID) |
| PUT | `/v1/me/traffic-light` | Wochenplan, manuelle Überschreibung, Emoji, Notiz |
| PUT | `/v1/me/location` | `{lat, lon}` oder `{paused: true}` |
| PUT / DELETE | `/v1/me/voice` | Sprach-Slot belegen (multipart) / zurückholen |
| GET / POST | `/v1/partner/voice` · `/listened` | Abspielen / als angehört markieren |
| POST / DELETE | `/v1/me/photos` · `/:id` | Foto hochladen (multipart, max. 30/Tag) / löschen |
| GET / POST | `/v1/partner/photos/:id` · `/seen` · `/keep` | Foto laden (`?size=thumb`) / gesehen / Herz |
| POST / PUT / DELETE | `/v1/me/notes` · `/:id` | Post-it anheften / ersetzen oder abhaken / löschen |
| POST | `/v1/partner/notes/:id/seen` | 👀 |

## iOS

Siehe [ios/README.md](ios/README.md). Braucht einen Mac mit Xcode.
