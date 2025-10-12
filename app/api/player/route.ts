import { NextRequest } from "next/server";
import path from "path";
const getDB = () => (eval('require')(path.join(process.cwd(), "server/db.js")).db);
const { verifyToken } = eval('require')(path.join(process.cwd(), "server/auth.js"));

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return Response.json({ error: "未登录" }, { status: 401 });
  const payload = verifyToken(token);
  if (!payload) return Response.json({ error: "无效令牌" }, { status: 401 });

  const db = getDB();
  const ch = db.prepare("SELECT level, exp, money, atk, def, hp FROM characters WHERE user_id=?").get(payload.uid);
  const user = db.prepare("SELECT id, username FROM users WHERE id=?").get(payload.uid);
  return Response.json({ player: { ...ch, id: user.id, username: user.username, maxHp: ch?.hp } });
}
