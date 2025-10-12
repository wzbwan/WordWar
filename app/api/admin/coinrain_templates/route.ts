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
  const rows = db.prepare('SELECT * FROM coinrain_templates').all();
  return Response.json({ data: rows });
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json();
  const db = getDB();
  if (body.id) {
    db.prepare('UPDATE coinrain_templates SET duration_ms=?, coin_count=?, coin_value=?, per_user_cap=? WHERE id=?')
      .run(body.duration_ms, body.coin_count, body.coin_value, body.per_user_cap, body.id);
    return Response.json({ ok: true, id: body.id });
  } else {
    const res = db.prepare('INSERT INTO coinrain_templates (duration_ms, coin_count, coin_value, per_user_cap) VALUES (?,?,?,?)')
      .run(body.duration_ms, body.coin_count, body.coin_value, body.per_user_cap);
    return Response.json({ ok: true, id: Number(res.lastInsertRowid) });
  }
}

