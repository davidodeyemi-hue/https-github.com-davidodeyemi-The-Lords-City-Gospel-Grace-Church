CREATE TABLE IF NOT EXISTS audio_messages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_date TEXT NOT NULL,
  speaker TEXT,
  object_key TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS audio_messages_date ON audio_messages(event_date DESC, created_at DESC);
