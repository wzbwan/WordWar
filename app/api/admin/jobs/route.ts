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
  const rows = db.prepare('SELECT * FROM jobs').all();
  return Response.json({ data: rows });
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json();
  const db = getDB();
  try {
    if (body.id) {
      db.prepare('UPDATE jobs SET code=?, name=?, idle_url=?, hurt_url=?, attack_url=?, walk_url=?, die_url=? WHERE id=?')
        .run(body.code, body.name, body.idle_url, body.hurt_url, body.attack_url, body.walk_url, body.die_url, body.id);
      return Response.json({ ok: true, id: body.id });
    } else {
      const res = db.prepare('INSERT INTO jobs (code, name, idle_url, hurt_url, attack_url, walk_url, die_url) VALUES (?,?,?,?,?,?,?)')
        .run(body.code, body.name, body.idle_url, body.hurt_url, body.attack_url, body.walk_url, body.die_url);
      return Response.json({ ok: true, id: Number(res.lastInsertRowid) });
    }
  } catch (e:any) {
    return Response.json({ error: 'save failed' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!checkAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id') || 0);
  if (!id) return Response.json({ error: 'bad id' }, { status: 400 });
  const db = getDB();
  try {
    db.prepare('DELETE FROM jobs WHERE id=?').run(id);
    return Response.json({ ok: true });
  } catch (e:any) {
    return Response.json({ error: 'delete failed' }, { status: 400 });
  }
}

