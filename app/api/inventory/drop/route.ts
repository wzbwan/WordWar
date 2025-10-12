import { NextRequest } from "next/server";
import path from "path";
const getDB = () => (eval('require')(path.join(process.cwd(), "server/db.js")).db);
const { verifyToken } = eval('require')(path.join(process.cwd(), "server/auth.js"));

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return Response.json({ error: "未登录" }, { status: 401 });
  const p = verifyToken(token);
  if (!p) return Response.json({ error: "无效令牌" }, { status: 401 });
  const { itemId } = await req.json();
  const db = getDB();
  const row = db.prepare('SELECT * FROM inventory WHERE id=? AND user_id=?').get(itemId, p.uid);
  if (!row) return Response.json({ error: '物品不存在' }, { status: 404 });
  if (row.equipped_slot) return Response.json({ error: '已装备物品不可丢弃，请先卸下' }, { status: 400 });
  if (row.count > 1) db.prepare('UPDATE inventory SET count=count-1 WHERE id=?').run(row.id);
  else db.prepare('DELETE FROM inventory WHERE id=?').run(row.id);
  return Response.json({ ok: true });
}

