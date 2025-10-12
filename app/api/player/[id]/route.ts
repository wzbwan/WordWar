import { NextRequest } from "next/server";
import path from "path";
const getDB = () => (eval('require')(path.join(process.cwd(), "server/db.js")).db);

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDB();
  const uid = Number(params.id);
  if (!Number.isFinite(uid)) return Response.json({ error: 'bad id' }, { status: 400 });
  const ch = db.prepare("SELECT level, exp, money, atk, def, hp FROM characters WHERE user_id=?").get(uid);
  const user = db.prepare("SELECT id, username FROM users WHERE id=?").get(uid);
  if (!user || !ch) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json({ player: { ...ch, id: user.id, username: user.username, maxHp: ch.hp } });
}

