import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import path from "path";
const getDB = () => (eval('require')(path.join(process.cwd(), "server/db.js")).db);
const { signToken } = eval('require')(path.join(process.cwd(), "server/auth.js"));

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  if (!username || !password) {
    return Response.json({ error: "缺少参数" }, { status: 400 });
  }
  try {
    const hash = bcrypt.hashSync(password, 10);
    const now = Date.now();
    const db = getDB();
    db.prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)").run(username, hash, now);
    const user = db.prepare("SELECT id, username FROM users WHERE username=?").get(username);
    // create character
    const now2 = Date.now();
    db.prepare("INSERT INTO characters (user_id, level, exp, money, atk, def, hp, last_exp_time, last_passive_money_ts, exp_bank) VALUES (?,?,?,?,?,?,?,?,?,?)").run(
      user.id, 1, 0, 0, 12, 4, 80, now2, now2, 0
    );
    const token = signToken({ uid: user.id, username: user.username });
    return Response.json({ token });
  } catch (e:any) {
    const dup = String(e?.message || "").includes("UNIQUE");
    return Response.json({ error: dup ? "用户名已存在" : "注册失败" }, { status: 400 });
  }
}
