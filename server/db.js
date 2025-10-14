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
    hp_max INTEGER NOT NULL DEFAULT 80,
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

  CREATE TABLE IF NOT EXISTS monster_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    hp INTEGER NOT NULL,
    atk INTEGER NOT NULL,
    def INTEGER NOT NULL,
    exp_pool INTEGER NOT NULL DEFAULT 0,
    money_pool INTEGER NOT NULL DEFAULT 0,
    counter_chance REAL NOT NULL DEFAULT 0.25,
    last_hit_reward_item_id INTEGER
  );

  CREATE TABLE IF NOT EXISTS coinrain_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    duration_ms INTEGER NOT NULL,
    coin_count INTEGER NOT NULL,
    coin_value INTEGER NOT NULL,
    per_user_cap INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scheduled_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL, -- 'monster' | 'coinrain'
    template_id INTEGER NOT NULL,
    interval_sec INTEGER NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS item_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL, -- weapon, hat, clothes, shoes, necklace, ring, consumable
    add_atk INTEGER NOT NULL DEFAULT 0,
    add_def INTEGER NOT NULL DEFAULT 0,
    add_max_hp INTEGER NOT NULL DEFAULT 0,
    add_dodge INTEGER NOT NULL DEFAULT 0,
    add_attack_speed INTEGER NOT NULL DEFAULT 0,
    add_crit INTEGER NOT NULL DEFAULT 0,
    add_current_hp INTEGER NOT NULL DEFAULT 0,
    url TEXT NOT NULL DEFAULT 'https://word-war.tos-cn-beijing.volces.com/fc13.png'
  );

  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    template_id INTEGER NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    bag_slot INTEGER, -- 0..23 when in bag
    equipped_slot TEXT, -- weapon|hat|clothes|shoes|necklace|ring when equipped
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(template_id) REFERENCES item_templates(id)
  );
  `);

  // Migrations
  try {
    const cols = db.prepare("PRAGMA table_info(characters)").all();
    const hasExpBank = cols.some(c => c.name === 'exp_bank');
    if (!hasExpBank) {
      db.exec("ALTER TABLE characters ADD COLUMN exp_bank INTEGER NOT NULL DEFAULT 0");
    }
    const hasHpMax = cols.some(c => c.name === 'hp_max');
    if (!hasHpMax) {
      db.exec("ALTER TABLE characters ADD COLUMN hp_max INTEGER NOT NULL DEFAULT 80");
      db.exec("UPDATE characters SET hp_max = hp WHERE hp_max IS NOT NULL");
    }
    const hasDodge = cols.some(c => c.name === 'dodge_index');
    if (!hasDodge) {
      db.exec("ALTER TABLE characters ADD COLUMN dodge_index INTEGER NOT NULL DEFAULT 10");
    }
    const hasCrit = cols.some(c => c.name === 'crit_index');
    if (!hasCrit) {
      db.exec("ALTER TABLE characters ADD COLUMN crit_index INTEGER NOT NULL DEFAULT 10");
    }
    const now = Date.now();
    db.prepare('UPDATE characters SET last_passive_money_ts = ? WHERE last_passive_money_ts = 0').run(now);
    db.prepare('UPDATE characters SET last_exp_time = ? WHERE last_exp_time = 0').run(now);
    const hasDead = cols.some(c => c.name === 'dead_remaining_ms');
    if (!hasDead) {
      db.exec("ALTER TABLE characters ADD COLUMN dead_remaining_ms INTEGER NOT NULL DEFAULT 0");
    }

    // item_templates add url
    const itCols = db.prepare("PRAGMA table_info(item_templates)").all();
    const hasUrl = itCols.some(c => c.name === 'url');
    if (!hasUrl) {
      db.exec("ALTER TABLE item_templates ADD COLUMN url TEXT NOT NULL DEFAULT 'https://word-war.tos-cn-beijing.volces.com/fc13.png'");
    }
    // monster_templates add url and last_hit_reward_items if missing
    const mtCols = db.prepare("PRAGMA table_info(monster_templates)").all();
    const hasMtItems = mtCols.some(c => c.name === 'last_hit_reward_items');
    if (!hasMtItems) {
      try { db.exec("ALTER TABLE monster_templates ADD COLUMN last_hit_reward_items TEXT"); } catch {}
    }
    const hasMtUrl = mtCols.some(c => c.name === 'url');
    if (!hasMtUrl) {
      try { db.exec("ALTER TABLE monster_templates ADD COLUMN url TEXT"); } catch {}
    }
  } catch (e) {
    // ignore
  }

  // Seed defaults
  try {
    const mtCount = db.prepare('SELECT COUNT(*) as c FROM monster_templates').get().c;
    if (mtCount === 0) {
      try { db.exec("ALTER TABLE monster_templates ADD COLUMN last_hit_reward_items TEXT"); } catch {}
      try { db.exec("ALTER TABLE monster_templates ADD COLUMN url TEXT"); } catch {}
      db.prepare('INSERT INTO monster_templates (name, hp, atk, def, exp_pool, money_pool, counter_chance, last_hit_reward_items, url) VALUES (?,?,?,?,?,?,?,?,?)')
        .run('普通怪', 6000, 6, 24, 0, 30000, 0.25, null, null);
    }
    const ctCount = db.prepare('SELECT COUNT(*) as c FROM coinrain_templates').get().c;
    if (ctCount === 0) {
      db.prepare('INSERT INTO coinrain_templates (duration_ms, coin_count, coin_value, per_user_cap) VALUES (?,?,?,?)')
        .run(20000, 25, 500, 5);
    }
    const itCount = db.prepare('SELECT COUNT(*) as c FROM item_templates').get().c;
    if (itCount === 0) {
      db.prepare("INSERT INTO item_templates (name, category, add_atk, url) VALUES (?,?,?,?)").run('木剑', 'weapon', 2, 'https://word-war.tos-cn-beijing.volces.com/fc13.png');
      db.prepare("INSERT INTO item_templates (name, category, add_current_hp, url) VALUES (?,?,?,?)").run('小红瓶', 'consumable', 20, 'https://word-war.tos-cn-beijing.volces.com/fc13.png');
    }
    const seCount = db.prepare('SELECT COUNT(*) as c FROM scheduled_events').get().c;
    if (seCount === 0) {
      const m1 = db.prepare('SELECT id FROM monster_templates LIMIT 1').get().id;
      const c1 = db.prepare('SELECT id FROM coinrain_templates LIMIT 1').get().id;
      db.prepare('INSERT INTO scheduled_events (type, template_id, interval_sec, enabled) VALUES (?,?,?,1)').run('monster', m1, 180);
      db.prepare('INSERT INTO scheduled_events (type, template_id, interval_sec, enabled) VALUES (?,?,?,1)').run('coinrain', c1, 300);
    }
  } catch {}
}

init();

module.exports = { db };
