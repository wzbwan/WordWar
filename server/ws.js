const WebSocket = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const { db } = require('./db');
const { verifyToken } = require('./auth');

const PORT = process.env.WS_PORT ? Number(process.env.WS_PORT) : 3001;

const server = http.createServer((req, res) => {
  try {
    if (!req.url) { res.statusCode = 404; return res.end('Not found'); }
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/admin/coinrain') {
      const key = url.searchParams.get('key');
      if (process.env.ADMIN_KEY && key !== process.env.ADMIN_KEY) {
        res.statusCode = 403; return res.end('Forbidden');
      }
      spawnCoinRain();
      res.statusCode = 200; return res.end('ok');
    }
    if (url.pathname === '/admin/monster') {
      const key = url.searchParams.get('key');
      if (process.env.ADMIN_KEY && key !== process.env.ADMIN_KEY) {
        res.statusCode = 403; return res.end('Forbidden');
      }
      spawnMonster();
      res.statusCode = 200; return res.end('ok');
    }
    if (url.pathname === '/admin/fix_money') {
      const key = url.searchParams.get('key');
      if (process.env.ADMIN_KEY && key !== process.env.ADMIN_KEY) {
        res.statusCode = 403; return res.end('Forbidden');
      }
      const user = url.searchParams.get('user');
      const valueStr = url.searchParams.get('value');
      const value = Number(valueStr ?? 0);
      if (!user || Number.isNaN(value)) { res.statusCode = 400; return res.end('bad args'); }
      const row = db.prepare('SELECT id FROM users WHERE username=?').get(user);
      if (!row) { res.statusCode = 404; return res.end('no user'); }
      db.prepare('UPDATE characters SET money=? WHERE user_id=?').run(value, row.id);
      res.statusCode = 200; return res.end('ok');
    }
    res.statusCode = 404; res.end('Not found');
  } catch (e) {
    res.statusCode = 500; res.end('error');
  }
});
const wss = new WebSocket.Server({ server });

/**
 * Online users: userId -> { ws, username }
 */
const online = new Map();

function broadcast(type, payload) {
  const data = JSON.stringify({ type, payload });
  for (const { ws } of online.values()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

function sendTo(userId, type, payload) {
  const c = online.get(userId);
  if (!c) return;
  if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify({ type, payload }));
}

function userList() {
  return Array.from(online.entries()).map(([id, v]) => {
    const ch = getChar(id);
    return { id: Number(id), username: v.username, level: ch?.level ?? 1 };
  });
}

function pushSystem(text) {
  const msg = { id: uuidv4(), type: 'system', content: text, ts: Date.now() };
  broadcast('system', msg);
  try {
    db.prepare('INSERT INTO messages (user_id, content, type, ts) VALUES (?,?,?,?)').run(null, text, 'system', Date.now());
  } catch {}
}

function getChar(uid) {
  return db.prepare('SELECT level, exp, money, atk, def, hp, last_passive_money_ts, last_exp_time, exp_bank FROM characters WHERE user_id=?').get(uid);
}

function setMoney(uid, money) {
  db.prepare('UPDATE characters SET money=? WHERE user_id=?').run(money, uid);
}

function addMoney(uid, delta) {
  const ch = getChar(uid);
  if (!ch) return;
  const m = Math.max(0, (ch.money || 0) + delta);
  setMoney(uid, m);
  sendTo(uid, 'player.update', {
    level: ch.level, exp: ch.exp, money: m, atk: ch.atk, def: ch.def, hp: ch.hp,
  });
}

// Coin rain state
let activeCoinRain = null; // { id:number, startedAt, endsAt, picked: Map<uid, count> }

function spawnCoinRain() {
  if (activeCoinRain) return; // avoid overlap
  const now = Date.now();
  const res = db.prepare('INSERT INTO coinrain_events (started_at) VALUES (?)').run(now);
  const id = Number(res.lastInsertRowid);
  activeCoinRain = { id, startedAt: now, endsAt: now + 20000, picked: new Map() };
  broadcast('coinrain.spawn', { event_id: id });
  setTimeout(() => {
    if (!activeCoinRain) return;
    const endedAt = Date.now();
    db.prepare('UPDATE coinrain_events SET ended_at=? WHERE id=?').run(endedAt, id);
    broadcast('coinrain.end', { event_id: id });
    activeCoinRain = null;
  }, 20000);
}

// Monster state
let activeMonster = null; // { id:number, hp, max_hp, atk, def, reward_pool, started_at, damage: Map<uid, dmg>, cell:number, endsAt:number }
const MONSTER_DURATION_MS = 60_000;

function spawnMonster() {
  if (activeMonster) return;
  const now = Date.now();
  const base = { hp: 6000, max_hp: 6000, atk: 6, def: 24, reward_pool: 30000 };
  const res = db.prepare('INSERT INTO monsters (hp, max_hp, atk, def, reward_pool, started_at) VALUES (?,?,?,?,?,?)')
    .run(base.hp, base.max_hp, base.atk, base.def, base.reward_pool, now);
  const id = Number(res.lastInsertRowid);
  activeMonster = { id, ...base, started_at: now, damage: new Map(), cell: Math.floor(Math.random()*9), endsAt: now + MONSTER_DURATION_MS };
  broadcast('monster.spawn', { text: `普通怪出现！HP ${activeMonster.hp}/${activeMonster.max_hp} 奖励池 ${activeMonster.reward_pool}` });
  broadcast('monster.state', { hp: activeMonster.hp, max_hp: activeMonster.max_hp, cell: activeMonster.cell, endsAt: activeMonster.endsAt });
}

function endMonster(killed) {
  if (!activeMonster) return;
  const endedAt = Date.now();
  db.prepare('UPDATE monsters SET hp=?, ended_at=? WHERE id=?').run(Math.max(0, activeMonster.hp), endedAt, activeMonster.id);
  const entries = Array.from(activeMonster.damage.entries());
  const sumDamage = entries.reduce((s, [,d])=>s+d, 0) || 1;
  const results = [];
  if (killed) {
    for (const [uid, dmg] of entries) {
      const share = dmg / sumDamage;
      const threshold = 0.003; // 0.3%
      let reward = 0;
      if (share >= threshold) reward = Math.floor(activeMonster.reward_pool * share);
      if (reward > 0) addMoney(uid, reward);
      try { db.prepare('INSERT OR REPLACE INTO monster_damage (monster_id, user_id, damage) VALUES (?,?,?)').run(activeMonster.id, uid, dmg); } catch {}
      results.push({ uid, dmg, reward });
    }
  }
  results.sort((a,b)=>b.dmg-a.dmg);
  const top10 = results.slice(0,10).map(r => {
    const u = db.prepare('SELECT username FROM users WHERE id=?').get(r.uid);
    return `${u?.username || r.uid}: 伤害${r.dmg}${killed?` 奖励${r.reward}`:''}`;
  }).join(' | ');
  const text = killed ? `怪物被击杀！功劳榜：${top10}` : '时间到，怪物逃跑了。';
  broadcast('monster.end', { text });
  activeMonster = null;
}

function tickMonster() {
  if (!activeMonster) return;
  const now = Date.now();
  if (now > activeMonster.endsAt) {
    endMonster(false);
    return;
  }
  // move position roughly every second
  if (!activeMonster._nextMoveAt || now >= activeMonster._nextMoveAt) {
    activeMonster.cell = Math.floor(Math.random()*9);
    activeMonster._nextMoveAt = now + 900 + Math.floor(Math.random()*600);
    broadcast('monster.state', { hp: activeMonster.hp, max_hp: activeMonster.max_hp, cell: activeMonster.cell, endsAt: activeMonster.endsAt });
  }
}

// Passive money per minute
function tickPassiveMoney() {
  const now = Date.now();
  for (const uid of online.keys()) {
    const ch = getChar(uid);
    if (!ch) continue;
    const last = ch.last_passive_money_ts || 0;
    if (last === 0) {
      db.prepare('UPDATE characters SET last_passive_money_ts = ? WHERE user_id = ?').run(now, uid);
      continue;
    }
    if (now - last >= 60_000) {
      const minutes = Math.floor((now - last) / 60_000);
      const perMin = 55 + 18 * (Math.max(1, ch.level) - 1);
      const delta = perMin * minutes;
      db.prepare('UPDATE characters SET money = money + ?, last_passive_money_ts = ? WHERE user_id = ?').run(delta, now, uid);
      const updated = getChar(uid);
      sendTo(uid, 'player.update', {
        level: updated.level, exp: updated.exp, money: updated.money, atk: updated.atk, def: updated.def, hp: updated.hp,
      });
    }
  }
}

// Exp bank per minute (online only)
function tickExpBank() {
  const now = Date.now();
  for (const uid of online.keys()) {
    const ch = getChar(uid);
    if (!ch) continue;
    const last = ch.last_exp_time || 0;
    if (last === 0) {
      db.prepare('UPDATE characters SET last_exp_time = ? WHERE user_id = ?').run(now, uid);
      continue;
    }
    if (now - last >= 60_000) {
      const minutes = Math.floor((now - last) / 60_000);
      db.prepare('UPDATE characters SET exp_bank = exp_bank + ?, last_exp_time = last_exp_time + ? WHERE user_id = ?').run(minutes, minutes * 60_000, uid);
    }
  }
}

// PVP simulation
function simulatePvp(a, b) {
  // a and b: { name, atk, def, hp }
  const log = [];
  let A = { ...a }, B = { ...b };
  let turn = 0;
  while (A.hp > 0 && B.hp > 0 && log.length < 50) {
    if (turn % 2 === 0) {
      const dmg = Math.max(1, A.atk - B.def);
      B.hp -= dmg;
      log.push(`${A.name} 对 ${B.name} 造成 ${dmg} 伤害，剩余HP ${Math.max(0, B.hp)}`);
    } else {
      const dmg = Math.max(1, B.atk - A.def);
      A.hp -= dmg;
      log.push(`${B.name} 对 ${A.name} 造成 ${dmg} 伤害，剩余HP ${Math.max(0, A.hp)}`);
    }
    turn++;
  }
  const winner = A.hp > 0 ? a.name : b.name;
  return { winner, log };
}

wss.on('connection', (ws) => {
  let uid = null;

  ws.on('message', (raw) => {
    let msg = null;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    const { type, payload, token } = msg;

    if (type === 'connect') {
      const p = verifyToken(token);
      if (!p) { ws.close(); return; }
      uid = p.uid;
      online.set(uid, { ws, username: p.username });
      // Online-time-only exp: reset last_exp_time to now at login to avoid counting offline duration
      try { db.prepare('UPDATE characters SET last_exp_time = ? WHERE user_id = ?').run(Date.now(), uid); } catch {}
      // send initial state
      const list = userList();
      broadcast('user.list', list);
      pushSystem(`玩家 ${p.username} 加入了聊天室`);
      const ch = getChar(uid);
      if (ch) sendTo(uid, 'player.update', { level: ch.level, exp: ch.exp, money: ch.money, atk: ch.atk, def: ch.def, hp: ch.hp });
      return;
    }

    if (!uid) return;

    if (type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong' }));
      return;
    }

    if (type === 'chat.message') {
      const user = online.get(uid);
      const now = Date.now();
      const payloadOut = { id: uuidv4(), type: 'chat', user: user?.username, content: String(payload?.content || '').slice(0, 500), ts: now };
      broadcast('chat.message', payloadOut);
      try { db.prepare('INSERT INTO messages (user_id, content, type, ts) VALUES (?,?,?,?)').run(uid, payloadOut.content, 'chat', now); } catch {}
      return;
    }

    if (type === 'coinrain.hit') {
      if (!activeCoinRain || Date.now() > activeCoinRain.endsAt) return;
      const count = activeCoinRain.picked.get(uid) || 0;
      if (count >= 5) {
        sendTo(uid, 'coinrain.result', { ok: false, reason: 'CAP_REACHED', picked: count });
        return;
      }
      activeCoinRain.picked.set(uid, count + 1);
      addMoney(uid, 500);
      try {
        const existing = db.prepare('SELECT coins_collected FROM coinrain_claims WHERE event_id=? AND user_id=?').get(activeCoinRain.id, uid);
        if (existing) {
          db.prepare('UPDATE coinrain_claims SET coins_collected=? WHERE event_id=? AND user_id=?').run(existing.coins_collected + 1, activeCoinRain.id, uid);
        } else {
          db.prepare('INSERT INTO coinrain_claims (event_id, user_id, coins_collected) VALUES (?,?,?)').run(activeCoinRain.id, uid, 1);
        }
      } catch {}
      sendTo(uid, 'coinrain.result', { ok: true, picked: count + 1 });
      return;
    }

    if (type === 'pvp.challenge') {
      const targetId = payload?.targetId;
      if (!online.has(targetId)) return;
      const aRow = db.prepare('SELECT username FROM users WHERE id=?').get(uid);
      const bRow = db.prepare('SELECT username FROM users WHERE id=?').get(targetId);
      const aCh = getChar(uid), bCh = getChar(targetId);
      if (!aCh || !bCh) return;
      const { winner, log } = simulatePvp({ name: aRow.username, atk: aCh.atk, def: aCh.def, hp: aCh.hp }, { name: bRow.username, atk: bCh.atk, def: bCh.def, hp: bCh.hp });
      const summary = `${aRow.username} 对 ${bRow.username} 进行切磋，${winner} 获胜。`;
      sendTo(uid, 'pvp.result', { summary, log });
      sendTo(targetId, 'pvp.result', { summary, log });
      return;
    }

    if (type === 'monster.hit') {
      if (!activeMonster) return;
      const { cell } = payload || {};
      const now = Date.now();
      if (now > activeMonster.endsAt) { endMonster(false); return; }
      if (cell !== activeMonster.cell) return; // miss
      const ch = getChar(uid);
      if (!ch) return;
      const dmg = Math.max(1, (ch.atk || 0) - activeMonster.def);
      activeMonster.hp = Math.max(0, activeMonster.hp - dmg);
      const prev = activeMonster.damage.get(uid) || 0;
      activeMonster.damage.set(uid, prev + dmg);
      if (activeMonster.hp <= 0) {
        endMonster(true);
      } else {
        broadcast('monster.state', { hp: activeMonster.hp, max_hp: activeMonster.max_hp, cell: activeMonster.cell, endsAt: activeMonster.endsAt });
      }
      return;
    }
  });

  ws.on('close', () => {
    if (uid && online.has(uid)) {
      const name = online.get(uid)?.username;
      online.delete(uid);
      // Anchor last_exp_time at disconnect to avoid offline accumulation
      try { db.prepare('UPDATE characters SET last_exp_time = ? WHERE user_id = ?').run(Date.now(), uid); } catch {}
      broadcast('user.list', userList());
      pushSystem(`玩家 ${name} 离开了聊天室`);
    }
  });
});

// Game loops
setInterval(() => {
  tickMonster();
  // 被动金钱改为随存点结算，这里不再发放金钱
  // tickPassiveMoney();
  tickExpBank();
}, 1000);

// Spawners
setInterval(() => spawnCoinRain(), 1000 * 60 * 5); // every 5 min
setInterval(() => spawnMonster(), 1000 * 60 * 3); // every 3 min

server.listen(PORT, () => {
  console.log(`[WS] listening on :${PORT}`);
});
