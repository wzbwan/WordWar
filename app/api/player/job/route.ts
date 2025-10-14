import { NextRequest } from "next/server";
import path from "path";
const getDB = () => (eval('require')(path.join(process.cwd(), "server/db.js")).db);
const { verifyToken } = eval('require')(path.join(process.cwd(), "server/auth.js"));

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return Response.json({ error: "未登录" }, { status: 401 });
  const payload = verifyToken(token);
  if (!payload) return Response.json({ error: "无效令牌" }, { status: 401 });
  const { job } = await req.json();
  if (!job) return Response.json({ error: '缺少参数' }, { status: 400 });
  const db = getDB();
  try {
    db.prepare('UPDATE characters SET job=? WHERE user_id=?').run(String(job), payload.uid);
    return Response.json({ ok: true });
  } catch (e:any) {
    return Response.json({ error: '设置失败' }, { status: 400 });
  }
}

