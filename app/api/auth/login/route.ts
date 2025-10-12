import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import path from "path";
const getDB = () => (eval('require')(path.join(process.cwd(), "server/db.js")).db);
const { signToken } = eval('require')(path.join(process.cwd(), "server/auth.js"));

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  if (!username || !password) return Response.json({ error: "缺少参数" }, { status: 400 });
  const db = getDB();
  const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!row) return Response.json({ error: "账号或密码错误" }, { status: 400 });
  const ok = bcrypt.compareSync(password, row.password_hash);
  if (!ok) return Response.json({ error: "账号或密码错误" }, { status: 400 });
  const token = signToken({ uid: row.id, username: row.username });
  return Response.json({ token });
}
