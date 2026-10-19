const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(process.env.DB_PATH || path.join(DATA_DIR, 'social.db'));

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  username      TEXT UNIQUE,
  bio           TEXT DEFAULT '',
  accent_color  TEXT DEFAULT '#ff2d55',
  avatar_url    TEXT DEFAULT '',
  is_public     INTEGER NOT NULL DEFAULT 0,
  preferences   TEXT NOT NULL DEFAULT '{}',
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS connected_accounts (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL CHECK (platform IN ('youtube','instagram')),
  platform_account_id TEXT NOT NULL,
  account_label TEXT,
  status        TEXT NOT NULL DEFAULT 'connected',
  scopes        TEXT NOT NULL DEFAULT '[]',
  token_ref     TEXT NOT NULL,
  token_expires_at INTEGER,
  last_sync_at INTEGER,
  last_error    TEXT,
  created_at    INTEGER NOT NULL,
  UNIQUE (user_id, platform, platform_account_id)
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON connected_accounts(user_id);

CREATE TABLE IF NOT EXISTS videos (
  id            TEXT PRIMARY KEY,
  platform      TEXT NOT NULL,
  platform_video_id TEXT NOT NULL,
  creator_id    TEXT,
  creator_name  TEXT,
  title         TEXT,
  description   TEXT,
  thumbnail_url TEXT,
  source_url    TEXT,
  published_at  INTEGER,
  duration      INTEGER,
  is_live       INTEGER NOT NULL DEFAULT 0,
  view_count    INTEGER,
  metadata      TEXT NOT NULL DEFAULT '{}',
  last_discovered_at INTEGER NOT NULL,
  metadata_updated_at INTEGER NOT NULL,
  UNIQUE (platform, platform_video_id)
);
CREATE INDEX IF NOT EXISTS idx_videos_published ON videos(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_discovered ON videos(last_discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_live ON videos(is_live) WHERE is_live = 1;

CREATE TABLE IF NOT EXISTS collections (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  category    TEXT,
  is_private  INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE (owner_id, name)
);
CREATE INDEX IF NOT EXISTS idx_collections_owner ON collections(owner_id);

CREATE TABLE IF NOT EXISTS collection_items (
  id          TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  video_id    TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  saved_at    INTEGER NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  origin      TEXT NOT NULL DEFAULT 'manual',
  UNIQUE (collection_id, video_id)
);
CREATE INDEX IF NOT EXISTS idx_items_collection ON collection_items(collection_id, saved_at DESC);

CREATE TABLE IF NOT EXISTS discovery_rules (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  name          TEXT,
  search_terms  TEXT NOT NULL DEFAULT '[]',
  platforms     TEXT NOT NULL DEFAULT '["youtube"]',
  channel_ids   TEXT NOT NULL DEFAULT '[]',
  frequency_minutes INTEGER NOT NULL DEFAULT 360,
  enabled       INTEGER NOT NULL DEFAULT 1,
  last_run_at   INTEGER,
  last_error    TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rules_collection ON discovery_rules(collection_id);

CREATE TABLE IF NOT EXISTS rule_matches (
  id         TEXT PRIMARY KEY,
  rule_id    TEXT NOT NULL REFERENCES discovery_rules(id) ON DELETE CASCADE,
  video_id   TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  dismissed  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (rule_id, video_id)
);

CREATE TABLE IF NOT EXISTS interactions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id   TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('opened','saved','not_interested','searched','watched')),
  metadata   TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_interactions_user ON interactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS feed_sync (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'idle',
  last_success_at INTEGER,
  next_run_at INTEGER,
  cursor      TEXT,
  error       TEXT,
  updated_at  INTEGER NOT NULL,
  UNIQUE (user_id, platform)
);

CREATE TABLE IF NOT EXISTS api_secrets (
  platform  TEXT PRIMARY KEY,
  payload   TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`);

// Migration: add profile columns to existing users tables
function addColumnIfMissing(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
addColumnIfMissing('users', 'username', 'TEXT');
addColumnIfMissing('users', 'bio', `TEXT DEFAULT ''`);
addColumnIfMissing('users', 'accent_color', `TEXT DEFAULT '#ff2d55'`);
addColumnIfMissing('users', 'avatar_url', `TEXT DEFAULT ''`);
addColumnIfMissing('users', 'is_public', 'INTEGER NOT NULL DEFAULT 0');
// Unique index on username (safe if column already existed with UNIQUE)
try {
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL');
} catch {}

// Backfill usernames for existing users
function slugifyUser(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}
{
  const missing = db.prepare("SELECT id, email, display_name FROM users WHERE username IS NULL OR username = ''").all();
  for (const u of missing) {
    const base = slugifyUser(u.display_name || u.email.split('@')[0]) || 'creator';
    let candidate = base;
    let n = 1;
    while (db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(candidate, u.id)) {
      n += 1;
      candidate = `${base}-${n}`;
    }
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(candidate, u.id);
  }
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

module.exports = { db, id, DATA_DIR };
