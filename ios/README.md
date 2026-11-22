# iOS-App

SwiftUI, iOS 17+. Das Xcode-Projekt wird aus `project.yml` erzeugt, damit keine schwer lesbare `.xcodeproj` im Repo liegt.

```bash
brew install xcodegen
cd ios
xcodegen generate
open LDB.xcodeproj
```

In Xcode: Target **LDB** → **Signing & Capabilities** → eigenes Team wählen. Ohne bezahlten Developer-Account läuft die App 7 Tage auf dem eigenen iPhone, danach neu installieren. Für TestFlight, Push und WeatherKit braucht es das Apple Developer Program (99 €/Jahr).

Stand: Grundgerüst, auf dem Mac noch **nicht kompiliert**.

- `Core/` API-Client, Schlüsselbund, Datenmodelle, App-Zustand
- `Views/PairingView` einmalige Kopplung (Server-Adresse + Kopplungscode)
- `Views/DisplayView` Anzeige: Uhr des Partners, Ampel, Sprach-Slot, Post-its, Foto-Zähler
- `Views/EditView` Bearbeiten: Zeitzone, Ampel manuell, eigene Post-its, Standort pausieren

Noch offen: Wochenplan-Auswertung der Ampel, Sprachaufnahme/-wiedergabe, Foto-Upload und -Anzeige, Wetter, Kalender, Minikarte, Widgets.
