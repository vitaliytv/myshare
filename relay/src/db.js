import { Database } from 'bun:sqlite'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS link_journal (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  link_id TEXT NOT NULL,
  url TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  device_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_link_journal_user_seq ON link_journal(user_id, seq);

CREATE TABLE IF NOT EXISTS translation_journal (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  entry TEXT,
  deleted INTEGER NOT NULL DEFAULT 0,
  device_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_translation_journal_user_seq ON translation_journal(user_id, seq);
`

/**
 * Open (and migrate) the relay's sqlite database.
 * @param {string} path file path, or `:memory:` for tests
 * @returns {Database}
 */
export function openDb(path) {
  const db = new Database(path)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec(SCHEMA)
  return db
}

const TABLES = {
  links: { table: 'link_journal', idCol: 'link_id', valueCol: 'url' },
  translations: { table: 'translation_journal', idCol: 'video_id', valueCol: 'entry' }
}

/**
 * @param {'links'|'translations'} table
 * @returns {{table: string, idCol: string, valueCol: string}}
 */
export function tableSpec(table) {
  const spec = TABLES[table]
  if (!spec) throw new Error(`unknown sync table: ${table}`)
  return spec
}
