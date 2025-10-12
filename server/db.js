const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data.sqlite');
const db = new Database(dbPath);

function init() {
  db.pragma('journal_mode = WAL');
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    level INTEGER NOT NULL,
    exp INTEGER NOT NULL,
    money INTEGER NOT NULL,
    atk INTEGER NOT NULL,
    def INTEGER NOT NULL,
    hp INTEGER NOT NULL,
    last_exp_time INTEGER NOT NULL DEFAULT 0,
    last_passive_money_ts INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    content TEXT NOT NULL,
    type TEXT NOT NULL,
    ts INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS monsters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hp INTEGER NOT NULL,
    max_hp INTEGER NOT NULL,
    atk INTEGER NOT NULL,
    def INTEGER NOT NULL,
    reward_pool INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS monster_damage (
    monster_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    damage INTEGER NOT NULL,
    PRIMARY KEY (monster_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS coinrain_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS coinrain_claims (
    event_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    coins_collected INTEGER NOT NULL,
    PRIMARY KEY (event_id, user_id)
  );
  `);

  // Migrations
  try {
    const cols = db.prepare("PRAGMA table_info(characters)").all();
    const hasExpBank = cols.some(c => c.name === 'exp_bank');
    if (!hasExpBank) {
      db.exec("ALTER TABLE characters ADD COLUMN exp_bank INTEGER NOT NULL DEFAULT 0");
    }
    const now = Date.now();
    db.prepare('UPDATE characters SET last_passive_money_ts = ? WHERE last_passive_money_ts = 0').run(now);
    db.prepare('UPDATE characters SET last_exp_time = ? WHERE last_exp_time = 0').run(now);
  } catch (e) {
    // ignore
  }
}

init();

module.exports = { db };
