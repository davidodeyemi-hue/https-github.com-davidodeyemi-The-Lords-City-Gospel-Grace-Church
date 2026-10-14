CREATE TABLE IF NOT EXISTS member_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name TEXT,
  gender TEXT,
  phone TEXT,
  state TEXT,
  city TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS member_profiles_username ON member_profiles(username COLLATE NOCASE);
