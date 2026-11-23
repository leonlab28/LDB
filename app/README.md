# iPhone-App

Expo SDK 58 (React Native, TypeScript). Entwicklung unter Windows, Test auf dem iPhone mit **Expo Go**, Builds und TestFlight über **EAS** in der Cloud. Ein Mac wird nicht gebraucht.

```
src/lib/crypto.ts    Verschlüsselungsformat (docs/encryption.md), ohne native Abhängigkeiten
src/lib/vault.ts     verbindet crypto.ts mit dem Zufallsgenerator des iPhones
src/lib/session.ts   Geräteschlüssel + gemeinsames Geheimnis im Schlüsselbund
src/lib/api.ts       API-Client: verschlüsselt vor dem Senden, entschlüsselt nach dem Laden
src/screens/         Koppeln · Drüben (Anzeige des Partners) · Ich (eigenen Stand bearbeiten)
```

## Entwickeln (Windows, PowerShell)

1. Einmalig: **Expo Go** aus dem App Store aufs iPhone laden.
2. ```powershell
   cd LDB\app
   npm install
   npm start
   ```
3. Den QR-Code im Terminal mit der iPhone-Kamera scannen. Laptop und iPhone müssen im selben WLAN sein, sonst `npm run start:tunnel`.
4. In der App den Kopplungslink aus dem Passwortmanager einfügen (siehe [docs/cloudflare-setup.md](../docs/cloudflare-setup.md), Teil 3). Änderungen am Code erscheinen sofort auf dem iPhone.

Prüfen vor jedem Commit:

```powershell
npm run typecheck
npm test                 # Verschlüsselung gegen docs/crypto-test-vectors.json
npm run test:api         # App-Schicht gegen das lokale Backend (vorher im Backend: npm run dev)
```

Jeder Testlauf koppelt Testgeräte, nach drei Läufen greift das Limit von 3 Geräten pro Person. Lokal zurücksetzen (im Ordner `backend`):

```powershell
npx wrangler d1 execute ldb --local --command "DELETE FROM devices"
```

## Auf beide iPhones bringen (TestFlight)

Voraussetzung: **Apple Developer Program** (99 €/Jahr). Ohne geht es nicht an ein iPhone, das nicht neben dir liegt.

1. Expo-Konto anlegen (expo.dev) und **Passkey oder Authenticator-App als zweiten Faktor** einschalten. Wer dieses Konto übernimmt, kann eine App bauen, die den Schlüssel abgreift (siehe [docs/encryption.md](../docs/encryption.md)).
2. Optional die Bundle-ID in `app.json` ändern (`com.leonlab28.ldb`). Später geht das nicht mehr ohne neue App.
3. ```powershell
   npx eas-cli@latest login
   npx eas-cli@latest init        # verknüpft das Projekt mit deinem Expo-Konto
   npm run build:ios              # baut in der Cloud, fragt einmal nach Apple-ID-Anmeldung und legt Zertifikate an
   npm run submit:ios             # lädt den Build zu App Store Connect hoch
   ```
4. In App Store Connect → **Benutzer und Zugriff**: deinen Freund als Benutzer einladen (z. B. Rolle „Kundensupport“, nicht „Admin“).
5. App Store Connect → deine App → **TestFlight** → interne Gruppe anlegen, euch beide hinzufügen. Interne Tests brauchen keine Prüfung durch Apple.
6. Beim ersten Build fragt App Store Connect nach **Exportbestimmungen (Verschlüsselung)**. Die App nutzt Standardverfahren (ChaCha20-Poly1305, HKDF-SHA256) zusätzlich zur iOS-eigenen Verschlüsselung. Die Fragen ehrlich so beantworten; ob dafür Unterlagen nötig sind, zeigt App Store Connect an.
7. Beide installieren die App über die **TestFlight**-App.

TestFlight-Builds laufen nach **90 Tagen** ab. Spätestens dann `npm run build:ios` und `npm run submit:ios` erneut ausführen.

## Stand

Fertig und gegen das Backend getestet: Koppeln, Uhrzeit und Zeitzone drüben (folgt automatisch dem iPhone), Ampel manuell mit Dauer, Emoji und Notiz, Entfernung (Standort gerundet, pausierbar), Post-its (anheften, erledigt, löschen, 👀), Foto-Dump (teilen mit Vorschau, ansehen, Herz, löschen). Alles Ende-zu-Ende verschlüsselt.

Auf einem echten iPhone noch **nicht ausprobiert**: Der Code ist typgeprüft, bündelt fehlerfrei für iOS, und die App-Schicht läuft unter Node gegen den echten Worker. Oberfläche, Kamera-Rolle und Standortabfrage zeigen sich erst in Expo Go.

Offen:

- Sprach-Slot: Aufnahme und Wiedergabe (API-Client ist fertig, Oberfläche fehlt)
- Ampel-Wochenplan: Eingabe und Auswertung
- Wetter drüben (auf dem Gerät abrufen, damit der Server keinen Ort braucht)
- Kalender, Minikarte
- Widgets (WidgetKit, Swift über `expo-apple-targets`; braucht einen Development-Build statt Expo Go)
- Push-Mitteilungen (Inhalt neutral halten, Apple sieht ihn)
- Kopplung per QR-Code
