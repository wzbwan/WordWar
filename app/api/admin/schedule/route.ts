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
  const rows = db.prepare('SELECT * FROM scheduled_events').all();
  return Response.json({ data: rows });
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json();
  const db = getDB();
  if (body.id) {
    db.prepare('UPDATE scheduled_events SET type=?, template_id=?, interval_sec=?, enabled=? WHERE id=?')
      .run(body.type, body.template_id, body.interval_sec, body.enabled ? 1 : 0, body.id);
    return Response.json({ ok: true, id: body.id });
  } else {
    const res = db.prepare('INSERT INTO scheduled_events (type, template_id, interval_sec, enabled) VALUES (?,?,?,?)')
      .run(body.type, body.template_id, body.interval_sec, body.enabled ? 1 : 0);
    return Response.json({ ok: true, id: Number(res.lastInsertRowid) });
  }
}

export async function DELETE(req: NextRequest) {
  if (!checkAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id') || 0);
  if (!id) return Response.json({ error: 'bad id' }, { status: 400 });
  const db = getDB();
  db.prepare('DELETE FROM scheduled_events WHERE id=?').run(id);
  return Response.json({ ok: true });
}
