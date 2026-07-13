// `bun:sqlite` only exists under the Bun runtime that actually runs this
// server in production. Vitest (even invoked via `bun x vitest`) executes
// test files in a plain Node worker, so a static top-level `import 'bun:sqlite'`
// would break every test file that merely imports this module. Resolve the
// sqlite implementation lazily and pick Node's built-in `node:sqlite`
// (near-identical sync API: exec/prepare/run/all) when Bun isn't present.
let DatabaseCtor = null

/**
 * @returns {Promise<new (path: string) => object>} the sqlite `Database`/`DatabaseSync` constructor for the current runtime
 */
async function resolveDatabaseCtor() {
  if (DatabaseCtor) return DatabaseCtor
  if (typeof Bun === 'undefined') {
    ;({ DatabaseSync: DatabaseCtor } = await import('node:sqlite'))
  } else {
    ;({ Database: DatabaseCtor } = await import('bun:sqlite'))
  }
  return DatabaseCtor
}

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
 * @returns {Promise<import('bun:sqlite').Database>} the open, migrated database handle
 */
export async function openDb(path) {
  const Ctor = await resolveDatabaseCtor()
  const db = new Ctor(path)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec(SCHEMA)
  return db
}

const TABLES = {
  links: { table: 'link_journal', idCol: 'link_id', valueCol: 'url' },
  translations: { table: 'translation_journal', idCol: 'video_id', valueCol: 'entry' }
}

/**
 * @param {'links'|'translations'} table which journal to resolve column names for
 * @returns {{table: string, idCol: string, valueCol: string}} table/column names for that journal
 */
export function tableSpec(table) {
  const spec = TABLES[table]
  if (!spec) throw new Error(`unknown sync table: ${table}`)
  return spec
}
