-- LDB: Grundschema. Es gibt genau zwei Personen; jede kann mehrere Geräte haben.
-- Alle Zeitstempel sind UTC in Millisekunden (Unix-Epoch). Zeitzonen werden als IANA-ID gespeichert,
-- nie als fester Versatz (siehe konzept/01).

CREATE TABLE persons (
  id            TEXT PRIMARY KEY CHECK (id IN ('a', 'b')),
  display_name  TEXT NOT NULL,
  timezone      TEXT,                 -- z. B. 'Asia/Hong_Kong'
  updated_at    INTEGER NOT NULL
);

-- Pro Gerät ein Schlüssel. Gespeichert wird nur der SHA-256-Hash, der Klartext liegt im iPhone-Schlüsselbund.
CREATE TABLE devices (
  id            TEXT PRIMARY KEY,
  person_id     TEXT NOT NULL REFERENCES persons(id),
  name          TEXT NOT NULL,
  key_hash      TEXT NOT NULL UNIQUE,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER
);

-- Feature 3: Ampel. Nur der aktuelle Zustand, keine Historie.
CREATE TABLE traffic_light (
  person_id     TEXT PRIMARY KEY REFERENCES persons(id),
  manual_state  TEXT CHECK (manual_state IN ('free', 'busy', 'sleeping')),
  manual_set_at INTEGER,
  manual_until  INTEGER,              -- nächster Planwechsel; danach gilt wieder der Plan
  emoji         TEXT,
  note          TEXT,
  plan_json     TEXT,                 -- Wochenplan (Werktag/Wochenende) in Ortszeit der Person
  updated_at    INTEGER NOT NULL
);

-- Feature 2: genau ein Sprach-Slot pro Person.
CREATE TABLE voice_slot (
  person_id        TEXT PRIMARY KEY REFERENCES persons(id),
  r2_key           TEXT NOT NULL,
  duration_ms      INTEGER NOT NULL,
  waveform_json    TEXT,
  sender_timezone  TEXT,
  recorded_at      INTEGER NOT NULL,
  listened_at      INTEGER
);

-- Feature 4: Foto-Dump, jedes Foto lebt 24 h ab Upload.
CREATE TABLE photos (
  id            TEXT PRIMARY KEY,
  person_id     TEXT NOT NULL REFERENCES persons(id),
  r2_key        TEXT NOT NULL,
  thumb_r2_key  TEXT,
  caption       TEXT,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  seen_at       INTEGER,
  kept_at       INTEGER
);
CREATE INDEX idx_photos_expires ON photos(expires_at);
CREATE INDEX idx_photos_person_created ON photos(person_id, created_at);

-- Feature 5: Post-its. Nur der Autor bearbeitet, 24 h Lebensdauer.
CREATE TABLE notes (
  id            TEXT PRIMARY KEY,
  person_id     TEXT NOT NULL REFERENCES persons(id),
  kind          TEXT NOT NULL DEFAULT 'text',
  body          TEXT NOT NULL,
  color         TEXT,
  done          INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  seen_at       INTEGER                -- 👀, vom Partner gesetzt
);
CREATE INDEX idx_notes_expires ON notes(expires_at);

-- Feature 1 + 7: letzter bekannter Ort (gerundet), keine Historie.
CREATE TABLE location (
  person_id     TEXT PRIMARY KEY REFERENCES persons(id),
  lat           REAL,
  lon           REAL,
  paused        INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL
);

INSERT INTO persons (id, display_name, timezone, updated_at) VALUES
  ('a', 'Leon', 'Europe/Berlin', 0),
  ('b', 'Partner', 'Asia/Hong_Kong', 0);
