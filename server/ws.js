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
      const tpl = Number(url.searchParams.get('tpl')||1);
      spawnCoinRainByTemplate(tpl);
      res.statusCode = 200; return res.end('ok');
    }
    if (url.pathname === '/admin/monster') {
      const key = url.searchParams.get('key');
      if (process.env.ADMIN_KEY && key !== process.env.ADMIN_KEY) {
        res.statusCode = 403; return res.end('Forbidden');
      }
      const tpl = Number(url.searchParams.get('tpl')||1);
      spawnMonsterByTemplate(tpl);
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

function getCharBase(uid) {
  return db.prepare('SELECT level, exp, money, atk, def, hp, hp_max, dodge_index, crit_index, last_passive_money_ts, last_exp_time, exp_bank, dead_remaining_ms FROM characters WHERE user_id=?').get(uid);
}
function getEquipBonuses(uid) {
  const rows = db.prepare(`
    SELECT it.* FROM inventory inv
    JOIN item_templates it ON it.id = inv.template_id
    WHERE inv.user_id=? AND inv.equipped_slot IS NOT NULL
  `).all(uid);
  const sum = rows.reduce((acc, r) => ({
    add_atk: acc.add_atk + (r.add_atk||0),
    add_def: acc.add_def + (r.add_def||0),
    add_max_hp: acc.add_max_hp + (r.add_max_hp||0),
    add_dodge: acc.add_dodge + (r.add_dodge||0),
    add_attack_speed: acc.add_attack_speed + (r.add_attack_speed||0),
    add_crit: acc.add_crit + (r.add_crit||0)
  }), {add_atk:0,add_def:0,add_max_hp:0,add_dodge:0,add_attack_speed:0,add_crit:0});
  return sum;
}
function getChar(uid) {
  const ch = getCharBase(uid);
  if (!ch) return null;
  const b = getEquipBonuses(uid);
  return { ...ch,
    atk: ch.atk + b.add_atk,
    def: ch.def + b.add_def,
    hp_max: (ch.hp_max || ch.hp) + b.add_max_hp,
    dodge_index: (ch.dodge_index||0) + (b.add_dodge||0),
    crit_index: (ch.crit_index||0) + (b.add_crit||0),
  };
}

function chanceFromIndex(R){
  const pMin=0.03, pMax=0.70, R0=10, K=204;
  const Rp=Math.max(0,(R||0)-R0);
  const p=pMax-(pMax-pMin)*Math.exp(-Rp/K);
  return Math.min(pMax, Math.max(pMin,p));
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
    level: ch.level, exp: ch.exp, money: m, atk: ch.atk, def: ch.def, hp: ch.hp, maxHp: ch.hp_max, dodge_index: ch.dodge_index, crit_index: ch.crit_index, deadRemaining: ch.dead_remaining_ms || 0,
  });
}

// Coin rain state
let activeCoinRain = null; // { id:number, startedAt, endsAt, picked: Map<uid, count>, conf }

function spawnCoinRainByTemplate(tplId) {
  if (activeCoinRain) return; // avoid overlap
  const cfg = db.prepare('SELECT * FROM coinrain_templates WHERE id=?').get(tplId);
  if (!cfg) return;
  const now = Date.now();
  const res = db.prepare('INSERT INTO coinrain_events (started_at) VALUES (?)').run(now);
  const id = Number(res.lastInsertRowid);
  activeCoinRain = { id, startedAt: now, endsAt: now + cfg.duration_ms, picked: new Map(), conf: cfg };
  broadcast('coinrain.spawn', { event_id: id });
  setTimeout(() => {
    if (!activeCoinRain) return;
    const endedAt = Date.now();
    db.prepare('UPDATE coinrain_events SET ended_at=? WHERE id=?').run(endedAt, id);
    broadcast('coinrain.end', { event_id: id });
    activeCoinRain = null;
  }, cfg.duration_ms);
}

// Monster state
let activeMonster = null; // { id:number, name:string, url?:string, hp, max_hp, atk, def, money_pool, exp_pool, counter_chance, started_at, damage: Map<uid, dmg>, endsAt:number, lastHitter:number|null, reward_item_id?:number, reward_items?:number[], question_bank_id?:number|null, question_time_ms?:number, currentQuestion?:any, qAnswered?:Set<number> }
const MONSTER_DURATION_MS = 60_000;

function spawnMonsterByTemplate(tplId) {
  if (activeMonster) return;
  const tpl = db.prepare('SELECT * FROM monster_templates WHERE id=?').get(tplId);
  if (!tpl) return;
  const now = Date.now();
  const rewardItems = (tpl.last_hit_reward_items && String(tpl.last_hit_reward_items).trim()) ? String(tpl.last_hit_reward_items).split(',').map(s=>Number(s.trim())).filter(n=>Number.isFinite(n) && n>0) : null;
  const base = { name: tpl.name, url: tpl.url || null, hp: tpl.hp, max_hp: tpl.hp, atk: tpl.atk, def: tpl.def, money_pool: tpl.money_pool, exp_pool: tpl.exp_pool, counter_chance: tpl.counter_chance, reward_item_id: tpl.last_hit_reward_item_id, reward_items: rewardItems };
  const res = db.prepare('INSERT INTO monsters (hp, max_hp, atk, def, reward_pool, started_at) VALUES (?,?,?,?,?,?)')
    .run(base.hp, base.max_hp, base.atk, base.def, base.money_pool, now);
  const id = Number(res.lastInsertRowid);
  activeMonster = { id, ...base, started_at: now, damage: new Map(), endsAt: now + MONSTER_DURATION_MS, lastHitter: null, question_bank_id: tpl.question_bank_id || null, question_time_ms: tpl.question_time_ms || 0, currentQuestion: null, qAnswered: new Set() };
  broadcast('monster.spawn', { text: `怪物出现：${tpl.name}！HP ${activeMonster.hp}/${activeMonster.max_hp} 金币池 ${activeMonster.money_pool}` });
  broadcast('monster.state', { name: tpl.name, hp: activeMonster.hp, max_hp: activeMonster.max_hp, endsAt: activeMonster.endsAt, url: activeMonster.url });
  // Start quiz flow
  try { selectAndBroadcastQuestion(); } catch {}
}

function endMonster(killed) {
  if (!activeMonster) return;
  const endedAt = Date.now();
  db.prepare('UPDATE monsters SET hp=?, ended_at=? WHERE id=?').run(Math.max(0, activeMonster.hp), endedAt, activeMonster.id);
  const entries = Array.from(activeMonster.damage.entries());
  const sumDamage = entries.reduce((s, [,d])=>s+d, 0) || 1;
  const results = [];
  let lastHitItemIdForText = null;
  if (killed) {
    for (const [uid, dmg] of entries) {
      const share = dmg / sumDamage;
      const threshold = 0.003; // 0.3%
      let reward = 0;
      if (share >= threshold) reward = Math.floor((activeMonster.money_pool||0) * share);
      if (reward > 0) addMoney(uid, reward);
      if (share >= threshold && (activeMonster.exp_pool||0) > 0) {
        try {
          const c = getCharBase(uid);
          let level = c.level, exp = c.exp, atk=c.atk, def=c.def, hp=c.hp, hp_max=c.hp_max, dodge_index=c.dodge_index||10, crit_index=c.crit_index||10;
          exp += Math.floor((activeMonster.exp_pool||0) * share);
          while (exp >= (12 + 2*(level-1))) {
            exp -= (12 + 2*(level-1));
            level += 1; atk+=4; def+=2; hp+=18; hp_max+=18;
          }
          if (c.level !== level) {
            // on any level increase, restore full hp
            hp = hp_max;
            const gain = level - c.level;
            dodge_index += gain; crit_index += gain;
          }
          db.prepare('UPDATE characters SET level=?, exp=?, atk=?, def=?, hp=?, hp_max=?, dodge_index=?, crit_index=? WHERE user_id=?').run(level, exp, atk, def, hp, hp_max, dodge_index, crit_index, uid);
          const eff = getChar(uid);
          sendTo(uid, 'player.update', { level: eff.level, exp: eff.exp, money: eff.money, atk: eff.atk, def: eff.def, hp: eff.hp, maxHp: eff.hp_max, dodge_index: eff.dodge_index, crit_index: eff.crit_index });
        } catch {}
      }
      try { db.prepare('INSERT OR REPLACE INTO monster_damage (monster_id, user_id, damage) VALUES (?,?,?)').run(activeMonster.id, uid, dmg); } catch {}
      results.push({ uid, dmg, reward });
    }
    let lastHitItemId = null;
    if (activeMonster.lastHitter) {
      if (activeMonster.reward_items && activeMonster.reward_items.length>0) {
        const arr = activeMonster.reward_items;
        lastHitItemId = arr[Math.floor(Math.random()*arr.length)] || null;
      } else if (activeMonster.reward_item_id) {
        lastHitItemId = activeMonster.reward_item_id;
      }
    }
    if (lastHitItemId && activeMonster.lastHitter) {
      try {
        const uid = activeMonster.lastHitter;
        const bag = db.prepare('SELECT bag_slot FROM inventory WHERE user_id=? AND bag_slot IS NOT NULL').all(uid).map(r=>r.bag_slot);
        let slot = -1; for (let i=0;i<24;i++){ if (!bag.includes(i)) { slot=i; break; } }
        if (slot>=0) {
          db.prepare('INSERT INTO inventory (user_id, template_id, bag_slot, count) VALUES (?,?,?,1)').run(uid, lastHitItemId, slot);
          const it = db.prepare('SELECT name FROM item_templates WHERE id=?').get(lastHitItemId);
          sendTo(uid, 'system', { id: uuidv4(), type:'system', content: `获得最后一击奖励物品：${it?.name || lastHitItemId}` , ts: Date.now() });
          lastHitItemIdForText = lastHitItemId;
        } else {
          sendTo(uid, 'system', { id: uuidv4(), type:'system', content: '背包已满，无法获得最后一击奖励物品', ts: Date.now() });
        }
      } catch {}
    }
  }
  results.sort((a,b)=>b.dmg-a.dmg);
  const top10 = results.slice(0,10).map(r => {
    const u = db.prepare('SELECT username FROM users WHERE id=?').get(r.uid);
    return `${u?.username || r.uid}: 伤害${r.dmg}${killed?` 奖励${r.reward}`:''}`;
  }).join(' | ');
  let text = killed ? `${activeMonster.name} 被击杀！功劳榜：${top10}` : '时间到，怪物逃跑了。';
  if (killed && activeMonster.lastHitter) {
    try {
      const u = db.prepare('SELECT username FROM users WHERE id=?').get(activeMonster.lastHitter);
      let itName = null;
      if (lastHitItemIdForText) {
        const it = db.prepare('SELECT name FROM item_templates WHERE id=?').get(lastHitItemIdForText);
        itName = it?.name || null;
      } else if (activeMonster.reward_item_id) {
        const it = db.prepare('SELECT name FROM item_templates WHERE id=?').get(activeMonster.reward_item_id);
        itName = it?.name || null;
      }
      if (u && itName) text += ` 最后一击者 ${u.username} 获得 ${itName}`;
    } catch {}
  }
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
  // Quiz mode: no moving grid; optionally could time questions, but basic loop only checks timeout
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
    // Death countdown (online only)
    const base = getCharBase(uid);
    if ((base.dead_remaining_ms||0) > 0) {
      const remain = Math.max(0, (base.dead_remaining_ms||0) - 1000);
      if (remain === 0) {
        // revive: restore full HP
        try { db.prepare('UPDATE characters SET dead_remaining_ms=?, hp=hp_max WHERE user_id=?').run(0, uid); } catch {}
        const eff = getChar(uid);
        sendTo(uid, 'player.update', { level: eff.level, exp: eff.exp, money: eff.money, atk: eff.atk, def: eff.def, hp: eff.hp_max, maxHp: eff.hp_max, dodge_index: eff.dodge_index, crit_index: eff.crit_index, deadRemaining: 0 });
        sendTo(uid, 'system', { id: uuidv4(), type:'system', content: '你已复活。', ts: Date.now() });
      } else {
        try { db.prepare('UPDATE characters SET dead_remaining_ms=? WHERE user_id=?').run(remain, uid); } catch {}
        const eff = getChar(uid);
        sendTo(uid, 'player.update', { level: eff.level, exp: eff.exp, money: eff.money, atk: eff.atk, def: eff.def, hp: eff.hp, maxHp: eff.hp_max, dodge_index: eff.dodge_index, crit_index: eff.crit_index, deadRemaining: remain });
        // while dead, skip exp bank accumulation below
        continue;
      }
    }
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
  // a and b: { name, atk, def, hp, dodge_index?, crit_index? }
  const log = [];
  let A = { ...a }, B = { ...b };
  let turn = 0;
  while (A.hp > 0 && B.hp > 0 && log.length < 50) {
    if (turn % 2 === 0) {
      const dodge = Math.random() < chanceFromIndex(B.dodge_index||0);
      if (dodge) {
        log.push(`${B.name} 躲闪成功！`);
      } else {
        let dmg = Math.max(1, A.atk - B.def);
        const crit = Math.random() < chanceFromIndex(A.crit_index||0);
        if (crit) dmg = Math.floor(dmg * 2.2);
        B.hp -= dmg;
        log.push(`${A.name}${crit?' 暴击':''} 对 ${B.name} 造成 ${dmg} 伤害，剩余HP ${Math.max(0, B.hp)}`);
      }
    } else {
      const dodge = Math.random() < chanceFromIndex(A.dodge_index||0);
      if (dodge) {
        log.push(`${A.name} 躲闪成功！`);
      } else {
        let dmg = Math.max(1, B.atk - A.def);
        const crit = Math.random() < chanceFromIndex(B.crit_index||0);
        if (crit) dmg = Math.floor(dmg * 2.2);
        A.hp -= dmg;
        log.push(`${B.name}${crit?' 暴击':''} 对 ${A.name} 造成 ${dmg} 伤害，剩余HP ${Math.max(0, A.hp)}`);
      }
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
      if (ch) sendTo(uid, 'player.update', { level: ch.level, exp: ch.exp, money: ch.money, atk: ch.atk, def: ch.def, hp: ch.hp, maxHp: ch.hp_max, id: uid, username: p.username, dodge_index: ch.dodge_index, crit_index: ch.crit_index, deadRemaining: ch.dead_remaining_ms || 0 });
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
      const base = getCharBase(uid);
      if (base && (base.dead_remaining_ms||0) > 0) return; // dead cannot participate
      if (!activeCoinRain || Date.now() > activeCoinRain.endsAt) return;
      const cap = activeCoinRain.conf?.per_user_cap ?? 5;
      const value = activeCoinRain.conf?.coin_value ?? 500;
      const count = activeCoinRain.picked.get(uid) || 0;
      if (count >= cap) {
        sendTo(uid, 'coinrain.result', { ok: false, reason: 'CAP_REACHED', picked: count });
        return;
      }
      activeCoinRain.picked.set(uid, count + 1);
      addMoney(uid, value);
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
      const selfBase = getCharBase(uid);
      if (selfBase && (selfBase.dead_remaining_ms||0) > 0) return;
      const targetBase = getCharBase(targetId);
      if (targetBase && (targetBase.dead_remaining_ms||0) > 0) return;
      if (!online.has(targetId)) return;
      const aRow = db.prepare('SELECT username FROM users WHERE id=?').get(uid);
      const bRow = db.prepare('SELECT username FROM users WHERE id=?').get(targetId);
      const aCh = getChar(uid), bCh = getChar(targetId);
      if (!aCh || !bCh) return;
      const { winner, log } = simulatePvp(
        { name: aRow.username, atk: aCh.atk, def: aCh.def, hp: aCh.hp, dodge_index: aCh.dodge_index, crit_index: aCh.crit_index },
        { name: bRow.username, atk: bCh.atk, def: bCh.def, hp: bCh.hp, dodge_index: bCh.dodge_index, crit_index: bCh.crit_index }
      );
      const summary = `${aRow.username} 对 ${bRow.username} 进行切磋，${winner} 获胜。`;
      sendTo(uid, 'pvp.result', { summary, log });
      sendTo(targetId, 'pvp.result', { summary, log });
      return;
    }

    if (type === 'monster.answer') {
      if (!activeMonster) return;
      const now = Date.now();
      if (now > activeMonster.endsAt) { endMonster(false); return; }
      const baseBefore = getCharBase(uid);
      if (baseBefore && (baseBefore.dead_remaining_ms||0) > 0) return; // dead cannot participate
      const ch = getChar(uid);
      if (!ch) return;
      const q = activeMonster.currentQuestion;
      if (!q) return;
      if (activeMonster.qAnswered?.has(uid)) return; // already answered this question
      const submitted = (payload?.answer);
      const correct = isAnswerCorrect(q, submitted);
      activeMonster.qAnswered?.add(uid);
      if (correct) {
        // Player deals damage (no counter on correct)
        let dmg = Math.max(1, (ch.atk || 0) - activeMonster.def);
        const isCrit = Math.random() < chanceFromIndex(ch.crit_index||0);
        if (isCrit) dmg = Math.floor(dmg * 2.2);
        activeMonster.hp = Math.max(0, activeMonster.hp - dmg);
        const prev = activeMonster.damage.get(uid) || 0;
        activeMonster.damage.set(uid, prev + dmg);
        activeMonster.lastHitter = uid;
        sendTo(uid, 'system', { id: uuidv4(), type:'system', content: `回答正确！${isCrit?'暴击，':''}对怪物造成 ${dmg} 伤害。`, ts: Date.now() });
        if (activeMonster.hp <= 0) {
          endMonster(true);
          return;
        } else {
          broadcast('monster.state', { name: activeMonster.name, hp: activeMonster.hp, max_hp: activeMonster.max_hp, endsAt: activeMonster.endsAt, url: activeMonster.url });
        }
        // schedule next question after 1s
        try {
          if (activeMonster._nextQTimer) clearTimeout(activeMonster._nextQTimer);
          activeMonster._nextQTimer = setTimeout(() => { try { selectAndBroadcastQuestion(); } catch {} }, 1000);
        } catch {}
      } else {
        // Wrong: monster attacks player (with dodge chance)
        const dodged = Math.random() < chanceFromIndex(ch.dodge_index||0);
        if (dodged) {
          sendTo(uid, 'system', { id: uuidv4(), type:'system', content: '回答错误，但你躲闪了怪物的攻击！', ts: Date.now() });
        } else {
          const cdmg = Math.max(1, (activeMonster.atk||0) - (ch.def||0));
          const base = getCharBase(uid);
          let newHp = Math.max(0, (base.hp||0) - cdmg);
          let deadRemaining = base.dead_remaining_ms || 0;
          if (newHp <= 0) {
            const reviveSec = 15 + 5 * Math.max(1, base.level||1);
            deadRemaining = reviveSec * 1000;
          }
          try { db.prepare('UPDATE characters SET hp=?, dead_remaining_ms=? WHERE user_id=?').run(newHp, deadRemaining, uid); } catch {}
          const eff = getChar(uid);
          sendTo(uid, 'player.update', { level: eff.level, exp: eff.exp, money: eff.money, atk: eff.atk, def: eff.def, hp: newHp, maxHp: eff.hp_max, dodge_index: eff.dodge_index, crit_index: eff.crit_index, deadRemaining });
          if (newHp <= 0) {
            sendTo(uid, 'system', { id: uuidv4(), type:'system', content: `回答错误，你已阵亡，等待复活……`, ts: Date.now() });
            try {
              const name = (online.get(uid)?.username) || (db.prepare('SELECT username FROM users WHERE id=?').get(uid)?.username) || uid;
              pushSystem(`玩家 ${name} 阵亡`);
            } catch {}
          } else {
            sendTo(uid, 'system', { id: uuidv4(), type:'system', content: `回答错误，受到怪物 ${cdmg} 伤害。`, ts: Date.now() });
          }
        }
      }
      // do not change question on wrong answer; wait until someone answers correctly
      return;
    }
  });

  ws.on('close', () => {
    if (uid && online.has(uid)) {
      const name = online.get(uid)?.username;
      online.delete(uid);
      // Anchor last_exp_time at disconnect to avoid offline accumulation
      try { 
        db.prepare('UPDATE characters SET last_exp_time = ?, exp_bank = 0 WHERE user_id = ?').run(Date.now(), uid);
      } catch {}
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

// Scheduler based on DB scheduled_events
setInterval(() => {
  try {
    const now = Date.now();
    const rows = db.prepare('SELECT * FROM scheduled_events WHERE enabled=1').all();
    for (const r of rows) {
      if (now - (r.last_run_at||0) >= r.interval_sec*1000) {
        if (r.type === 'monster') spawnMonsterByTemplate(r.template_id);
        if (r.type === 'coinrain') spawnCoinRainByTemplate(r.template_id);
        db.prepare('UPDATE scheduled_events SET last_run_at=? WHERE id=?').run(now, r.id);
      }
    }
  } catch {}
}, 1000);

server.listen(PORT, () => {
  console.log(`[WS] listening on :${PORT}`);
});

// Quiz helpers
function getRandomQuestion(bankId) {
  try {
    if (bankId) {
      return db.prepare('SELECT * FROM questions WHERE bank_id=? ORDER BY RANDOM() LIMIT 1').get(bankId);
    }
    // fallback: any enabled bank
    const b = db.prepare('SELECT id FROM question_banks WHERE enabled=1 ORDER BY RANDOM() LIMIT 1').get();
    if (b) return db.prepare('SELECT * FROM questions WHERE bank_id=? ORDER BY RANDOM() LIMIT 1').get(b.id);
    return db.prepare('SELECT * FROM questions ORDER BY RANDOM() LIMIT 1').get();
  } catch { return null; }
}

function selectAndBroadcastQuestion() {
  if (!activeMonster) return;
  const q = getRandomQuestion(activeMonster.question_bank_id || null);
  if (!q) return;
  activeMonster.currentQuestion = q;
  activeMonster.qAnswered = new Set();
  let options = null;
  try { options = q.options ? JSON.parse(q.options) : null; } catch { options = null; }
  broadcast('monster.question', { id: q.id, type: q.type, content: q.content, options });
}

function isAnswerCorrect(q, submitted) {
  // Parse correct answer
  let corr;
  try { corr = JSON.parse(q.answer); } catch { corr = q.answer; }
  const type = (q.type||'').toLowerCase();
  // normalize helpers
  const normStr = (s) => String(s??'').trim().toLowerCase();
  if (type === 'single') {
    return normStr(submitted) === normStr(corr);
  } else if (type === 'true_false') {
    const toBool = (v) => typeof v === 'boolean' ? v : (String(v).toLowerCase()==='true' || String(v).trim()==='对');
    return toBool(submitted) === toBool(corr);
  } else if (type === 'multiple') {
    const arrSub = Array.isArray(submitted) ? submitted.map(normStr) : String(submitted||'').split(',').map(normStr).filter(Boolean);
    const arrCorr = Array.isArray(corr) ? corr.map(normStr) : String(corr||'').split(',').map(normStr).filter(Boolean);
    if (arrSub.length !== arrCorr.length) return false;
    const setC = new Set(arrCorr);
    for (const a of arrSub) if (!setC.has(a)) return false;
    return true;
  } else if (type === 'fill') {
    if (Array.isArray(corr)) {
      const n = normStr(submitted);
      return corr.map(normStr).includes(n);
    }
    return normStr(submitted) === normStr(corr);
  }
  return false;
}
