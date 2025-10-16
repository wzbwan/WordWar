import { NextRequest } from "next/server";
import path from "path";
const getDB = () => (eval('require')(path.join(process.cwd(), "server/db.js")).db);

function checkAdmin(req: NextRequest) {
  const key = req.headers.get('x-admin-key');
  const need = process.env.ADMIN_KEY;
  if (need && key !== need) return false;
  return true;
}

export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const db = getDB();
  const rows = db.prepare('SELECT * FROM monster_templates').all();
  return Response.json({ data: rows });
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json();
  const db = getDB();
  if (body.id) {
    db.prepare('UPDATE monster_templates SET name=?, hp=?, atk=?, def=?, exp_pool=?, money_pool=?, counter_chance=?, last_hit_reward_item_id=?, last_hit_reward_items=?, url=?, question_bank_id=?, question_time_ms=? WHERE id=?')
      .run(body.name, body.hp, body.atk, body.def, body.exp_pool, body.money_pool, body.counter_chance ?? 0.25, body.last_hit_reward_item_id ?? null, body.last_hit_reward_items ?? null, body.url ?? null, (body.question_bank_id? Number(body.question_bank_id): null), Number(body.question_time_ms||0), body.id);
    return Response.json({ ok: true, id: body.id });
  } else {
    const res = db.prepare('INSERT INTO monster_templates (name, hp, atk, def, exp_pool, money_pool, counter_chance, last_hit_reward_item_id, last_hit_reward_items, url, question_bank_id, question_time_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(body.name, body.hp, body.atk, body.def, body.exp_pool, body.money_pool, body.counter_chance ?? 0.25, body.last_hit_reward_item_id ?? null, body.last_hit_reward_items ?? null, body.url ?? null, (body.question_bank_id? Number(body.question_bank_id): null), Number(body.question_time_ms||0));
    return Response.json({ ok: true, id: Number(res.lastInsertRowid) });
  }
}

export async function DELETE(req: NextRequest) {
  if (!checkAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id') || 0);
  if (!id) return Response.json({ error: 'bad id' }, { status: 400 });
  const db = getDB();
  db.prepare('DELETE FROM monster_templates WHERE id=?').run(id);
  return Response.json({ ok: true });
}
