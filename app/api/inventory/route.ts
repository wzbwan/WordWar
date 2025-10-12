import { NextRequest } from "next/server";
import path from "path";
const getDB = () => (eval('require')(path.join(process.cwd(), "server/db.js")).db);
const { verifyToken } = eval('require')(path.join(process.cwd(), "server/auth.js"));

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return Response.json({ error: "未登录" }, { status: 401 });
  const p = verifyToken(token);
  if (!p) return Response.json({ error: "无效令牌" }, { status: 401 });
  const db = getDB();
  const bag = db.prepare(`
    SELECT inv.id AS inv_id, inv.template_id, inv.count, inv.bag_slot, it.*
    FROM inventory inv JOIN item_templates it ON it.id=inv.template_id
    WHERE inv.user_id=? AND inv.bag_slot IS NOT NULL
    ORDER BY inv.bag_slot
  `).all(p.uid);
  const equip = db.prepare(`
    SELECT inv.id AS inv_id, inv.template_id, inv.equipped_slot as slot, it.*
    FROM inventory inv JOIN item_templates it ON it.id=inv.template_id
    WHERE inv.user_id=? AND inv.equipped_slot IS NOT NULL
  `).all(p.uid);
  return Response.json({ bag, equip });
}
