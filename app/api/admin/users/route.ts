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
  const rows = db.prepare(`
    SELECT u.id, u.username, u.created_at,
           c.level, c.exp, c.money, c.atk, c.def, c.hp, c.hp_max,
           c.dodge_index, c.crit_index, c.job
    FROM users u LEFT JOIN characters c ON c.user_id=u.id
    ORDER BY u.id ASC
  `).all();
  return Response.json({ users: rows });
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json();
  const { id, username, level, exp, money, atk, def, hp, hp_max, dodge_index, crit_index, job } = body;
  if (!id) return Response.json({ error: 'missing id' }, { status: 400 });
  const db = getDB();
  try {
    if (username) db.prepare('UPDATE users SET username=? WHERE id=?').run(username, id);
    db.prepare(`UPDATE characters SET level=?, exp=?, money=?, atk=?, def=?, hp=?, hp_max=?, dodge_index=?, crit_index=?, job=? WHERE user_id=?`)
      .run(level??0, exp??0, money??0, atk??0, def??0, hp??0, hp_max??0, dodge_index??10, crit_index??10, job ?? null, id);
    return Response.json({ ok: true });
  } catch (e:any) {
    return Response.json({ error: 'update failed' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!checkAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id') || 0);
  if (!id) return Response.json({ error: 'bad id' }, { status: 400 });
  const db = getDB();
  try {
    db.prepare('DELETE FROM inventory WHERE user_id=?').run(id);
    db.prepare('DELETE FROM characters WHERE user_id=?').run(id);
    db.prepare('DELETE FROM users WHERE id=?').run(id);
    return Response.json({ ok: true });
  } catch (e:any) {
    return Response.json({ error: 'delete failed' }, { status: 400 });
  }
}

