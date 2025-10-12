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
  const rows = db.prepare('SELECT * FROM item_templates').all();
  return Response.json({ data: rows });
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json();
  const db = getDB();
  if (body.id) {
    db.prepare(`UPDATE item_templates SET name=?, category=?, add_atk=?, add_def=?, add_max_hp=?, add_dodge=?, add_attack_speed=?, add_crit=?, add_current_hp=?, url=? WHERE id=?`)
      .run(body.name, body.category, body.add_atk||0, body.add_def||0, body.add_max_hp||0, body.add_dodge||0, body.add_attack_speed||0, body.add_crit||0, body.add_current_hp||0, body.url || 'https://word-war.tos-cn-beijing.volces.com/fc13.png', body.id);
    return Response.json({ ok: true, id: body.id });
  } else {
    const res = db.prepare(`INSERT INTO item_templates (name, category, add_atk, add_def, add_max_hp, add_dodge, add_attack_speed, add_crit, add_current_hp, url) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(body.name, body.category, body.add_atk||0, body.add_def||0, body.add_max_hp||0, body.add_dodge||0, body.add_attack_speed||0, body.add_crit||0, body.add_current_hp||0, body.url || 'https://word-war.tos-cn-beijing.volces.com/fc13.png');
    return Response.json({ ok: true, id: Number(res.lastInsertRowid) });
  }
}

export async function DELETE(req: NextRequest) {
  if (!checkAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id') || 0);
  if (!id) return Response.json({ error: 'bad id' }, { status: 400 });
  const db = getDB();
  db.prepare('DELETE FROM item_templates WHERE id=?').run(id);
  return Response.json({ ok: true });
}
