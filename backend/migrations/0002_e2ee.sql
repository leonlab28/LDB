-- LDB: Umstellung auf Ende-zu-Ende-Verschlüsselung (siehe docs/encryption.md).
-- Der Server speichert ab hier nur noch Chiffrate (Umschläge) plus die Metadaten, die er für
-- Rechte, Limits und die 24-h-Regel braucht. Alle Inhalte aus 0001 werden verworfen; sie waren
-- Klartext und ohnehin kurzlebig. Auch alle Geräte werden entfernt, weil sie den neuen
-- Inhaltsschlüssel nicht kennen: beide iPhones koppeln sich danach neu.

DROP TABLE IF EXISTS traffic_light;
DROP TABLE IF EXISTS voice_slot;
DROP TABLE IF EXISTS photos;
DROP TABLE IF EXISTS notes;
DROP TABLE IF EXISTS location;
DELETE FROM devices;

-- Name und Zeitzone lagen im Klartext beim Server. Sie wandern verschlüsselt in "state".
ALTER TABLE persons DROP COLUMN display_name;
ALTER TABLE persons DROP COLUMN timezone;
ALTER TABLE persons DROP COLUMN updated_at;

-- Einzelzustände pro Person: profile (Name, Zeitzone), light (Ampel samt Plan), location.
-- data ist ein Umschlag (base64url), den nur die beiden iPhones öffnen können.
CREATE TABLE state (
  person_id   TEXT NOT NULL REFERENCES persons(id),
  kind        TEXT NOT NULL CHECK (kind IN ('profile', 'light', 'location')),
  data        TEXT NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (person_id, kind)
);

-- Genau ein Sprach-Slot pro Person. id kommt vom Gerät und ist Teil der Zusatzdaten (AAD),
-- damit Audio und Metadaten nicht zwischen Nachrichten vertauscht werden können.
CREATE TABLE voice_slot (
  person_id    TEXT PRIMARY KEY REFERENCES persons(id),
  id           TEXT NOT NULL,
  r2_key       TEXT NOT NULL,
  meta         TEXT NOT NULL,            -- Umschlag: Dauer, Wellenform, Zeitzone des Absenders
  recorded_at  INTEGER NOT NULL,
  listened_at  INTEGER
);

-- Foto-Dump, jedes Foto lebt 24 h ab Upload. Bild und Vorschau liegen verschlüsselt in R2.
CREATE TABLE photos (
  id            TEXT PRIMARY KEY,         -- vom Gerät erzeugte UUID
  person_id     TEXT NOT NULL REFERENCES persons(id),
  r2_key        TEXT NOT NULL,
  thumb_r2_key  TEXT,
  meta          TEXT NOT NULL,            -- Umschlag: Bildunterschrift u. Ä.
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  seen_at       INTEGER,
  kept_at       INTEGER
);
CREATE INDEX idx_photos_expires ON photos(expires_at);
CREATE INDEX idx_photos_person_created ON photos(person_id, created_at);

-- Post-its, 24 h Lebensdauer. Text, Farbe und "erledigt" stecken im Umschlag.
CREATE TABLE notes (
  id          TEXT PRIMARY KEY,           -- vom Gerät erzeugte UUID
  person_id   TEXT NOT NULL REFERENCES persons(id),
  data        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  seen_at     INTEGER                     -- 👀, vom Partner gesetzt
);
CREATE INDEX idx_notes_expires ON notes(expires_at);
CREATE INDEX idx_notes_person ON notes(person_id, expires_at);
